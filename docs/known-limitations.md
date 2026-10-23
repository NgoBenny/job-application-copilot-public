# Known limitations

**Checked live on a handful of sites only.** Automated tests use synthetic pages modelled on public Workday, Greenhouse and Ashby markup; live checks so far are listed in `docs/qa/`. Real employers differ, so treat every result as "check it".

## Workday variation
- Detection needs a Workday host plus page markers. Custom domains that front Workday aren't recognized.
- Field meaning comes from automation ids and labels. Unusual labels land in "Needs review", and label ties are never filled.
- Step names come from the progress bar or heading. Tenants without either show "Unnamed step".

## Controls
- Synthetic events aren't trusted user events. A widget that ignores them is reported "Not filled", never forced.
- Dropdown options are read only when the list opens. If two lists are open at once and the control doesn't say which list is its own, the fill refuses.
- Date widgets other than month/year text boxes (calendar pickers) are unsupported.
- Skill search supports observed results lists, Enter-to-search, free-entry chips, and narrow-window pop-ups. Unrecognized gestures report "No clear answer"; arbitrary custom skill entry is not forced.

## Resume import
- PDF reading targets one-column, English, text-based resumes. Two-column layouts merge columns; scanned PDFs have no text and are refused with a message.
- The companion JSON is a proposal, not proof. Your master profile wins.
- Application content must be explicitly enabled, reviewed and saved. Editing selections/wording or replacing the import clears its approval; experience and education fills then pause. Missing master records are ignored. Project wording is available for manual entry; project-specific form controls are unsupported.

## Accounts and upload
- The extension never signs in, registers, types passwords or codes, or uses SSO. Email help is copy-to-clipboard only.
- Uploads are always manual.
- Chrome removes `activeTab` access on full page loads, so activate again after a reload.

## Answers
- Similar-question matching is deliberately narrow (filler words and a few synonyms). Many equivalent questions won't match, which is safe.
- Sensitive answers require one unambiguous topic from the question or, when it names none, its choices. Ambiguous labels/choices stay manual. Individual approval or explicit group approval is allowed for this personal build; Approve all safe excludes these answers.
- No AI drafting (optional post-MVP per the spec).

## Data
- `chrome.storage.local` isn't encrypted. Anyone with your computer account can read it.
- Removing the extension deletes its data. Export backups.
- Backup imports and validated stores are bounded to 12 MB; Chrome may reach its local quota earlier. Schema-6 data cannot be opened by the older schema-5 build: keep a backup made before upgrading if rollback is needed.

- Questions that ask you to acknowledge something or to receive messages (SMS/WhatsApp) are treated like terms and attestations on every site: never read, never filled, and a saved answer for them is not used (added 2026-10-12 for Greenhouse).

## Environment
- Keeping the repo in OneDrive caused files in `node_modules` to be removed or locked during development. Build from a folder outside OneDrive, or pause sync while building.
