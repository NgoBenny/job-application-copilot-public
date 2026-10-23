import type { ApplicationContent, MasterProfile } from '../../domain/schemas';
import type { ResumeExtract } from '../../domain/resume/extract';
import { reconcile } from '../../domain/resume/reconcile';
import { sameName } from '../../domain/text';
import { Button, CARD, Field } from '../../ui/fields';

export function ApplicationContentEditor({ content, profile, imported, onChange }: {
  content?: ApplicationContent; profile: MasterProfile; imported?: ResumeExtract;
  onChange: (content: ApplicationContent | undefined) => void;
}) {
  const initial = (): ApplicationContent => ({
    approved: false, educationIds: profile.education.map((e) => e.id),
    employment: profile.employment.map((e) => ({ masterId: e.id, description: e.bullets.join('\n') })),
    projects: profile.projects.map((p) => ({ masterId: p.id, description: [p.description, ...p.bullets].filter(Boolean).join('\n') })),
  });
  const update = (patch: Partial<ApplicationContent>) => onChange({ ...content!, ...patch, approved: false });
  const matches = imported && reconcile(imported, profile);
  const missing = content && (content.educationIds.some((id) => !profile.education.some((e) => e.id === id))
    || content.employment.some((e) => !profile.employment.some((m) => m.id === e.masterId))
    || content.projects.some((p) => !profile.projects.some((m) => m.id === p.masterId)));

  return (
    <section aria-labelledby="content-h" className="space-y-3">
      <h3 id="content-h" className="font-semibold">Application content</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Choose the jobs, schools and projects for this application. Edit wording here; names, titles and dates always come from your master profile. Imported wording is a draft: verify every claim.</p>
      <Field spec={{ key: 'enabled', label: 'Choose records and wording for this application', kind: 'checkbox' }} value={!!content} onChange={(enabled) => onChange(enabled ? initial() : undefined)} />
      {content && <>
        {missing && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">Some selected records were removed from your master profile and will not be used. Reload selections to review the current records.</p>}
        <Button onClick={() => { if (confirm('Replace these selections and wording with your current master profile?')) onChange(initial()); }}>Reload selections from master profile</Button>
        <fieldset className={`${CARD} space-y-2`}>
          <legend className="px-1 font-medium">Education to include</legend>
          {profile.education.length === 0 && <p className="text-sm">Add verified education in Master profile first.</p>}
          {profile.education.map((e) => <Field key={e.id} spec={{ key: 'included', label: `Include education: ${e.school} — ${e.degree}`, kind: 'checkbox' }} value={content.educationIds.includes(e.id)} onChange={(checked) => update({ educationIds: checked ? [...content.educationIds, e.id] : content.educationIds.filter((id) => id !== e.id) })} />)}
        </fieldset>
        <fieldset className={`${CARD} space-y-3`}>
          <legend className="px-1 font-medium">Employment to include</legend>
          {profile.employment.length === 0 && <p className="text-sm">Add verified employment in Master profile first.</p>}
          {profile.employment.map((e) => {
            const row = content.employment.find((r) => r.masterId === e.id);
            const match = matches?.employment.filter((m) => m.master?.id === e.id);
            const suggestion = match?.length === 1 ? imported!.experience[match[0]!.index]!.bullets.join('\n') : undefined;
            return <ContentRecord key={e.id} label={`employment: ${e.title} at ${e.employer}`} description={row?.description} suggestion={suggestion}
              onSelect={(checked) => update({ employment: checked ? [...content.employment, { masterId: e.id, description: e.bullets.join('\n') }] : content.employment.filter((r) => r.masterId !== e.id) })}
              onDescription={(description) => update({ employment: content.employment.map((r) => r.masterId === e.id ? { ...r, description } : r) })} />;
          })}
        </fieldset>
        <fieldset className={`${CARD} space-y-3`}>
          <legend className="px-1 font-medium">Projects to include</legend>
          <p className="text-sm text-slate-600 dark:text-slate-400">Approved project wording is available in the step review for manual entry. Project-specific form controls are unsupported.</p>
          {profile.projects.length === 0 && <p className="text-sm">Add verified projects in Master profile first.</p>}
          {profile.projects.map((p) => {
            const row = content.projects.find((r) => r.masterId === p.id);
            const candidates = imported?.projects.filter((r) => r.masterRecordId ? r.masterRecordId === p.id : sameName(r.name, p.name));
            const suggestion = candidates?.length === 1 ? [candidates[0]!.description, ...candidates[0]!.bullets].filter(Boolean).join('\n') : undefined;
            return <ContentRecord key={p.id} label={`project: ${p.name}`} description={row?.description} suggestion={suggestion}
              onSelect={(checked) => update({ projects: checked ? [...content.projects, { masterId: p.id, description: [p.description, ...p.bullets].filter(Boolean).join('\n') }] : content.projects.filter((r) => r.masterId !== p.id) })}
              onDescription={(description) => update({ projects: content.projects.map((r) => r.masterId === p.id ? { ...r, description } : r) })} />;
          })}
        </fieldset>
        <Field spec={{ key: 'approved', label: 'I verified the selected records and wording for this application', kind: 'checkbox' }} value={content.approved} onChange={(approved) => onChange({ ...content, approved: !!approved })} />
        <p role="status" className="text-sm">{content.approved ? 'Approved in this draft. Save application to use it.' : 'Needs review. Experience and education fills pause until you approve and save.'}</p>
      </>}
    </section>
  );
}

function ContentRecord({ label, description, suggestion, onSelect, onDescription }: {
  label: string; description?: string; suggestion?: string;
  onSelect: (selected: boolean) => void; onDescription: (description: string) => void;
}) {
  return <div className="space-y-2">
    <Field spec={{ key: 'included', label: `Include ${label}`, kind: 'checkbox' }} value={description !== undefined} onChange={(checked) => onSelect(!!checked)} />
    {description !== undefined && <>
      <Field spec={{ key: 'description', label: `Wording for ${label}`, kind: 'textarea' }} value={description} onChange={(value) => onDescription(value as string)} />
      {suggestion && <details className="text-sm">
        <summary className="cursor-pointer">Imported wording for {label}</summary>
        <p className="my-2 whitespace-pre-line break-words">{suggestion}</p>
        <Button onClick={() => onDescription(suggestion)}>Use imported wording for {label}</Button>
      </details>}
    </>}
  </div>;
}
