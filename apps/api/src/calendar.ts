/**
 * Calendar days in a learner's time zone, for the dashboard's forecast and
 * the stats. Postgres does the time zone arithmetic (`AT TIME ZONE`); days
 * travel as YYYY-MM-DD strings.
 */
import { sql } from "kysely";
import type { Database } from "./db/index.ts";

/** Postgres' code for an unknown time zone name ("invalid_parameter_value"). */
const INVALID_PARAMETER = "22023";

/**
 * True when Postgres rejected a time zone name. Intl (the contract's check)
 * can know a name this Postgres' time zone database doesn't.
 */
export function isUnknownTimeZone(error: unknown): boolean {
  return (error as { code?: string }).code === INVALID_PARAMETER;
}

/** `date` (YYYY-MM-DD) plus `days` calendar days; `days` may be negative. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today in `timeZone`, YYYY-MM-DD, by the database's clock. */
export async function todayIn(db: Database, timeZone: string): Promise<string> {
  const { rows } = await sql<{ today: string }>`
    SELECT to_char((now() AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS today
  `.execute(db);
  return rows[0]?.today ?? new Date().toISOString().slice(0, 10);
}
