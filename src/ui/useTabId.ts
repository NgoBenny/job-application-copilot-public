import { useEffect, useState } from 'react';

/** The tab this page acts on: `?tabId=` when given (side panel opened for a tab, tests), else the active tab. */
export function useTabId(follow = false) {
  const fixed = Number(new URLSearchParams(location.search).get('tabId')) || undefined;
  const [tabId, setTabId] = useState(fixed);
  useEffect(() => {
    if (fixed) return;
    const read = () => chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTabId(t?.id));
    void read();
    if (!follow) return;
    // The side panel stays open while the user switches tabs.
    chrome.tabs.onActivated.addListener(read);
    return () => chrome.tabs.onActivated.removeListener(read);
  }, [fixed, follow]);
  return tabId;
}
