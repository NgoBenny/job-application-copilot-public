# Implementation progress (ledger)

## Current status (2026-10-22)

| Area | Current evidence |
|---|---|
| Product | Local Chrome extension; Workday, Greenhouse hosted boards and Ashby hosted applications implemented |
| Reliability | Phase 9 passed: 457 unit tests, 46 browser tests; screenshot capture opt-in |
| Application tailoring | Phase 10 passed: optional record selections, approved employment/project wording, schema 6; 468 unit tests, 47 browser tests |
| Workday live evidence | Recorded user sessions in `manual-testing.md` and `qa/`, including employer 9 and narrow-window skills findings |
| Greenhouse live evidence | Three recorded hosted boards, 2026-10-12/13 |
| Ashby live evidence | Recorded application QA 2026-10-16; confirmation follow-up 2026-10-17 |
| Candidate live QA | Pending fresh user-run checks in `release-candidate.md`; historical QA is not a pass for these changes |
| Review delivery | Isolated private branch `codex/reliability-and-tailoring`, PR into default `feat/workday-v1`; public checkout unchanged |
| Hosted CI | GitHub Actions did not start the phase-9 job due to an account billing/spending restriction; rerun required after the account restriction is resolved |

The sections below record historical phase outcomes. Later entries and this status table supersede earlier untested/Workday-only statements. Sensitive group approval is accepted for personal use as of 2026-10-22; Approve all safe still excludes it.

**Session setup (verified 2026-10-10):** model `claude-opus-5-5`, effort `medium`; plugins `ponytail@ponytail` 5.1.0 (level full), `agent-skills@addy-agent-skills` 0.6.12.
**Toolchain:** Node 22.23.3, npm 10.9.9; WXT 0.21.4 (Vite 8.3), React 19.3, Tailwind 4.3, Zod 4.6, Vitest 5.0, Playwright 1.64 (Chromium 156), ESLint 10.12, TypeScript 6.0.3 (TS 7.0 is current, but typescript-eslint 8.71 requires `<6.1`).
**Branch:** `feat/workday-v1`, pushed to the private GitHub repo after each phase (user decision 2026-10-10).

Gate for every phase: `npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e`, then `/code-review` + `ponytail-review`, then commit.

## Phase 9 — Reliability fixes (2026-10-22)

- [x] Application saves merge only edited fields into the latest record. Concurrent edits to the same field are refused with the draft preserved; Reload saved application offers explicit recovery. Portal bindings, skills, step history and submission dates survive unrelated edits.
- [x] Backups use compact JSON and a bounded 12 MB import/store-validation limit, above Chrome's default 10 MiB local quota. File size is checked before reading; large exports round-trip in a browser regression.
- [x] Added-record verification compares section record counts before/after the plan; one new record cannot verify two clicks, and ignored clicks or growth in another section fail.
- [x] User decision: retain group approval of dashboard-entered sensitive answers for personal use. Approve all safe continues to exclude them; category and exact-option checks remain mandatory.
- [x] Gate: typecheck, lint and release build passed; 457 unit tests and 46 E2E tests passed, one opt-in screenshot test skipped. Unit tests used a workspace-local temp directory; E2E ran outside the Windows sandbox for localhost/browser access.
- [x] Code review: traced merge conflicts, retention/import validation, all three adapter callers and verification outcomes. Ponytail review: shared verifier fix, existing storage revision guard retained, no dependencies or new abstractions. Mutation check (`>` to `>=` in added-record verification) failed three new tests, then source restored.
- Review delivery: user requested a PR for Claude. This repo has only the default `feat/workday-v1` branch, so changes are isolated on `codex/reliability-and-tailoring`, targeting `feat/workday-v1`; no direct update of the default branch or public checkout.
- Remaining: application-specific selections/wording, current status documentation, release candidate package and fresh user-run live QA. Existing unit SSO-marker fixture makes an unnecessary iframe request; disable iframe loading in the next phase.

## Phase 10 — Application content and review candidate (2026-10-22)

