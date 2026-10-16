import { useRef, useState } from 'react';
import { send, type Response, type StoreRequest } from '../../browser/messages';
import { rankSkills, spellings } from '../../domain/skills';
import type { Application, Store } from '../../domain/schemas';
import type { Binding, ScanSnapshot, SkillOutcome } from '../../platform/adapter';
import { Button } from '../../ui/fields';

// Long searches go in batches: each request stays short enough for the service worker and the message limit.
const BATCH = 25;

const STATUS_TEXT: Record<SkillOutcome['status'], string> = {
  added: 'Added', alreadySelected: 'Already on the page', suggestions: 'Only similar options exist', notAvailable: 'Not available on this site',
  timedOut: 'No clear answer from the site; check by hand or try again', cancelled: 'Stopped', failed: 'Not added',
  full: 'Not added: the box stopped taking skills, so it may have a limit. Remove a less important one, then try again',
};

export function SkillsPanel({ snapshot, store, app, binding, tabId, run, onScanned }: {
  snapshot: ScanSnapshot; store: Store; app: Application; binding: Binding; tabId: number;
  run: (r: StoreRequest) => Promise<Response>; onScanned: (s: ScanSnapshot) => void;
}) {
  const field = snapshot.fields.find((f) => f.semantic === 'skills' && f.kind === 'multiselect' && !f.protection);
  // The job description is only used for ranking. A pasted one here is not saved.
  const [jd, setJd] = useState(app.jobDescription);
  const { ranked, unverified } = rankSkills(store.profile.skills.map((s) => s.name), app.imported?.skills.map((s) => s.name) ?? [], jd);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(ranked.filter((r) => r.suggested).map((r) => r.name)));
  const [outcomes, setOutcomes] = useState<SkillOutcome[]>([]);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stopped = useRef(false);
  if (!field) return null;

  async function search(items: { name: string; spellings: string[]; option?: string }[], alias?: { skill: string; option: string }) {
    setBusy(true); setError(''); stopped.current = false;
    const added: string[] = [];
    for (let i = 0; i < items.length && !stopped.current; i += BATCH) {
      const r = await send({ type: 'tab/skills', tabId, request: { binding, fieldId: field!.fieldId, items: items.slice(i, i + BATCH) } });
      if (!r.ok) { setError(r.error); break; }
      // Merge: newer results for a skill replace older ones.
      setOutcomes((old) => [...old.filter((o) => !r.outcomes.some((n) => n.name === o.name)), ...r.outcomes]);
      if (r.snapshot) onScanned(r.snapshot);
      added.push(...r.outcomes.filter((o) => o.status === 'added' || o.status === 'alreadySelected').map((o) => o.name));
      if (r.outcomes.some((o) => o.status === 'full')) {
        const rest = items.slice(i + BATCH).map((it) => ({ name: it.name, status: 'full' as const }));
        setOutcomes((old) => [...old.filter((o) => !rest.some((n) => n.name === o.name)), ...rest]);
        break;
      }
      if (r.outcomes.some((o) => o.status === 'cancelled')) break;
    }
    setBusy(false);
    if (added.length) {
      // One write: the selections and (if asked and it worked) the remembered option.
      const next = { ...app, skillSelections: [...new Set([...app.skillSelections, ...added])], updatedAt: new Date().toISOString() };
      const keepAlias = alias && added.includes(alias.skill) && !store.skillAliases.some((a) => a.skill === alias.skill && a.option === alias.option);
      await run({ type: 'store/save', store: { ...store, applications: store.applications.map((a) => (a.id === app.id ? next : a)), skillAliases: keepAlias ? [...store.skillAliases, alias] : store.skillAliases } });
    }
  }

  const pickSuggestion = (name: string, option: string) => search([{ name, spellings: [option], option }], remember ? { skill: name, option } : undefined);

  return (
    <section aria-labelledby="skills-h" className="space-y-3 text-sm">
      <h3 id="skills-h" className="font-semibold">Skills</h3>
      <p className="text-slate-600 dark:text-slate-400">Only skills from your verified list are offered. The tailored resume and the job description only change the order.</p>
      <details>
        <summary className="cursor-pointer">Job description for ranking ({jd ? 'provided' : 'none'})</summary>
        <label className="mt-1 block">Paste it here (not saved)
          <textarea className="mt-1 w-full rounded border border-slate-300 p-1 dark:border-slate-600 dark:bg-slate-800" rows={3} value={jd} onChange={(e) => setJd(e.target.value)} />
        </label>
      </details>
      <ul aria-label="Your skills, ranked" className="space-y-1">
        {ranked.map((s) => (
          <li key={s.name}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={chosen.has(s.name)} onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(s.name); else n.delete(s.name); return n; })} />
              <span>{s.name}</span>
              <span className="text-xs text-slate-500">{s.sources.filter((x) => x !== 'verified').join(', ') || 'verified only'}</span>
            </label>
          </li>
        ))}
      </ul>
      {unverified.length > 0 && <p className="text-amber-800 dark:text-amber-300">On the tailored resume but not in your verified skills, so not offered: {unverified.join(', ')}.</p>}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy || chosen.size === 0} onClick={() => search(ranked.filter((r) => chosen.has(r.name)).map((r) => ({ name: r.name, spellings: spellings(r.name, store.skillAliases) })))}>
          {busy ? 'Searching…' : `Search and add ${chosen.size}`}
        </Button>
        {busy && <Button onClick={() => { stopped.current = true; void send({ type: 'tab/cancel', tabId }); }}>Stop</Button>}
      </div>
      {error && <p role="alert" className="text-amber-800 dark:text-amber-300">{error}</p>}
      {outcomes.length > 0 && (
        <div role="region" aria-label="Skill results" className="space-y-1">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember options I choose below for next time</label>
          <ul className="space-y-1">
            {outcomes.map((o) => (
              <li key={o.name}>
                <span className="font-medium">{o.name}</span>: <span className={o.status === 'added' || o.status === 'alreadySelected' ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}>{STATUS_TEXT[o.status]}</span>
                {o.option && o.option !== o.name && <span className="text-xs"> (as "{o.option}")</span>}
                {o.suggestions && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {o.suggestions.map((s) => <Button key={s} disabled={busy} onClick={() => pickSuggestion(o.name, s)} aria-label={`Use "${s}" for ${o.name}`}>Use "{s}"</Button>)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
