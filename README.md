# Job Application Copilot

A local-first Chrome extension that helps you fill job applications from your own verified profile. You review every change, and it **never submits anything**.

It supports **Workday** candidate portals and **Greenhouse** hosted job boards (`job-boards.greenhouse.io`; Greenhouse forms embedded on employer websites aren't supported yet). Other application systems can be added (see [docs/adding-an-adapter.md](docs/adding-an-adapter.md)).

> **Status: experimental.** Checked live on four Workday employers and three Greenhouse boards (see [docs/qa/](docs/qa/)). Everything here is tested against synthetic Workday-like pages, not real employer portals. Live behaviour varies by employer. Until manual results are recorded in [docs/implementation-progress.md](docs/implementation-progress.md), treat it as a careful assistant and check each step yourself.

## What it does

- **Keeps one verified master profile** (contact, links, education, jobs, projects, skills) and a separate record for each application.
- **Imports your tailored resume** as a PDF, a companion JSON from your resume chat, or both. It reads them on your device, flags mismatches, and shows how each differs from your master profile. Your master profile stays the source of truth.
- **Scans each Workday step without changing it,** then proposes fills: only fields that differ from your profile, each with its source and reason.
- **Repairs My Experience:** matches Workday's parsed entries to your real jobs and schools by identity, never by position. It fixes dates and dropdowns, and adds missing entries only when you approve.
- **Adds skills** only from your verified list. It searches Workday's skills box, picks exact matches, offers close options for your approval, and tells you honestly when a skill isn't available.
- **Remembers answers** only when you click Remember, scoped to all employers, one employer or one job. It never reuses an answer for reversed wording.
- **Sensitive answers** (demographics, work authorization, sponsorship, conviction) are filled only from answers you type in the dashboard. Each one needs your approval, only when the question clearly names the topic, and only into a choice whose text exactly matches what you typed.
- **Helps with accounts:** it recognizes sign-in and registration pages and keeps an account list (email and status only), but never types or reads passwords, codes or Google sign-in.
- **Respects your edits:** a value you changed is never overwritten, and every write is checked after the page rerenders.

## What it never does

Click Next or Submit. Accept terms or sign attestations. Create accounts or sign in. Touch passwords, one-time codes, CAPTCHA, cookies or SSO. Upload files. Invent skills, dates or experience. Send your data anywhere: there's no server, no analytics and no AI service.

## Install (from source)

Requires Node 22 and npm.

```bash
npm ci
```
```bash
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `.output/chrome-mv3`.
3. Pin the extension. After updating the code, rebuild and click ↻ on the extension card. Your data is kept.

`npm run zip` builds a local package under `.output/`. It isn't published to any store.

## Using it on an application

1. **Dashboard → Master profile:** enter your verified details.
2. **Dashboard → Applications → New application:** add the tailored PDF and/or JSON (see [docs/chatgpt-resume-handoff.md](docs/chatgpt-resume-handoff.md)), review the comparison, and save.
3. Open the employer's Workday application. Use Workday's own "Autofill with Resume" and upload your PDF yourself.
4. Click the extension button, choose the application, and click **Activate on this tab**. Then click **Open step review**.
5. **Scan this step**, read the proposed changes, approve what's right (or "Approve all safe"), and click **Fill**. Each field reports "Filled and verified" or why it wasn't filled.
6. Answer anything listed under "You answer these" yourself. Click Next yourself; the panel re-scans the new step.
7. On the confirmation page, record the submission if you want it in your history.

The full manual QA checklist is in [docs/manual-testing.md](docs/manual-testing.md).

## Privacy

Your data is stored only in this Chrome profile (`chrome.storage.local`, restricted to the extension's own pages). Chrome doesn't encrypt it, so anyone with access to your computer account could read it. Export backups and delete data from **Dashboard → Backup & privacy**. Job descriptions are saved only if you tick the box. Details: [docs/privacy-threat-model.md](docs/privacy-threat-model.md).

Permissions: `activeTab` (only the tab you activate, until it navigates away), `scripting`, `storage`, `sidePanel`. No access to sites until you click Activate.

## Development

```bash
npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e
```

- `npm run test:e2e` builds a test-only variant into `.output/chrome-mv3-e2e` (it grants the synthetic fixture hosts) and drives it in Playwright's Chromium. The release build never contains those grants, and a test checks this.
- Architecture: [docs/architecture.md](docs/architecture.md). Limitations: [docs/known-limitations.md](docs/known-limitations.md). Conventions for contributors and coding agents: [AGENTS.md](AGENTS.md).
- Regenerate fixture PDFs: `node scripts/make-fixture-pdfs.ts`.

## Screenshots

These use fabricated data only.

| Dashboard | Step review | Proposed changes |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Step review](docs/screenshots/step-review.png) | ![Proposed changes](docs/screenshots/proposals.png) |

## License

MIT
