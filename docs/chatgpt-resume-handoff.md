# Getting a companion JSON from your resume-tailoring chat

Keep your current workflow. You still paste a job description into your resume chat and download a tailored PDF. Adding one request gets you a small JSON file that the Copilot reads more reliably than the PDF.

The JSON is optional. PDF-only imports work, but the Copilot reads them with layout heuristics, so you'll review more.

## Prompt to add to your resume chat

Paste this after the chat produces the tailored PDF:

> Also give me a downloadable file named after the PDF but ending in `.json` (for example `avery-acme-swe.json`). It must follow this exact shape and contain only facts already in my resume: no new skills, employers, titles or dates. Leave unknown values as empty strings.
>
> ```json
> {
>   "schemaVersion": 1,
>   "job": { "company": "", "title": "", "url": "", "description": "" },
>   "resume": { "filename": "<the exact PDF filename>" },
>   "candidate": { "firstName": "", "lastName": "", "email": "", "phone": "" },
>   "links": [{ "kind": "linkedin | github | portfolio | other", "url": "https://..." }],
>   "education": [{ "school": "", "degree": "", "major": "", "start": "YYYY-MM", "end": "YYYY-MM" }],
>   "experience": [{ "employer": "", "title": "", "location": "", "start": "YYYY-MM", "end": "YYYY-MM", "current": false, "bullets": [""] }],
>   "projects": [{ "name": "", "description": "", "bullets": [""] }],
>   "skills": [{ "name": "", "source": "resume", "evidence": "where it appears in the resume" }]
> }
> ```
>
> Dates are `YYYY` or `YYYY-MM`. If you only know the year, use `YYYY`; never guess a month. For a skill that appears only in the job description and not in my resume, use `"source": "job"`.

## Field notes

| Field | Meaning |
|---|---|
| `resume.filename` | Must match the PDF's filename. A mismatch is flagged as "may be for different jobs". |
| `job.description` | Optional. Saved with the application only if you tick "Save the job description". |
| `education[].masterRecordId`, `experience[].masterRecordId` | Optional. The id of the matching record in your master profile (shown in a backup export). It makes matching exact. |
| `skills[].source` | `resume`, `job` or `both`. Skills marked `job` are never imported as your skills. |

The full contract is `examples/tailored-resume.schema.json` (JSON Schema). A complete example with fabricated data is `examples/tailored-resume.example.json`.

## What the Copilot does with it

- Validates it. Files that are oversized (over 500 KB), malformed, contain unknown fields or non-http links are rejected with a reason.
- Treats everything as a proposal. Your master profile is the source of truth for facts, and differences are shown side by side.
- If you import both files, it checks that they belong together: the filename, the candidate name, and whether each JSON job appears in the PDF text.
- Never follows instructions written inside the file. Text is data.
