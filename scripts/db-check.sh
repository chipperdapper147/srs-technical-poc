#!/usr/bin/env bash
# CI guard for the schema workflow (free-tier replacement for `atlas migrate lint`):
#  1. atlas.sum matches the migration files (nobody edited an applied migration)
#  2. db/schema.sql has no changes that are missing a migration
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-postgres://unused}"

atlas migrate validate --env local

out="$(atlas migrate diff --env local drift_check 2>&1)"
if ! grep -q "no changes to be made" <<<"$out"; then
  echo "$out"
  echo "::error::db/schema.sql has changes without a migration. Run: pnpm db:diff <name>" >&2
  rm -f db/migrations/*_drift_check.sql
  git checkout -- db/migrations/atlas.sum 2>/dev/null || true
  exit 1
fi
echo "Migrations are valid and in sync with db/schema.sql"
