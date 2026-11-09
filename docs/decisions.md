# Decisions

Stack and design decisions for the prototype, newest last. Annotate rather
than delete when a decision is reversed.

## 2026-11-09: Initial stack

| Area                         | Decision                                                               | Notes                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo                         | pnpm workspaces + Turborepo                                            | `apps/api`, `apps/web`, `packages/shared`                                                                                                                       |
| Node                         | **24 LTS**                                                             | Node 26 became LTS in Oct 2026 but is weeks old; 24 is one LTS behind and supported to Apr 2028. 22 (EOL Apr 2027) ruled out. Bump via `.nvmrc`, `engines`, CI. |
| Postgres                     | **18**                                                                 | Released Sep 2025 and patched (18.x); gives built-in `uuidv7()` for primary keys.                                                                               |
| TypeScript                   | **6.0**, not 7.0                                                       | 7.0 is the Go-native compiler; Next.js type-checks through the classic JS API. Revisit once Next supports TS 7.                                                 |
| Schema                       | Atlas, versioned migrations generated from declarative `db/schema.sql` | `atlas migrate lint` now requires an Atlas login (Pro), so CI uses `scripts/db-check.sh`: `migrate validate` plus a no-op `migrate diff` drift check.           |
| DB access                    | Kysely + `kysely-codegen`                                              | Atlas owns the schema; types are generated from the migrated DB and CI fails if they drift. Ruled out Prisma/Drizzle (second schema source of truth).           |
| API                          | Fastify 5 + Zod (`fastify-type-provider-zod`)                          | Contracts in `@app/shared`, OpenAPI generated from them at `/docs`. TypeBox ruled out: less ergonomic on the frontend.                                          |
| Web                          | Next.js 16 App Router, Tailwind 4, shadcn/ui, TanStack Query           | shadcn's current default style (`base-nova`) is built on Base UI rather than Radix.                                                                             |
| Lint/format                  | Biome                                                                  | Next 16 removed `next lint`; one fast tool for the whole repo.                                                                                                  |
| Tests                        | Vitest                                                                 | API tests run against a real Postgres (`srs_test`) via `app.inject`.                                                                                            |
| No build step for API/shared | Node 24 type stripping runs `.ts` directly                             | Requires `erasableSyntaxOnly` (no enums, namespaces or parameter properties) and `.ts` import extensions.                                                       |
| Auth                         | Dev stub now, **Auth0 next**                                           | Every request resolves `request.user` from `users.auth_sub`; dev mode uses `dev                                                                                 | local`or the`x-dev-user`header. Auth0's free plan should be enough for a prototype; swapping in JWT verification only touches`apps/api/src/plugins/auth.ts` and the web client. |

## 2026-11-09: First tool: typed-recall vocabulary trainer

- **Content model:** course (source/target BCP 47 language tags) → units → items
  (`term` typed by the learner, `definition` prompt, `alternatives`, `notes`).
  Courses without an owner are shared and read-only; users create their own and
  import CSV.
- **Scheduler:** FSRS via `ts-fsrs` v6 with library defaults (FSRS-7 model,
  fuzz on). The `cards` table mirrors the v6 card fields; each review stores the
  raw ts-fsrs revlog as `jsonb` so parameters can be re-fitted per learner later.
- **Grading** (`packages/shared/src/grading.ts`), configurable per user with
  per-course overrides:
  - _lenient_ (default): normalized comparison (case, punctuation and whitespace
    ignored), with a small edit-distance allowance (0 for ≤3 chars, 1 for ≤7, 2
    beyond) graded as **typo**.
  - _strict_: normalized exact match only.
  - _accent-sensitive_ toggle (default off).
  - Ratings: exact → Good, typo → Hard, wrong → Again. Easy is unused for now.
- **Session flow:** learn mode presents each new word (typed once to copy, not
  graded), then quizzes them; review mode quizzes due cards. Wrong answers are
  re-queued up to 2 times per session. The API grades every answer; the
  client's copy of the grader only checks the ungraded copy step.

### Open questions

- A correct first answer at the end of a learn session schedules the next
  review about **5 days** out (FSRS-7 defaults skip learning steps). Memrise-style
  apps review new words within hours. Options: `allowModelOverride: false` with
  explicit learning steps, or make the learn-session quiz not count as an FSRS
  review.
- Map fast exact answers to **Easy**? It would need per-learner timing baselines.
- Prompt direction is fixed (definition → type term); add reverse or
  listening modes later.
- Atlas CI installs the latest Atlas release; pin `ATLAS_VERSION` if it causes churn.
