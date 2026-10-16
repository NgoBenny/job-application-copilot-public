# Job Application Copilot (Workday v1) — Claude Code Implementation Plan

## Context

You apply to many jobs through Workday. Each posting gets its own ChatGPT-tailored PDF, Workday's "Autofill with Resume" misparses **My Experience**, skills must be searched one by one in a controlled dropdown, and links and repeat answers are retyped every time. The ChatGPT/Codex package (`MASTER_IMPLEMENTATION_PLAN.md`, `PROJECT_CONTEXT.md`, `CODEX_START_PROMPT.md`) and the two Codex plan revisions specify a local-first Chrome MV3 extension that:

- repairs parsed data against a verified master profile,
- fills only verified and approved values,
- selects skills that actually exist in the dropdown,
- reviews every step before you move on,
- never submits anything.

The latest revision renames the product **Job Application Copilot**. It has a shared engine and a **Workday-only adapter in v1**, structured so Greenhouse, Lever and others can be added later.

This plan explains how **Claude Code (Opus 5.5, medium effort)** will build it in the empty git repo `C:\Users\User\OneDrive\Documents\ChatGPT\Workday Automation`. The package documents remain the authoritative spec. The multi-platform amendment and the Codex plan refinements (stale-plan invalidation, adapters never receive the full profile, contract test suite) are adopted as-is.

**Your decisions:**
- Commit locally at each phase gate.
- Claude may inspect real Workday pages in Chrome and, with the user's go-ahead, write to form fields to debug (user decision 2026-10-10; see §6).
- Implementation runs continuously through Phases 0–8.
- English-language forms only in v1.
- Never push or publish.

---

## 0. Before implementation: handoff to a fresh session

**Why this session can't do the build**
- **The plugins aren't loaded here.** Ponytail was installed at 00:15 UTC, after this session started at 00:09. Plugins only load when a session starts.
- **agent-skills isn't fully installed.** It's enabled in `~/.claude/settings.json` but missing from `installed_plugins.json`, so it may not be installed yet.
- **Ponytail's install may be broken.** Its install directory (`~/.claude/plugins/cache/ponytail/...`) doesn't exist.
- **The effort level is wrong.** This session runs at effort `high`, and a session can't change its own effort.

**What this session does on approval:** writes this plan to `docs/plans/claude-code-implementation-plan.md` in the repo (it gets committed with Phase 0), then prints the kickoff prompt. Nothing else.

**Then you:**
1. Make sure both plugins are installed, using the app's plugin settings or a terminal:
   ```bash
   claude plugin install agent-skills@addy-agent-skills
   ```
   ```bash
   claude plugin install ponytail@ponytail
   ```
2. Start a **new** Code session in this folder with **Opus 5.5** and **Medium** selected in the model/effort picker. You should see Ponytail's "Loading ponytail mode..." status at startup.
3. Paste the kickoff prompt from §8.

**Step 0.0, the new session's first action, checks the setup before any file is written:**
- `get_session("self")` must report `model: claude-opus-5-5` and `effort: medium`.
- The skill list must contain `ponytail:*` and `agent-skills:*` entries.
- If either check fails, Claude stops and tells you exactly what's missing.
- The confirmed model, effort and plugin versions go into the ledger header.
- Every resumed session repeats these checks.

---

## 1. How Claude Code will run this project

**Instruction files (Phase 0)**
- `AGENTS.md` is the canonical file for conventions, module boundaries, security rules and mandatory checks. Codex/GPT can still read it if you switch tools.
- `CLAUDE.md` contains `@AGENTS.md` plus Claude-specific notes: the skills to use per phase, the rules for Chrome use on real pages, and the resume procedure.
- `docs/implementation-progress.md` is the single status ledger. For each phase it records acceptance criteria, files changed, exact commands and results, limitations, open manual gates and the next task.
- `docs/requirements/` holds a copy of the three package docs plus `multi-platform-amendment.md` (the revised requirement), so future sessions don't depend on `~/Downloads`.

