# Button

A clickable action, from Base UI's Button styled by shadcn `base-nova`: one strong `primary` fill and quieter variants.

**Source:** `apps/web/src/components/ui/button.tsx`.

## When to use

- `default` (`primary` fill) for the one main action on a screen or card: **Check**, **Create course**, **Import**, **Continue**.
- `outline` for secondary navigation next to a primary action: **New course**, **Review (n due)**.
- `ghost` and `link` for low-emphasis actions in dense places.
- `destructive` for actions that remove data. It renders as a 10% `destructive` tint with `destructive` text, never a solid red fill.
- A link that looks like a button is a `RouteLink` (web) with `buttonVariants(...)` classes, not a Button: navigation stays an `<a>`.

## What the consumer provides

- `children`: the label, in sentence case, naming the action ("Create course", not "Submit").
- `variant`: `default | outline | secondary | ghost | destructive | link` (default `default`).
- `size`: `default` (32px) `| xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`.
- `disabled` while an action can't run. The view model computes it (e.g. `canCheck`), never the view.
- `type="submit"` inside forms: Enter submits the form and the controller decides what that means.

## Do / don't

- Do keep one `default` Button per region.
- Don't put icons-only buttons without an `aria-label`.
- Don't restyle colours with utility classes; pick a variant.
