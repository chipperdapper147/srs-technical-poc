# Badge

A small pill label for counts and states (2.6× radius, `badge` text style).

**Source:** `apps/web/src/components/ui/badge.tsx`.

## When to use

- `default`: counts that need attention, such as "3 due" on a course card.
- `secondary`: neutral tags, such as "New word" on a present step.
- `outline`, `ghost`, `link`: rare; quiet labels.
- `destructive`: an error state, as a 10% tint with `destructive` text.

## What the consumer provides

`children` (short text, no trailing punctuation) and `variant`. It renders a `<span>`; pass `render` (Base UI) to render another element.

## Don't

Don't use a Badge as a button, and don't put more than three words in one.
