# Live QA: Greenhouse, employer 2 (Greenhouse board 2), 2026-10-12/13

Redacted notes. The user ran the extension; Claude in Chrome read the page.

| Finding | Result |
|---|---|
| Work authorization and sponsorship dropdowns not filled | By design: the choices are full sentences; the saved answers were "Yes"/"No". Fixed by the user adding the employer's exact wording as extra lines in Sensitive answers; both then filled. The extension left no search text behind. |
| Remember on "Undergrad Discipline(s)" (checkbox group, ~80 choices) did nothing | Fail → fixed: a saved answer stores its choices to detect changed lists, capped at 50; raised to 300. Confirmed live: Remember now shows Saved. |
| Education block (School typed search, Degree, Discipline, start/end month and year), other fields, protected questions | Pass (user-confirmed): education and the rest filled and verified; Terms & Conditions, pronouns and EEO questions stayed under "You answer these". |
