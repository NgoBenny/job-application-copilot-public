# Live QA: Greenhouse, employer 1 (Greenhouse board 1, job-boards.greenhouse.io), 2026-10-12

Redacted notes. The user ran the extension; Claude in Chrome read the page, ran the extension's own click sequence on a blank copy of the form, and attached a read-only event recorder to the user's tab.

| Finding | Result |
|---|---|
| Scan | Pass: 13 fields; contact fields recognized, EEO questions protected, resume left manual. |
| The phone widget's hidden country search showed as "(no label)" | Fail → fixed: inputs inside `.iti__country-container` are skipped. |
| Country picker shows only a flag and "+1" | Fail → fixed: the country name is read from the phone widget's button title; dialling codes are ignored when matching; "United States" = "United States of America" = "USA". |
| First Fill of Country did nothing, a second Fill worked | Fail → fixed. The recorder showed the extension clicking "United States+1" in the phone widget's own hidden country list 13 ms after pressing the dropdown, before React-Select's list had appeared (the generic "any open list" fallback counted the hidden list). Greenhouse now only uses the dropdown's own list (`aria-controls`). |
| Switching the phone country to +358 and back left the number with a trunk 0 in front, and the scan still called it unchanged | Fail → fixed: a leading 0 no longer counts as a country-code prefix, so the scan after a Fill proposes the profile number again. |
| Dropdowns with the page unfocused/hidden (side-panel condition) | Pass: the full pointer sequence opens React-Select without focus events. |
| Country Fill after the own-list fix | Pass: confirmed live by the user on the first try. |
