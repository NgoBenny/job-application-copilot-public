# Live QA notes: employer 4 (Workday employer 4), 2026-10-12

Structure and results only; no personal values recorded.

| Check | Result |
|---|---|
| Remember a long question | Fail → fixed: a question carrying a long "close personal relationship" definition (well over 500 characters) silently failed to save on Remember: saved questions were capped at 500 characters and the side panel ignored the save result. Cap raised to 3,000 (stored whole, since matching uses the exact wording); failed saves from Remember and "Use …" now show an alert. Not yet retested live. |
| Veteran question not treated as sensitive | Fail → fixed (safety): "Indicate your military/veterans status…" was classified as ordinary, so it sat in Needs review and Remember offered and saved it as a global saved answer. The demographic pattern only knew `veteran` (word-bounded, so not "veterans") and "military status". Now `veterans?` and `military` count. A saved ordinary answer for a protected question is never used. |
| Race as checkboxes | Unsupported → built: "Please indicate your race." is a group of checkboxes, each option ending "(United States of America)"; the scan listed six unrecognized checkbox fields. Several checkboxes under one question are now one choice question named by its label, recognized as sensitive, and filled from the dashboard's race answer with the exact/shared-tag rule: only the matching box is ticked, never unticks. First retest: grouped, but named after its first option. Live markup: `formField-ethnicityMulti > fieldset > legend` holds the question; the boxes sit in an inner `fieldset[aid=ethnicityMulti-CheckboxGroup]` grid with no label. The group's label is now found outward from the group up to the field. Checked on the live DOM: 6 boxes, label "Please indicate your race." Confirmed live: the proposal ticked only "Asian (United States of America)". |
| Veteran wording differs | By design: the dashboard answer "I am not a protected veteran" has no exact option on this tenant ("I am not a Veteran."), so it was reported "No matching choice" and left to the user. |
| Confirmation page | Pass: after Submit, Candidate Home showed the "Application Submitted / Thank you for applying!" dialog; activated + scanned, the side panel named the step "Candidate Home", scanned 0 fields (header menus skipped) and offered "Looks like a confirmation page… Yes, I submitted it" (records only on click). |

## Outcome (2026-10-12)
The user completed and submitted the application themselves (check 12 pass). Confirmed live: confirmation-page recording, header menus skipped, long-question Remember fix pending a retest, race checkbox filled from the dashboard answer (only the matching box ticked).

