# Textarea

A multi-line text field that grows with its content (`field-sizing-content`, min 64px).

**Source:** `apps/web/src/components/ui/textarea.tsx`.

## When to use

Descriptions and pasted CSV. For CSV, add `className="font-mono text-xs"` (the `code` text style) and show the expected header as the placeholder.

## What the consumer provides

`id` with a `Label`, `rows`, `value` and `onChange` from the view model and actions.
