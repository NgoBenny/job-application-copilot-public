import type { ApplicationAdapter } from '../../platform/adapter';
import { fillLifecycle } from '../shared/fill';
import { writeField } from './controls';
import { detectAshby } from './detection';
import { scanAshby } from './scan';

const fill = fillLifecycle({
  scan: scanAshby,
  write: (el, f, a, signal) => writeField(el, f.kind, a.proposed, signal, !!a.sensitiveCategory),
  // Ashby application forms here have no repeating entries to add.
  addRecord: () => ({ ok: false, outcome: 'unsupported', reason: 'Add this entry yourself, then scan again.' }),
});

export const ashby: ApplicationAdapter = {
  id: 'ashby',
  capabilities: new Set(),
  async detect(ctx) {
    return { ok: true, value: detectAshby(ctx.url, ctx.document) };
  },
  scan: fill.scan,
  apply: fill.apply,
  verify: fill.verify,
  observeChanges: fill.observeChanges,
};
