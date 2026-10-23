# Session handoff (2026-10-22)

Read `AGENTS.md`, then the current status at the top of `docs/implementation-progress.md`. Earlier phase sections are historical; they do not override later user decisions or QA notes. Claude-specific setup is in `CLAUDE.md`.

## Current implementation

- Local Chrome MV3 extension with Workday, Greenhouse hosted-board and Ashby hosted-application adapters. No backend, AI service, analytics or static host permissions.
- Phases 0–8 and subsequent platform fixes are implemented. Phase 9 fixes stale application saves, backup round trips and added-record verification. Phase 10 adds application-specific record selections and approved wording, schema 6, current docs and a local review candidate.
- Master facts stay canonical. Application content is opt-in; edits clear its approval. Approved employment descriptions are proposed with application provenance. Project descriptions remain available for manual entry. Old applications retain their existing whole-profile behavior.
- Unit/E2E coverage includes synthetic forms; existing user-run live results are in `docs/manual-testing.md` and `docs/qa/`. Fresh live testing of the candidate is pending, not implied by earlier QA.
- Gate: `npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e`. Actual counts and results are in the ledger, not copied into this handoff.

## Binding decisions

- Sensitive answers come only from dashboard entries with unambiguous topics and exact choices. Individual or explicit group approval is accepted for personal use (2026-10-22). Approve all safe excludes them. No learning from pages or inferred answers.
- Never automate navigation, submission, registration, upload, terms/attestations/signatures, credentials, OTP, CAPTCHA or SSO. Real-page debugging follows the session authorization and limits in `CLAUDE.md`.
- The user requested a PR for Claude's review. This private repo's default/only original branch is `feat/workday-v1`. Work is isolated on `codex/reliability-and-tailoring`, targeting `feat/workday-v1`. Push passing phases to this branch; do not merge or update the public checkout during review.
- No real personal data in fixtures, screenshots, logs, commits or QA records.

## Review and remaining work

- Review the private PR, its regression tests, `CHANGELOG.md`, and `docs/release-candidate.md`.
- Export a backup before loading the candidate into a real Chrome profile. It migrates schema 5 to 6; older builds cannot open schema-6 data. Keep the original backup if rollback is needed.
- Follow the candidate checklist on real Workday employers and hosted Greenhouse/Ashby forms. Record redacted results and convert failures into fixtures. Do not mark pending checks passed without the user's actual results.
- Build/load instructions and compatibility limits are in `README.md`; `npm run zip` creates a local package only. No store publication or merge is authorized by the review request.

## Environment

Build outside OneDrive. In the Windows agent sandbox, Vitest may need a workspace-local `TEMP`/`TMP`; Chromium/local fixture tests ran outside that sandbox. Unit iframe page loading is disabled so synthetic SSO markers do not make external requests.
