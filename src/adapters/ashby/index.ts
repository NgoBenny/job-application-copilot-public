import type { ApplicationAdapter } from '../../platform/adapter';
import { sleep } from '../shared/dom';
import { fillLifecycle } from '../shared/fill';
import { writeField } from './controls';
import { detectAshby } from './detection';
import { scanAshby } from './scan';

// Ashby saves each answer into one form-wide store from a snapshot taken at its last redraw; answers written back to back
// can overwrite each other there while every box still shows its value (live 2026-10-16: Submit said Email was missing).
const SAVE_PAUSE_MS = 400;

const fill = fillLifecycle({
  scan: scanAshby,
  write: async (el, f, a, signal) => {
    const r = await writeField(el, f.kind, a.proposed, signal, !!a.sensitiveCategory);
    if (r.ok) await sleep(SAVE_PAUSE_MS, signal).catch(() => undefined);
    return r;
  },
  // Ashby application forms here have no repeating entries to add.
  addRecord: () => ({ ok: false, outcome: 'unsupported', reason: 'Add this entry yourself, then scan again.' }),
});

export const ashby: ApplicationAdapter = {
  id: 'ashby',
  async detect(ctx) {
    return { ok: true, value: detectAshby(ctx.url, ctx.document) };
  },
  scan: fill.scan,
  apply: fill.apply,
  verify: fill.verify,
  observeChanges: fill.observeChanges,
};
