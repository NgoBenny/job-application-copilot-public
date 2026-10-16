# Architecture

## Contexts

| Context | Code | Role |
|---|---|---|
| Popup | `entrypoints/popup` | Shows tab status, picks the application, **Activate on this tab**, opens the side panel and dashboard. |
| Side panel | `entrypoints/sidepanel`, `src/features/review`, `src/features/skills`, `src/features/account-registry` | Step review, proposals and approval, skills, Remember, account/upload/confirmation panels. |
| Dashboard (options page) | `entrypoints/options`, `src/features/*` | Master profile, applications and resume import, saved and sensitive answers, employer accounts, backup/privacy. |
| Service worker | `entrypoints/background.ts`, `src/browser/*` | Sole owner of storage, validated message router, tab ↔ application binding, plan forwarding. |
| Injected script | `entrypoints/copilot.ts` + the adapter | Injected only after Activate. Runs the adapter's detect/scan/apply/verify/searchSkills. Never reads storage or receives the profile. |

## Layers

```
src/domain/     pure TS: schemas + migrations, policy (protected fields), plan (proposals), questions (answer memory),
                skills, options, dates, text, resume parsing/reconcile
src/platform/   ApplicationAdapter contract, registry (the only place adapters are imported)
src/adapters/workday/  detection + tenant key, scan, semantics, page kind, controls, skills search
src/browser/    messages (Zod), router, store-service, tab-service
src/features/   React UI per feature
```

An ESLint rule (`no-restricted-imports`) blocks adapter imports anywhere except `src/platform/registry.ts`. The contract kit (`tests/contract`) runs against Workday and a test-only plain-HTML adapter, which proves the engine has no Workday dependency.

## Data flow for one step

```
Popup "Activate" ──► SW: executeScript(copilot.js) ─► page: detect ─► SW: bind tab→application (session storage)
Side panel "Scan" ─► SW (binding check) ─► page: scan (read-only) ─► ScanSnapshot (no protected values)
Side panel: propose(snapshot, profile, answers)  ← profile stays in extension pages
User approves ─► ApprovedFillPlan (only approved actions) ─► SW (Zod + binding check) ─► page:
   per action: re-read label, entry identity and current value ─► protection check ─► write via UI path
   ─► wait for rerenders ─► verify by re-reading ─► results
```

`apply` only reports *attempted*; only `verify` marks *verified*. A plan made for another step, or one whose expected values or entries changed, is reported as stale and left alone.

## Identity and scope

- **tenantKey** = origin plus tenant/site path (`*.myworkdayjobs.com/<site>`, `myworkdaysite.com/recruiting/<tenant>/<site>`, `wdN.myworkday.com/<tenant>`). An application is tied to the first portal it's activated on.
- **Bindings** are per tab, held in `chrome.storage.session`. They're cleared on cross-origin navigation, tab close, failed scans, or a status check that finds the injected script gone.
- **Answer scopes:** job > employer (tenantKey) > global; the latest confirmation wins within a scope.

## Storage

One document under `chrome.storage.local["store"]`, validated by `Store` (`src/domain/schemas.ts`), with `revision` for conflict detection. Writes are serialized in the service worker. Access level is `TRUSTED_CONTEXTS`.

| Version | Added |
|---|---|
| 1 | master profile |
| 2 | applications |
| 3 | skill aliases, per-application skill selections |
| 4 | saved answers, sensitive answers |
| 5 | employer accounts, submission date, step history |

Migrations (`src/domain/backup.ts`) run on a copy. A failure leaves stored data untouched. Backups go through the same size cap, forbidden-key check, migrations and schema.

## Messages

All service-worker requests are Zod-validated (`src/browser/messages.ts`) and accepted only from the extension's own pages. Service worker → page commands (`copilot/*`) are validated again in the page, and accepted only from the extension with no tab sender. The page → side panel `copilot/changed` notice carries no data and only triggers a re-scan.
