# Progress

A thin (4px) bar for how far something has got: a session, a course, a unit.

**Source:** `apps/web/src/components/ui/progress.tsx` on Base UI Progress. Track `muted`, indicator `primary`, fully rounded.

## What the consumer provides

- `value` from 0 to 100, computed by the view model (`percent(part, whole)`).
- `aria-label`, **required**: the view model supplies it (`progressLabel`, or `progress.label` such as "Basics progress"). A progress bar without a name fails axe.
- Optional `ProgressLabel` and `ProgressValue` children for a visible label and number.

## Do / don't

- Do pair it with a caption that states the numbers ("1 / 4 words learned"); the bar alone is decoration.
- Don't animate it for loading; it shows real progress only.
