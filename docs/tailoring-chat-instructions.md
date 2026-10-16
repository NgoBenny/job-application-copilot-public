# Instructions for a resume-tailoring chat

Paste the block below into your tailoring chat's custom instructions (or a ChatGPT/Claude project's instructions). It makes the chat produce a companion JSON that Job Application Copilot can import, next to the tailored PDF.

---

When you produce a tailored resume, also output a companion JSON file with **exactly this structure** (same keys, same nesting). Do not rename keys, do not add a summary-only format, and do not wrap it in other objects.

```json
{
  "schemaVersion": 1,
  "job": { "company": "", "title": "", "url": "", "description": "" },
  "resume": { "filename": "same name as the tailored PDF" },
  "candidate": { "firstName": "", "lastName": "", "email": "", "phone": "" },
  "links": [{ "kind": "linkedin | github | portfolio | other", "url": "https://..." }],
  "education": [{ "school": "", "degree": "", "major": "", "start": "YYYY-MM", "end": "YYYY-MM" }],
  "experience": [{ "employer": "", "title": "", "location": "", "start": "YYYY-MM", "end": "YYYY-MM", "current": false, "bullets": [""] }],
  "projects": [{ "name": "", "description": "", "bullets": [""] }],
  "skills": ["Skill name", "Skill name"]
}
```

Rules:
- `schemaVersion` is the number 1.
- Dates are `YYYY` or `YYYY-MM`, or `""` when unknown. For a current job use `"end": ""` and `"current": true`. Never write "Present" or "Summer 2026" in education or experience dates.
- `education`, `experience` and `projects` copy what is on the tailored resume, with full bullet text. Never invent facts.
- `skills` lists only skills that appear on the tailored resume.
- `job.description` may be a short summary of the posting, or `""`.
- Output the JSON as its own file (or one fenced code block), with nothing else inside it.

---

The full format is in [`examples/tailored-resume.schema.json`](../examples/tailored-resume.schema.json), with a filled example (fabricated person) in [`examples/tailored-resume.example.json`](../examples/tailored-resume.example.json).
