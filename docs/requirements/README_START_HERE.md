# Workday Application Copilot — Codex handoff

This package has three source-of-truth files:

1. `MASTER_IMPLEMENTATION_PLAN.md` — complete scope, architecture, safety, data schemas, feature behavior, phases, tests, acceptance requirements.
2. `PROJECT_CONTEXT.md` — the user's exact application workflow and decisions reached in the ChatGPT discussion.
3. `CODEX_START_PROMPT.md` — paste this message into Codex after adding the first two files to the repo.

## Start with Codex

1. Create an empty local project folder, for example `workday-application-copilot`, and open it in VS Code with the Codex extension or the Codex app/CLI.
2. Copy all files from this package into the project root. Git-init if desired.
3. Open `CODEX_START_PROMPT.md`, copy its content, paste into a Codex chat attached to that project, and send.
4. Codex should scaffold the extension, create `AGENTS.md` and progress tracking, and implement/test the phases. Review changes and confirm action when permission or external website access is requested.
5. Load the resulting `wxt build` Chrome output in `chrome://extensions` → Developer mode → Load unpacked. The exact `.output` path should be shown by Codex after build.

## Giving Codex the entire ChatGPT conversation

ChatGPT's **Share** feature can create a link to a selected conversation, including a full-conversation view when available. A link on a personal ChatGPT account can be viewed by anyone with the link, so review the preview. **Do not rely on Codex being able to open that link or infer the contents.** The two Markdown documents here capture all material requirements and should be treated as authoritative.

If you need a literal archived transcript, use ChatGPT Settings → Data controls → Export data and extract the relevant conversation yourself; the export contains more private information than the project needs. Do not add raw chat exports, resume PDFs, personal profiles, or account data to a public GitHub repository.
