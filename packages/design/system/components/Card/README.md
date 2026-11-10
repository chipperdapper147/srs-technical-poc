# Card

A grouped surface: 14px radius (1.4× `radius`), a 10% `foreground` ring instead of a shadow, 16px padding.

**Source:** `apps/web/src/components/ui/card.tsx`. Parts: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.

## When to use

- One card per topic: a course in the list, a settings group, a study step, the session summary.
- `CardAction` for a badge or small control in the header's top-right ("3 due").
- `CardFooter` for the card's actions. It gets a `border` rule and a 50% `muted` fill.
- `size="sm"` for denser lists.

## What the consumer provides

Content as children. Titles come from the view model (`card-title` text style).

## Don't

Don't nest cards, and don't add shadows: separation is the ring and spacing.