- [x] Optional application content selects verified education/employment/project IDs and stores reviewed wording separately from master facts. Changes to selections/wording or a replacement import clear approval. Experience/education proposals pause until content is approved; existing applications keep whole-profile behavior.
- [x] Imported job/project wording is offered as a draft and copied only on explicit click. Approved employment wording carries `approved application` provenance and requires step-review approval. Project wording is displayed for manual entry because project-specific controls remain unsupported.
- [x] Populated entries match against the full master profile before filtering selections. Empty entries pair only with selected records; excluded entries are left unchanged. Ambiguous repeated employer/title and school/degree import matches stay unmatched.
- [x] Schema 6 migration preserves old application records without enabling tailoring. Project import snapshots retain optional IDs and descriptions. Docs explain backup/rollback limits of older schema-5 builds.
- [x] Fixed whole-text comparison for multiline descriptions: one matching bullet does not suppress a correction, and a complete matching description is a no-op. Search-box alternatives still accept separate wordings.
- [x] Refreshed README, handoff, architecture, limitations, threat model, changelog and current QA/status tables. Sensitive group approval is retained and documented per the user's decision. Synthetic iframe markers use `srcdoc`, and unit child-frame navigation is disabled to prevent external SSO requests.
- [x] Final local gate: typecheck, lint, release build and all 468 unit tests passed. Full browser gate: 47 passed, one opt-in screenshot spec skipped. Focused multiline browser flow passed separately with a fabricated-data screenshot (`docs/screenshots/application-content.png`), visually inspected.
- [x] Code review: traced schema migration, approval invalidation, current application merges, all planner callers, selected/excluded identities, and old-app fallback. Fixed the same-employer selection and multiline bugs found during review. Ponytail/React review: existing fields/buttons/reconciliation reused, shared narrative editor for jobs/projects, no dependency or generic abstraction added. Approval mutation caught by five tests, then source restored.
- [x] `npm run zip` produced `.output/job-application-copilot-0.1.0-chrome.zip`. ZIP manifest checked: four release permissions, no static hosts/content scripts. SHA-256: `56c398bd9f6bbdad466d673d00dc6ee89f64e97263335836b23872d491b95868`.
- Hosted CI: phase-9 GitHub run `39899975022` did not start any steps because of an account-level Actions billing/spending restriction. Local gate results above are actual runs; hosted CI must be rerun after the account restriction is resolved.
- Pending external checks: Claude's PR review and fresh user-run live QA in `docs/release-candidate.md`. No live session, merge, store publication, or public-repo update was performed.

---

## Phase 0 — Foundation ✅

**Acceptance criteria**
- [x] `npm run build` produces `.output/chrome-mv3`
- [x] E2E smoke loads the built extension and renders popup, side panel and dashboard with no console errors
- [x] Manifest test asserts the exact permission set (`activeTab`, `scripting`, `storage`, `sidePanel`), no host permissions, no static content scripts, no e2e grant
- [x] Lint test proves the adapter-boundary rule fails on a forbidden import
- [x] Docs: `AGENTS.md`, `CLAUDE.md`, ledger, ADR-001, draft threat model, requirements copied, MIT `LICENSE`, `.gitignore`
- [x] `.github/workflows/ci.yml` written (not pushed)

**Decisions / deviations**
- Injected script is a WXT *unlisted script* (`entrypoints/copilot.ts`) rather than `*.content.ts`: WXT's runtime-registered content scripts add their `matches` to `host_permissions`, which would break the no-host-access rule. Injected via `chrome.scripting.executeScript({ files })`.
- `--mode e2e` builds into `.output/chrome-mv3-e2e` and adds `http://127.0.0.1:4173/*` host permission for fixtures only.
- `docs/requirements/multi-platform-amendment.md` is reconstructed from the approved plan's summary (the original ChatGPT revision wasn't available as a file).

**User decision (2026-10-10):** sensitive answers (demographic, disability, veteran, work authorization, sponsorship, legal history) may be saved and filled, but only from values the user enters in the dashboard. Each requires per-field approval, an unambiguous category match and an exact option match (2026-10-11: a bracketed tag shared by 2+ options is ignored), and is excluded from bulk approval. Attestation/e-signature/terms boxes stay manual. This overrides the spec's "no sensitive autofill" (MASTER_IMPLEMENTATION_PLAN §2.10, §4.4) for user-entered values only. Phase 6 implements it.

