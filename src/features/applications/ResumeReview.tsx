import type { ResumeExtract } from '../../domain/resume/extract';
import { reconcile, type RecordMatch } from '../../domain/resume/reconcile';
import type { MasterProfile } from '../../domain/schemas';
import { Button, CARD } from '../../ui/fields';

/** Side-by-side view of what was imported versus the verified master profile. The master profile stays canonical. */
export function ResumeReview({ extract, profile, busy, onAddToMaster }: {
  extract: ResumeExtract;
  profile: MasterProfile;
  busy: boolean;
  onAddToMaster: (kind: 'education' | 'employment', index: number) => void;
}) {
  const r = reconcile(extract, profile);
  return (
    <div className="space-y-4 text-sm">
      <p>Imported from <strong>{extract.source.toUpperCase()}</strong>{extract.resumeFilename && <> ({extract.resumeFilename})</>}.</p>
      {extract.warnings.length > 0 && (
        <ul aria-label="Import warnings" className="list-disc space-y-1 rounded border border-amber-300 bg-amber-50 py-2 pr-2 pl-6 dark:border-amber-700 dark:bg-amber-950">
          {extract.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <Records title="Education" matches={r.education} busy={busy} onAdd={(i) => onAddToMaster('education', i)} />
      <Records title="Employment" matches={r.employment} busy={busy} onAdd={(i) => onAddToMaster('employment', i)} />
      <section aria-label="Skills">
        <h4 className="font-semibold">Skills on this resume</h4>
        <p>{extract.skills.map((s) => s.name).join(', ') || 'None found.'}</p>
        {r.unverifiedSkills.length > 0 && (
          <p className="mt-1 text-amber-800 dark:text-amber-300">Not in your verified skills: {r.unverifiedSkills.join(', ')}. They won't be suggested until you add them to your master profile.</p>
        )}
      </section>
    </div>
  );
}

function Records<M>({ title, matches, busy, onAdd }: { title: string; matches: RecordMatch<M>[]; busy: boolean; onAdd: (index: number) => void }) {
  return (
    <section aria-label={title}>
      <h4 className="font-semibold">{title}</h4>
      {matches.length === 0 && <p className="text-slate-500">None found in the resume.</p>}
      <ul className="mt-1 space-y-2">
        {matches.map((m) => (
          <li key={m.index} className={CARD}>
            <p className="font-medium">{m.label}</p>
            {!m.master ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-amber-800 dark:text-amber-300">Not matched to your master profile.</span>
                <Button disabled={busy} onClick={() => onAdd(m.index)}>Add to master profile</Button>
              </div>
            ) : m.diffs.length === 0 ? (
              <p className="text-green-800 dark:text-green-300">Matches your master profile.</p>
            ) : (
              <table className="mt-1 w-full text-left">
                <caption className="sr-only">Differences for {m.label}</caption>
                <thead><tr><th scope="col">Field</th><th scope="col">Resume says</th><th scope="col">Master profile (used)</th></tr></thead>
                <tbody>
                  {m.diffs.map((d) => (
                    <tr key={d.field}><th scope="row" className="font-normal">{d.field}</th><td className="text-amber-800 dark:text-amber-300">{d.resume}</td><td>{d.master || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
