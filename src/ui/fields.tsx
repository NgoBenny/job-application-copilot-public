import { useId } from 'react';

export type FieldSpec<T> = {
  key: keyof T & string;
  label: string;
  kind?: 'text' | 'url' | 'email' | 'date' | 'textarea' | 'lines' | 'checkbox' | 'select';
  options?: readonly string[];
  wide?: boolean;
};

const input = 'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

/** One labeled control. `lines` edits a string[] as one entry per line. */
export function Field<T>({ spec, value, error, onChange }: { spec: FieldSpec<T>; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = useId();
  const kind = spec.kind ?? 'text';
  const describedBy = error ? `${id}-err` : undefined;
  const common = { id, 'aria-invalid': !!error, 'aria-describedby': describedBy };
  let control;
  if (kind === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {spec.label}
      </label>
    );
  } else if (kind === 'select') {
    control = (
      <select {...common} className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {spec.options!.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    );
  } else if (kind === 'textarea' || kind === 'lines') {
    const v = kind === 'lines' ? (value as string[]).join('\n') : String(value);
    control = <textarea {...common} className={input} rows={kind === 'lines' ? 4 : 3} value={v} onChange={(e) => onChange(kind === 'lines' ? e.target.value.split('\n') : e.target.value)} />;
  } else {
    control = (
      <input {...common} className={input} type={kind === 'date' ? 'text' : kind} placeholder={kind === 'date' ? 'YYYY or YYYY-MM' : undefined}
        value={String(value)} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <div className={spec.wide || kind === 'textarea' || kind === 'lines' ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="text-sm font-medium">{spec.label}{kind === 'lines' && <span className="font-normal text-slate-500"> (one per line)</span>}</label>
      {control}
      {error && <p id={describedBy} className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Native file input whose built-in button looks like a secondary Button (keeps the browser's keyboard and screen-reader support). */
export const FILE_INPUT = 'ml-2 text-sm text-slate-600 dark:text-slate-400 file:mr-2 file:cursor-pointer file:rounded file:border file:border-solid file:border-slate-300 file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-100 dark:file:border-slate-600 dark:file:text-slate-100 dark:hover:file:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600';

export function Button({ variant = 'secondary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-blue-700 text-white shadow-sm hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
    secondary: 'border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800',
    danger: 'border border-red-700 text-red-700 hover:bg-red-50 dark:border-red-500 dark:text-red-300 dark:hover:bg-red-950',
  }[variant];
  return <button type="button" {...props} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-70 ${styles} ${props.className ?? ''}`} />;
}

/** One meaning per tone everywhere: success = done or safe, warning = needs you, sensitive = protected answer. */
const TONES = {
  success: 'bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  sensitive: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-200',
} as const;
type Tone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-px text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

/** The one container style for grouped content (entries, proposals, saved answers). */
export const CARD = 'rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900';
