# ADR 0003: Verify as if every package were its own repository

- **Status:** Accepted for the principles below; the open details are tracked in `TODO.md` (section 4, "Across repositories")
- **Date:** 2026-11-10

## Context

This repository is a monorepo, but the setup it rehearses for is not: day to
day, the database, the API, the shared contracts and the clients live in
separate repositories, are released separately, and are deployed at different
times. A database usually has more than one consumer, and no single consumer
owns it.

The checks so far all run every part **at the same commit**: the API's
generated types and its tests meet the schema of the same commit, and the web
client meets the API of the same commit. That proves the parts agree with each
other, but not that a change is safe while older versions are still running. A
schema change can pass every check here and still break the API version in
production. In a multi-repo setup, a check that relies on seeing every
consumer's code at one commit doesn't exist at all.

## Decision

1. **Mechanisms are designed for separate repositories.** Each unit is treated
   as if it were its own repository: the schema (`db/`), the API (`apps/api`),
   the shared contracts (`packages/shared`), the client core (`packages/client`),
   the design system (`packages/design`), the web app and the coming mobile app.
   A verification mechanism may not depend on reading another unit's source at
   the same commit. It works from what that unit publishes, for example a
   released package version, a schema snapshot, or a contract artifact. A
   monorepo shortcut is acceptable only as a clearly labelled stand-in for the
   published-artifact version.

2. **The compatibility window.** A change to an interface that other units
   consume (the database schema first, then the HTTP API and shared packages)
   must not break any consumer version that can be running while the change is
   live. For each consumer, those are:
   - the version **in production**;
   - the **rollback candidate**: the version production returns to if the
     current release is rolled back;
   - the **deployment candidate**: the version that deploys next.

   For mobile clients of the HTTP API, the window is every app version still
   supported.

3. **Database changes go by expand and contract.** There are no versioned views
   or per-consumer schemas. Only a few consumers share the database, and
   expand/contract keeps them working without that machinery.
   - **Expand** migrations only add: new tables, nullable columns or columns
     with a default, relaxed constraints, new enum values. They are safe for
     every version in the window.
   - **Contract** migrations remove or tighten: drop columns or tables, set
     NOT NULL, add constraints or unique indexes, drop defaults. A contract
     migration is named `*_contract_*`, holds only contract statements, ships
     alone with no other migrations and no code changes, and ships only when no
     consumer version in the window uses what it removes.
   - **Never in one step:** renames, type changes, a new NOT NULL column without
     a default, renamed enum values. They become expand, backfill, switch, then
     contract.
   - **Migrations deploy before the code that relies on them.**

4. **Every migration is checked before merge:**
   - **Linted** for locking and safety hazards. The real setup uses Atlas Pro's
     `atlas migrate lint`. Here, Squawk stands in for it (`.squawk.toml`); see
     the decisions log.
   - **Checked against the expand/contract policy** (point 3).
   - **Rehearsed on production-shaped data**: applied to a copy of what
     production holds, timed, and followed by invariant queries. The target
     is a branch of the production database (Neon). Until then, the stand-in
     is a local Postgres filled by a generator (`db/rehearsal/seed.sql`).

## What exists now, and what is open

| Mechanism              | Now                                                                                                        | Target                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Migration lint         | Squawk on the migrations a change adds (`migration-lint`)                                                  | `atlas migrate lint --git-base`                                                                       |
| Expand/contract policy | Enforced on migration SQL (`migration-lint`); contract readiness is manual evidence (`contract-readiness`) | Readiness proven automatically from the consumers' published usage (open)                             |
| Rehearsal              | Local Postgres with generated data (`migration-rehearsal`)                                                 | A per-change branch of production in Neon (open, with the deploy)                                     |
| Versioned consumption  | Workspace links (same commit)                                                                              | Units publish versions; consumers pin exact versions (open)                                           |
| Compatibility window   | The base commit's API runs its integration tests on the migrated schema (`compat-old-api`)                 | Each consumer version in the window runs its database-facing tests against the migrated schema (open) |
| Deployed versions      | Not recorded                                                                                               | The deploy pipeline records production and the rollback candidate per environment (open)              |
| HTTP API compatibility | oasdiff against the base branch's spec (`openapi-breaking`), plus review of the diff                       | The same check against each deployed client's version (open)                                          |

## Consequences

- A refactor that touches stored data takes several changes and deploys
  (expand, backfill, switch, contract) rather than one. That cost is the
  point: each step is safe for every running version.
- Contract migrations wait on evidence. Until it is automated, that evidence
  is a person's (or agent's) written check, listed in the verification report.
- The local stand-ins (Squawk, generated rehearsal data, workspace links) are
  labelled as such, so they can be replaced without changing the policy.
