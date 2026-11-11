/**
 * The verification rules, as data. This file is the source of truth for
 * "what is sufficient verification for this change"; the tables in
 * docs/verification.md are generated from it (`pnpm verify docs`).
 *
 * How a change is judged:
 *  1. Every changed path is put in exactly one change class: the first class
 *     whose `paths` match. A path no class matches is `unclassified`, which
 *     requires the full run (fail safe).
 *  2. The required checks are the union of the classes' checks. Each check is
 *     a command that passes or fails.
 *  3. Each class can carry obligations: "this kind of change must come with a
 *     change to that kind of test". An obligation is met when some changed path
 *     matches it, or waived with a `Verify-Waive: <id>: <reason>` commit trailer.
 *  4. Each class can require manual evidence: things only a person or agent
 *     can judge (screenshots, reviewing a diff). The report lists them.
 */

export type CheckId =
  | "lint"
  | "typecheck"
  | "test:scripts"
  | "rules-drift"
  | "shell-syntax"
  | "db:check"
  | "migration-lint"
  | "migration-rehearsal"
  | "codegen-drift"
  | "openapi-drift"
  | "test:shared"
  | "test:design"
  | "design-drift"
  | "design-system"
  | "test:client"
  | "test:web"
  | "test:api"
  | "db:seed"
  | "build:web"
  | "e2e";

export type Need = "postgres" | "atlas" | "docker";

export interface Check {
  id: CheckId;
  title: string;
  /** Shell command, run from the repo root. `e2e` gets spec files appended. */
  command: string;
  needs?: Need[];
  /**
   * Generated files this check rewrites. The check fails if any of them
   * differs afterwards: the committed copy was stale.
   */
  drift?: string[];
}

/** In run order. */
export const CHECKS: Check[] = [
  { id: "lint", title: "Biome lint and format", command: "pnpm lint" },
  { id: "typecheck", title: "TypeScript, all packages", command: "pnpm typecheck" },
  { id: "test:scripts", title: "Repo script tests", command: "pnpm test:scripts" },
  {
    id: "rules-drift",
    title: "Rule tables in docs/verification.md match rules.ts",
    command: "pnpm verify docs",
    drift: ["docs/verification.md"],
  },
  {
    id: "shell-syntax",
    title: "Shell scripts and git hooks parse",
    command: 'for f in scripts/*.sh .githooks/*; do bash -n "$f" || exit 1; done',
  },
  {
    id: "db:check",
    title: "Migrations valid and in sync with db/schema.sql",
    command: "pnpm db:check",
    needs: ["atlas", "docker"],
  },
  {
    id: "migration-lint",
    title:
      "New migrations: Squawk (stand-in for atlas migrate lint) and the expand/contract policy",
    command: "pnpm db:lint",
  },
  {
    id: "codegen-drift",
    title: "Kysely types match the migrated schema",
    command: "pnpm db:migrate && pnpm db:codegen",
    needs: ["postgres", "atlas"],
    drift: ["apps/api/src/db/types.ts"],
  },
  {
    id: "migration-rehearsal",
    title: "New migrations applied to production-shaped data: timed, invariants hold",
    command: "pnpm db:rehearse",
    needs: ["postgres", "atlas"],
  },
  {
    id: "openapi-drift",
    title: "OpenAPI snapshot matches the routes",
    command: "pnpm api:openapi",
    drift: ["apps/api/openapi.json"],
  },
  {
    id: "design-drift",
    title: "Generated token files match packages/design/tokens.json",
    command: "pnpm design:build",
    drift: ["packages/design/src/tokens.ts", "apps/web/src/app/tokens.css"],
  },
  { id: "test:shared", title: "Shared unit tests", command: "pnpm --filter @app/shared test" },
  {
    id: "test:design",
    title: "Design token generator tests",
    command: "pnpm --filter @app/design test",
  },
  {
    id: "test:client",
    title: "Client tests: controllers and view models against the MSW fake API",
    command: "pnpm --filter @app/client test",
  },
  {
    id: "test:web",
    title: "Web tests: views and screens in jsdom (Testing Library, MSW, axe)",
    command: "pnpm --filter @app/web test",
  },
  {
    id: "test:api",
    title: "API integration tests (app.inject + Postgres)",
    command: "pnpm --filter @app/api test",
    needs: ["postgres", "atlas"],
  },
  { id: "db:seed", title: "Seed runs cleanly", command: "pnpm db:seed", needs: ["postgres"] },
  { id: "build:web", title: "Next.js production build", command: "pnpm --filter @app/web build" },
  {
    id: "design-system",
    title: "Design-system artifact builds, and every preview renders in both themes",
    command: "pnpm design:system && pnpm --filter @app/design system:check",
  },
  { id: "e2e", title: "Playwright e2e", command: "pnpm e2e", needs: ["postgres"] },
];

