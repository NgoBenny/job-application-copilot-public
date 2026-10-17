# Live QA: Workday employer 9 Workday (wd12), 2026-10-15

Redacted notes. The user ran the extension; Claude in Chrome read the page structure only.

| Finding | Result |
|---|---|
| My Experience: 26 fields in "Needs review" as "label is ambiguous" | Fail -> fixed: entry headings read "Work History (Optional) 1" and "Education (Required) 1", which the entry pattern didn't know, so repeated labels collided. Entry headings now accept Work History / Employment and a bracketed note; Add Another is found under a Work History section too. |
| Skills box ("Type to Add Skills" in "Skills and Strengths (Optional)") | Pass: a normal skills field; it showed as unrecognized only on a scan made before reloading the extension. After reload and a new scan, the Skills section appears. |
| Workday employer 10: skills pop-up in a narrow window stopped runs after one skill | Fail -> fixed. Read live: the pop-up is role=dialog with its own search box, marks the page aria-hidden, and ignores Escape; typing into the hidden original box did nothing. The extension now types into the pop-up's search box and the scanner keeps seeing fields behind an open pop-up. The earlier Escape attempt was removed. |
