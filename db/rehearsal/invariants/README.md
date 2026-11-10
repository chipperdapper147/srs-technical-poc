# Rehearsal invariants

Each `*.sql` file here is a query that returns the rows **violating** one
invariant. The migration rehearsal (`scripts/schema/rehearse.ts`) runs them all
after applying a change's migrations to production-shaped data; any row fails it.

Two kinds:

- **Standing invariants** of the data model (below), true after every change.
- **Change invariants**, added by an expand migration's change to prove its
  backfill: for example, when splitting `items.alternatives` into a new table,
  "every item's alternatives appear in the new table". Keep them until the
  contract migration removes the old side, then delete them with it.

Write invariants the database can't enforce on its own; a CHECK or FOREIGN KEY
belongs in `db/schema.sql`.
