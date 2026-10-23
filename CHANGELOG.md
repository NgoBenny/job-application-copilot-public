# Changelog

## Unreleased — review candidate, 2026-10-22

### Added
- Per-application job, education and project selections with reviewed employment/project wording. Master facts remain canonical; projects stay manual.
- Schema 6 migration preserving existing applications' whole-profile behavior. Export a backup before upgrading if you may need the previous build; old builds cannot open the newer schema.

### Fixed
- Application saves preserve newer portal bindings, history, skills and submission dates. Conflicting edits keep the draft and request review.
- Backups over 2 MB can be restored. Compact export and a bounded 12 MB ceiling keep backups compatible with saved data; Chrome's local quota still applies.
- Add clicks report success only when a new record is scanned in that section.
- Ambiguous repeated employer/title matches remain unmatched during import review.
- Multiline descriptions are compared as complete text, so partial descriptions are corrected and already-filled descriptions stay a no-op.
- Unit fixtures no longer load external iframe pages.

### Clarified
- Sensitive group approval remains accepted for personal use; Approve all safe continues to exclude sensitive answers.
- Historical Workday/Greenhouse/Ashby QA is separate from fresh validation of this candidate. No store publication or new live-compatibility claim.
