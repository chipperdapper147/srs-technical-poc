# @app/design

The SRS design system. `tokens.json` is the one source of every colour,
size and text style, for web and mobile.

| File                                | What                                                                                                           | Edit? |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----- |
| `tokens.json`                       | Tokens, in the Design System artifact's format (lists per family, colours per theme, `{alias}` references)     | yes   |
| `system/`                           | The design-system docs: `README.md` (usage rules), `components/<Name>/README.md` and `preview.html`, the cover | yes   |
| `src/generate.ts`                   | tokens.json → web CSS, native TS, artifact CSS (pure, tested)                                                  | yes   |
| `src/tokens.ts`                     | **Generated** for React Native / Expo: hex colours, numbers in dp                                              | no    |
| `../../apps/web/src/app/tokens.css` | **Generated** CSS variables, imported by `globals.css`                                                         | no    |
| `.system/`                          | **Generated**, git-ignored: the artifact's files, ready to publish                                             | no    |

## Changing a token

1. Edit `tokens.json` (keep a `usage` note on every token).
2. `pnpm design:build`. Regenerates `src/tokens.ts` and `apps/web/src/app/tokens.css`. Commit them with the change.
3. `pnpm verify`. The `design-drift` check fails if a generated file is stale.

A new colour that Tailwind should know (`bg-<name>`) also needs a `--color-<name>: var(--<name>)` line in the `@theme inline` block of `apps/web/src/app/globals.css`.

## Publishing the design-system artifact

`pnpm design:system` builds `.system/project/`: tokens, docs, and the ten
components in `apps/web/src/components` as one live bundle (`window.SRS`,
built from ESM with React provided by the page). Publish that folder to
https://claude.ai/artifact/Uo2eiqKFqx6actt2Fxaj3w with Claude (the Artifact tool), updating the artifact's
`project/design-system.json` index and its `lastChange`.
