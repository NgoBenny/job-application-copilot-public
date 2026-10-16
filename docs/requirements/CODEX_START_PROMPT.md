# Copy/Paste This Message Into Codex

You are the lead software engineer implementing an open-source **Workday Application Copilot**, a local-first Chrome Manifest V3 extension that assists with user-reviewed Workday job applications.

**Read the attached/repository files in full before coding:**
1. `MASTER_IMPLEMENTATION_PLAN.md` — authoritative product and engineering specification.
2. `PROJECT_CONTEXT.md` — the user's real step-by-step Workday application workflow and previously agreed design decisions.

If these files are not present in the repository, **first ask me to provide them; do not invent their contents**. Treat them as the definitive context; you do not need access to my previous ChatGPT conversation or a publicly shared chat link.

## What to build

Implement a functioning, well-tested Chrome extension using **TypeScript + React + WXT/Manifest V3 + Tailwind CSS + Zod** with **Vitest and Playwright** tests. Workday is the only ATS in v1. The extension must:

- Maintain a verified persistent **master profile** (education, employment, links, skills, projects) without storing credentials.
- Create an isolated **application profile** for each employer/job, with a different tailored PDF/resume, skills list, and job-specific material.
- Import **PDF-only**, **JSON-only**, or **matching PDF+JSON** generated through a ChatGPT resume-tailoring workflow. Include text extraction, error reporting, schema validation, conflict review, and a fake-data JSON example.
- Recognize allowed Workday candidate pages with tenant-aware detection; scan each application step before filling.
- Identify and fill supported text fields, URLs, native selects, radios, checkboxes, accessible comboboxes, repeated experience/education entries, and dates; verify every write and leave unsupported controls for the user.
- Correct erroneous Workday **My Experience** parsing by diffing against verified records; present reviewable changes; never auto-overwrite user edits.
- Suggest relevant **skills** from verified abilities, tailored resume and optionally pasted job description; search real Workday dropdown options; try exact and approved aliases; allow reviewed broader options only; show unavailable skills rather than fabricating them.
- Remember **latest user-confirmed reusable non-sensitive choices** with appropriate global/employer/job scope; recognize equivalent questions conservatively; support user-approved templates for custom questions.
- Show a **per-step review dashboard** (matched, filled+verified, needs review, missing, unsupported, visible validation errors) and repeat scanning on navigation/backtracking.
- Assist with multi-company **Workday account registration/login detection** and maintain account metadata without touching passwords, OTPs, cookies, CAPTCHA or Google SSO credentials.
- Use the user's **native Workday Autofill with Resume** process. Do not promise automatic PDF upload on custom widgets; provide a documented manual fallback.
- Track application progress and offer to record a *confirmed* submission, but **never click Next or Submit automatically**.

## Hard security and accuracy constraints

- No credentials stored, no background job submissions, no invented skills or experience, no sensitive demographic/authorization/legal answers filled automatically.
- Use minimum browser permissions and user-initiated tab access. No `<all_urls>` or remote script execution. Keep user data local by default; do not add analytics or a server.
- All PDFs, imported JSON, descriptions, and DOM text are untrusted. Import cannot overwrite approved factual master data without explicit user confirmation.
- Never clobber a field the user changed manually. Match repeated records by identity, not just DOM order. Fill only with sufficiently strong evidence and verify the UI accepted changes.
- Do not claim live Workday compatibility without manual testing. Build robust fake-site/browser tests and supply a real-tenant QA checklist using redacted data.
- Generative-AI custom answers are **optional post-MVP**; do not make the core system depend on a paid API or put API keys in client code.

## Process I want you to follow

1. Inspect the repository and read the two specified context files. If the repository is empty, scaffold it. Verify the latest compatible WXT/Chrome tooling rather than assuming older examples.
2. Convert the specification's phases into a checked **`docs/implementation-progress.md`** with acceptance criteria. Add **`AGENTS.md`** to maintain coding/test/security conventions for future Codex sessions.
3. Implement **Phase 0 → Phase 8 in order**, one independently usable and testable increment at a time. Start with the skeleton, then master data and import flows, then scan-only Workday detection, then safe form filling, experience repair, skills, memory, step review, account assistance, and polished release.
4. After each phase: run build/typecheck/lint/unit tests; run integration/Playwright tests where relevant; fix failures; update progress and architecture docs; report the changed files, features working, tests actually run, limitations, and next phase.
5. Add automated synthetic fixtures for differing Workday tenants, controlled inputs that rerender, delayed skill search/no-match, dropdowns/radios/checkboxes, repeated education/employment, conflicting PDF/JSON, account-flow detection, step navigation/backtracking, preservation of user edits, and ensuring **no automatic submission**.
6. Use fake profile data throughout examples/tests and avoid sharing personal data in commits. Clearly document steps to run from a fresh clone and load the built unpacked extension via `chrome://extensions`.
7. Continue iteratively until phases are complete within the task's environment. **If implementation cannot proceed** because of a real external dependency, live site access, necessary user decision, or execution limit, leave working code, update the progress checklist precisely, and tell me exactly what to do next. Don't just return a conceptual design or a single HTML mockup.
8. Do not publish or push to a remote repository, change account settings, purchase services, or submit any job application without asking me first.

**First action:** summarize the architecture and major tradeoffs in 6–10 concise bullets; then initialize the repo and start implementing Phase 0. Keep the project's functional work and test results authoritative, not the original chat transcript.
