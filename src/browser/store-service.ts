// Service-worker only: the single owner of chrome.storage.local.
import { migrate, parseBackup, validateStore, type Parsed } from '../domain/backup';
import { applyRetention, emptyStore, type Store } from '../domain/schemas';
import type { Response, StoreRequest } from './messages';

const KEY = 'store';

async function load(): Promise<Parsed<Store>> {
  const raw = (await chrome.storage.local.get(KEY))[KEY];
  if (raw === undefined) return { ok: true, value: emptyStore() };
  const migrated = migrate(raw);
  return migrated.ok ? validateStore(migrated.value) : migrated;
}

async function write(store: Store): Promise<Response> {
  const kept = applyRetention(store);
  await chrome.storage.local.set({ [KEY]: kept });
  return { ok: true, store: kept };
}

// Serialize writes so two concurrent saves can't both pass the revision check.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn);
  queue = p.catch(() => undefined);
  return p;
}

export async function handle(req: StoreRequest): Promise<Response> {
  if (req.type === 'store/wipe') return serial(async () => (await chrome.storage.local.clear(), { ok: true, store: emptyStore() }));
  return serial(async () => {
    const current = await load();
    if (req.type === 'store/get') return current.ok ? { ok: true, store: current.value } : { ok: false, error: `Saved data could not be read: ${current.error}` };
    // A corrupt store is never overwritten implicitly; the user can still import a backup or wipe.
    if (req.type === 'store/import') {
      const parsed = parseBackup(req.text);
      if (!parsed.ok) return parsed;
      return write({ ...parsed.value, revision: (current.ok ? current.value.revision : 0) + 1 });
    }
    if (!current.ok) return { ok: false, error: 'Saved data is unreadable; import a backup or delete all data first.' };
    const next = validateStore(req.store);
    if (!next.ok) return next;
    if (next.value.revision !== current.value.revision) return { ok: false, error: 'Your data changed in another window. Reload to see the latest version.' };
    return write({ ...next.value, revision: current.value.revision + 1 });
  });
}

/** Only extension pages may talk to storage; content scripts (sender.url = the web page) and web pages are refused. */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
}
