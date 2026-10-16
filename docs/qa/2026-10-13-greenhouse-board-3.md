# Live QA: Greenhouse, employer 3 (Greenhouse board 3), 2026-10-13

Redacted notes. The user ran the extension; Claude in Chrome read the page (choices masked to their first word and length; nothing chosen).

| Finding | Result |
|---|---|
| Disability Status "filled, then disappeared" | Fail → fixed: the site's choice uses a curly apostrophe ("don’t"); the saved answer a straight one. No exact match, so the extension's search text appeared and was cleared. Typographic quotes now compare as the same character (exact match otherwise unchanged), in matching and in verify. |
| Gender not recognized | Fail → fixed: it is a multi-answer dropdown, which was always left manual. The extension now fills one exact answer into an empty one (never adds to or changes existing answers) and closes the list afterwards. Markup assumed from React-Select's standard multi-value classes: confirm live. |
| Disability Status and Gender after the fix | Pass (user-confirmed): both filled and verified; Gender holds exactly one answer, list closed. |
| Applicant Privacy Acknowledgement, SMS/WhatsApp consent | Pass: never proposed; the user answered both by hand. |
