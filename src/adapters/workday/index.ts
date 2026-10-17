import type { ApplicationAdapter } from '../../platform/adapter';
import { fillLifecycle } from '../shared/fill';
import { addRecord, pressKey, sleep, writeField } from './controls';
import { detectWorkday } from './detection';
import { scanWorkday } from './scan';
import { pickOne, searchSkills } from './skills-search';

const fill = fillLifecycle({
  scan: scanWorkday,
  // Single-choice search boxes (Field of Study) pick one option; sensitive answers never go through them.
  write: (el, f, a, signal) => (f.kind === 'multiselect' && !a.sensitiveCategory ? pickOne(el as HTMLInputElement, a.proposed, signal) : writeField(el, f.kind, a.proposed, signal, !!a.sensitiveCategory)),
  addRecord: (doc, section) => addRecord(doc, section === 'education' ? 'education' : 'workExperience'),
});

export const workday: ApplicationAdapter = {
  id: 'workday',
  capabilities: new Set(['repeaterAdd', 'skillSearch', 'accountDetect', 'confirmationDetect']),
  async detect(ctx) {
    return { ok: true, value: detectWorkday(ctx.url, ctx.document) };
  },
  scan: fill.scan,
  apply: fill.apply,
  verify: fill.verify,
  observeChanges: fill.observeChanges,
  async searchSkills(ctx, req, signal) {
    const find = () => { const { snapshot, elements } = scanWorkday(ctx.document, fill.revision()); return { f: snapshot.fields.find((x) => x.fieldId === req.fieldId), el: elements.get(req.fieldId) }; };
    let { f, el } = find();
    // Narrow layouts leave the skills pop-up open after a batch, hiding the page (aria-hidden) from the scan; Escape closes it
    // and the chosen skills stay (live 2026-10-17: the second batch said the field was gone).
    if (!f) { pressKey(ctx.document.activeElement ?? ctx.document.body, 'Escape'); await sleep(500, signal).catch(() => undefined); ({ f, el } = find()); }
    if (!f || !el || f.kind !== 'multiselect' || f.semantic !== 'skills' || f.protection || f.disabled) return { ok: false, outcome: 'stale', reason: 'The skills field is no longer on the page. Scan again.' };
    return { ok: true, value: await searchSkills(el as HTMLInputElement, req.items, signal) };
  },
};
