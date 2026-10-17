@AGENTS.md

## Claude Code notes

- **Session start check:** `get_session("self")` must report `claude-opus-5-5` / `medium`, and the skill list must include `ponytail:*` and `agent-skills:*`. If not, stop and tell the user. Record versions in the ledger header.
- **Resume:** read `docs/implementation-progress.md`, continue from the first unchecked task.
- **Skills per phase:** see the table in `docs/plans/claude-code-implementation-plan.md` §1. Gates: `/code-review` then `ponytail:ponytail-review`.
- **Real Workday pages:** with the user's go-ahead in chat for that session, Claude in Chrome may read the page and write to form fields (type, clear, open dropdowns, pick options, tick radios/checkboxes) to debug the extension (user decision 2026-10-10). Say which fields before changing them. Never click Next/Save and Continue/Submit, sign in or register, upload files, answer sensitive questions, tick attestations/terms/e-signatures, or read or type password/OTP/CAPTCHA/SSO fields. Record redacted notes in `docs/qa/`.
- **Real Greenhouse pages** (user decision 2026-10-12): Claude may read and write form fields on the user's Greenhouse applications to build and debug support, under the same limits as Workday: never Submit, upload files, answer sensitive questions, tick acknowledgements/terms/consents, or touch CAPTCHA.
- **Real Ashby pages** (user decision 2026-10-16): same permission and limits as Greenhouse: Claude may read and write form fields on the user's Ashby applications to build and debug support; never Submit, upload files, answer sensitive questions, tick acknowledgements/terms/consents, or touch CAPTCHA.
- The built-in browser pane can't load unpacked extensions; extension E2E uses Playwright's Chromium.
