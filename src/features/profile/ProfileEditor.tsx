import { useState } from 'react';
import { MasterProfile, type Contact, type Education, type Employment, type Link, type Project, type Skill, type Store } from '../../domain/schemas';
import { Button, CARD, Field, type FieldSpec } from '../../ui/fields';
import type { Response, StoreRequest } from '../../browser/messages';

const contactFields: FieldSpec<Contact>[] = [
  { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Last name' }, { key: 'preferredName', label: 'Preferred name' },
  { key: 'email', label: 'Email', kind: 'email' }, { key: 'phone', label: 'Phone' }, { key: 'addressLine1', label: 'Address line 1', wide: true },
  { key: 'city', label: 'City' }, { key: 'region', label: 'State / region' }, { key: 'postalCode', label: 'Postal code' }, { key: 'country', label: 'Country' },
];

type ListKey = 'links' | 'education' | 'employment' | 'projects' | 'skills';
type Item<K extends ListKey> = MasterProfile[K][number];

const lists: { [K in ListKey]: { title: string; noun: string; fields: FieldSpec<Item<K>>[]; blank: () => Omit<Item<K>, 'id'>; name: (i: Item<K>) => string } } = {
  links: {
    title: 'Links', noun: 'link',
    fields: [{ key: 'kind', label: 'Type', kind: 'select', options: ['linkedin', 'github', 'portfolio', 'other'] }, { key: 'label', label: 'Label' }, { key: 'url', label: 'URL', kind: 'url', wide: true }],
    blank: () => ({ kind: 'other', label: '', url: '' }), name: (l: Link) => l.label || l.kind,
  },
  education: {
    title: 'Education', noun: 'education record',
    fields: [{ key: 'school', label: 'School', wide: true }, { key: 'degree', label: 'Degree' }, { key: 'major', label: 'Major / field of study' },
      { key: 'start', label: 'Start', kind: 'date' }, { key: 'end', label: 'End or expected graduation', kind: 'date' },
      { key: 'status', label: 'Status', kind: 'select', options: ['', 'completed', 'in progress', 'expected'] }, { key: 'gpa', label: 'GPA (optional)' }],
    blank: () => ({ school: '', degree: '', major: '', start: '', end: '', status: '', gpa: '' }), name: (e: Education) => e.school,
  },
  employment: {
    title: 'Employment', noun: 'job',
    fields: [{ key: 'employer', label: 'Employer' }, { key: 'title', label: 'Job title' }, { key: 'location', label: 'Location' },
      { key: 'current', label: 'I currently work here', kind: 'checkbox' }, { key: 'start', label: 'Start', kind: 'date' }, { key: 'end', label: 'End', kind: 'date' },
      { key: 'bullets', label: 'Verified description', kind: 'lines' }],
    blank: () => ({ employer: '', title: '', location: '', start: '', end: '', current: false, bullets: [] }), name: (e: Employment) => [e.title, e.employer].filter(Boolean).join(' at '),
  },
  projects: {
    title: 'Projects', noun: 'project',
    fields: [{ key: 'name', label: 'Name' }, { key: 'url', label: 'URL', kind: 'url' }, { key: 'description', label: 'Description', kind: 'textarea' }, { key: 'bullets', label: 'Highlights', kind: 'lines' }],
    blank: () => ({ name: '', url: '', description: '', bullets: [] }), name: (p: Project) => p.name,
  },
  skills: {
    title: 'Skills you actually have', noun: 'skill',
    fields: [{ key: 'name', label: 'Skill' }],
    blank: () => ({ name: '' }), name: (s: Skill) => s.name,
  },
};

// Drop empty lines users leave while typing bullet lists.
const tidy = (p: MasterProfile): MasterProfile => ({
  ...p,
  employment: p.employment.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
  projects: p.projects.map((x) => ({ ...x, bullets: x.bullets.map((b) => b.trim()).filter(Boolean) })),
});

export function ProfileEditor({ store, run }: { store: Store; run: (r: StoreRequest) => Promise<Response> }) {
  const [draft, setDraft] = useState(store.profile);
  const [base, setBase] = useState(store);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  // Any edit replaces the draft object; save, discard and sync reset it to the stored object. No per-keystroke serialization.
  const dirty = draft !== base.profile;

  // Another window saved: adopt its data unless there are unsaved edits here (state adjusted during render, not in an effect).
  if (store.revision !== base.revision && !dirty) { setDraft(store.profile); setBase(store); }
  const stale = store.revision !== base.revision && dirty;

  async function save() {
    const profile = tidy(draft);
    const parsed = MasterProfile.safeParse(profile);
    if (!parsed.success) {
      // Map nested issues (e.g. one bullet line) onto the field that shows them.
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.slice(0, i.path[0] === 'contact' ? 2 : 3).join('.'), i.message])));
      setStatus('Not saved: fix the highlighted fields.');
      return;
    }
    setErrors({});
    const r = await run({ type: 'store/save', store: { ...base, profile: parsed.data } });
    if (r.ok) { setBase(r.store); setDraft(r.store.profile); setStatus('Saved.'); } else setStatus(`Not saved: ${r.error}`);
  }

  function setList<K extends ListKey>(key: K, items: Item<K>[]) {
    setDraft((d) => ({ ...d, [key]: items }));
    setStatus('');
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 py-2 dark:border-slate-700 dark:bg-slate-900/95">
        <Button variant="primary" onClick={save} disabled={!dirty}>Save profile</Button>
        {dirty && <Button onClick={() => { setDraft(store.profile); setBase(store); setErrors({}); setStatus('Changes discarded.'); }}>Discard changes</Button>}
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{stale ? 'This data changed in another window. Discard your changes to load it.' : status || (dirty ? 'Unsaved changes' : '')}</p>
      </div>

      <section aria-labelledby="contact-h">
        <h2 id="contact-h" className="text-lg font-semibold">Contact</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {contactFields.map((f) => (
            <Field key={f.key} spec={f} value={draft.contact[f.key]} error={errors[`contact.${f.key}`]}
              onChange={(v) => { setDraft((d) => ({ ...d, contact: { ...d.contact, [f.key]: v } })); setStatus(''); }} />
          ))}
        </div>
      </section>

      {(Object.keys(lists) as ListKey[]).map((key) => (
        <ListSection key={key} listKey={key} items={draft[key]} errors={errors} onChange={(items) => setList(key, items)} />
      ))}
    </div>
  );
}

