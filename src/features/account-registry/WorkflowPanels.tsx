import { useState } from 'react';
import type { Response, StoreRequest } from '../../browser/messages';
import type { AccountRecord, Application, Store } from '../../domain/schemas';
import type { Binding, ScanSnapshot } from '../../platform/adapter';
import { Button, CARD } from '../../ui/fields';

type Run = (r: StoreRequest) => Promise<Response>;

const PAGE_TEXT = {
  signIn: 'This is the sign-in page for this employer.',
  createAccount: 'This page creates an account with this employer.',
  verifyEmail: 'The site says it sent you a verification email.',
} as const;

/** Sign-in / registration help. Never touches passwords, codes, cookies or SSO; only offers the email and a status the user sets. */
export function AccountPanel({ snapshot, store, app, binding, run }: { snapshot: ScanSnapshot; store: Store; app: Application; binding: Binding; run: Run }) {
  const kind = snapshot.page?.kind;
  const [status, setStatus] = useState('');
  if (kind !== 'signIn' && kind !== 'createAccount' && kind !== 'verifyEmail') return null;
  const account = store.accounts.find((a) => a.tenantKey === binding.tenantKey);
  const email = account?.email || store.profile.contact.email;

  async function setAccount(next: AccountRecord['status']) {
    const rec: AccountRecord = { id: account?.id ?? crypto.randomUUID(), tenantKey: binding.tenantKey, employerLabel: app.employerLabel, email, status: next, updatedAt: new Date().toISOString() };
    const r = await run({ type: 'store/save', store: { ...store, accounts: [...store.accounts.filter((a) => a.tenantKey !== binding.tenantKey), rec] } });
    setStatus(r.ok ? 'Saved.' : r.error);
  }

  return (
    <section aria-labelledby="account-h" className={`${CARD} space-y-2 text-sm`}>
      <h3 id="account-h" className="font-semibold">Employer account</h3>
      <p>{PAGE_TEXT[kind]} The extension never types or reads passwords, verification codes or Google sign-in. Use your password manager or the site's own buttons.</p>
      {snapshot.page!.sso.length > 0 && <p>This site offers sign-in with {snapshot.page!.sso.join(', ')}. Choose it yourself if you prefer.</p>}
      <p>Your registry says: <strong>{account ? { unknown: 'not sure', registered: 'you have an account here', verificationPending: 'waiting for email verification' }[account.status] : 'nothing yet'}</strong>.</p>
      {email && (
        <p className="flex flex-wrap items-center gap-2">Email for this employer: <span className="font-medium">{email}</span>
          <Button onClick={() => void navigator.clipboard.writeText(email).then(() => setStatus('Email copied. Paste it into the email field yourself.'))}>Copy email</Button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void setAccount('registered')}>I have an account here</Button>
        <Button onClick={() => void setAccount('verificationPending')}>Waiting for verification email</Button>
        {account && <Button onClick={() => void setAccount('unknown')}>Not sure</Button>}
      </div>
      {kind === 'verifyEmail' && account?.status !== 'verificationPending' && <p className="text-xs text-slate-600 dark:text-slate-400">Tip: mark "Waiting for verification email" so you remember to check your inbox.</p>}
      <p role="status" className="text-xs">{status}</p>
    </section>
  );
}

/** Upload stays manual: the extension names the right file, the user picks it with the site's own button. */
export function UploadNote({ snapshot, app }: { snapshot: ScanSnapshot; app: Application }) {
  if (!snapshot.fields.some((f) => f.kind === 'file')) return null;
  return (
    <p role="note" className={`${CARD} text-sm`}>
      Upload <strong>{app.imported?.resumeFilename || 'your tailored resume for this job'}</strong> with the site's own upload button. The extension never uploads files for you.
    </p>
  );
}

/** Records a submission only when the user confirms it. */
export function ConfirmationPanel({ snapshot, store, app, run }: { snapshot: ScanSnapshot; store: Store; app: Application; run: Run }) {
  if (snapshot.page?.kind !== 'confirmation') return null;
  if (app.submittedAt) return <p role="status" className="text-sm">Recorded as submitted on {app.submittedAt.slice(0, 10)}.</p>;
  return (
    <section aria-labelledby="confirm-h" className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
      <h3 id="confirm-h" className="font-semibold">Looks like a confirmation page</h3>
      <p>Only you know whether the application really went through. Record it in your history?</p>
      <Button variant="primary" onClick={() => void run({ type: 'store/save', store: { ...store, applications: store.applications.map((a) => (a.id === app.id ? { ...a, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : a)) } })}>
        Yes, I submitted it
      </Button>
    </section>
  );
}

/** Dashboard list of employer accounts: email and status only. */
export function AccountsPanel({ store, run }: { store: Store; run: Run }) {
  const [status, setStatus] = useState('');
  const save = async (accounts: AccountRecord[], done: string) => { const r = await run({ type: 'store/save', store: { ...store, accounts } }); setStatus(r.ok ? done : r.error); };
  return (
    <section aria-labelledby="accounts-h" className="space-y-2">
      <h2 id="accounts-h" className="text-lg font-semibold">Employer accounts</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">One entry per employer portal. Only the email you used and a status you set. Never passwords, codes or sign-in sessions.</p>
      {store.accounts.length === 0 && <p className="text-sm text-slate-500">None yet. They're added from the step review on sign-in pages.</p>}
      <ul className="space-y-2">
        {store.accounts.map((a) => (
          <li key={a.id} className={`${CARD} text-sm`}>
            <p className="font-medium">{a.employerLabel || new URL(a.tenantKey).hostname}</p>
            <p className="text-xs text-slate-500">{a.tenantKey}</p>
            <label className="mt-1 block text-xs">Email used here
              <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800" type="email" defaultValue={a.email}
                onBlur={(e) => e.target.value !== a.email && void save(store.accounts.map((x) => (x.id === a.id ? { ...x, email: e.target.value.trim(), updatedAt: new Date().toISOString() } : x)), 'Email updated.')} />
            </label>
            <Button variant="danger" className="mt-1" aria-label={`Delete account entry for ${a.employerLabel || a.tenantKey}`} onClick={() => void save(store.accounts.filter((x) => x.id !== a.id), 'Account entry deleted.')}>Delete</Button>
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm">{status}</p>
    </section>
  );
}