**Session workflow**
- Use the task list to track the current phase's slices.
- Pin the tooling versions in `package.json` and commit the lockfile. These were current on 2026-10-10 and get re-verified at scaffold time:

  | Package | Version |
  |---|---|
  | wxt | 0.21.x |
  | @wxt-dev/module-react | 1.2.x |
  | React | 19.x |
  | Tailwind | 4.x, via `@tailwindcss/vite` |
  | zod | 4.x |
  | pdfjs-dist | 6.x |
  | vitest | 5.x |
  | @playwright/test | 1.64 |
  | eslint | 10 |

- TypeScript 7 is current. If typescript-eslint or WXT doesn't support it yet, pin the newest TS version they do support and record the reason in the ledger.
- Use npm on Node 22.23 (both already installed).

**Git**
- Rename the unborn `master` branch to `main` (the configured main branch).
- Work on `feat/workday-v1`.
- Make **one commit per passing phase gate**, with message `Phase N: <summary>` and the Co-Authored-By trailer.
- Never push, publish, or add a remote.

**Permissions**
- In Phase 0, use the `fewer-permission-prompts` / `update-config` skills to allowlist the project's own scripts in `.claude/settings.json`: `npm run typecheck|lint|test|build|test:e2e` and `npx playwright install chromium`.

**Coding discipline: Karpathy + Ponytail + agent-skills** (they reinforce each other)
- **Ponytail (plugin, level `full`)** covers solution size. Its SessionStart hook switches it on automatically in every new session, so Claude doesn't have to invoke it. It applies this ladder: does it need to exist → existing code → platform/stdlib → installed dependency → one line → minimum code. It also means no speculative abstractions and no new dependency for a few lines, and it adds `shortcut: <limit>, <when to upgrade>` comments.
- **Ponytail level:** not `ultra`. Ultra pushes back on requested features, and the approved spec already defines the scope. Ponytail can shrink *how* a requirement is built, never *which* requirements ship.
- **What Ponytail never cuts:** validation at trust boundaries, data-loss protection, security and accessibility. That lines up with this project's hard boundaries.
- **Karpathy (user skill)** covers process: state assumptions, make surgical edits, and turn each slice into a check.
- **agent-skills (plugin)** supplies engineering workflow: thin vertical slices, test-first for domain logic, interface design, migrations, security hardening, CI, and ship checklists.
- The merged rules also go into the "How we write code" section of `AGENTS.md`, so they still apply if a plugin fails to load or you switch back to Codex.
- Every phase report ends with Ponytail's one or two lines: what was skipped or not checked, and any risk.