function ListSection<K extends ListKey>({ listKey, items, errors, onChange }: { listKey: K; items: Item<K>[]; errors: Record<string, string>; onChange: (items: Item<K>[]) => void }) {
  const cfg = lists[listKey];
  const update = (i: number, patch: Partial<Item<K>>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <section aria-labelledby={`${listKey}-h`}>
      <h2 id={`${listKey}-h`} className="text-lg font-semibold">{cfg.title}</h2>
      {items.length === 0 && <p className="mt-1 text-sm text-slate-500">None yet.</p>}
      <ul className="mt-2 space-y-3">
        {items.map((item, i) => (
          <li key={item.id} className={CARD}>
            <div className="grid gap-3 sm:grid-cols-2">
              {cfg.fields.map((f) => (
                <Field key={f.key} spec={f} value={item[f.key]} error={errors[`${listKey}.${i}.${f.key}`]} onChange={(v) => update(i, { [f.key]: v } as Partial<Item<K>>)} />
              ))}
            </div>
            <Button variant="danger" className="mt-3" onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${cfg.noun} ${cfg.name(item as never) || i + 1}`}>Remove</Button>
          </li>
        ))}
      </ul>
      <Button className="mt-2" onClick={() => onChange([...items, { id: crypto.randomUUID(), ...cfg.blank() } as Item<K>])}>Add {cfg.noun}</Button>
    </section>
  );
}
