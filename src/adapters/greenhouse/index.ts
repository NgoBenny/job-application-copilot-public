import type { ApplicationAdapter } from '../../platform/adapter';
import { fillLifecycle } from '../shared/fill';
import { addEducation, writeField } from './controls';
import { detectGreenhouse } from './detection';
import { scanGreenhouse } from './scan';

const fill = fillLifecycle({
  scan: scanGreenhouse,
  write: (el, f, a, signal) => writeField(el, f.kind, a.proposed, signal, !!a.sensitiveCategory),
  // Greenhouse boards here only repeat the education block.
  addRecord: (doc, section) => (section === 'education' ? addEducation(doc) : { ok: false, outcome: 'unsupported', reason: 'Add this entry yourself, then scan again.' }),
});

export const greenhouse: ApplicationAdapter = {
  id: 'greenhouse',
  capabilities: new Set(['repeaterAdd']),
  async detect(ctx) {
    return { ok: true, value: detectGreenhouse(ctx.url, ctx.document) };
  },
  scan: fill.scan,
  apply: fill.apply,
  verify: fill.verify,
  observeChanges: fill.observeChanges,
};
