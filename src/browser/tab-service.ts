// Service-worker only: tab ↔ application binding and adapter orchestration.
import type { Binding } from '../platform/adapter';
import type { ContentRequest, ContentResponse, PlanInput, ResponseFor, SkillRequestInput } from './messages';
import { handle as storeHandle } from './store-service';

// Session storage: survives service-worker suspension, cleared when the browser closes.
const key = (tabId: number) => `binding:${tabId}`;
const getBinding = async (tabId: number) => (await chrome.storage.session.get(key(tabId)))[key(tabId)] as Binding | undefined;
const clearBinding = (tabId: number) => chrome.storage.session.remove(key(tabId));

async function toTab(tabId: number, req: ContentRequest): Promise<ContentResponse> {
  try {
    return (await chrome.tabs.sendMessage(tabId, req, { frameId: 0 })) ?? { ok: false, error: 'The page did not answer.' };
  } catch {
    return { ok: false, error: 'The extension is no longer connected to this page (it may have navigated). Activate again.' };
  }
}

/** A binding counts only if the injected script still answers on the same employer portal. */
export async function status(tabId: number): Promise<ResponseFor<'tab/status'>> {
  const binding = await getBinding(tabId);
  if (!binding) return { ok: true };
  const d = await toTab(tabId, { type: 'copilot/detect' });
  if (d.ok && d.detection?.status === 'supported' && d.detection.tenantKey === binding.tenantKey) return { ok: true, binding };
  await clearBinding(tabId);
  return { ok: true };
}

/** Called from a user gesture in the popup, so activeTab grants access to this tab. */
export async function activate(tabId: number, applicationId: string): Promise<ResponseFor<'tab/activate'>> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['/copilot.js'] });
  } catch {
    return { ok: false, error: "The extension can't access this page. Click the extension icon on the application tab and try again." };
  }
  const d = await toTab(tabId, { type: 'copilot/detect' });
  if (!d.ok || !d.detection) return { ok: false, error: d.ok ? 'No answer from the page.' : d.error };
  const detection = d.detection;
  if (detection.status !== 'supported' || !detection.tenantKey || !detection.platformId) return { ok: true, detection };
  const platformId = detection.platformId;

  const store = await storeHandle({ type: 'store/get' });
  if (!store.ok) return store;
  const app = store.store.applications.find((a) => a.id === applicationId);
  if (!app) return { ok: false, error: 'Choose an application first.' };
  if (app.tenantKey && app.tenantKey !== detection.tenantKey) {
    return { ok: false, error: `This application belongs to a different employer portal (${app.tenantKey}). Choose the matching application or create a new one.` };
  }
  const portalOrigin = new URL(detection.tenantKey).origin;
  if (!app.tenantKey) {
    const saved = await storeHandle({ type: 'store/save', store: { ...store.store, applications: store.store.applications.map((a) => (a.id === app.id ? { ...a, platformId: platformId as typeof a.platformId, tenantKey: detection.tenantKey!, portalOrigin, updatedAt: new Date().toISOString() } : a)) } });
    if (!saved.ok) return saved;
  }
  const binding: Binding = { platformId, portalOrigin, tenantKey: detection.tenantKey, applicationId };
  await chrome.storage.session.set({ [key(tabId)]: binding });
  return { ok: true, binding, detection };
}

export async function scan(tabId: number): Promise<ResponseFor<'tab/scan'>> {
  const binding = await getBinding(tabId);
  if (!binding) return { ok: false, error: 'This tab is not activated. Open the extension popup on the application tab and click Activate.' };
  const r = await toTab(tabId, { type: 'copilot/scan', binding });
  if (!r.ok || !r.snapshot) {
    await clearBinding(tabId);
    return { ok: false, error: r.ok ? 'No answer from the page.' : r.error };
  }
  return { ok: true, snapshot: r.snapshot, binding };
}

/** Forwards an approved plan only if it is for the application and portal this tab is bound to. */
export async function fill(tabId: number, plan: PlanInput): Promise<ResponseFor<'tab/fill'>> {
  const binding = await getBinding(tabId);
  if (!binding) return { ok: false, error: 'This tab is not activated.' };
  if (plan.binding.tenantKey !== binding.tenantKey || plan.binding.applicationId !== binding.applicationId) return { ok: false, error: 'This plan was made for a different application or portal.' };
  const r = await toTab(tabId, { type: 'copilot/fill', plan });
  if (!r.ok || !r.report) return { ok: false, error: r.ok ? 'No answer from the page.' : r.error };
  return { ok: true, report: r.report, snapshot: r.snapshot };
}

export async function skills(tabId: number, request: SkillRequestInput): Promise<ResponseFor<'tab/skills'>> {
  const binding = await getBinding(tabId);
  if (!binding || request.binding.tenantKey !== binding.tenantKey || request.binding.applicationId !== binding.applicationId) return { ok: false, error: 'This tab is not activated for this application.' };
  const r = await toTab(tabId, { type: 'copilot/skills', request });
  if (!r.ok || !r.outcomes) return { ok: false, error: r.ok ? 'No answer from the page.' : r.error };
  return { ok: true, outcomes: r.outcomes, snapshot: r.snapshot };
}

export async function cancel(tabId: number): Promise<ResponseFor<'tab/cancel'>> {
  await toTab(tabId, { type: 'copilot/cancel' });
  return { ok: true };
}

export function listenTabs() {
  chrome.tabs.onRemoved.addListener((tabId) => void clearBinding(tabId));
  // A cross-origin navigation ends the binding; same-origin SPA changes are re-checked by the injected script on every scan.
  chrome.tabs.onUpdated.addListener(async (tabId, change) => {
    if (!change.url) return;
    const b = await getBinding(tabId);
    if (b && new URL(change.url).origin !== b.portalOrigin) await clearBinding(tabId);
  });
}
