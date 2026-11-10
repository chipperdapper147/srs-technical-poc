# Switch

An on/off toggle that saves immediately (Base UI Switch): `primary` track when on, `input` when off.

**Source:** `apps/web/src/components/ui/switch.tsx`. Sizes `default` and `sm`.

## When to use

A boolean setting that applies right away, such as "Require accents". Put the `Label` and a one-line `caption` hint to the left, and the switch on the right (`justify-between`).

## What the consumer provides

`id` with a `Label` (or an `aria-label`), `checked` from the view model, and `onCheckedChange` calling an action.

## Don't

Don't use a switch for choices that need a Save button; use a checkbox in a form instead.
