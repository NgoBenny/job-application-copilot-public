// Maps a Workday field (automation id, label, record) to a platform-neutral semantic key.
// Known automation ids first, labels second. Unknown fields stay unmapped and go to review.

const BY_ID: Record<string, string> = {
  legalNameSection_firstName: 'contact.firstName',
  legalNameSection_lastName: 'contact.lastName',
  'legalNameSection_preferredName': 'contact.preferredName',
  email: 'contact.email',
  'phone-number': 'contact.phone',
  addressSection_addressLine1: 'contact.addressLine1',
  addressSection_city: 'contact.city',
  addressSection_countryRegion: 'contact.region',
  addressSection_postalCode: 'contact.postalCode',
  countryDropdown: 'contact.country',
  linkedinQuestion: 'links.linkedin',
  jobTitle: 'employment.title',
  company: 'employment.employer',
  location: 'employment.location',
  currentlyWorkHere: 'employment.current',
  startDate: 'employment.start',
  endDate: 'employment.end',
  roleDescription: 'employment.description',
  school: 'education.school',
  degree: 'education.degree',
  fieldOfStudy: 'education.major',
  firstYearAttended: 'education.start',
  lastYearAttended: 'education.end',
  'file-upload-input-ref': 'resume.file',
};

type Rule = [RegExp, string];
const CONTACT: Rule[] = [
  [/^(legal )?first name|^given name/, 'contact.firstName'], [/^(legal )?last name|^family name|^surname/, 'contact.lastName'],
  [/^preferred (first )?name/, 'contact.preferredName'], [/^(confirm )?e-?mail( address)?$/, 'contact.email'], [/^phone( number)?$|^mobile( phone)?( number)?$/, 'contact.phone'],
  [/^address line 1$|^street( address)?$/, 'contact.addressLine1'], [/^city$|^town$/, 'contact.city'], [/^(state|province|region|state\/province)$/, 'contact.region'],
  [/^(postal|zip)( code)?$/, 'contact.postalCode'], [/^country( \/ territory)?$|^country\/region$/, 'contact.country'],
  [/linkedin/, 'links.linkedin'], [/github/, 'links.github'], [/^(personal )?(website|portfolio)( url)?$|^url$/, 'links.portfolio'],
];
const EMPLOYMENT: Rule[] = [
  [/^job title$|^title$|^position$/, 'employment.title'], [/^company$|^employer$|^organization$/, 'employment.employer'], [/^location$/, 'employment.location'],
  [/currently work here|current (job|role|position)/, 'employment.current'], [/^from( \(.*\))?$|^start( date)?$/, 'employment.start'], [/^to( \(.*\))?$|^end( date)?$/, 'employment.end'],
  [/description|responsibilities/, 'employment.description'],
];
const EDUCATION: Rule[] = [
  [/(^|[^a-z])gpa([^a-z]|$)|grade point|overall result/, 'education.gpa'], [/school|university|college|institution/, 'education.school'], [/^degree/, 'education.degree'], [/field of study|^major/, 'education.major'],
  // "To (Actual or Expected)" (live QA 2026-10-12, Workday employer 5).
  [/^from( \(.*\))?$|^start|first year/, 'education.start'], [/^to( \(.*\))?$|^end|last year|graduat/, 'education.end'],
];

export function semanticFor(automationId: string, label: string, recordKey: string | undefined, section: string): string | undefined {
  const l = label.toLowerCase().replace(/\s+/g, ' ').trim();
  const record = recordKey?.replace(/-\d+$/, '');
  const byId = BY_ID[automationId];
  // An id like "jobTitle" only means employment inside a work-experience record.
  if (byId && (!byId.startsWith('employment.') || record === 'workExperience') && (!byId.startsWith('education.') || record === 'education')) return byId;
  const rules = record === 'workExperience' ? EMPLOYMENT : record === 'education' ? EDUCATION : CONTACT;
  const hit = rules.find(([re]) => re.test(l))?.[1];
  if (hit) return hit;
  if (/skills/i.test(section) || /^(type to add )?skills$/.test(l)) return 'skills';
  return undefined;
}