**Limitations / manual gates:** loading the release build in real Chrome (toolbar click, side-panel open) is a manual check — see Phase 4 handoff.

---

## Phase 1 — Verified profile ✅

**Acceptance criteria**
- [x] Zod schemas (`src/domain/schemas.ts`): bounded strings, `YYYY`/`YYYY-MM` partial dates, http(s)-only URLs, no credential fields, strict objects
- [x] Migration runner (`src/domain/backup.ts`) works on a copy; failing/missing steps and unknown versions are rejected
- [x] Storage owned by the service worker only (`src/browser/store-service.ts`); sender must be an extension page; requests Zod-validated; writes serialized with a revision check
- [x] Dashboard editors for contact, links, education, employment, projects, skills with stable IDs, per-field errors, discard, delete-one
- [x] Backup export, import with preview + confirm, wipe-all with confirm, privacy notice
- [x] E2E: data survives a browser restart (same profile dir relaunched)
- [x] Malformed, oversized, polluted, future-version imports and failing migrations leave the store untouched (unit + E2E)
- [x] A content script can't read `chrome.storage.local` and its `store/get` message is refused (E2E)

**Commands / results:** `npm run typecheck` ✔, `npm run lint` ✔, `npm run build` ✔, `npm test` 45 passed, `npm run test:e2e` 5 passed.

**Notes:** corrupt saved data is never overwritten by a normal save; the user can import a backup or wipe. Review fixes: SW-unreachable error shown, bullet-line errors mapped to their field, dates trimmed, export URL revoked after a delay. Skipped: full-profile stringify per render (fine for realistic profile sizes).

## Phase 2 — Applications and resume handoff ✅

**Acceptance criteria**
- [x] Platform-neutral `Application` records (`platformId`, `portalOrigin`, `tenantKey`, job details, import snapshot, reviewed flag); store schema v2 with a v1→v2 migration
- [x] Local PDF.js extraction with the bundled worker (`src/features/resumes/pdf.ts`); caps: 10 MB, 10 pages, 15 s
- [x] Section heuristics for header, education, experience, projects, skills (`src/domain/resume/pdf-text.ts`), never inventing dates
- [x] Companion JSON (`TailoredResumeJSON`), `examples/tailored-resume.example.json`, exported `examples/tailored-resume.schema.json` (kept in sync by a test), `docs/chatgpt-resume-handoff.md`
- [x] Side-by-side conflict review vs master; master stays canonical; unmatched records can be added to master only by explicit click (tailored bullets not copied)
- [x] Optional JD paste; persisted only on opt-in (retention enforced in the service worker on every write)
- [x] Fixture PDFs generated by `node scripts/make-fixture-pdfs.ts` (pdf-lib + a hand-built encrypted PDF)
- [x] E2E: PDF-only and JSON-only flows produce reviewed applications; mismatched PDF+JSON flagged; encrypted, image-only and corrupt PDFs report clearly; switching applications never leaks data

**Commands / results:** typecheck ✔, lint ✔, build ✔ (release bundle 2.15 MB, mostly the pdf.js worker), `npm test` 92 passed, `npm run test:e2e` 12 passed.

**Limitations:** PDF heuristics target one-column English resumes; two-column layouts merge columns into one line. JSON skills marked `source: "job"` are dropped (relevance only). Job descriptions not opted in are lost when the page closes.

## Phase 3 — Workday adapter: scan-only ✅

