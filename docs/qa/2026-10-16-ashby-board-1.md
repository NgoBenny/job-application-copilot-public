# Live QA: Ashby, board 1 (jobs.ashbyhq.com), 2026-10-16

Redacted notes. The user ran the extension; Claude in Chrome read the page structure only.

| Finding | Result |
|---|---|
| Overview tab | Correctly "not recognized": only the Application tab holds the form. |
| Name (full name), Email, Phone Number, LinkedIn, Current Location, work-authorization Yes/No | Pass: filled and verified. |
| EEO questions (Gender, Race, Veteran Status) missing from the scan | Fail -> fixed: the equal-opportunity survey is a separate container whose question blocks have `data-field-path` but not the field-entry class. The scanner now reads every `[data-field-path]` block with a question title. Fixture changed to the live structure first (3 tests red), then fixed. |
| Sponsorship question is a free-text box | By design manual: sensitive answers fill only choice questions. |
| Submit said "Missing entry for required field: Email" although the box showed the email | Fail -> fixed. Reproduced on a blank copy: Ashby saves each answer into one form-wide store from a snapshot taken at its last redraw, so answers written back to back can overwrite each other there while every box still shows its value. The extension now pauses 400 ms after each Ashby write (100 ms was enough live). Fixture copies the race first (test red), then fixed. The extension cannot read that store, so "verified" means the page shows the value. |
