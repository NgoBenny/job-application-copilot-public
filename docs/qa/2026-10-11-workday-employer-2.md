# Live QA notes: employer 2 (Workday employer 2, wd5), 2026-10-11

Tenant: a wd5 Workday tenant, Autofill with Resume. Structure only; no personal values recorded.

## Findings
| Check | Result |
|---|---|
| 10 Degree dropdown | Fail → fixed: options are level-only ("Bachelors", "Masters"); profile degrees "… of Science" matched nothing, and after a manual pick the rescan kept proposing a change. `matchOption` now falls back to the degree level (associate/bachelor/master/doctorate) for level-only options, unique match only; verify and the rescan check use the same matcher. Not yet retested live. |
| GPA per education entry | Fail → fixed: "Overall Result (GPA)" was remembered as a saved answer (employer scope) and then proposed for every education entry, overwriting the other school's GPA. Saved answers match by wording only, so they no longer apply to (or offer Remember for) fields inside a work/education entry. Education records gained an optional GPA (default empty; older stores and backups load unchanged), and GPA / grade point / "Overall Result" fields inside an entry map to that school's GPA. Not yet retested live. |
| Skills: many at once | Fail → fixed: 77 selected skills gave "Invalid request." because one skills request allows at most 50 items (message validation). The side panel now searches in batches of 25 (also keeps each request short for the service worker), shows results per batch, Stop halts the remaining batches, and selections are saved once at the end. e2e: 52 skills across three batches; fails with batching disabled. Not yet retested live. |
| Date Available (MM/DD/YYYY) | Fail → fixed: the date box has a `dateSectionDay-input` too; the scan grouped only month/year, so the day input looked like a separate text question "Date Available:" = "17", which Remember offered. Day is now part of the date (read as YYYY-MM-DD, written month → day → year with one blur), dates can be remembered (proposed as "needs your OK"), and trailing ":" is stripped from labels. Confirmed live: Date Available remembered as a full date. |
| 15 Sign-in page | Pass: step "Create Account/Sign In"; first screen (Google / email buttons) scanned 0 fields and showed the Employer account box with the saved account; after "Sign in with email", Email, Password and a hidden anti-bot field ("This input is for robots only") were all under "You answer these" as sign-in secrets and nothing was filled. |
| Google sign-in note | Fail → fixed: the account box didn't say the site offers Google sign-in. Page text came from `textContent`, which glues neighbouring elements ("Sign In" + "Sign in with Google" → "Sign InSign in…"), defeating the word-start match; text nodes are now joined with spaces. Also detects Google's iframe, an aria-label or a google automation id. Not yet retested live. |
| Terms checkbox | Pass: "Yes, I have read and consent to the terms and conditions" listed under "You answer these" (agreement or signature) and never ticked; user ticked it. Kept manual by decision. |

## Outcome (2026-10-11)
The user completed and submitted the application themselves (check 12 pass). Path: Autofill with Resume.
Confirmed live: date answers remembered; terms checkbox left manual.
Confirmed live afterwards: employer account panel (accounts recorded for both employers).
Not confirmed live: level-only degree match on a fresh fill, GPA per entry, skills batching (77), parser-filled fields shown as "needs your OK" (check 5), confirmation-page recording. (Check 15 confirmed afterwards.)

## Follow-ups (2026-10-11)
- Error text: rejected requests now say what was wrong and the limit ("Too much at once: request.items allows at most 50."), and a page that lost its connection says to reload and activate again (`src/browser/errors.ts`). No values in error text.
- Remembered choices: clicking "Use '…'" in a search box saves profile value → site option (store `optionAliases`, default empty); later proposals offer that option first and a field already showing it counts as correct. Listed and deletable under Saved answers → Remembered choices.
- Regression fixtures: `tests/fixtures/workday/summit/` (fabricated, Autofill-with-Resume state) covers parser-filled values needing OK (check 5), level-only degrees, GPA per entry in parser order, a remembered MM/DD/YYYY date, and the terms box staying unticked. Mutation check: 5 of 5 caught.

