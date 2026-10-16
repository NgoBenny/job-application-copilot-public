// Service-worker message router: validates sender and shape, then dispatches.
import { extensionError, requestError } from './errors';
import { Request } from './messages';
import { handle, isTrustedSender } from './store-service';
import * as tabs from './tab-service';

function route(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'tab/status': return tabs.status(req.tabId);
    case 'tab/activate': return tabs.activate(req.tabId, req.applicationId);
    case 'tab/deactivate': return tabs.deactivate(req.tabId);
    case 'tab/scan': return tabs.scan(req.tabId);
    case 'tab/fill': return tabs.fill(req.tabId, req.plan);
    case 'tab/cancel': return tabs.cancel(req.tabId);
    case 'tab/skills': return tabs.skills(req.tabId, req.request);
    default: return handle(req);
  }
}

export function listen() {
  tabs.listenTabs();
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!isTrustedSender(sender)) return false;
    const req = Request.safeParse(msg);
    if (!req.success) { reply({ ok: false, error: requestError(req.error) }); return false; }
    route(req.data).then(reply, (e: unknown) => reply({ ok: false, error: extensionError(e) }));
    return true;
  });
}
