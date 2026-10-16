import { useEffect, useRef, useState } from 'react';
import { send, type TabStatus } from '../../src/browser/messages';
import { GROUP_TITLES, summarize, type ReviewGroup } from '../../src/features/review/classify';
import { FillReview } from '../../src/features/review/FillReview';
import { SkillsPanel } from '../../src/features/skills/SkillsPanel';
import { AccountPanel, ConfirmationPanel, UploadNote } from '../../src/features/account-registry/WorkflowPanels';
import { useStore } from '../../src/ui/useStore';
import { questionKey, type Scope } from '../../src/domain/questions';
import type { ScannedField, ScanSnapshot } from '../../src/platform/adapter';
import { Button } from '../../src/ui/fields';
import { useTabId } from '../../src/ui/useTabId';

const PROTECTION_TEXT = { credential: 'sign-in secret', attestation: 'agreement or signature', demographic: 'voluntary disclosure', authorization: 'work authorization', legal: 'legal question' };

export function SidePanel() {
  const tabId = useTabId(true);
  const { store, run } = useStore();
  const [tab, setTab] = useState<TabStatus>({});
  const [snapshot, setSnapshot] = useState<ScanSnapshot>();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (tabId === undefined) return;
    void send({ type: 'tab/status', tabId }).then((r) => { if (r.ok) setTab(r); });
  }, [tabId]);

  async function scan() {
    if (tabId === undefined) return;
    const r = await send({ type: 'tab/scan', tabId });
    if (!r.ok) { setMessage(r.error); setSnapshot(undefined); setTab({}); return; }
    setMessage('');
    setSnapshot(r.snapshot);
    setTab({ binding: r.binding });
    // Step history: labels only, never answers.
    const a = store?.applications.find((x) => x.id === r.binding.applicationId);
    if (store && a && r.snapshot.page?.kind === 'application' && r.snapshot.stepLabel && a.stepsSeen.at(-1)?.label !== r.snapshot.stepLabel) {
      const stepsSeen = [...a.stepsSeen, { label: r.snapshot.stepLabel, at: new Date().toISOString() }].slice(-50);
      const saved = await run({ type: 'store/save', store: { ...store, applications: store.applications.map((x) => (x.id === a.id ? { ...x, stepsSeen } : x)) } });
      if (!saved.ok) setMessage(`Step history not saved: ${saved.error}`);
    }
  }

  // The page tells us when its step changes (Next/Back in a single-page app); scan again so nothing stale is shown.
  const scanRef = useRef(scan);
  useEffect(() => { scanRef.current = scan; });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if ((msg as { type?: string })?.type !== 'copilot/changed' || sender.id !== chrome.runtime.id || sender.tab?.id !== tabId) return;
      clearTimeout(timer);
      timer = setTimeout(() => void scanRef.current(), 400);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => { chrome.runtime.onMessage.removeListener(onMessage); clearTimeout(timer); };
  }, [tabId]);

  const s = snapshot && summarize(snapshot);
  const binding = tab.binding;
  const app = binding && store?.applications.find((a) => a.id === binding.applicationId);

  // Saving is an explicit click; machine-filled values never become memories on their own.
  async function remember(f: ScannedField, scope: Scope) {
    if (!store || !binding) return;
    const m = { id: crypto.randomUUID(), question: f.label, kind: f.kind === 'select' || f.kind === 'radio' || f.kind === 'dropdown' || f.kind === 'multiselect' ? 'choice' as const : 'text' as const, answer: f.value!, options: [...(f.options ?? [])], scope,
      tenantKey: scope === 'global' ? '' : binding.tenantKey, applicationId: scope === 'job' ? binding.applicationId : '', confirmedAt: new Date().toISOString() };
    const rest = store.answers.filter((x) => !(questionKey(x.question) === questionKey(m.question) && x.scope === m.scope && x.tenantKey === m.tenantKey && x.applicationId === m.applicationId));
    const r = await run({ type: 'store/save', store: { ...store, answers: [...rest, m] } });
    if (!r.ok) setMessage(`Not remembered: ${r.error}`);
  }

  async function useOption(field: string, value: string, option: string) {
    if (!store) return;
    // Added, not replaced: one value can have different wordings on different sites.
    if (store.optionAliases.some((a) => a.field === field && a.value === value && a.option === option)) return;
    const r = await run({ type: 'store/save', store: { ...store, optionAliases: [...store.optionAliases, { field, value, option }] } });
    if (!r.ok) setMessage(`Choice not remembered: ${r.error}`);
  }

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-tight text-slate-600 dark:text-slate-400">Step review</h1>
        <Button variant="primary" onClick={scan} disabled={tabId === undefined}>Scan this step</Button>
      </header>
      {!tab.binding && !snapshot && <p className="text-sm text-slate-700 dark:text-slate-300">Not active on this tab. Click the extension button on the application tab and choose Activate.</p>}
      {message && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{message}</p>}
      {snapshot && s && (
        <section aria-labelledby="step-h" className="space-y-4">
          <div>
            <h2 id="step-h" className="text-lg font-semibold tracking-tight">{snapshot.stepLabel || 'Unnamed step'}</h2>
            <p role="status" className="text-xs text-slate-600 dark:text-slate-400">
              Scanned {snapshot.fields.length} fields. Scanning never changes the page.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
            {(Object.keys(GROUP_TITLES) as ReviewGroup[]).map((g) => (<div key={g} className="flex items-baseline justify-between gap-2"><dt className="text-slate-600 dark:text-slate-400">{GROUP_TITLES[g]}</dt><dd className="font-semibold tabular-nums" data-testid={`count-${g}`}>{s.groups[g].length}</dd></div>))}
            <div className="flex items-baseline justify-between gap-2"><dt className="text-slate-600 dark:text-slate-400">Required and empty</dt><dd className={`font-semibold tabular-nums ${s.missingRequired.length ? 'text-red-700 dark:text-red-400' : ''}`} data-testid="count-missing">{s.missingRequired.length}</dd></div>
          </dl>
          {s.errors.length > 0 && (
            <div role="region" aria-label="Errors shown by the site" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <h3 className="font-semibold">Errors shown by the site</h3>
              <ul className="list-disc pl-5">{s.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {store && binding && app && (
            <>
              <AccountPanel snapshot={snapshot} store={store} app={app} binding={binding} run={run} />
              <ConfirmationPanel snapshot={snapshot} store={store} app={app} run={run} />
              <UploadNote snapshot={snapshot} app={app} />
            </>
          )}
          {store && binding && app && tabId !== undefined && (
            <>
              <FillReview key={`fill:${snapshot.stepId}:${app.id}`} snapshot={snapshot} profile={store.profile} binding={binding} tabId={tabId} onScanned={setSnapshot} onRemember={remember} onUseOption={useOption}
                answers={{ memories: store.answers, sensitive: store.sensitiveAnswers, optionAliases: store.optionAliases, ctx: { tenantKey: binding.tenantKey, applicationId: app.id, employer: app.employerLabel, jobTitle: app.jobTitle } }} />
              <SkillsPanel key={`skills:${snapshot.stepId}:${app.id}`} snapshot={snapshot} store={store} app={app} binding={binding} tabId={tabId} run={run} onScanned={setSnapshot} />
            </>
          )}
          {(Object.keys(GROUP_TITLES) as ReviewGroup[]).map((g) => s.groups[g].length > 0 && (
            <details key={g} open={g !== 'recognized'} className="text-sm">
              <summary className="cursor-pointer rounded-md py-1 font-semibold">{GROUP_TITLES[g]} ({s.groups[g].length})</summary>
              <ul className="mt-1 space-y-1.5">{s.groups[g].map((f) => <FieldRow key={f.fieldId} f={f} />)}</ul>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}

function FieldRow({ f }: { f: ScannedField }) {
  const note = f.protection ? PROTECTION_TEXT[f.protection] : f.uncertain ? 'label is ambiguous' : f.kind === 'file' ? 'upload it yourself' : !f.semantic ? 'not matched to your profile' : '';
  return (
    <li className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="break-words font-medium">{f.label || '(no label)'}</span>
      {f.required && <span className="text-red-700 dark:text-red-400"> *</span>}
      <span className="block text-xs text-slate-600 dark:text-slate-400">{[f.section, f.recordKey, note].filter(Boolean).join(' · ')}</span>
    </li>
  );
}