**Skills and plugins mapped to the work** (names as they'll appear once the plugins load: `ponytail:*`, `agent-skills:*`)

| When | Skill / plugin | Use |
|---|---|---|
| All code | Ponytail (auto), `karpathy-guidelines`, `agent-skills:incremental-implementation`, `agent-skills:test-driven-development` | Smallest complete change, built as thin slices, with a test first for domain logic |
| Phase 0 | `agent-skills:source-driven-development` | Check WXT, Chrome extension, PDF.js and Playwright APIs against official docs, not memory |
| Phase 0 | `agent-skills:git-workflow-and-versioning`, `agent-skills:ci-cd-and-automation`, `agent-skills:documentation-and-adrs` | Branch and commit conventions; CI workflow; `AGENTS.md`; ADR-001 "adapter architecture" |
| Phase 0 | `fewer-permission-prompts` | Allowlist the project's npm scripts |
| Phase 0, Phase 8 | `security-threat-model` | Draft, then finalize, `docs/privacy-threat-model.md` |
| Phases 0–2 | `agent-skills:api-and-interface-design` | Adapter contract, message protocol and Zod schemas |
| Phase 1 | `agent-skills:deprecation-and-migration` | Versioned storage migrations |
| Phase 2 | `pdf` | Visually check generated fixture PDFs |
| UI (Phases 1–4, 8) | `agent-skills:frontend-ui-engineering`, `frontend-design`, `impeccable`, `design:ux-copy` | Dashboard and side panel; honest status wording |
| Phase 8 (spot-checks earlier) | `design:accessibility-review` | Keyboard and screen-reader audit |
| Phases 0–7 | `playwright-skill` / `playwright`, `agent-skills:browser-testing-with-devtools`, `agent-skills:debugging-and-error-recovery` | E2E harness and failure triage |
| Every gate | `code-review` (medium) for bugs, then `ponytail:ponytail-review` for bloat | Fix the findings, then commit |
| Gates for Phases 4, 7, 8 | `agent-skills:security-and-hardening`, `security-review`, `security-best-practices` | Messaging, storage, injection and logging pass |
| Gates for Phases 4, 8 only | agent-skills' `security-auditor` and `test-engineer` subagents | One independent audit each, limited to these two gates to keep cost down |
| Phase 8 | `agent-skills:shipping-and-launch` | Release checklist (local zip only, no publishing) |
| Real-site QA | Claude in Chrome (`anthropic-skills:chrome-browser`) | DOM inspection and field-level debugging (see §6) |

Two built-ins are skipped: `simplify` overlaps `ponytail-review`, and `agent-skills:code-review-and-quality` overlaps `/code-review`.

The built-in browser pane can't load unpacked extensions, so automated extension testing uses Playwright's bundled Chromium with a persistent context.

**Windows/OneDrive note:** the repo sits in OneDrive, and syncing `node_modules` and `.output` adds churn and can lock files. If builds hit `EBUSY`, pause OneDrive sync or move the folder. Both directories are git-ignored either way.

---

## 2. Architecture

**Extension surfaces** (WXT generates the manifest; there is no hand-written `manifest.json`)
- **Popup:** current page status, active application selector, "Activate on this tab", and open panel/dashboard.
- **Side panel:** step review, scan, preview, approve, fill and verify; experience corrections; skills.
- **Dashboard (options page):** master profile, applications, imports, saved answers, accounts, privacy/backup/delete.
- **Service worker:** sole owner of storage, validated message router, tab↔application binding, permission lifecycle, adapter orchestration.
- **Content script:** programmatically injected only after user activation. Runs the selected adapter's scan/apply/verify. Never reads storage.

**Permissions:** `activeTab`, `scripting`, `storage`, `sidePanel`.
- No `<all_urls>`, no static host matches, no remote code.
- Call `chrome.storage.local.setAccessLevel('TRUSTED_CONTEXTS')` at startup.
- Cross-origin navigation or a tenant change invalidates the binding, and the UI asks you to reactivate.

**Layers and import boundaries** (enforced with ESLint `no-restricted-imports`; no extra dependency)
```
src/domain/        pure TS: schemas (Zod), normalization, matching, dates, skills, policy, fill-plan logic
src/features/      profiles, applications, resumes, skills, answer-memory, review, account-registry (UI + use cases)
src/platform/      ApplicationAdapter contract, registry, detector, contract-test kit   ← no ATS code
src/adapters/workday/  detection, tenant, scan, selectors, controls/, steps, verifier, skills-search, account
src/browser/       storage + migrations, messaging (typed + validated), permissions, injection
entrypoints/       background.ts, popup/, sidepanel/, options/, copilot.content.ts
```
- `domain`, `features` and `platform` must never import `adapters/*`.
- Only `src/platform/registry.ts` (the composition root) imports `adapters/workday`.

**Adapter contract** (`src/platform/adapter.ts`; Workday is the only registered implementation)
```ts
interface ApplicationAdapter {
  readonly id: PlatformId;
  readonly capabilities: ReadonlySet<'skillSearch' | 'repeaterAdd' | 'accountDetect' | 'uploadAssist' | 'confirmationDetect'>;
  detect(ctx: PageContext): Promise<AdapterResult<Detection>>;            // read-only; supported | uncertain | unsupported + tenant evidence
  scan(ctx: BoundPageContext, signal: AbortSignal): Promise<AdapterResult<ScanSnapshot>>;   // read-only
  apply(ctx: BoundPageContext, plan: ApprovedFillPlan, signal: AbortSignal): Promise<AdapterResult<ApplyReport>>;
  verify(ctx: BoundPageContext, report: ApplyReport, signal: AbortSignal): Promise<AdapterResult<VerificationReport>>;
  observeChanges(ctx: BoundPageContext, onInvalidate: () => void, signal: AbortSignal): void;
}
```
- `ScanSnapshot` carries document/step identity, a revision number, sanitized fields (identity, kind, label, section, required, current value unless the field is protected, ARIA options), visible validation errors, and protected-field presence only.
- `ApprovedFillPlan` holds only approved actions: field identity, expected current value, proposed value, record identity, provenance, rationale and binding. **Adapters never receive the profile.**
- `apply` can only report "attempted". Only `verify`, which re-reads the rendered state after a rerender, can mark an action verified.
- Typed outcomes: `verified | skipped | stale | unsupported | failed | cancelled | timedOut`, each with a reason. User-facing text never includes raw personal data.

**Write lifecycle (central, shared by all adapters):**

**scan → propose → preview → approve → revalidate (re-read the expected current value) → apply → verify**

- Protected fields (credentials, OTP, demographic, authorization/sponsorship, legal/attestation) are classified **before their values are read**. They are blocked in `domain/policy` and blocked again at the content-script boundary.
- A non-empty value seen on the first scan has unknown authorship, so any correction needs explicit approval.
- Repeated records are matched by identity (employer/school, title, dates), never by DOM order. If the match is ambiguous, you link the records manually.
- "Add Another" is bounded and requires approval. Delete, Next, Submit, registration and attestation are never automated.

**Data contracts** (`src/domain/schemas`, versioned, with migrations)
- `MasterProfile`, `ApplicationProfile` (with `platformId`, `portalOrigin`, `tenantKey`), `TailoredResumeJSON`, `QuestionMemory`, `AccountRegistry`, `Backup`, plus `ScanSnapshot`, `FillPlan` and `ActionResult`.
- No credential fields exist anywhere.
- Import guards: size cap, prototype-pollution key rejection, URL scheme allowlist, and rejection of unknown `schemaVersion`.
- Precedence:
  - **Factual fields:** current-form user edit > master > approved application record > JSON > PDF > Workday parser output.
  - **Narrative and skills:** approved job-specific material > master > PDF.
  - A job description only ever signals relevance. It is never evidence of a skill.

---

## 3. Phases (each ends in a gate, a ledger update and a local commit)

| Phase | Build | Gate |
|---|---|---|
| **0 Foundation** | Branch setup; copy requirements into `docs/requirements/`; `AGENTS.md`, `CLAUDE.md`, ledger, MIT `LICENSE`, `.gitignore` (profiles, `*.pdf` outside fixtures, `.output`, exports); WXT+React+TS+Tailwind scaffold with all 5 surfaces rendering; scripts `dev build typecheck lint test test:e2e`; Vitest (happy-dom); Playwright persistent-context extension harness; adapter types and an empty registry; boundary lint rule; draft threat model; `.github/workflows/ci.yml` (written, not pushed) | `npm run build` produces `.output/chrome-mv3`. E2E smoke test loads it and opens the popup and options with no console errors. A manifest test asserts the exact permission set. A lint fixture proves the boundary rule fails on a forbidden import. |
| **1 Verified profile** | Zod schemas and migration runner; storage service in the service worker only; dashboard editors (contact, links, education, employment, projects, skills) with stable IDs; backup preview/import/export; delete one / wipe all; privacy notice | Data survives an extension context restart (E2E). Malformed, oversized and polluted imports and a failing migration all leave the store untouched. A content-script context can't read storage. |
| **2 Applications and resume handoff** | Platform-neutral application records; local PDF.js extraction with bundled worker (CSP-safe) and size/page/time caps; section heuristics; companion JSON import; side-by-side conflict review; optional JD paste (persisting it is opt-in); `examples/tailored-resume.example.json`; exported JSON Schema; `docs/chatgpt-resume-handoff.md`; fixture PDFs generated by a `pdf-lib` script | PDF-only and JSON-only flows each produce a reviewed application. A mismatched PDF+JSON pair is flagged. Encrypted, image-only and corrupt PDFs report clearly. Switching between applications never leaks data. |
| **3 Workday adapter: scan-only** | Register Workday; URL-eligibility + DOM-evidence detection; `tenantKey` from origin + path-based tenant; activation/binding flow; field inventory and classifier (`data-automation-id` → labels → ARIA → name/id → section context; ties = uncertain); step recognition by labels, not count; protected-field tagging; review UI (matched / needs review / missing / unsupported / visible errors); synthetic tenant fixtures (≥3 variants) served by a local fixture server | All fixtures scan correctly with **zero writes and zero clicks** (instrumented). Unknown or uncertain pages stay inactive. Two tenants on the same host stay separate. |
| **4 Safe fill + My Experience repair** | Controls: text/URL/textarea (native setter + input/change/blur), native select, radio, checkbox, accessible combobox/listbox (open → wait for options → click a real option), explicit-format dates; correction diff cards (current / proposed / source / reason / reviewRequired); per-field, per-record and "all safe" approval; record association; bounded Add Another; repeated links; stale-plan rejection; cancellation on navigation; post-rerender verification | Fixtures with rerendering controlled inputs fill correctly. User edits made before or during a fill are preserved. A repeat run is a no-op. Wrong-field writes = 0. Instrumented Next/Submit/attest buttons are never activated. **First usable build:** write `docs/manual-testing.md` and hand you load instructions plus the QA checklist, then keep going. |
| **5 Skills** | Shared ranking (verified inventory × tailored-resume evidence × JD relevance) with provenance; versioned alias map + user-approved aliases; Workday `skillSearch` capability: exact → wait → alias → broader suggestions (approval required) → genuine custom entry → "not available"; rate-limited, cancellable, duplicate-safe | Delayed, empty, stale, duplicate, alias and broader-match fixtures all pass. Timeout is distinguished from a confirmed no-result. A skill mentioned only in the JD is never added. |
| **6 Answer memory** | Explicit "Remember" control; job → employer → global scope; latest *user-confirmed* answer wins; conservative question matcher (negation/inversion detection); choices mapped by visible text; templates and deterministic drafts from approved content; manage/edit/delete UI | Inverted wording, changed options, different tenants and sensitive questions are never auto-reused. Machine-selected values never become memories on their own. |
| **7 Full workflow** | SPA/back-navigation re-scan; permission loss and reactivation; account/SSO/registration detection; isolated account registry (no secrets); noncredential email assist; upload guidance (manual by default); conservative confirmation detection + user-confirmed history | Multi-tab and multi-tenant E2E isolation holds. Password, OTP and SSO inputs are never read or written (asserted). History is recorded only after your confirmation. |
| **8 Release readiness** | Accessibility pass; narrow-panel layout; final threat model; `README.md` (honest "experimental until validated" compatibility), `docs/architecture.md`, `docs/known-limitations.md`, `docs/adding-an-adapter.md` (worked Greenhouse/Lever walkthrough, docs only); fabricated-data screenshots; local `npm run zip` package; feed your live-QA findings back as fixtures | A fresh clone passes `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. The ledger lists the Chrome version and tenant flows you tested manually. Untested areas are labeled. |

Per-step review starts in Phase 3, is usable in Phase 4 and is complete in Phase 7. No future-platform stubs, remote plugin loader, generic unknown-site adapter, AI drafting, email integration or backend.

---

## 4. Testing strategy

- **Unit (Vitest, pure `domain`):** schemas and migrations, merge precedence, partial dates (never invent a day or month), tenant identity, record matching, skill normalization and alias boundaries, question inversion, protected-field classification, idempotent plans, log redaction.
- **Adapter contract kit (`src/platform/contract-tests.ts`):** one parameterized suite run against every registered adapter and its fixtures. It covers:
  - read-only detect/scan
  - protected-value exclusion
  - approved-action-only enforcement
  - preservation of changed values
  - verification after rerender
  - stale-plan rejection
  - cancellation
  - idempotence
  - bounded additions
  - honest unsupported and timeout outcomes
  - no Next/Submit/attest

  A tiny **test-only fake adapter** on a plain HTML fixture runs the same suite to prove the shared engine has no Workday dependency.
- **Fixtures (`tests/fixtures/`):** synthetic Workday-like pages with ≥3 tenant variants; controlled inputs that rerender; delayed and zero-result comboboxes; repeaters; account/SSO screens; a confirmation page; adversarial labels, JD text and JSON (prompt-injection-style strings are treated as data). Only fabricated people, never your data.
- **E2E (Playwright, built extension, bundled Chromium):**
  - Import → bind fixture tab → scan → preview → approve → fill → verify → navigate back → re-scan.
  - Storage restore; multi-tenant isolation; submission boundary.
  - `activeTab` can't be triggered from automation, so a **test-only** build flag grants a fixture-origin host permission. A test asserts that flag and permission are absent from the release manifest.
- **Manual gates (recorded separately):** real toolbar activation, side-panel opening, `activeTab` loss after cross-origin navigation, and live Workday flows.

---

## 5. Hard boundaries (repeated in AGENTS.md)

- Never click Next or Submit, accept terms/attestations, complete registration, or touch passwords, OTPs, CAPTCHA, cookies or Google SSO.
- Sensitive/demographic answers are filled only from values you entered in the dashboard, with per-field approval (your decision, 2026-10-10); never learned from pages or bulk-approved. Attestations stay manual.
- No invented skills or experience.
- No `<all_urls>`, remote scripts, analytics or server.
- PDFs, JSON, job descriptions and DOM text are untrusted data.
- Never overwrite your manual edits.
- No real personal data in the repo, tests, screenshots or commit messages.
- Never claim live compatibility without your manual results.

---

## 6. Real-Workday QA with Claude in Chrome

After Phase 4, at a time you choose:

1. You open an authorized Workday application in your Chrome and navigate to a step.
2. Claude reads the page structure (`read_page` / `get_page_text`). With your go-ahead in that session it may also write to form fields to reproduce bugs: type, clear, pick dropdown options, tick radios/checkboxes (user decision 2026-10-10; previously read-only). It never clicks Next/Save and Continue/Submit/Sign in, uploads, answers sensitive questions, ticks attestations/terms/e-signatures, or reads or types password, OTP, CAPTCHA or SSO fields.
3. Claude records control types, `data-automation-id` patterns, step labels and widget behavior in `docs/qa/` with all values redacted. It then turns those notes into synthetic regression fixtures.
4. You separately load the built extension (`chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`). You run the `docs/manual-testing.md` checklist on ≥2 employers without submitting, and report the results. Claude logs them in the ledger.

---

## 7. Verification (how you'll know it works)

- **Every phase:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` all green, followed by `code-review` and `ponytail:ponytail-review`. The ledger entry lists the exact commands and results, then the phase commit is made.
- **After Phase 4:** load the unpacked build in Chrome yourself and confirm the popup and panel open, activation works on a fixture page, and (optionally) a real Workday scan is read-only.
- **End state:** a fresh clone builds and passes everything. The README matches actual behavior. Manual results and untested areas are explicit.

---

## 8. Kickoff / resume prompt (paste into the new Opus 5.5 · Medium session)

> First, verify setup: call get_session("self") and confirm model is claude-opus-5-5 and effort is medium, and confirm your skill list includes ponytail:* and agent-skills:* entries. If anything is missing, stop and tell me. Then read `docs/plans/claude-code-implementation-plan.md` (the approved plan) and the requirements in `~/Downloads/workday-copilot-codex-package/workday-copilot-package/` (or `docs/requirements/` once copied), plus `CLAUDE.md`, `AGENTS.md`, and `docs/implementation-progress.md` if they exist. Implement the Job Application Copilot starting from the first unfinished task (Phase 0 if none). Follow the plan's phase gates: typecheck, lint, unit, build and e2e; then code-review and ponytail-review; then update the ledger and commit locally for each phase. Never push. Respect every hard boundary. Run continuously through Phase 8, stopping only for real blockers. Report what works, test results, limitations, and manual steps I need to do.
