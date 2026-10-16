import { useEffect, useState } from 'react';
import { send, type TabStatus } from '../../src/browser/messages';
import { Button } from '../../src/ui/fields';
import { useStore } from '../../src/ui/useStore';
import { useTabId } from '../../src/ui/useTabId';

export function Popup() {
  const tabId = useTabId();
  const { store } = useStore();
  const [tab, setTab] = useState<TabStatus>({});
  const [appId, setAppId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tabId === undefined) return;
    void send({ type: 'tab/status', tabId }).then((r) => { if (r.ok) setTab(r); });
  }, [tabId]);

  const apps = store?.applications ?? [];
  const chosen = appId || tab.binding?.applicationId || apps.at(-1)?.id || '';
  const bound = tab.binding && apps.find((a) => a.id === tab.binding!.applicationId);

  async function activate() {
    if (tabId === undefined) return;
    setBusy(true);
    const r = await send({ type: 'tab/activate', tabId, applicationId: chosen });
    setBusy(false);
    if (!r.ok) { setMessage(r.error); return; }
    setTab(r);
    if (r.binding) setMessage('');
    else if (r.detection?.status === 'uncertain') setMessage("This page isn't recognized as an application form yet, so the extension stays off. Try again once the application form is showing.");
    else setMessage('This is not a supported application site. The extension stays off here.');
  }

  return (
    <main className="w-80 space-y-3 p-4">
      <h1 className="text-base font-semibold tracking-tight">Job Application Copilot</h1>
      <p role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${bound ? 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-100' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${bound ? 'bg-green-600 dark:bg-green-400' : 'bg-slate-400'}`} />
        <span>{bound ? <>Active on this tab for <strong>{bound.employerLabel || 'Untitled employer'} — {bound.jobTitle || 'untitled job'}</strong>.</> : 'Not active on this tab.'}</span>
      </p>
      {apps.length === 0 ? (
        <p className="text-sm">Create an application in the dashboard first.</p>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="app">Application</label>
          <select id="app" className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" value={chosen} onChange={(e) => setAppId(e.target.value)}>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.employerLabel || 'Untitled employer'} — {a.jobTitle || 'untitled job'}</option>)}
          </select>
          <Button variant="primary" onClick={activate} disabled={busy || !chosen}>{bound ? 'Re-activate on this tab' : 'Activate on this tab'}</Button>
        </div>
      )}
      {message && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{message}</p>}
      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        {/* sidePanel.open must run inside the click gesture, so it isn't awaited after other calls. */}
        <Button onClick={() => { if (tabId !== undefined) void chrome.sidePanel.open({ tabId }); window.close(); }}>Open step review</Button>
        <Button onClick={() => void chrome.runtime.openOptionsPage()}>Open dashboard</Button>
      </div>
    </main>
  );
}
