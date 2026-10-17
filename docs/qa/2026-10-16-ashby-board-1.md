# Live QA: Ashby, board 1 (jobs.ashbyhq.com), 2026-10-16

Redacted notes. The user ran the extension; Claude in Chrome read the page structure only.

| Finding | Result |
|---|---|
| Overview tab | Correctly "not recognized": only the Application tab holds the form. |
| Name (full name), Email, Phone Number, LinkedIn, Current Location, work-authorization Yes/No | Pass: filled and verified. |
| EEO questions (Gender, Race, Veteran Status) missing from the scan | Fail -> fixed: the equal-opportunity survey is a separate container whose question blocks have `data-field-path` but not the field-entry class. The scanner now reads every `[data-field-path]` block with a question title. Fixture changed to the live structure first (3 tests red), then fixed. |
| Sponsorship question is a free-text box | By design manual: sensitive answers fill only choice questions. |
