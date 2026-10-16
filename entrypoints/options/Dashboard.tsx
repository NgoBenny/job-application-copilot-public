import { useState } from 'react';
import { AccountsPanel } from '../../src/features/account-registry/WorkflowPanels';
import { AnswersPanel } from '../../src/features/answer-memory/AnswersPanel';
import { ApplicationsPanel } from '../../src/features/applications/ApplicationsPanel';
import { BackupPanel } from '../../src/features/profile/BackupPanel';
import { ProfileEditor } from '../../src/features/profile/ProfileEditor';
import { readTheme, setTheme, type Theme } from '../../src/ui/theme';
import { useStore } from '../../src/ui/useStore';

const sections = ['Master profile', 'Applications', 'Saved answers', 'Employer accounts', 'Backup & privacy'] as const;

export function Dashboard() {
  const { store, error, run } = useStore();
  const [section, setSection] = useState<(typeof sections)[number]>('Master profile');
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your data stays on this device.</p>
        </div>
        <label className="text-sm">Theme
          <select className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800" defaultValue={readTheme()} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <nav aria-label="Dashboard sections" className="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {sections.map((s) => (
          <button key={s} type="button" aria-current={s === section ? 'page' : undefined} onClick={() => setSection(s)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${s === section ? 'border-blue-700 font-semibold' : 'border-transparent text-slate-600 dark:text-slate-400'}`}>{s}</button>
        ))}
      </nav>
      {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <main className="mt-6">
        {section === 'Master profile' && store && <ProfileEditor store={store} run={run} />}
        {section === 'Applications' && store && <ApplicationsPanel store={store} run={run} />}
        {section === 'Saved answers' && store && <AnswersPanel store={store} run={run} />}
        {section === 'Employer accounts' && store && <AccountsPanel store={store} run={run} />}
        {section === 'Backup & privacy' && <BackupPanel store={store} run={run} />}
      </main>
    </div>
  );
}