**Acceptance criteria**
- [x] Workday adapter registered in `src/platform/registry.ts` (the only adapter import)
- [x] Detection = Workday host (`*.myworkdayjobs.com`, `*.myworkdaysite.com`, `wdN.myworkday.com`) + DOM markers; lookalike hosts never supported; no markers → uncertain (inactive)
- [x] `tenantKey` from origin + path tenant/site (`src/adapters/workday/detection.ts`); two tenants on one host and two sites of one employer stay separate
- [x] Activation from the popup injects `copilot.js`, binds tab → application (session storage); application is pinned to its first portal; binding cleared on cross-origin navigation, tab close, failed scan, or a status check that finds the script gone
- [x] Field inventory and classifier (`scan.ts`, `semantics.ts`): automation ids → explicit labels → ARIA → wrapper label → name/id; record grouping; month/year dates; dropdowns, comboboxes, multiselect, radios, checkboxes, files; label ties marked uncertain; semantics only on compatible control kinds
- [x] Step recognized by its label (progress bar / heading), not by count
- [x] Protected fields classified before values are read (`src/domain/policy.ts`); credential/attestation values never read
- [x] Side-panel review: recognized / needs review / you answer these / not supported / required-and-empty / site errors
- [x] Fixtures: Acme (standard ids), Globex (ARIA labels, repeated records), Initech + Hooli (same host, path tenants, protected questions), a job listing (uncertain) and a lookalike (unsupported); instrumented to record events/mutations/values
- [x] E2E: all fixtures scan with zero events, zero mutations, unchanged values, no navigation; unknown/uncertain pages stay inactive; same-host tenants stay separate

**Commands / results:** typecheck ✔, lint ✔, build ✔ (release manifest unchanged: 4 permissions, no hosts), `npm test` 152 passed, `npm run test:e2e` 18 passed.

**Test-only mechanics:** `--mode e2e` grants `http://*.myworkdayjobs.com/*`, `http://*.myworkdaysite.com/*` and the fixture origin; Playwright maps those hostnames to the local fixture server (`--host-resolver-rules`). Popup and side panel accept `?tabId=` so tests can target a tab.

**Manual gates:** real toolbar activation, `activeTab` loss after navigation, side panel opening from the popup, and real Workday markup are not yet verified.

## Phase 4 — Safe fill + My Experience repair ✅ (first usable build)

**Acceptance criteria**
- [x] Proposal engine (`src/domain/plan.ts`): only differing fields; never clears or invents; existing values = corrections needing approval; choice controls already showing the matching option count as correct; idempotent
- [x] Record association by identity (employer/school + title/degree/start), ambiguous → unlinked, manual linking in the side panel; unmatched page entries never touched
- [x] Diff cards (now / new / source / reason / safe vs needs your OK); per-field, per-entry and "Approve all safe" (excludes corrections, paired new entries, checkboxes, protected)
- [x] Controls (`controls.ts`): text/url/textarea (native setter + input/change/blur), native select, radio, checkbox, Workday dropdown (open → wait → click owned option), combobox (restores text on failure/stop), month/year dates
- [x] Write lifecycle: revalidate label, entry identity and expected value right before each write → apply → settle → verify; `apply` reports attempted, only `verify` marks verified
- [x] Bounded Add Another (max 3 per fill, approval only); new empty entries paired for review
- [x] Stale-plan rejection (different step), cancellation (Stop button, page hide, URL change)
- [x] Forbidden-click guard: Next/Submit/agree/sign in/delete never pressed; protected fields re-checked at the page boundary
- [x] Adapter contract kit (`tests/contract/kit.ts`) run against Workday and a test-only plain-HTML adapter
- [x] E2E: rerendering controlled inputs fill and verify; user edits before fill preserved; repeat run is a no-op; zero wrong-field writes (value diff); Next/Submit never activated; My Experience dates/dropdowns/Add Another
- [x] `docs/manual-testing.md` (load instructions + QA checklist)

**Reviews:** /code-review + independent security-auditor and test-engineer audits. Fixed: writes into a re-slotted entry (entry identity check), label drift after rerender, options from another control's list (owned-listbox only), approvals surviving value changes, email on sign-in/registration pages (now credential), frame targeting (main frame only), combobox restore on stop, Add caps aligned, settle 2 s → 4 s. Added tests for each.

**Commands / results:** typecheck ✔, lint ✔, build ✔, `npm test` 207 passed, `npm run test:e2e` 22 passed.

