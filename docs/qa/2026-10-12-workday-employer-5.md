# Live QA: Workday employer 5 Workday (2026-10-12)

Redacted notes. Claude in Chrome read the page and, with the user's go-ahead, typed one skill the user wanted.

| Finding | Result |
|---|---|
| Education "To (Actual or Expected)" year boxes went to Needs review | Fail → fixed: no known automation id, and the label rule only knew a bare "To". `To (…)` / `From (…)` now map to the entry's end/start date. |
| Skills box is free-entry: Enter adds the typed skill at once and lists its row already ticked | Fail → fixed: the extension clicked that row, which unticked it, and reported "Not added". A skill that arrives on Enter now counts as added, and a row whose skill is already chosen is never clicked. |
| Skills box accepts at most 25 skills | Confirmed by the user (removing one let another in). Fixed: two skills in a row with no answer and no new chip now mark the rest "Not added: the box stopped taking skills, so it may have a limit", and the panel stops sending batches. |
