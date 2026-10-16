# Manual testing (real Chrome, real Workday)

Automated tests use synthetic pages. This checklist is how you check the extension on real employer portals. **Never submit an application during QA.** Use applications you are genuinely allowed to use, stop before the final Submit, and redact anything personal from notes and screenshots.

## 1. Build and load the extension

```bash
npm ci
```
```bash
npm run build
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `.output/chrome-mv3` folder in this repo.
4. Pin "Job Application Copilot" from the puzzle-piece menu so its button is always visible.
5. After every rebuild, click the reload ↻ icon on the extension's card.

## 2. One-time setup

1. Click the extension button → **Open dashboard**.
2. **Master profile:** enter your contact details, links, education, jobs and the skills you actually have. Save.
3. **Applications → New application:** enter the employer and job, then import the tailored PDF and/or companion JSON. Review the side-by-side comparison, tick "I reviewed this import", and save.
4. **Backup & privacy:** export a backup.

## 3. Per-step checklist

Do this on at least **two different employers**. Record results in the table at the end.

| # | Check | Expected |
|---|---|---|
| 1 | Open the employer's Workday application, click the extension button, choose the application, click **Activate on this tab** | "Active on this tab for …". On a job listing page (no form yet): "isn't recognized … stays off". |
| 2 | Click **Open step review** | The side panel opens. If it doesn't, right-click the extension button → "Open side panel". |
| 3 | **Scan this step** | The step name is correct. The page doesn't change at all: no typing, no clicks, nothing focused. |
| 4 | Look at the groups | Your contact fields are under Recognized. Demographic, authorization and legal questions are under "You answer these". Uploads are under "Not supported". |
| 5 | Proposed changes | Only fields that differ from your profile appear. Fields already filled by Workday's parser show "needs your OK", never "safe". |
| 6 | **Approve all safe** → **Fill** | Each field reports "Filled and verified" or an honest reason. Check the page: the values are right and nothing else changed. |
| 7 | Type into a field after approving it, then Fill | That field reports "Left as is". Your typing is kept. |
| 8 | Scan again | "Nothing to change on this step from your profile." |
| 9 | My Experience: check the "Entries on this page" links | Each Workday entry links to the right job or school, or says "Not found"/"Link it yourself". Unlinked entries are never touched. |
| 10 | Dropdowns (Country, Degree) | The right option is chosen, or "No matching choice"/"Several choices could match". |
| 11 | Add another (if a job is missing) | Approve it → exactly one new empty entry appears. Scan again → its fields are proposed as "needs your OK". |
| 12 | Next / Submit | The extension never presses them. You do. |
| 13 | Click Next yourself, then scan the new step | The new step is recognized. Earlier proposals are gone. |
| 14 | Navigate to another site in the same tab, then reopen the popup | "Not active on this tab." |
| 15 | Sign-in / create-account pages | Password and verification-code fields are listed as "You answer these" and never filled. |

## 4. Page inspection and debugging (optional, with Claude in Chrome)

Open the application step in your own Chrome, add the tab to Claude's tab group (or paste its URL), and tell Claude to go ahead. Claude can then:

- **Read** the page structure (`read_page`, `get_page_text`, read-only scripts) to learn a tenant's markup.
- **Write to form fields** to reproduce a problem: type or clear text, open a dropdown and pick an option, tick a radio or checkbox. Claude says which fields it will change first and puts them back afterwards when asked.

Claude still never clicks Next, Save and Continue or Submit, signs in or creates accounts, uploads files, answers sensitive questions (demographic, disability, veteran, work authorization, legal), ticks attestations, terms or e-signatures, or reads or types passwords, verification codes, CAPTCHAs or SSO. Redacted notes go to `docs/qa/` and become new synthetic fixtures.

## 5. Results log

| Date | Chrome version | Employer (redacted ok) | Steps checked | Passed | Problems seen |
|---|---|---|---|---|---|
| 2026-10-10/11 | 154.0.8037.98 (Windows) | Workday employer 1 (wd1) | My Information, My Experience, Application Questions, submitted by user | 3, 6 (after fixes), 8, 9, 10, 11, 12 | 14 bugs found and fixed live; see `docs/qa/2026-10-10-workday-employer-1.md` |
| 2026-10-11 | 154.0.8037.98 (Windows) | Workday employer 2 (wd5) | Autofill with Resume through to submission by user; sign-in page | 12, 15, employer account box, terms left manual, remembered dates | 4 bugs found and fixed live (level-only degrees, GPA per entry, 77-skill limit, MM/DD/YYYY dates); see `docs/qa/2026-10-11-workday-employer-2.md` |
| 2026-10-11 | 154.0.8037.98 (Windows) | Workday employer 3 (wd1) | Autofill with Resume, My Information, through to submission by user; Candidate Home after Submit | 5, 12 | 3 bugs found and fixed live (phone formatting compared as text, Candidate Home not recognized so the submission couldn't be recorded, header Settings menu listed as a question); added a manual "Mark as submitted"; see `docs/qa/2026-10-11-workday-employer-3.md` |
| 2026-10-12 | 154.0.8037.98 (Windows) | Workday employer 4 (wd1) | Autofill with Resume through Voluntary Disclosures to submission by user; confirmation dialog on Candidate Home | 12, confirmation recorded, race checkboxes filled from the dashboard, veteran wording left manual | 4 bugs found and fixed live (long questions couldn't be remembered, veteran question not treated as sensitive, race checkboxes not grouped, group named after its first option); see `docs/qa/2026-10-12-workday-employer-4.md` |

Send the problems back (control type, step, what happened, with no personal data) and they become regression fixtures.
