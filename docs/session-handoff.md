# Session handoff (2026-10-10)

Read this first in a new Claude Code session, then `AGENTS.md`, `CLAUDE.md` and `docs/implementation-progress.md`.

## Where things stand
- **Project:** Job Application Copilot, a local-first Chrome MV3 extension (WXT + React + TypeScript + Tailwind + Zod). v1 has a Workday adapter only. Spec: `docs/requirements/`. Approved plan: `docs/plans/claude-code-implementation-plan.md`.
- **Phases 0–8 are complete**, plus post-release fixes. Branch `feat/workday-v1`, pushed to the private repo the project repo. CI (GitHub Actions) is green.
- **Repo location:** moved out of OneDrive to `C:\Users\User\dev\job-application-copilot` because OneDrive sync removed and locked files in `node_modules`. The old copy at `C:\Users\User\OneDrive\Documents\ChatGPT\Workday Automation` is obsolete. Delete it only when the user says so.
- **Tests:** 259 unit tests, 31 E2E (Playwright with synthetic Workday fixtures). Gate: `npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e`.

## User decisions (binding)
1. **Sensitive answers** (demographic, disability, veteran, work authorization, sponsorship, conviction) may be saved and filled, but **only from values the user types in the dashboard**. Each one needs its own approval; the label must clearly name one topic; and the choice text must match the saved answer **exactly**, except that a bracketed tag shared by 2+ options (e.g. "Asian (United States of America)") is ignored (2026-10-11); one-off brackets like "Yes (I will require sponsorship)" never match "Yes". They're never learned from pages and never in "Approve all safe". Attestations, e-signatures and terms checkboxes stay manual.
2. **Push to GitHub after each change/phase** (overrides the plan's original "never push"). Never force-push, never publish to the Chrome Web Store.
3. On real Workday pages, Claude in Chrome may **read and write form fields** to debug the extension, once the user says go ahead in that session (2026-10-10; was read-only). Never click Next/Save and Continue/Submit, sign in/register, upload, answer sensitive questions, tick attestations/terms, or touch password/OTP/CAPTCHA/SSO.

## Working conventions
- Session start check (from `CLAUDE.md`): `get_session("self")` should be `claude-opus-5-5` / `medium`, with `ponytail:*` and `agent-skills:*` skills loaded.
- At each gate run `/code-review`, then `ponytail:ponytail-review`. The plan also adds security-auditor and test-engineer subagents at major releases.
- Windows notes: Git Bash heredocs mangle `\\` and some quotes. Write edit scripts or files with the Write tool, or use Python scripts saved in the scratchpad. `gh` works from PowerShell.

## What's left
- **The user's live QA:** load `.output/chrome-mv3` (built in this folder), import the backup exported from the old OneDrive-loaded extension (the new path gives a new extension ID and empty storage), then run `docs/manual-testing.md` on ≥2 real employers without submitting. Record the Chrome version and results in the ledger's "Live QA log". Turn any problems into synthetic fixtures.
- **Optional:** open a PR from `feat/workday-v1` to `main`. The Chrome DevTools MCP (`--categoryExtensions`) could automate the manual popup/side-panel checks, but only in a separate Chrome profile with fabricated data, never the user's default profile.

## Handy facts
- Companion-JSON prompt for the resume chat: `docs/chatgpt-resume-handoff.md`.
- After a rebuild, the user clicks ↻ on the extension card; data is kept.
- The full previous transcript was exported to the user's Downloads folder as `session-export-1791697984966.zip`. It contains personal data, so never commit it.
