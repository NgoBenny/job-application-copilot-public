import { useState } from 'react';
import { MAX_IMPORT_BYTES, parseBackup } from '../../domain/backup';
import type { Store } from '../../domain/schemas';
import type { Response, StoreRequest } from '../../browser/messages';
import { Button, FILE_INPUT } from '../../ui/fields';

export function BackupPanel({ store, run }: { store?: Store; run: (r: StoreRequest) => Promise<Response> }) {
  const [pending, setPending] = useState<{ text: string; summary: string }>();
  const [status, setStatus] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  function exportBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `copilot-backup-${new Date().toISOString().slice(0, 10)}.backup.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setPending(undefined); setStatus(`Can't import: File is larger than ${MAX_IMPORT_BYTES / 1_000_000} MB. Nothing was changed.`); return; }
    const text = await file.text();
    const r = parseBackup(text);
    if (!r.ok) { setPending(undefined); setStatus(`Can't import: ${r.error} Nothing was changed.`); return; }
    const p = r.value.profile;
    const v = r.value;
    const sensitive = v.sensitiveAnswers.map((s) => s.topic).join(', ');
    setPending({ text, summary: `${p.education.length} education, ${p.employment.length} jobs, ${p.projects.length} projects, ${p.skills.length} skills, ${p.links.length} links, ${v.applications.length} applications, ${v.answers.length} saved answers, ${v.skillAliases.length} remembered skill options, ${v.optionAliases.length} remembered choices, ${v.accounts.length} employer accounts, and ${v.sensitiveAnswers.length ? `sensitive answers for: ${sensitive}` : 'no sensitive answers'}` });
    setStatus('');
  }

  async function confirmImport() {
    const r = await run({ type: 'store/import', text: pending!.text });
    setPending(undefined);
    setStatus(r.ok ? 'Backup imported.' : `Can't import: ${r.error} Nothing was changed.`);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="privacy-h" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
        <h2 id="privacy-h" className="font-semibold">Privacy</h2>
        <p className="mt-1">Everything stays in this browser profile. Nothing is sent to a server. Chrome stores it unencrypted, so anyone with access to this computer account can read it. Never store passwords here; the extension has no place for them.</p>
      </section>

      <section aria-labelledby="backup-h">
        <h2 id="backup-h" className="text-lg font-semibold">Backup</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button onClick={exportBackup} disabled={!store}>Export backup</Button>
          <label className="text-sm">Import backup <input type="file" accept="application/json,.json" className={FILE_INPUT} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
        {pending && (
          <div className="mt-3 rounded border border-slate-300 p-3 text-sm dark:border-slate-600">
            <p>This backup has {pending.summary}. Importing replaces all current data.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={confirmImport}>Replace my data</Button>
              <Button onClick={() => setPending(undefined)}>Cancel</Button>
            </div>
          </div>
        )}
        <p role="status" className="mt-2 text-sm">{status}</p>
      </section>

      <section aria-labelledby="wipe-h">
        <h2 id="wipe-h" className="text-lg font-semibold">Delete all data</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Removes your profile and everything else this extension stored. This can't be undone; export a backup first.</p>
        {confirmWipe ? (
          <div className="mt-2 flex gap-2">
            <Button variant="danger" onClick={async () => { const r = await run({ type: 'store/wipe' }); setConfirmWipe(false); setStatus(r.ok ? 'All data deleted.' : r.error); }}>Yes, delete everything</Button>
            <Button onClick={() => setConfirmWipe(false)}>Cancel</Button>
          </div>
        ) : <Button variant="danger" className="mt-2" onClick={() => setConfirmWipe(true)}>Delete all data…</Button>}
      </section>
    </div>
  );
}
