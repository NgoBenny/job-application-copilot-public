import { defineBackground } from 'wxt/utils/define-background';
import { listen } from '../src/browser/router';

export default defineBackground(() => {
  // Content scripts must never read storage directly.
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch((e) => console.error('Storage could not be restricted to extension pages', e));
  listen();
});
