# Privacy & threat model (final, v0.1.0)

## Assets
- Master profile: contact details, education, employment, projects, skills.
- Application records: job details, import snapshots, skill selections, step labels, submission date.
- Saved answers.
- **Sensitive answers** (demographic, work authorization, sponsorship, conviction). The user chose to store these (decision 2026-10-10).
- Employer account list: email and status only.
- Transient: resume PDFs, job descriptions (unless saved on opt-in).

## Trust boundaries
1. **Extension pages and service worker** (trusted). These own `chrome.storage.local`, which is set to `TRUSTED_CONTEXTS` at startup. Tab bindings live in `chrome.storage.session` (trusted contexts by default).
2. **Injected script** (runs in the employer page's isolated world). It is injected only after Activate (`activeTab`) and receives only approved plans, skill lists and bindings. It never receives the profile or saved answers, and it cannot read storage.
3. **Employer page DOM** (untrusted). Labels, options and text may be adversarial.
4. **Imported files** (untrusted). PDFs, companion JSON, backups and pasted job descriptions.

## Threats and mitigations

| Threat | Mitigation | Evidence |
|---|---|---|
| Page script reads profile data | The profile never enters the page. Storage is restricted to trusted contexts. A content script's storage read fails and its storage messages are refused. | `tests/e2e/profile.spec.ts` |
| Page or another extension forges commands | The service worker accepts only this extension's own pages (`isTrustedSender`) and validates every request with Zod. The page accepts commands only from the extension with no tab sender. Fill and skill plans must match the tab's binding (tenant + application). | `store-service.test.ts`, `workday-workflow.spec.ts` (cross-tab plan refused) |
| Adversarial labels steer a write to the wrong field | Label ties are marked uncertain. Semantics apply only to compatible control kinds. Each action re-checks label, entry identity and expected value right before writing. Options come only from the control's own list. | `workday-apply.test.ts`, `workday-fill.spec.ts` (zero wrong-field writes) |
| Credentials, codes, SSO | Classified before values are read (password type, autocomplete, wording, sign-in/registration sections); values never read. Writes are blocked at the page boundary whatever the plan claims. No credential fields exist in any schema. | `policy.test.ts`, `workday-workflow.spec.ts` |
| Attestations / terms | Classified `attestation` and never read or written. Forbidden-click guard on agree/submit/next/sign-in/delete. | `workday-apply.test.ts` |
| Sensitive answers misapplied | Filled only from dashboard-typed values. The label must name exactly one topic with no negation. Never "safe", so every one needs approval. Only a choice whose text exactly equals the saved answer, both when proposing and when writing (near-miss options are refused). The page boundary requires the action's declared category to equal the field's category. Never learned from pages. | `questions.test.ts`, `workday-apply.test.ts`, `workday-answers.spec.ts` |
| Unapproved skills | Only verified skills are offered. Only exact matches are picked automatically; broader options need a click; job-description-only skills are never offered. | `skills.test.ts`, `workday-skills.spec.ts` |
| Malformed, huge or polluted imports | Size caps, rejection of `__proto__`/`constructor`/`prototype`, strict schemas, http(s)-only URLs, unknown versions rejected. Migrations run on a copy, so a failure changes nothing. PDFs: 10 MB, 10 pages, 15 s, no XFA, bundled worker. | `backup.test.ts`, `applications.spec.ts` |
| Prompt-injection text | No LLM anywhere. Imported and page text is treated as data. | `pdf-text.test.ts`, `skills.test.ts` |
| Over-broad host access | Release permissions are `activeTab`, `scripting`, `storage`, `sidePanel`: no host permissions, no static content scripts. The test-only grants exist only in the e2e build. | `manifest.test.ts` |
| Data at rest | Unencrypted, as the privacy notice states. Export, delete-one, and wipe-all are available. | Dashboard → Backup & privacy |
| Logs leak PII | No production logging of data. Error text names fields, never values. | `backup.test.ts` |
| Remote code | No CDN or remote scripts. MV3 CSP. The pdf.js worker is bundled. | Build output |

## Residual risks
- Anyone with access to your computer account can read stored data, including sensitive answers.
- A malicious extension with broad permissions installed in the same browser is out of scope.
- Live Workday markup may differ from the fixtures. Protection classification is wording-based and may miss unusual labels. Mitigation: nothing sensitive is ever "safe", and unmatched questions are left to you.

## Retention
Job descriptions are stored only on opt-in. Full answers are stored only for questions you chose to remember. You can delete individual applications, answers and accounts, or wipe everything.
