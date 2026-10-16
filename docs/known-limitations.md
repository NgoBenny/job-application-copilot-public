# Known limitations

**Untested on live Workday.** All automated tests use synthetic pages modelled on public Workday markup. Real tenants differ, so treat every result as "check it" until manual QA is recorded in the ledger.

## Workday variation
- Detection needs a Workday host plus page markers. Custom domains that front Workday aren't recognized.
- Field meaning comes from automation ids and labels. Unusual labels land in "Needs review", and label ties are never filled.
- Step names come from the progress bar or heading. Tenants without either show "Unnamed step".

## Controls
- Synthetic events aren't trusted user events. A widget that ignores them is reported "Not filled", never forced.
- Dropdown options are read only when the list opens. If two lists are open at once and the control doesn't say which list is its own, the fill refuses.
- Date widgets other than month/year text boxes (calendar pickers) are unsupported.
- Skill search assumes typing shows a results list. Tenants that need a different gesture report "No clear answer". Free-text custom skills aren't added.

## Resume import
- PDF reading targets one-column, English, text-based resumes. Two-column layouts merge columns; scanned PDFs have no text and are refused with a message.
- The companion JSON is a proposal, not proof. Your master profile wins.

## Accounts and upload
- The extension never signs in, registers, types passwords or codes, or uses SSO. Email help is copy-to-clipboard only.
- Uploads are always manual.
- Chrome removes `activeTab` access on full page loads, so activate again after a reload.

## Answers
- Similar-question matching is deliberately narrow (filler words and a few synonyms). Many equivalent questions won't match, which is safe.
- Sensitive answers are proposed only when the question names exactly one topic. Bland labels ("Please select") are left to you.
- No AI drafting (optional post-MVP per the spec).

## Data
- `chrome.storage.local` isn't encrypted. Anyone with your computer account can read it.
- Removing the extension deletes its data. Export backups.

- Questions that ask you to acknowledge something or to receive messages (SMS/WhatsApp) are treated like terms and attestations on every site: never read, never filled, and a saved answer for them is not used (added 2026-10-12 for Greenhouse).

## Environment
- Keeping the repo in OneDrive caused files in `node_modules` to be removed or locked during development. Build from a folder outside OneDrive, or pause sync while building.
