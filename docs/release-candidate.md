# Review candidate — 2026-10-22

This candidate is for code review and user-run QA. It is not published to a store. The private PR targets `feat/workday-v1` from `codex/reliability-and-tailoring`; the public checkout is unchanged.

## Automated gate

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `npm run test:e2e`. The implementation ledger records actual results. Browser tests use a separate Chromium profile and fabricated local forms, not the user's application sessions. Generate a local candidate with `npm run zip`; load `.output/chrome-mv3` for QA.

Final local results: typecheck/lint/build passed, 468 unit tests passed, 47 browser tests passed, and one opt-in screenshot test was skipped. The focused multiline tailoring browser test also passed with screenshot capture, and the screenshot was visually inspected. Hosted CI could not start because of an account-level GitHub Actions billing/spending restriction; it still needs a run after that restriction is resolved.

Local ZIP: `.output/job-application-copilot-0.1.0-chrome.zip` (release manifest verified). SHA-256: `56c398bd9f6bbdad466d673d00dc6ee89f64e97263335836b23872d491b95868`. This remains an unpublished 0.1.0 review candidate; no release tag was created.

## Before updating

Export a backup with the previous build. The candidate migrates schema 5 to 6 on load/save without enabling tailoring on old applications. Older builds cannot read schema-6 data. Keep the original backup for rollback. The candidate accepts version-5 backups; a backup import replaces the current store only after confirmation.

## Fresh manual checks (pending user results)

1. Open the same application in two dashboard windows. Edit different fields and save both: preserve both edits and portal/history metadata. Edit the same field: refuse the stale change, keep the draft, and offer Reload saved application.
2. Import a tailored PDF/JSON and inspect mismatches against master facts. Enable Application content, select the intended jobs/schools/projects, and review imported wording before copying it. Verify the content and save.
3. Scan a supported application. Selected experience uses the approved description, with master names, titles and dates. Excluded existing entries stay untouched, and excluded missing records do not trigger Add proposals. Wording still needs approval in step review.
4. Edit the wording or replace the resume import. Verify that content approval clears and experience/education fills pause until you review and save again. A different application keeps its own selections and master wording.
5. Approve an Add action. Confirm exactly one new record appears for each verified addition. If the page ignores it, the extension must report failure. Inspect the page after every fill; visible verification cannot guarantee the portal's internal saved state.
6. Export and restore a backup in a separate test profile, then restart Chrome and verify the selected content persists. Do not replace real data just to perform this check.
7. Confirm sensitive answers still come only from dashboard entries. Group approval is deliberately allowed; Approve all safe must exclude them. Unknown/ambiguous choices stay manual. Never automate Next, Submit, registration, upload, terms, signatures, passwords, codes or SSO.

| Platform | Candidate live QA | Existing evidence |
|---|---|---|
| Workday, at least two employers | Pending | `manual-testing.md` and Workday notes in `qa/` |
| Greenhouse hosted board | Pending | Three recorded boards, 2026-10-12/13 |
| Ashby hosted application | Pending | Recorded board, 2026-10-16; confirmation follow-up 2026-10-17 |

Record Chrome/build version, redacted employer, step, expected/actual outcome and any manual workaround in `docs/qa/`. Turn failures into fabricated regression fixtures before claiming the candidate passed live QA. No submission is needed for these checks.