export type ObligationId =
  | "api-test"
  | "shared-test"
  | "client-test"
  | "web-unit-test"
  | "web-view-test"
  | "e2e-spec";

export interface Obligation {
  id: ObligationId;
  title: string;
  /** Met when any changed path matches one of these. */
  metBy: string[];
}

export const OBLIGATIONS: Obligation[] = [
  {
    id: "api-test",
    title: "An API integration test is added or changed",
    metBy: ["apps/api/test/**"],
  },
  {
    id: "shared-test",
    title: "A shared unit test is added or changed",
    metBy: ["packages/shared/src/**/*.test.ts"],
  },
  {
    id: "client-test",
    title: "A controller or view-model test is added or changed",
    metBy: ["packages/client/src/**/*.test.ts"],
  },
  {
    id: "web-view-test",
    title: "A view or screen test (jsdom) is added or changed",
    metBy: ["apps/web/src/**/*.test.tsx"],
  },
  {
    id: "web-unit-test",
    title: "A web unit test is added or changed",
    metBy: ["apps/web/src/**/*.test.ts"],
  },
  {
    id: "e2e-spec",
    title: "An e2e spec or page object is added or changed",
    metBy: ["apps/e2e/tests/**", "apps/e2e/pages/**"],
  },
];

export type EvidenceId =
  | "contract-readiness"
  | "visual-check"
  | "openapi-review"
  | "lockfile-review"
  | "ci-run"
  | "design-publish";

export interface Evidence {
  id: EvidenceId;
  title: string;
  how: string;
}

export const EVIDENCE: Evidence[] = [
  {
    id: "visual-check",
    title: "Agent visual check of the changed screens",
    how: "Screenshots of each changed screen (desktop and mobile) and of any new state, console errors collected. See 'The agent visual check'.",
  },
  {
    id: "openapi-review",
    title: "Review the OpenAPI snapshot diff",
    how: "Read the apps/api/openapi.json diff. A removed path, a removed or newly required request field, or a removed or narrowed response field is breaking; say so in the PR.",
  },
  {
    id: "lockfile-review",
    title: "Review the lockfile diff",
    how: "New packages, major version bumps, packages with install scripts. Versions in package.json stay exact.",
  },
  {
    id: "contract-readiness",
    title: "Nothing in the compatibility window still uses what the contract removes",
    how: "For each consumer of the database, list the versions in production, the rollback candidate and the deployment candidate (ADR 0003), and show that none of them reads or writes what this contract migration removes or tightens. Until deployed versions are recorded, search the code at the base branch.",
  },
  {
    id: "design-publish",
    title: "Republish the design-system artifact",
    how: "After merge, run `pnpm design:system` and publish packages/design/.system/project to the artifact (see packages/design/README.md), so the published system matches main.",
  },
  {
    id: "ci-run",
    title: "Green CI run of the change",
    how: "Tooling changes affect CI itself; push and link the run.",
  },
];

