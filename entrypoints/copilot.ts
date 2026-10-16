import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { ContentRequest, type ContentResponse } from '../src/browser/messages';
import type { Detection } from '../src/platform/adapter';
import { adapters, getAdapter } from '../src/platform/registry';

// Injected with chrome.scripting.executeScript only after the user activates the tab.
// It never reads extension storage and never receives the profile.
export default defineUnlistedScript(() => {
  const w = window as { __copilotLoaded?: boolean };
  if (w.__copilotLoaded) return;
  w.__copilotLoaded = true;

  const page = () => ({ url: new URL(location.href), document });
  let observing: AbortController | undefined;

  /** Best answer across adapters: supported beats uncertain beats unsupported. */
  async function detect(): Promise<Detection> {
    const results = await Promise.all(adapters.map((a) => a.detect(page()).then((r) => (r.ok ? { ...r.value, platformId: a.id } : undefined), () => undefined)));
    const found = results.flatMap((r) => (r ? [r] : []));
    return found.find((d) => d.status === 'supported') ?? found.find((d) => d.status === 'uncertain') ?? { status: 'unsupported', evidence: ['No supported application site recognized'] };
  }

  let filling: AbortController | undefined;
  // Leaving the page or the URL changing (SPA navigation) cancels a fill in progress.
  addEventListener('pagehide', () => filling?.abort());
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; filling?.abort(); } }, 250);

  async function handle(req: ContentRequest): Promise<ContentResponse> {
    if (req.type === 'copilot/detect') return { ok: true, detection: await detect() };
    if (req.type === 'copilot/cancel') { filling?.abort(); return { ok: true }; }
    const binding = req.type === 'copilot/fill' ? req.plan.binding : req.type === 'copilot/skills' ? req.request.binding : req.binding;
    const adapter = getAdapter(binding.platformId);
    if (!adapter) return { ok: false, error: 'Unsupported platform.' };
    const d = await adapter.detect(page());
    // Tenant changed (e.g. SPA navigation to another employer): the binding is no longer valid.
    if (!d.ok || d.value.status !== 'supported' || d.value.tenantKey !== binding.tenantKey) {
      return { ok: false, error: 'This tab is no longer on the activated employer portal. Activate again.' };
    }
    const ctx = { ...page(), binding };
    if (!observing) {
      observing = new AbortController();
      // Tell the side panel when the step itself changes (SPA Next/Back), not on every rerender or our own writes.
      const signature = async () => {
        const s = await adapter.scan({ ...page(), binding }, new AbortController().signal);
        return s.ok ? `${location.href}|${s.value.stepId}|${s.value.page?.kind}` : location.href;
      };
      let lastStep = await signature();
      adapter.observeChanges(ctx, async () => {
        if (filling) return;
        const step = await signature();
        if (step !== lastStep) void chrome.runtime.sendMessage({ type: 'copilot/changed' }).catch(() => undefined);
        lastStep = step;
      }, observing.signal);
    }
    if (req.type === 'copilot/skills') {
      if (filling || !adapter.searchSkills) return { ok: false, error: filling ? 'Something is already running on this page.' : 'Skill search is not supported here.' };
      filling = new AbortController();
      try {
        const r = await adapter.searchSkills(ctx, req.request, filling.signal);
        if (!r.ok) return { ok: false, error: r.reason };
        const after = await adapter.scan(ctx, new AbortController().signal);
        return { ok: true, outcomes: [...r.value], snapshot: after.ok ? after.value : undefined };
      } finally {
        filling = undefined;
      }
    }
    if (req.type === 'copilot/fill') {
      if (filling) return { ok: false, error: 'A fill is already running on this page.' };
      filling = new AbortController();
      try {
        const applied = await adapter.apply(ctx, req.plan, filling.signal);
        if (!applied.ok) return { ok: false, error: applied.reason };
        const verified = await adapter.verify(ctx, applied.value, filling.signal);
        if (!verified.ok) return { ok: false, error: verified.reason };
        const after = await adapter.scan(ctx, new AbortController().signal);
        return { ok: true, report: verified.value, snapshot: after.ok ? after.value : undefined };
      } finally {
        filling = undefined;
      }
    }
    const r = await adapter.scan(ctx, new AbortController().signal);
    return r.ok ? { ok: true, snapshot: r.value } : { ok: false, error: r.reason };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    // Only the extension's own service worker (no tab) may command this script.
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    const req = ContentRequest.safeParse(msg);
    if (!req.success) return false;
    handle(req.data).then(reply, () => reply({ ok: false, error: 'The page could not be read.' }));
    return true;
  });
});
