# Live QA notes: employer 3 (Workday employer 3), 2026-10-11

Autofill with Resume, My Information step. Structure and results only; no personal values recorded.

| Check | Result |
|---|---|
| 5 Parser-filled fields | Pass: values the parser got right (names, country, city, state) were not proposed; a wrong parser value in Address Line 1 was proposed as "needs your OK" and left out of Approve all safe; only an empty field (Postal Code) was "safe". |
| Phone formatting | Fail → fixed: the parser's "+1 (…) …-…" phone was proposed as a change to the same digits. Phones now compare by digits, allowing a country-code prefix only before a full 10+ digit number. Not yet retested live. |
| Confirmation after Submit | Fail → fixed: after Submit, Workday went to Candidate Home (`…/External/userHome`) and showed an "Application Submitted" dialog there. Candidate Home had no recognized Workday marker, so the status check judged the tab "not on the portal" and dropped the activation ("Not active on this tab"). Measured live: Candidate Home carries `CandidateHomePage` / `candidate-home-app`, has 0 input fields, and resolves to the same portal key as the apply pages. `CandidateHomePage` is now a recognized marker, so the dialog's wording makes the scan a confirmation page. Not yet retested live. |
| Candidate Home after closing the dialog | Expected: with the "Application Submitted" dialog closed, Candidate Home is not a confirmation (its "successfully submitted" text stays for every past application, so it can't safely name this one). Fixed alongside: the header Settings menu (`settingsSelectorButton`) was listed as a question and offered for Remember; site header/menus/footer are now skipped. Added a manual "Mark as submitted" / "Clear" on each application in the dashboard for when the dialog was closed before scanning. |
