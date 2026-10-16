import { useState } from 'react';
import type { Response, StoreRequest } from '../../browser/messages';
import { SENSITIVE_TOPICS, type Scope, type SensitiveTopic } from '../../domain/questions';
import type { Store } from '../../domain/schemas';
import { Button, CARD } from '../../ui/fields';

const SCOPE_TEXT: Record<Scope, string> = { global: 'All employers', employer: 'One employer', job: 'One job' };
const input = 'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

export function AnswersPanel({ store, run }: { store: Store; run: (r: StoreRequest) => Promise<Response> }) {
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState({ question: '', answer: '' });
  const [sensitive, setSensitive] = useState<Record<string, string>>(() => Object.fromEntries(store.sensitiveAnswers.map((s) => [s.topic, s.answer])));

  async function save(next: Store, done: string) {
    const r = await run({ type: 'store/save', store: next });
    setStatus(r.ok ? done : `Not saved: ${r.error}`);
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="saved-h">
        <h2 id="saved-h" className="text-lg font-semibold">Saved answers</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Answers you chose to remember from the step review, and templates you write here. They are proposed only for the same or very similar question, never for reversed wording, and only where their scope allows.</p>
        {store.answers.length === 0 && <p className="mt-2 text-sm text-slate-500">None yet.</p>}
        <ul className="mt-2 space-y-2">
          {store.answers.map((m) => (
            <li key={m.id} className={`${CARD} text-sm`}>
              <p className="break-words font-medium">{m.question}</p>
              <label className="block text-xs">Answer
                <textarea className={input} rows={m.kind === 'text' ? 2 : 1} defaultValue={m.answer}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== m.answer && void save({ ...store, answers: store.answers.map((x) => (x.id === m.id ? { ...x, answer: e.target.value, confirmedAt: new Date().toISOString() } : x)) }, 'Answer updated.')} />
              </label>
              <p className="mt-1 text-xs text-slate-500">{m.kind === 'choice' ? 'Choice' : 'Text'} · {SCOPE_TEXT[m.scope]}{m.tenantKey && ` · ${new URL(m.tenantKey).hostname}`} · confirmed {m.confirmedAt.slice(0, 10)}</p>
              <Button variant="danger" className="mt-2" aria-label={`Delete saved answer: ${m.question}`} onClick={() => void save({ ...store, answers: store.answers.filter((x) => x.id !== m.id) }, 'Answer deleted.')}>Delete</Button>
            </li>
          ))}
        </ul>
        <div className={`${CARD} mt-4 text-sm`}>
          <h3 className="font-semibold">New text template</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">Use {'{{employer}}'} and {'{{jobTitle}}'}; they're filled from the application. Templates are used for every employer and always need your OK.</p>
          <label className="mt-2 block">Question<input className={input} value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} /></label>
          <label className="mt-2 block">Answer<textarea className={input} rows={3} value={draft.answer} onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))} /></label>
          <Button className="mt-2" disabled={!draft.question.trim() || !draft.answer.trim()} onClick={async () => {
            await save({ ...store, answers: [...store.answers, { id: crypto.randomUUID(), question: draft.question.trim(), kind: 'text', answer: draft.answer.trim(), options: [], scope: 'global', tenantKey: '', applicationId: '', confirmedAt: new Date().toISOString() }] }, 'Template saved.');
            setDraft({ question: '', answer: '' });
          }}>Save template</Button>
        </div>
      </section>

      <section aria-labelledby="choices-h">
        <h2 id="choices-h" className="text-lg font-semibold">Remembered choices</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Site options you picked with "Use …" for a profile value in a search box (like Field of Study). They are offered first next time and always need your OK.</p>
        {store.optionAliases.length === 0 && <p className="mt-2 text-sm text-slate-500">None yet.</p>}
        <ul className="mt-2 space-y-2">
          {store.optionAliases.map((a) => (
            <li key={`${a.field}|${a.value}`} className={`${CARD} flex flex-wrap items-center gap-2 text-sm`}>
              <span className="min-w-0 flex-1">{a.value} → <span className="font-medium">{a.option}</span> <span className="text-xs text-slate-500">({a.field})</span></span>
              <Button variant="danger" aria-label={`Delete remembered choice: ${a.value}`} onClick={() => void save({ ...store, optionAliases: store.optionAliases.filter((x) => x !== a) }, 'Choice deleted.')}>Delete</Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sensitive-h">
        <h2 id="sensitive-h" className="text-lg font-semibold">Sensitive answers</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Only what you type here is ever used for these questions. Each one is proposed only when the question, or else its choices, clearly names the topic, and only if the site shows a choice with exactly the text you typed (for example "No" or "I am not a protected veteran"). Employers word choices differently, so you can put several wordings on separate lines; each must still match a choice exactly. Every fill needs your OK, one field at a time. Leave a topic blank to always answer it yourself.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SENSITIVE_TOPICS.map((t) => (
            <label key={t.topic} className="text-sm font-medium">{t.title}
              <textarea rows={2} className={input} value={sensitive[t.topic] ?? ''} placeholder="Exactly as the site's choice reads; one wording per line" onChange={(e) => setSensitive((s) => ({ ...s, [t.topic]: e.target.value }))} />
            </label>
          ))}
        </div>
        <Button variant="primary" className="mt-3" onClick={() => void save({
          ...store, sensitiveAnswers: Object.entries(sensitive).filter(([, a]) => a.trim()).map(([topic, answer]) => ({ topic: topic as SensitiveTopic, answer: answer.split('\n').map((w) => w.trim()).filter(Boolean).join('\n') })),
        }, 'Sensitive answers saved.')}>Save sensitive answers</Button>
      </section>
      <p role="status" className="text-sm">{status}</p>
    </div>
  );
}
