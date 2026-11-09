# ADR 0002: Screens are controller, view model and view

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The web screens mixed data fetching, session logic, timers and markup in one
component (the study screen was 314 lines). That logic could only be tested
through a browser, and none of it could be reused by the planned mobile app.
The one piece that was easy to test was the pure study-session reducer.

## Decision

Every screen, on every platform, is split into five layers. No exceptions for
small screens: one shape everywhere is what makes the rules enforceable.

| Layer          | Lives in                                                         | Is                                                                                                                                                        | May import                                                                        |
| -------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Model**      | `@app/shared`, `@app/client` (`*/session.ts`)                    | Contracts, grading, client state machines. Pure.                                                                                                          | `@app/shared`                                                                     |
| **Controller** | `@app/client` (`<screen>/controller.ts`)                         | Owns the screen's state in a `Store` and every side effect: queries, mutations, navigation, time. Exposes intent methods (`submit()`, `setAnswer(text)`). | model, `@tanstack/query-core`, the ports. Never React, Next, React Native or DOM. |
| **View model** | `@app/client` (`<screen>/view-model.ts`)                         | A pure function from controller state to display data: text, flags, counts, routes.                                                                       | model                                                                             |
| **View**       | `apps/web/src/views/<screen>/*-view.tsx` (later `apps/mobile/…`) | Renders `{ vm, actions }`. Turns platform events into action calls. No state beyond focus and DOM refs, no decisions, no fetching.                        | UI primitives, `@/platform`, view-model types                                     |
| **Route**      | `apps/web/src/app/**`                                            | Reads URL params and renders the screen. Nothing else.                                                                                                    | `@/views`, `@/platform`, `next`, `react` (`Suspense`)                             |

Glue:

- **`@app/client`** (`packages/client`) holds controllers, view models, the
  typed API client and the ports. It has no React, Next or DOM dependency, so
  an Expo app reuses all of it.
- **`@app/client/react`** is the binding: `ClientProvider` supplies the
  dependencies, `useScreen(createController, viewModel, params)` creates the
  controller, starts it in an effect and subscribes with
  `useSyncExternalStore`. It works the same in React DOM and React Native.
- **`*-screen.tsx`** (web) is the only place a view meets its controller:
  `const { vm, actions } = useScreen(…); return <XView vm={vm} actions={actions} />`.
- **Ports** (`ClientDeps`): `api`, `queryClient`, `navigator` (takes a
  platform-neutral `Route`, not a URL), `clock`. Each platform provides them
  once (`apps/web/src/platform`).
- **Caching** stays with TanStack Query, through its framework-free core
  (`@tanstack/query-core`): controllers use `QueryObserver` and
  `queryClient.fetchQuery`. `@tanstack/react-query` is removed from the web
  app.
- **Mobile** will be React Native with Expo (`apps/mobile`), writing only views,
  screens and its own `platform/` adapters.

## Testing, per layer

| Layer      | Test                                                                         | Runs in       |
| ---------- | ---------------------------------------------------------------------------- | ------------- |
| Model      | Unit and property tests                                                      | Node (Vitest) |
| View model | Unit tests on hand-built states. No mocks needed.                            | Node          |
| Controller | Real API client against a fake API served by MSW (`@app/client/testing`)     | Node          |
| View       | Testing Library on hand-built view models, plus an axe scan                  | jsdom         |
| Screen     | Testing Library on the screen with the fake API: the mocked-integration tier | jsdom         |
| Route      | Playwright e2e on the real stack                                             | browser       |

The fake API keeps state and grades with the shared grader, and every
fixture is parsed by the contract schemas, so mocks can't drift from the API's
shapes without failing typecheck or the parse.

## Enforcement

- **Imports per layer** are Biome `noRestrictedImports` rules (`biome.json`
  overrides), so `pnpm lint` fails on a view that fetches or a controller that
  imports React.
- **Verification classes** in `scripts/verify/rules.ts`: `client-logic`
  (obligation `client-test`), `web-view` (obligation `web-view-test`, visual
  check), `web-route` (e2e only).

## Consequences

- More files per screen (controller, view model, view, screen, route, three
  test files). In exchange, all behaviour except layout is tested in Node in
  milliseconds, and the mobile app starts with every screen's logic done.
- Text the learner reads lives in view models, shared by both platforms.
  Styling stays in views.
- The e2e suite is unchanged by the migration, which is the proof that the
  refactor preserved behaviour.
