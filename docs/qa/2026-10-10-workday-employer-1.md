# Live QA notes: Workday employer 1 (wd1), 2026-10-10

Tenant: a wd1 Workday tenant, Apply Manually. Structure only; no personal values recorded.
Steps: My Information → My Experience → Application Questions 1/2 → 2/2 → Voluntary Disclosures → Review.

## My Information markup
- Progress bar: `progressBar` (ol) → `progressBarActiveStep` (li) with labels "current step 1 of 6" + "My Information". No `aria-current`. `document.title` empty at load.
- Text inputs are uncontrolled React: props `onInput` + `onBlur` only. Workday commits the value on blur.
- Dropdowns: `button[aria-haspopup=listbox]` with no `aria-controls` (`source--source`, `country--country`, `address--countryRegion`, `phoneNumber--phoneType`).
- Country Phone Code (`phoneNumber--countryPhoneCode`) is a multiselect; its chosen value is a pill inside an always-visible `[role=listbox][data-automation-id=selectedItemList]`.
- County: `address--regionSubdivision1` (text). Previously-employed: radio group.

## Findings
| Check | Result |
|---|---|
| 3 Scan changes nothing | Pass |
| 3 Step name | Fail → fixed: the active step renders "current step 2 of 6" before its name label; stripping left "" and nothing fell through. Now an empty result falls through to the page heading (`applyFlowPage` h2/h3, skipping `jobTitleHeading`; here the step name is an h3). |
| 9 My Experience entries | Fail → fixed: record groups are `div[role=group][aria-labelledby=Work-Experience-1-panel]` with the "Work Experience 1" h5 outside the group, so no `recordKey` and every field was "not matched". `recordKeyOf` now reads the aria-labelledby heading. Control ids look like `workExperience-7--jobTitle` / `education-8--schoolName` (numbers aren't ordinals). |
| Skills search | Fail → fixed: `skills--skills` (selectinput in `multiselectInputContainer`) searches only on Enter with legacy `keyCode` 13 (synthetic events had 0), then empties the box, so our "box still holds the query" guard never passed → "No clear answer". Verified live: keyCode 13 → `activeListContainer` with options. Option click → fixed too: the `role=option` row (`menuItem`) has no onClick; its child `promptLeafNode` does, and `.click()` on the row never reaches it. `clickOption` now clicks the leaf when present. Verified live: leaf click → checkbox ticked, "Git" chip in `multiselectInputContainer`. Escape without keyCode didn't close the list either; `pressKey` now sets it. |
| 6 Fill text fields | Fail → fixed: while the side panel has focus, `document.hasFocus()` is false and Chrome fires no focus/blur events (`activeElement` still moves), so Workday's `onBlur` never committed and required fields were flagged empty on Save. First fix (checking `activeElement`) didn't work live; `setNativeValue` now checks `hasFocus()` and dispatches blur/focusout itself. Verified live: synthetic focusout reaches Workday's `onBlur` with the value. |
| 6 Fill State dropdown | Fail → fixed: list fallback grabbed the Country Phone Code pill list (`selectedItemList`) before the real list rendered → "No matching choice". Pills are now excluded. |
| 8 Rescan after fill | Pass ("Nothing to change") |
| Remember (global + employer scope) | Pass |
| My Experience dates | Fail → fixed: each part is `div[aid=dateSectionMonth-display]` followed by `input[aid=dateSectionMonth-input][role=spinbutton]` inside `dateInputWrapper` (role=group). Our `[aid^=dateSectionMonth]` matched the display div first: writes threw ("could not be changed") and scans read "" (empty). Selectors now require `input`. Input props: onChange/onFocus/onKeyDown; value setter + input event updates the display (verified live: MM/YYYY → 01/2025). Workday stores the month as "1". Retested live via the extension: From/To filled. |
| 11 Add Another | Fail (predicted from recorded markup) → fixed, confirmed live (second entries added): section headings are h4 (`h4#Work-Experience-section` inside the section group); `addRecord` only looked for h2/h3, so "No Add button found". Not yet retested live. |
| 10 Degree dropdown | Fail → fixed: options are abbreviations only (B.A., B.S., M.A., M.S., MBA, JD, Ph.D.); "Masters of Science" matched nothing. `matchOption` now falls back to a degree code (spelled-out or abbreviated → e.g. `ms`), unique match only. Confirmed live: Education 1 M.S., Education 2 B.S. |
| Skills: stale results | Fail → fixed: "HTML" was reported as "only similar options" (offered "PSD to HTML CSS") although the results contain an exact "HTML". Measured live: the box empties at once but the previous skill's 23 rows stay up until the new rows arrive (~650ms), so the previous list was read as this skill's answer. Rows on screen before the search are now ignored. |
| Back-to-back dropdowns | Fail → fixed: Education 1's Degree was set correctly, then overwritten with Education 2's choice. A chosen list stays visible ~100ms (measured live) and buttons have no aria-controls, so the next dropdown's lookup took the closing list. Lists already open before a dropdown is clicked are now ignored. Degree rows themselves have onClick (plain click works). |
| Dates saved on Save and Continue | Fail → fixed (2026-10-11): dates showed 01/2025 but Save reported "From/To is required". `dateInputWrapper`'s onBlur saves only if `relatedTarget || document.activeElement` is outside the wrapper; in an unfocused window `focus()` silently leaves activeElement in the input. `setNativeValue` now calls `blur()` (silent, but moves activeElement to body) before the synthetic events. Verified live by wrapping onBlur: old → "focus still inside", new → "focus left, saves". |
| Dates: half-saved month | Fail → fixed (2026-10-11): after the blur fix, Save showed "Invalid Date: 05/". Blurring after the month alone made the wrapper save a partial date, which Workday mangled (measured live: month 05 + empty year → saved as year 2005, month empty). Month and year are now written with one blur after the year. Verified live: clear → write both → one blur → enteredDate 5/2025, no error. Retested via the extension: fresh fill saved and passed Save and Continue. |
| Sensitive dropdown (ethnicity) | By design → rule loosened (user decision 2026-10-11): every option ends in "(United States of America)", so a saved "Asian" had no exact match and was left manual. `exactChoice` now ignores a bracketed tag only when 2+ options share it; one-off brackets ("Yes (I will require sponsorship)") still never match. Verify accepts the tagged value. Not yet retested live. |
| Field of Study (search box) | Unsupported → built (2026-10-11): `education-N--fieldOfStudy` is a single-choice `selectinput` in `multiselectInputContainer`, like Skills. Measured live: typing alone shows nothing; Enter searches; several results → list; exactly one result → the site picks it by itself ("Computer Science" auto-picked "Computer and Information Science"); chips have a `DELETE_charm`. Workday employer 1 has no plain "Computer Science". New `pickOne`: same-name unique match only (never "Computer Science Education"), otherwise "Use '…'" suggestions; a non-matching auto-pick is removed and offered instead. Never safe. Confirmed live: "Use 'Computer and Information Science'" filled both entries. |
| Fill results | Not reproduced: "Last fill" results showed on later fills. Earlier, after the failed date fill, no result lines were visible. Possibly the post-fill snapshot's stepId differed and remounted FillReview (`key=fill:stepId:app`), wiping results. Watch on retest. |

## Coverage gaps (not bugs)
- County, Phone Device Type, Country Phone Code aren't mapped from the profile. Middle name possibly missing from the profile.

## Outcome (2026-10-11)
The user completed and submitted the application themselves (the extension never pressed Next/Save/Submit: check 12 pass).
Confirmed live after fixes: text fields, State, Degree, entries + Add Another, dates surviving Save and Continue, skills (incl. "HTML"), Field of Study via suggestion, Remember (global + employer).
Not confirmed live: step name on My Experience onward, sensitive dropdown with the shared-tag rule, Application Questions / Voluntary Disclosures details, confirmation-page recording, sign-in page checks (15), employer account panel.

## Regression fixtures (2026-10-11)
`tests/fixtures/workday/vista/` is a fabricated look-alike of this tenant; `live-like.js` keeps a separate *saved* value per field, committed the way the live site commits it, and `__wd.save()` returns what Save and Continue would report. `tests/e2e/workday-live-like.spec.ts` disables Playwright's focus emulation on the site, so it is unfocused behind the side panel as in real Chrome.
Mutation check (each live fix undone in turn, spec rerun): 12 of 13 caught. The pill-list exclusion is not separately catchable because the unified before/after list snapshot also ignores the unchanged pill list.
Code-review edge cases fixed with unit tests: one list-ownership mechanism (`snapshotLists` + `listFor`) for dropdowns, comboboxes and search boxes, which also handles a reused listbox element; h3 step-name fallback only while a progress bar is present; list rows exempt from forbidden-text clicks unless the button sits inside the row.

