import { useRef, useState } from 'react';
import type { Response, StoreRequest } from '../../browser/messages';
import { Application, type Store } from '../../domain/schemas';
import type { ResumeExtract } from '../../domain/resume/extract';
import { Button, Field, FILE_INPUT, type FieldSpec } from '../../ui/fields';
import { importResume } from './importResume';
import { ResumeReview } from './ResumeReview';

type Run = (r: StoreRequest) => Promise<Response>;

const newApplication = (): Application => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), platformId: 'workday', employerLabel: '', jobTitle: '', jobUrl: '', portalOrigin: '', tenantKey: '',
    jobDescription: '', persistJobDescription: false, resumeImportMethod: 'none', reviewed: false, skillSelections: [], submittedAt: '', stepsSeen: [], createdAt: now, updatedAt: now,
  };
};

const fields: FieldSpec<Application>[] = [
  { key: 'employerLabel', label: 'Employer' }, { key: 'jobTitle', label: 'Job title' }, { key: 'jobUrl', label: 'Job posting URL', kind: 'url', wide: true },
];

export function ApplicationsPanel({ store, run }: { store: Store; run: Run }) {
  const [selected, setSelected] = useState<string>();
  const dirty = useRef(false);
  const app = store.applications.find((a) => a.id === selected);

  function select(id: string | undefined) {
    if (dirty.current && !confirm('Discard unsaved changes to this application?')) return;
    dirty.current = false;
    setSelected(id);
  }

  async function create() {
    const a = newApplication();
    const r = await run({ type: 'store/save', store: { ...store, applications: [...store.applications, a] } });
    if (r.ok) select(a.id);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <nav aria-label="Applications">
        <Button variant="primary" onClick={create}>New application</Button>
        <ul className="mt-3 space-y-1">
          {store.applications.length === 0 && <li className="text-sm text-slate-500">No applications yet.</li>}
          {store.applications.map((a) => (
            <li key={a.id}>
              <button type="button" aria-current={a.id === selected ? 'true' : undefined} onClick={() => select(a.id)}
                className={`w-full rounded px-2 py-1 text-left text-sm ${a.id === selected ? 'bg-blue-100 font-semibold dark:bg-blue-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {a.employerLabel || 'Untitled employer'} — {a.jobTitle || 'untitled job'}
                <span className="block text-xs font-normal text-slate-500">{a.submittedAt ? `Submitted ${a.submittedAt.slice(0, 10)} · ` : ''}{a.reviewed ? 'Reviewed' : 'Not reviewed'} · {a.resumeImportMethod === 'none' ? 'no resume' : a.resumeImportMethod.toUpperCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {/* key = id: switching applications always starts from that application's saved data. */}
      {app ? <ApplicationEditor key={app.id} app={app} store={store} run={run} onDirty={(d) => (dirty.current = d)} onDeleted={() => { dirty.current = false; setSelected(undefined); }} />
        : <p className="text-sm text-slate-500">Select or create an application.</p>}
    </div>
  );
}

function ApplicationEditor({ app, store, run, onDirty, onDeleted }: { app: Application; store: Store; run: Run; onDirty: (d: boolean) => void; onDeleted: () => void }) {
  const [draft, setDraftState] = useState(app);
  // The job description lives here while the page is open; it is written only if the user opts in.
  const [jd, setJd] = useState(app.jobDescription);
  const [files, setFiles] = useState<{ pdf?: File; json?: File }>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setDraft = (patch: Partial<Application>) => { setDraftState((d) => ({ ...d, ...patch })); onDirty(true); setStatus(''); };

  async function readFiles() {
    if (draft.imported && !confirm('Replace the current resume import for this application?')) return;
    setBusy(true);
    const r = await importResume(files.pdf, files.json);
    setBusy(false);
    if (!r.ok) { setStatus(`Not imported. ${r.error}`); return; }
    const x: ResumeExtract = r.value;
    setDraft({
      imported: x, resumeImportMethod: x.source, reviewed: false,
      employerLabel: draft.employerLabel || x.job.company, jobTitle: draft.jobTitle || x.job.title, jobUrl: draft.jobUrl || x.job.url,
    });
    if (!jd && x.job.description) setJd(x.job.description);
    setStatus('Resume imported. Review it below, then save.');
  }

  // Manual fallback when the site's confirmation was closed before a scan; saved at once, and kept in the draft.
  async function markSubmitted(submittedAt: string) {
    const r = await run({ type: 'store/save', store: { ...store, applications: store.applications.map((a) => (a.id === app.id ? { ...a, submittedAt, updatedAt: new Date().toISOString() } : a)) } });
    if (!r.ok) { setStatus(r.error); return; }
    setDraftState((d) => ({ ...d, submittedAt }));
    setStatus(submittedAt ? 'Marked as submitted.' : 'Submission date cleared.');
  }

  async function save() {
    const next = { ...draft, jobDescription: jd, updatedAt: new Date().toISOString() };
    const parsed = Application.safeParse(next);
    if (!parsed.success) { setStatus(`Not saved: check ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}.`); return; }
    if (!store.applications.some((a) => a.id === app.id)) { setStatus('Not saved: this application was deleted in another window.'); return; }
    const r = await run({ type: 'store/save', store: { ...store, applications: store.applications.map((a) => (a.id === app.id ? parsed.data : a)) } });
    if (r.ok) { onDirty(false); setStatus('Saved.'); } else setStatus(`Not saved: ${r.error}`);
  }

  async function addToMaster(kind: 'education' | 'employment', i: number) {
    const x = draft.imported!;
    const profile = { ...store.profile };
    if (kind === 'education') {
      const e = x.education[i]!;
      profile.education = [...profile.education, { id: crypto.randomUUID(), school: e.school, degree: e.degree, major: e.major, start: e.start, end: e.end, status: '', gpa: '' }];
    } else {
      // Tailored bullets are wording for one job, not verified facts, so they are not copied.
      const e = x.experience[i]!;
      profile.employment = [...profile.employment, { id: crypto.randomUUID(), employer: e.employer, title: e.title, location: '', start: e.start, end: e.end, current: e.current, bullets: [] }];
    }
    setBusy(true);
    const r = await run({ type: 'store/save', store: { ...store, profile } });
    setBusy(false);
    setStatus(r.ok ? 'Added to your master profile. Check it in Master profile.' : `Not added: ${r.error}`);
  }

  return (
    <article aria-labelledby="app-h" className="space-y-6">
      <h2 id="app-h" className="text-lg font-semibold">{draft.employerLabel || 'Untitled employer'} — {draft.jobTitle || 'untitled job'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => <Field key={f.key} spec={f} value={draft[f.key]} onChange={(v) => setDraft({ [f.key]: v })} />)}
      </div>

      <section aria-labelledby="jd-h">
        <h3 id="jd-h" className="font-semibold">Job description (optional)</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">Used only to rank which of your verified skills are relevant. It is never treated as proof you have a skill.</p>
        <Field spec={{ key: 'jobDescription', label: 'Paste the job description', kind: 'textarea' }} value={jd} onChange={(v) => { setJd(v as string); onDirty(true); }} />
        <Field spec={{ key: 'persistJobDescription', label: 'Save the job description with this application', kind: 'checkbox' }} value={draft.persistJobDescription} onChange={(v) => setDraft({ persistJobDescription: v as boolean })} />
      </section>

      <section aria-labelledby="resume-h">
        <h3 id="resume-h" className="font-semibold">Tailored resume</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">Choose the PDF you will upload to the employer, its companion JSON, or both. Files are read on this device only.</p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <label className="text-sm">Resume PDF <input type="file" accept="application/pdf,.pdf" className={FILE_INPUT} onChange={(e) => setFiles((f) => ({ ...f, pdf: e.target.files?.[0] }))} /></label>
          <label className="text-sm">Companion JSON <input type="file" accept="application/json,.json" className={FILE_INPUT} onChange={(e) => setFiles((f) => ({ ...f, json: e.target.files?.[0] }))} /></label>
          <Button onClick={readFiles} disabled={busy || (!files.pdf && !files.json)}>{busy ? 'Reading…' : 'Read resume files'}</Button>
        </div>
        {draft.imported && <div className="mt-4"><ResumeReview extract={draft.imported} profile={store.profile} busy={busy} onAddToMaster={addToMaster} /></div>}
      </section>

      {draft.stepsSeen.length > 0 && (
        <section aria-labelledby="steps-h" className="text-sm">
          <h3 id="steps-h" className="font-semibold">Steps seen</h3>
          <ol className="list-decimal pl-5">{draft.stepsSeen.map((s, i) => <li key={i}>{s.label} <span className="text-xs text-slate-500">{s.at.slice(0, 16).replace('T', ' ')}</span></li>)}</ol>
        </section>
      )}

      <Field spec={{ key: 'reviewed', label: 'I reviewed this import against my master profile', kind: 'checkbox' }} value={draft.reviewed} onChange={(v) => setDraft({ reviewed: v as boolean })} />

      <p className="flex flex-wrap items-center gap-2 text-sm">
        {draft.submittedAt ? <>Submitted on {draft.submittedAt.slice(0, 10)}. <Button onClick={() => void markSubmitted('')}>Clear</Button></>
          : <>Not recorded as submitted. <Button onClick={() => void markSubmitted(new Date().toISOString())}>Mark as submitted</Button></>}
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button variant="primary" onClick={save}>Save application</Button>
        {confirmDelete ? (
          <>
            <Button variant="danger" onClick={async () => { const r = await run({ type: 'store/save', store: { ...store, applications: store.applications.filter((a) => a.id !== app.id) } }); if (r.ok) onDeleted(); else setStatus(r.error); }}>Yes, delete this application</Button>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </>
        ) : <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete application…</Button>}
        <p role="status" className="text-sm">{status}</p>
      </div>
    </article>
  );
}
