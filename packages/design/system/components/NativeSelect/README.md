# NativeSelect

A native `<select>` styled like `Input` (32px, `input` border, `ring` focus). The app's only select.

**Source:** `apps/web/src/components/native-select.tsx` (hand-written, not shadcn-generated).

## When to use

A choice among two to five options: answer grading, accents. The view model provides a `SelectVM` (`id`, `label`, `value`, `options`); on web, `views/shared/select-field.tsx` renders it with a `Label`.

## Why native

The OS picker on mobile, and full keyboard support, with no extra code.
