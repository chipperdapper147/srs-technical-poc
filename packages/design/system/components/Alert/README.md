# Alert

A bordered message block with a title and description, for errors and confirmations.

**Source:** `apps/web/src/components/ui/alert.tsx`. Parts: `Alert`, `AlertTitle`, `AlertDescription`, `AlertAction`.

## When to use

- `destructive` for errors from the API: the title says something went wrong, and the description is the API's message. On web this is `ErrorMessage` in `views/shared/query-state.tsx`.
- `default` for neutral notices.
- Import and validation errors on forms use `Alert` with a description only.

## What the consumer provides

`variant` (`default | destructive`), an `AlertTitle` (optional), an `AlertDescription`. Error text comes from the view model, never from the view.

## Do / don't

- Do say what went wrong and how to fix it, in the user's terms.
- Don't apologise or show stack traces.