**Manual gate (yours):** load `.output/chrome-mv3` and run `docs/manual-testing.md` on ≥2 employers without submitting. Not yet done; live Workday compatibility is unverified.

## Phase 5 — Skills ✅

**Acceptance criteria**
- [x] Ranking (`src/domain/skills.ts`): verified inventory only; tailored resume = evidence (pre-ticked); job description = relevance only; resume skills not verified are listed, never offered
- [x] Versioned alias map (`ALIAS_VERSION` 1) with explicit non-equivalences (Java/JavaScript, C/C++/C#, React/React Native); user-approved aliases stored (schema v3 `skillAliases`)
- [x] Workday `skillSearch` capability (`skills-search.ts`): exact → wait for this field's own list → aliases → broader options shown for approval (whole-word related only) → never picks a non-exact option on its own
- [x] Honest outcomes: added (chip verified), already on the page, only similar options, not available (explicit empty answer), no clear answer (timeout or stale list), stopped
- [x] Rate-limited (400 ms), cancellable, duplicate-safe, search text always cleared, input kept focused while searching
- [x] Per-application `skillSelections` saved after success
- [x] Tests: unit (ranking, aliases, mentions, decide, search with delayed/empty/stale/duplicate/cancel widgets); E2E (exact, alias, broader-with-approval + remember, not available, timeout, duplicate, JD-only "Go" never offered or added)

**Commands / results:** typecheck ✔, lint ✔, build ✔, `npm test` 231 passed, `npm run test:e2e` 23 passed.

**Limitations:** custom free-text skill entry is not attempted (reported as not available); live Workday search behaviour (Enter vs typing, "No Items." wording) unverified.

**Environment note:** OneDrive sync removed/locked files in `node_modules` mid-phase (fixed with `npm ci`). Moving the repo out of OneDrive is recommended.

## Phase 6 — Answer memory ✅

**Acceptance criteria**
- [x] Explicit "Remember" in the side panel (text, textarea, select, radio, dropdown); scope global / employer / job; nothing saved without a click (schema v4 `answers`)
- [x] Matching (`src/domain/questions.ts`): exact wording → reuse; similar wording (filler/synonyms) → proposed, needs OK; reversed wording (negation/un-) → blocked with a reason; changed choices → blocked; choices mapped by visible text
- [x] Scope precedence job > employer > global; latest user confirmation wins
- [x] Templates with `{{employer}}` / `{{jobTitle}}` (rendered from the application only); deterministic, no AI
- [x] Safety: only exact, visible choices are "safe"; text answers, templates and closed dropdowns always need your OK; sensitive questions never use memory
- [x] Sensitive answers (user decision): typed in the dashboard (schema v4 `sensitiveAnswers`); proposed only for a single clearly named topic in the label, never negated, matching category; per-field approval only; the page boundary writes a sensitive field only for an action declaring that exact category; attestations never
- [x] Dashboard "Saved answers": edit, delete, add template; "Sensitive answers" form
- [x] Reasons shown for saved answers that were not used
- [x] Tests: unit (matching, inversion, scope, latest wins, changed options, templates, sensitive topics/choices, proposals incl. dropdowns, page-boundary category rule); E2E (safe reuse, other employer's answer not reused, sensitive needs per-field approval, bland "Please select" demographic left alone, attestation untouched, filling never creates memories, explicit Remember with scope, dashboard delete)

**Commands / results:** typecheck ✔, lint ✔, build ✔, `npm test` 249 passed, `npm run test:e2e` 24 passed.

**Limitations:** generative AI drafting not included (post-MVP per spec). Dropdown choices are matched against real options only when clicked.

## Phase 7 — Full workflow ✅

**Acceptance criteria**
- [x] SPA Next/Back re-scan: the injected script notifies the side panel only when URL/step/page kind changes (not on rerenders, typing or its own writes); the panel re-scans automatically
- [x] Permission loss / reactivation: binding ends on cross-origin navigation, tab close, failed scan, or a status check that finds the script gone; the UI asks you to activate again (full reloads revoke `activeTab` by Chrome design)
- [x] Page kinds (`page-kind.ts`): application, sign-in, create account, verify email, confirmation, unknown, plus offered SSO providers, from visible non-secret evidence only
- [x] Account registry (schema v5 `accounts`): tenant, employer, email, status (`unknown`/`registered`/`verificationPending`); changes only on your click; no secrets anywhere; dashboard "Employer accounts"
- [x] Non-credential email assist: copy-to-clipboard from an extension page; nothing typed into sign-in or registration forms (all their fields are classified credential)
- [x] Upload guidance: names the application's resume file; upload stays manual
- [x] Conservative confirmation detection (strong wording, no remaining form fields) and user-confirmed `submittedAt`; step history (labels only) shown per application
- [x] E2E: SPA next/back auto re-scan + step history; sign-in/registration pages never read or write password/OTP/SSO (values, events and storage asserted) and registry changes only on click; confirmation recorded only after confirm; two tabs on two employers isolated and a cross-tab plan refused; upload note

**Reviews:** /code-review (fixed: forced layout from innerText, silent step-history save failure), security-review (no high/medium findings), ponytail-review (fixed: typing no longer triggers step checks).

**Commands / results:** typecheck ✔, lint ✔, build ✔, `npm test` 256 passed, `npm run test:e2e` 29 passed.

## Phase 8 — Release readiness ✅ (pending your live QA)

**Acceptance criteria**
- [x] Accessibility: every control in all dashboard sections, the side panel and the popup has an accessible name; keyboard use of the dashboard (E2E `accessibility.spec.ts`)
- [x] Narrow side panel (320 px): no horizontal scroll, named controls (E2E)
- [x] Final `docs/privacy-threat-model.md`; `README.md` (states "experimental, not yet validated on live Workday"); `docs/architecture.md`; `docs/known-limitations.md`; `docs/adding-an-adapter.md` (Greenhouse/Lever walkthrough, docs only)
- [x] Screenshots with fabricated data (`docs/screenshots/`, regenerate with `SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts`)
- [x] Local package: `npm run zip` → `.output/job-application-copilot-0.1.0-chrome.zip` (manifest verified: 4 permissions, no hosts). Not published.
- [x] Fresh clone passes the full gate (see below)
- [x] **Live QA (yours):** run `docs/manual-testing.md` on ≥2 employers and record Chrome version + results here. Done 2026-10-11 on two employers (Chrome 154, results in `docs/manual-testing.md` §5). Confirmed live afterwards: check 15, the employer account panel, and check 5 (employer 3, `docs/qa/2026-10-11-workday-employer-3.md`). Confirmation-page recording confirmed live on employer 4 (Workday employer 4, 2026-10-12): every checklist item has now passed live at least once.
  - Employer 1 (Workday employer 1, wd1) in progress 2026-10-10/11: My Information and My Experience checked; 11 live bugs fixed (text blur, list ownership, step name, records, dates, Add Another, degree abbreviations, skills search/click/stale results). Details and open items: `docs/qa/2026-10-10-workday-employer-1.md`. Employer 2 (Workday employer 2, wd5) run 2026-10-11 with Autofill with Resume: 4 more live bugs fixed (`docs/qa/2026-10-11-workday-employer-2.md`). Live findings are replayed by `tests/e2e/workday-live-like.spec.ts` on the fabricated `vista` tenant (12/13 fixes caught by mutation).

**Release audits (security-auditor + test-engineer), fixed:** sensitive answers now require exact option text at proposal and write time (near-miss options refused); backup preview lists sensitive answers, remembered skill options and accounts; loose aliases removed (Angular≠AngularJS, "Node"); every field on sign-in/registration/verification pages is a credential (value never read); tests added for no re-scan on typing/rerender, same-URL step change, forged `tab/skills`, upload filename, full event equality and no password in scan responses; Playwright keeps traces on failure.

**Commands / results:** typecheck ✔, lint ✔, build ✔, `npm test` 259 passed, `npm run test:e2e` 31 passed (+1 screenshot spec skipped unless requested).

### Greenhouse support (2026-10-12, user request)
- [x] Phase 1: platform plumbing (`greenhouse` platform id; activation records the detected adapter; shared helpers in `src/adapters/shared/dom.ts`)
- [x] Phase 2: detection (`job-boards.greenhouse.io` + `form#application-form`, tenant = board token) and read-only scan (React-Select dropdowns, checkbox groups, education block, split month/year dates, Location (City)); policy protects acknowledgements and messaging consents
- [x] Phase 3: fill + verify (full pointer sequence for React-Select, typing into searched lists, exact/unique matches only, Add another); passes the adapter contract kit
- [x] Phase 4: E2E on a synthetic board (`tests/e2e/greenhouse.spec.ts`: read-only scan, approved fill incl. dropdowns, user edits kept, acknowledgement and Submit untouched)
- [x] Phase 5: live QA on the user's Greenhouse applications: Greenhouse board 1 (`docs/qa/2026-10-12-greenhouse-board-1.md`), Greenhouse board 2 (`docs/qa/2026-10-13-greenhouse-board-2.md`), Greenhouse board 3 (`docs/qa/2026-10-13-greenhouse-board-3.md`); 8 live bugs found and fixed. Greenhouse board 4's posting closed before testing. Supported: hosted job boards (`job-boards.greenhouse.io`); embedded employer-site forms are not.

### Ashby support (2026-10-16, user request)
- [x] Tests first: synthetic Ashby form copying a live jobs.ashbyhq.com structure (Yes/No buttons with aria-pressed, place search with an aria-controls list); detection, scan, fill, contract and e2e tests written and run red (19 failing assertions)
- [x] Plumbing (`ashby` platform id, registry, e2e host over HTTPS because ashbyhq.com is on Chrome's HSTS list) and adapter (`src/adapters/ashby/`, shared fill loop); "full name" profile value; all green
- [x] Reviews: location write restores the previous value on failure, ignores a stale list, phone label rule widened, only `/application` pages count
- [x] Confirmation: the success message that replaces the form after Submit is recognized (live screenshot 2026-10-17); before, the tab lost its activation
- [x] Recorded user-run application QA: `docs/qa/2026-10-16-ashby-board-1.md`. Fixes have synthetic regressions; fresh validation of the current candidate remains pending.

### Dead-code and test audit (2026-10-17, user request)
- [x] Bug: Greenhouse native `<select>` questions were scanned but never filled (no write case) and read back the option value, not its text; test first, fixed
- [x] Removed after proving no callers: `detectAdapter`, the `tab/deactivate` message, the unread adapter `capabilities` field
- [x] Tests: honest name for the contract kit's protected-field test, merged an Ashby duplicate, stopped a skills widget timer leaking into later tests, made the slow-click test independent of timing (mutation-checked), folded a duplicate pop-up test
- Kept on purpose: `ALIAS_VERSION` (the versioned alias map is a Phase 5 requirement); write-only stored fields (`Application.skillSelections`, `platformId`, `portalOrigin`, `createdAt`, `updatedAt`, `AccountRecord.updatedAt`) because removing them needs a storage migration for no user benefit

### Live QA log
The detailed Workday results, including the recorded Chrome version, are in `docs/manual-testing.md` §5. Platform-specific outcomes and follow-ups are in `docs/qa/`.

| Date | Platform | Recorded scope | Evidence |
|---|---|---|---|
| 2026-10-10–15 | Workday | Selected employers, experience/questions/skills, account and confirmation observations | Workday QA notes and manual-testing results |
| 2026-10-12–13 | Greenhouse | Three hosted boards | Greenhouse QA notes |
| 2026-10-16–17 | Ashby | Hosted application, EEO survey, form-store timing, confirmation | Ashby board 1 note and recorded confirmation follow-up |
| Pending | Current candidate | Reliability fixes and application content | `docs/release-candidate.md` |

### Remaining validation and unsupported scope
- Fresh live results for the current candidate; earlier sessions cover only observed employer configurations.
- Unobserved employers, custom Workday domains and embedded Greenhouse/Ashby forms.
- Project-specific form controls (wording is provided for manual entry).
- Two-column/scanned resume extraction and non-English forms remain unsupported.

