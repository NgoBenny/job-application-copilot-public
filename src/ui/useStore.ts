import { useCallback, useEffect, useState } from 'react';
import { send, type Response, type StoreRequest } from '../browser/messages';
import type { Store } from '../domain/schemas';

/** Live view of the store via the service worker; reloads when any window writes. */
export function useStore() {
  const [store, setStore] = useState<Store>();
  const [error, setError] = useState<string>();

  const run = useCallback(async (req: StoreRequest): Promise<Response> => {
    const r = await send(req).catch((): Response => ({ ok: false, error: 'The extension background stopped responding. Reload this page.' }));
    if (r.ok) { setStore(r.store); setError(undefined); } else setError(r.error);
    return r;
  }, []);

  useEffect(() => {
    void run({ type: 'store/get' });
    const onChange = () => void run({ type: 'store/get' });
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [run]);

  return { store, error, run };
}