/** `e2e: "mapped"` picks specs from E2E_MAP; `"all"` runs the whole suite. */
export type E2eScope = "none" | "mapped" | "all" | "self";

export type Side = "repo" | "backend" | "shared" | "client" | "frontend" | "tests";

export interface ChangeClass {
  id: string;
  side: Side;
  title: string;
  paths: string[];
  checks: CheckId[] | "full";
  e2e: E2eScope;
  obligations?: ObligationId[];
  evidence?: EvidenceId[];
}

const ALL = "full" as const;

/** Ordered: the first class whose paths match a file owns it. */
export const CLASSES: ChangeClass[] = [
  // Design system: tokens.json is the one source of tokens (packages/design)
  {
    id: "design-tokens",
    side: "repo",
    title: "Design tokens and their generated files",
    paths: [
      "packages/design/tokens.json",
      "packages/design/src/**",
      "packages/design/scripts/**",
      "packages/design/vitest.config.ts",
      "packages/design/tsconfig.json",
      "apps/web/src/app/tokens.css",
    ],
    checks: [
      "lint",
      "typecheck",
      "test:design",
      "design-drift",
      "test:web",
      "build:web",
      "design-system",
    ],
    e2e: "all",
    evidence: ["visual-check", "design-publish"],
  },
  {
    id: "design-docs",
    side: "repo",
    title: "Design-system docs, previews and cover",
    paths: ["packages/design/system/**", "packages/design/README.md"],
    checks: ["lint", "design-system"],
    e2e: "none",
    evidence: ["design-publish"],
  },

  // Repo-wide
  {
    id: "docs",
    side: "repo",
    title: "Documentation",
    paths: ["**/*.md", "docs/**", "LICENSE"],
    checks: ["lint", "rules-drift"],
    e2e: "none",
  },
  {
    id: "verify-tooling",
    side: "repo",
    title: "Verification rules and runner",
    paths: ["scripts/verify/**"],
    checks: ["lint", "typecheck", "test:scripts", "rules-drift"],
    e2e: "none",
  },
  {
    id: "dependencies",
    side: "repo",
    title: "Dependencies and runtime versions",
    paths: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "**/package.json", ".nvmrc"],
    checks: ALL,
    e2e: "all",
    evidence: ["lockfile-review"],
  },
  {
    id: "tooling",
    side: "repo",
    title: "CI, scripts, hooks and repo config",
    paths: [
      ".github/**",
      "scripts/**",
      ".githooks/**",
      ".claude/**",
      "turbo.json",
      "biome.json",
      ".squawk.toml",
      "tsconfig.base.json",
      "atlas.hcl",
      "docker-compose.yml",
      "docker/**",
      ".env.example",
      ".gitignore",
    ],
    checks: ALL,
    e2e: "all",
    evidence: ["ci-run"],
  },

  // Backend
  {
    id: "schema-contract",
    side: "backend",
    title: "Contract migration (removes or tightens; ADR 0003)",
    paths: ["db/migrations/*_contract_*.sql"],
    checks: [
      "lint",
      "typecheck",
      "db:check",
      "migration-lint",
      "codegen-drift",
      "migration-rehearsal",
      "test:api",
      "db:seed",
    ],
    e2e: "all",
    evidence: ["contract-readiness"],
  },
  {
    id: "schema",
    side: "backend",
    title: "Database schema and migrations",
    paths: ["db/schema.sql", "db/migrations/**", "apps/api/src/db/types.ts"],
    checks: [
      "lint",
      "typecheck",
      "db:check",
      "migration-lint",
      "codegen-drift",
      "migration-rehearsal",
      "test:api",
      "db:seed",
    ],
    e2e: "all",
    obligations: ["api-test"],
  },
  {
    id: "schema-rehearsal",
    side: "backend",
    title: "Migration rehearsal data and invariants",
    paths: ["db/rehearsal/**"],
    checks: ["lint", "migration-rehearsal"],
    e2e: "none",
  },
  {
    id: "seed",
    side: "backend",
    title: "Seed data",
    paths: ["db/seed/**", "apps/api/src/db/seed.ts"],
    checks: ["lint", "typecheck", "db:seed"],
    e2e: "mapped",
  },
  {
    id: "api-spec",
    side: "backend",
    title: "OpenAPI snapshot",
    paths: ["apps/api/openapi.json", "apps/api/src/openapi.ts"],
    checks: ["openapi-drift"],
    e2e: "none",
    evidence: ["openapi-review"],
  },
  {
    id: "api-tests",
    side: "backend",
    title: "API tests only",
    paths: ["apps/api/test/**"],
    checks: ["lint", "typecheck", "test:api"],
    e2e: "none",
  },
  {
    id: "api-route",
    side: "backend",
    title: "API routes, plugins and app wiring",
    paths: ["apps/api/src/routes/**", "apps/api/src/plugins/**", "apps/api/src/app.ts"],
    checks: ["lint", "typecheck", "openapi-drift", "test:api"],
    e2e: "mapped",
    obligations: ["api-test"],
  },
  {
    id: "api-domain",
    side: "backend",
    title: "API domain logic (scheduling, import, config)",
    paths: ["apps/api/**"],
    checks: ["lint", "typecheck", "openapi-drift", "test:api"],
    e2e: "mapped",
    obligations: ["api-test"],
  },

  // Shared
  {
    id: "contract",
    side: "shared",
    title: "API contracts (Zod)",
    paths: ["packages/shared/src/contracts.ts"],
    checks: [
      "lint",
      "typecheck",
      "openapi-drift",
      "test:shared",
      "test:client",
      "test:web",
      "test:api",
    ],
    e2e: "all",
    obligations: ["api-test"],
  },
  {
    id: "shared-tests",
    side: "shared",
    title: "Shared tests only",
    paths: ["packages/shared/src/**/*.test.ts"],
    checks: ["lint", "typecheck", "test:shared"],
    e2e: "none",
  },
  {
    id: "shared-logic",
    side: "shared",
    title: "Shared logic (grading)",
    paths: ["packages/shared/**"],
    checks: ["lint", "typecheck", "test:shared", "test:client", "test:web", "test:api"],
    e2e: "mapped",
    obligations: ["shared-test"],
  },

  // Client: controllers, view models, API client, binding (ADR 0002)
  {
    id: "client-tests",
    side: "client",
    title: "Client tests only",
    paths: ["packages/client/src/**/*.test.ts"],
    checks: ["lint", "typecheck", "test:client"],
    e2e: "none",
  },
  {
    id: "client-testing",
    side: "client",
    title: "Client testing kit (fake API, fixtures)",
    paths: ["packages/client/src/testing/**"],
    checks: ["lint", "typecheck", "test:client", "test:web"],
    e2e: "none",
  },
  {
    id: "client-binding",
    side: "client",
    title: "React binding (ClientProvider, useScreen)",
    paths: ["packages/client/src/react/**"],
    checks: ["lint", "typecheck", "test:web", "build:web"],
    e2e: "all",
  },
  {
    id: "client-logic",
    side: "client",
    title: "Controllers, view models, API client",
    paths: ["packages/client/**"],
    checks: ["lint", "typecheck", "test:client", "test:web", "build:web"],
    e2e: "mapped",
    obligations: ["client-test"],
  },

  // Frontend (web)
  {
    id: "web-tests",
    side: "frontend",
    title: "Web tests only",
    paths: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/src/test/**"],
    checks: ["lint", "typecheck", "test:web"],
    e2e: "none",
  },
  {
    id: "web-primitive",
    side: "frontend",
    title: "UI primitives and global styles",
    paths: ["apps/web/src/components/ui/**", "apps/web/src/app/globals.css"],
    checks: ["lint", "typecheck", "build:web"],
    e2e: "all",
    evidence: ["visual-check"],
  },
  {
    id: "web-platform",
    side: "frontend",
    title: "Web platform adapters (providers, routes, links)",
    paths: ["apps/web/src/platform/**"],
    checks: ["lint", "typecheck", "test:web", "build:web"],
    e2e: "all",
  },
  {
    id: "web-route",
    side: "frontend",
    title: "Routes (app/: params in, screen out)",
    paths: ["apps/web/src/app/**"],
    checks: ["lint", "typecheck", "build:web"],
    e2e: "mapped",
    obligations: ["e2e-spec"],
  },
  {
    id: "web-view",
    side: "frontend",
    title: "Views, screens and components",
    paths: ["apps/web/src/views/**", "apps/web/src/components/**"],
    checks: ["lint", "typecheck", "test:web", "build:web"],
    e2e: "mapped",
    obligations: ["web-view-test"],
    evidence: ["visual-check"],
  },
  {
    id: "web-logic",
    side: "frontend",
    title: "Web helpers (lib/)",
    paths: ["apps/web/src/lib/**"],
    checks: ["lint", "typecheck", "test:web", "build:web"],
    e2e: "mapped",
    obligations: ["web-unit-test"],
  },
  {
    id: "web-config",
    side: "frontend",
    title: "Web app config",
    paths: ["apps/web/**"],
    checks: ["lint", "typecheck", "test:web", "build:web"],
    e2e: "all",
    evidence: ["visual-check"],
  },

  // Tests
  {
    id: "e2e-specs",
    side: "tests",
    title: "E2E specs",
    paths: ["apps/e2e/tests/**"],
    checks: ["lint", "typecheck"],
    e2e: "self",
  },
  {
    id: "e2e-support",
    side: "tests",
    title: "E2E page objects, fixtures and config",
    paths: ["apps/e2e/**"],
    checks: ["lint", "typecheck"],
    e2e: "all",
  },
];

export const UNCLASSIFIED: ChangeClass = {
  id: "unclassified",
  side: "repo",
  title: "Matches no class (fail safe: full run)",
  paths: [],
  checks: ALL,
  e2e: "all",
};

/**
 * Which e2e specs guard which source files, for classes with `e2e: "mapped"`.
 * Globs use `path.matchesGlob`; write a literal `[` or `]` as `[[]` / `[]]`.
 * First match wins; a file with no entry runs the whole suite.
 */
export const E2E_MAP: { paths: string[]; specs: string[] }[] = [
  {
    paths: [
      "apps/api/src/routes/study.ts",
      "apps/api/src/srs.ts",
      "packages/shared/src/grading.ts",
      "packages/client/src/study/**",
      "apps/web/src/views/study/**",
      "apps/web/src/app/courses/[[]id[]]/study/**",
    ],
    specs: ["study", "grading"],
  },
  {
    paths: [
      "apps/api/src/routes/courses.ts",
      "apps/api/src/import.ts",
      "packages/client/src/course/**",
      "packages/client/src/new-course/**",
      "apps/web/src/views/course/**",
      "apps/web/src/views/new-course/**",
      "apps/web/src/app/courses/new/**",
      "apps/web/src/app/courses/[[]id[]]/page.tsx",
    ],
    specs: ["course-authoring", "courses", "grading"],
  },
  {
    paths: [
      "apps/api/src/routes/me.ts",
      "packages/client/src/settings/**",
      "apps/web/src/views/settings/**",
      "apps/web/src/app/settings/**",
    ],
    specs: ["grading", "courses"],
  },
  {
    paths: [
      "db/seed/**",
      "apps/api/src/db/seed.ts",
      "packages/client/src/courses/**",
      "packages/client/src/shell/**",
      "apps/web/src/views/courses/**",
      "apps/web/src/views/app-shell/**",
      "apps/web/src/app/page.tsx",
    ],
    specs: ["courses"],
  },
];
