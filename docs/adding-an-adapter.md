# Adding an adapter (e.g. Greenhouse or Lever)

Workday and Greenhouse (job-boards.greenhouse.io, added 2026-10-12, live QA pending) are implemented; `src/adapters/greenhouse/` is the smallest real example. This page shows how another applicant-tracking system plugs in. The Greenhouse notes below were written before it was built; where they differ, the code wins (e.g. Greenhouse's choice questions are React-Select dropdowns that need a full pointer sequence to open, see `src/adapters/greenhouse/controls.ts`).

## 1. What stays the same

Everything platform-neutral is reused as is:

- the master profile, applications and resume import;
- proposals (`src/domain/plan.ts`), protected-field policy (`src/domain/policy.ts`), answer memory and skills ranking;
- the side panel's approval UI, the service-worker router, and tab binding.

An adapter only maps one site's pages to the contract in `src/platform/adapter.ts`.

## 2. Folder and registration

```
src/adapters/greenhouse/
  detection.ts   # host + DOM evidence → supported | uncertain | unsupported, plus tenantKey
  scan.ts        # read-only field inventory → ScanSnapshot (semantic keys, protection, recordKey)
  controls.ts    # write one value per control kind through the site's normal UI path
  index.ts       # export const greenhouse: ApplicationAdapter
```

Then add one line in `src/platform/registry.ts`, the only file allowed to import adapters:

```ts
import { greenhouse } from '../adapters/greenhouse';
export const adapters: readonly ApplicationAdapter[] = [workday, greenhouse];
```

Add `'greenhouse'` to `PlatformId` (`src/platform/adapter.ts`), to `BindingSchema` (`src/browser/messages.ts`) and to `Application.platformId` (with a storage migration), and let `tab-service` record the detected adapter's id in the binding instead of `'workday'`.

## 3. Worked example: Greenhouse

These are illustrative patterns to verify against live pages before relying on them.

| Contract piece | Greenhouse approach |
|---|---|
| `detect` | Host `boards.greenhouse.io` or `job-boards.greenhouse.io` plus the application form (`#application_form` / `form#application-form`). An embedded iframe on an employer domain counts as `uncertain` until it's verified. |
| `tenantKey` | `origin + /<board token>`, e.g. `https://boards.greenhouse.io/acme`. |
| `scan` | One page, no steps: `stepId = 'application'`. Fields have stable `name`s (`job_application[first_name]`, `[email]`, `[phone]`), so map them to `contact.*`. Custom questions keep their label text, so answer memory handles them. Run `classifyProtection` on every label first. EEO sections are `demographic`. |
| `recordKey` | Education blocks repeat as `education[N]`. Matching still goes by identity (`propose`), never by position. |
| Controls | Mostly native inputs and selects, so the native setter + events path from Workday's `controls.ts` can be copied. Some boards use searchable selects (Select2); open them, then pick the owned option. |
| `searchSkills` | Usually absent: leave the capability out. The side panel hides the Skills section when no field has `semantic: 'skills'`. |
| Never | The Submit button (`#submit_app`) goes on the forbidden-click list. Resume upload stays manual. |

**Lever** is similar: `jobs.lever.co/<company>/<posting>/apply`, one page, `name="name"`, `name="email"`, `urls[LinkedIn]`, custom cards with `cards[...]` names, and the EEO section at the bottom.

## 4. Prove it

1. Add synthetic fixtures under `tests/fixtures/<platform>/` (fabricated people only), served by `tests/fixture-server.mjs`. For the e2e build, add the host to `E2E_HOSTS` in `wxt.config.ts` and to `--host-resolver-rules` in `tests/e2e/extension.ts`.
2. Run the contract kit against the new adapter (`tests/unit/adapter-contract.test.ts`): `adapterContract('greenhouse', greenhouse, { url, html, fillableLabel, protectedLabel })`. It checks read-only scans, protected-value exclusion, approved-only writes with verification, idempotence, stale-plan rejection, cancellation, and no navigation clicks.
3. Add E2E like `tests/e2e/workday-*.spec.ts`: scan with zero writes, fill and verify, user edits preserved, tenant isolation.
4. Do live QA with `docs/manual-testing.md` before claiming compatibility.
