import { useState } from 'react';
import { send, type PlanInput } from '../../browser/messages';
import { propose, type AnswerSources, type Proposal } from '../../domain/plan';
import { questionKey, type Scope } from '../../domain/questions';
import type { ApplicationContent, MasterProfile } from '../../domain/schemas';
import type { Binding, Outcome, ScannedField, ScanSnapshot } from '../../platform/adapter';
import { Badge, Button, CARD } from '../../ui/fields';

const OUTCOME_TEXT: Record<Outcome, string> = {
  verified: 'Filled and verified', skipped: 'Skipped', stale: 'Left as is', unsupported: 'Do this one by hand', failed: 'Not filled', cancelled: 'Stopped', timedOut: 'Timed out',
};

type Result = { actionId: string; label: string; outcome: Outcome; reason: string; suggestions?: readonly string[] };

/** Ordinary questions with a value now on the page that the user may choose to remember. */
// A search box counts only with one chosen value: several chips are not one answer.
const rememberable = (f: ScannedField) => !f.protection && !f.uncertain && !f.semantic && !f.recordKey && !!f.value && (['text', 'textarea', 'select', 'radio', 'dropdown', 'date'].includes(f.kind) || (f.kind === 'multiselect' && !f.value.includes('; ')));

export function FillReview({ snapshot, profile, content, binding, tabId, answers, onScanned, onRemember, onUseOption }: {
  snapshot: ScanSnapshot; profile: MasterProfile; content?: ApplicationContent; binding: Binding; tabId: number; answers: AnswerSources;
  onScanned: (s: ScanSnapshot) => void; onRemember: (f: ScannedField, scope: Scope) => Promise<void>;
  /** Saves a search-box choice for a profile value, so later proposals offer it directly. */
  onUseOption: (field: string, value: string, option: string) => Promise<void>;
}) {
  const [manual, setManual] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { proposals, records, notes } = propose(snapshot, profile, manual, answers, content);
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  // An approval covers the exact values shown; if a rescan changes them, the approval no longer applies.
  const approvalKey = (p: Proposal) => `${p.actionId}|${p.current}|${p.proposed}`;
  const chosen = proposals.filter((p) => approved.has(approvalKey(p)));
  const safe = proposals.filter((p) => p.safe);

  const toggle = (ids: string[], on: boolean) => setApproved((s) => { const n = new Set(s); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });

  async function fill(picked: Proposal[] = chosen) {
    // Field writes first, Add buttons last, so new entries don't shift fields that were just approved.
    const ordered = [...picked.filter((p) => p.type === 'set'), ...picked.filter((p) => p.type === 'addRecord')];
    const plan: PlanInput = {
      planId: crypto.randomUUID(), binding, stepId: snapshot.stepId, revision: snapshot.revision,
      actions: ordered.map((p) => ({ actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed, recordId: p.recordId, expectedRecord: p.expectedRecord, sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale })),
    };
    setBusy(true); setError('');
    const r = await send({ type: 'tab/fill', tabId, plan });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    const label = new Map(ordered.map((p) => [p.actionId, p.label]));
    setResults(r.report.results.map((x) => ({ actionId: x.actionId, label: label.get(x.actionId) ?? x.actionId, outcome: x.outcome, reason: x.reason, suggestions: x.suggestions })));
    setApproved(new Set());
    if (r.snapshot) onScanned(r.snapshot);
  }

  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const g = p.recordKey ?? (p.type === 'addRecord' ? 'Missing entries' : 'This step');
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const recordLabel = (key: string) => records.find((r) => r.recordKey === key)?.label ?? key;
  const masters = (kind: 'employment' | 'education') => kind === 'employment'
    ? profile.employment.filter((e) => !content || (content.approved && content.employment.some((r) => r.masterId === e.id))).map((e) => ({ id: e.id, label: [e.title, e.employer].filter(Boolean).join(' at ') }))
    : profile.education.filter((e) => !content || (content.approved && content.educationIds.includes(e.id))).map((e) => ({ id: e.id, label: e.school }));

  // A search box already showing a different wording ("Computer and Information Science"): keeping it remembers it as yours for this value.
  const keeper = (p: Proposal) => {
    const semantic = snapshot.fields.find((f) => f.fieldId === p.fieldId)?.semantic;
    if (p.kind !== 'multiselect' || !p.current || p.sensitiveCategory || !semantic) return undefined;
    return () => void onUseOption(semantic, p.from ?? p.proposed, p.current);
  };

  const resultsBlock = results.length > 0 && (
    <div role="region" aria-label="Fill results" className={`${CARD} space-y-2 text-sm`}>
      <h4 className="font-semibold">Last fill</h4>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li key={i} className="space-y-1">
            {/* The hidden colon keeps "Outcome: label" as one phrase for screen readers. */}
            <Badge tone={r.outcome === 'verified' ? 'success' : 'warning'}>{OUTCOME_TEXT[r.outcome]}</Badge><span className="sr-only">:</span> <span className="break-words">{r.label}</span>
            {r.outcome !== 'verified' && <span className="block text-xs text-slate-600 dark:text-slate-400">{r.reason}</span>}
            {/* Choosing a similar option is the approval; it fills that one field with exactly this choice. */}
            {r.suggestions?.map((s) => {
              const p = proposals.find((x) => x.actionId === r.actionId);
              const semantic = p && snapshot.fields.find((f) => f.fieldId === p.fieldId)?.semantic;
              return p && <Button key={s} disabled={busy} className="mt-1" onClick={() => void (async () => {
                if (semantic) await onUseOption(semantic, p.from ?? p.proposed, s);
                await fill([{ ...p, proposed: s }]);
              })()}>Use "{s}"</Button>;
            })}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section aria-labelledby="fill-h" className="space-y-3">
      <h3 id="fill-h" className="text-base font-semibold">Proposed changes</h3>
      {error && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}</p>}
      {resultsBlock}

      {records.length > 0 && (
        <div role="region" aria-label="Entries on this page" className="space-y-2 text-sm">
          {records.map((r) => (
            <div key={r.recordKey} className={CARD}>
              <p className="break-words font-medium">{r.label}</p>
              <label className="mt-1.5 block text-xs text-slate-600 dark:text-slate-400">Your record
                <select className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={manual[r.recordKey] ?? r.masterId ?? ''}
                  onChange={(e) => setManual((m) => { const n = { ...m }; if (e.target.value) n[r.recordKey] = e.target.value; else delete n[r.recordKey]; return n; })}>
                  <option value="">Not linked (left alone)</option>
                  {masters(r.kind).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{r.reason}</p>
            </div>
          ))}
        </div>
      )}

      {proposals.length === 0 ? <p className="text-sm text-slate-700 dark:text-slate-300">Nothing to change on this step from your profile.</p> : (
        <>
          {[...groups].map(([key, ps]) => (
            <div key={key} role="group" aria-label={key === 'This step' || key === 'Missing entries' ? key : recordLabel(key)} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span className="min-w-0 break-words">{key === 'This step' || key === 'Missing entries' ? key : recordLabel(key)}</span>
                <button type="button" className="shrink-0 rounded text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-400 dark:hover:text-blue-300" onClick={() => toggle(ps.map(approvalKey), true)}>Approve all in this group</button>
              </div>
              <ul className="space-y-1.5">{ps.map((p) => <Card key={p.actionId} p={p} checked={approved.has(approvalKey(p))} onChange={(on) => toggle([approvalKey(p)], on)} onKeep={keeper(p)} />)}</ul>
            </div>
          ))}
          {/* Pinned to the panel's bottom edge while the cards scroll, so Fill is always one click away. */}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            <Button onClick={() => toggle(safe.map(approvalKey), true)} disabled={safe.length === 0 || busy}>Approve all safe ({safe.length})</Button>
            <Button variant="primary" onClick={() => void fill()} disabled={chosen.length === 0 || busy}>{busy ? 'Filling…' : `Fill ${chosen.length} approved`}</Button>
            {busy && <Button onClick={() => void send({ type: 'tab/cancel', tabId })}>Stop</Button>}
          </div>
        </>
      )}

      {notes.length > 0 && (
        <ul aria-label="Review notes" className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
          {notes.map((n) => <li key={n.label}><span className="font-medium">{n.label}</span>: {n.reason}</li>)}
        </ul>
      )}
      {snapshot.fields.some(rememberable) && (
        <details className="text-sm">
          <summary className="cursor-pointer rounded-md py-1 font-semibold">Remember answers you typed</summary>
          <p className="text-xs text-slate-600 dark:text-slate-400">Only what you choose to remember is saved. Sensitive questions are never offered here; use the dashboard's Sensitive answers.</p>
          <ul aria-label="Answers you can remember" className="mt-2 space-y-1.5">
            {snapshot.fields.filter(rememberable).map((f) => {
              const scope = scopes[f.fieldId] ?? (f.kind === 'select' || f.kind === 'radio' || f.kind === 'dropdown' || f.kind === 'multiselect' ? 'global' : 'employer');
              const saved = answers.memories.some((m) => questionKey(m.question) === questionKey(f.label) && m.answer === f.value);
              // Stacked, not side by side: questions can run to hundreds of characters.
              return (
                <li key={f.fieldId} className={`${CARD} space-y-1.5`}>
                  <p className="break-words font-medium">{f.label}</p>
                  <p className="break-words text-slate-700 dark:text-slate-300">{f.value}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Where to reuse ${f.label}`} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800" value={scope}
                      onChange={(e) => setScopes((s) => ({ ...s, [f.fieldId]: e.target.value as Scope }))}>
                      <option value="global">All employers</option><option value="employer">This employer</option><option value="job">This job only</option>
                    </select>
                    {saved ? <Badge tone="success">Saved</Badge>
                      : <Button aria-label={`Remember ${f.label}`} onClick={() => void onRemember(f, scope)}>Remember</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

function Card({ p, checked, onChange, onKeep }: { p: Proposal; checked: boolean; onChange: (on: boolean) => void; onKeep?: () => void }) {
  return (
    <li className={`rounded-lg border bg-white p-3 text-sm dark:bg-slate-900 ${checked ? 'border-blue-500 ring-1 ring-blue-500 dark:border-blue-400 dark:ring-blue-400' : 'border-slate-200 dark:border-slate-700'}`}>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4 accent-blue-700" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={`Approve ${p.label}`} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="break-words font-medium">{p.label}</span>
            <Badge tone={p.safe ? 'success' : 'warning'}>{p.safe ? 'safe' : 'needs your OK'}</Badge>
            {p.sensitiveCategory && <Badge tone="sensitive">sensitive</Badge>}
          </span>
          {p.type === 'set' && (
            <span className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Now</span><span className="break-words">{p.current || '(empty)'}</span>
              <span className="text-slate-500 dark:text-slate-400">New</span><span className="whitespace-pre-line break-words font-semibold">{p.proposed}</span>
            </span>
          )}
          <span className="block text-xs text-slate-600 dark:text-slate-400">Source: {p.provenance}. {p.rationale}</span>
        </span>
      </label>
      {onKeep && <Button className="mt-2" onClick={onKeep}>Keep "{p.current}"</Button>}
    </li>
  );
}
