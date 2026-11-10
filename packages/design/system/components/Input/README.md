# Input

A single-line text field: 32px tall, `input` border, `ring` focus.

**Source:** `apps/web/src/components/ui/input.tsx`.

## When to use

- Forms: course title, language codes, numbers (`type="number"`).
- Typing answers in study: add `className="h-11 text-lg"` (44px, `definition` text style) and turn off `autoComplete`, `autoCorrect`, `autoCapitalize` and `spellCheck`, and set `lang` to the target language.

## What the consumer provides

`id` matched by a `Label`, `value` from the view model, and `onChange` that calls an action. In study, `readOnly` while feedback shows (the view model's `locked`).

## Don't

Don't rely on `placeholder` as the label: give every input a `Label` or an `aria-label`.
