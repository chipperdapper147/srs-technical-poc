/**
 * Direct database access for test setup that has no API (e.g. time travel).
 * Keep this small: prefer setting state up through the API.
 */
import pg from "pg";

let pool: pg.Pool | undefined;

function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({ connectionString, max: 2 });
  return pool;
}

/** Make every card of a user due now, as if time had passed. */
export async function makeAllCardsDue(authSub: string) {
  await db().query(
    `UPDATE cards SET due_at = now() - interval '1 minute'
     WHERE user_id = (SELECT id FROM users WHERE auth_sub = $1)`,
    [authSub],
  );
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
