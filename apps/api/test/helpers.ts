import type { JWTVerifyGetKey } from "jose";
import { sql } from "kysely";
import { buildApp } from "../src/build-app.ts";
import { createDb, type Database } from "../src/db/index.ts";
import type { Scheduler } from "../src/srs.ts";

/** `jwt` mode against a local key set, as production runs against the tenant's JWKS. */
export interface TestJwt {
  domain: string;
  audience: string;
  keys: JWTVerifyGetKey;
  legacyOwnerEmail?: string;
}

export async function setupTestApp({
  scheduler,
  jwt,
  vercelEnv,
}: {
  scheduler?: Scheduler;
  /** Verify Auth0 access tokens instead of using the dev stub. */
  jwt?: TestJwt;
  /** Build the app as on a Vercel deploy (no Swagger UI). */
  vercelEnv?: string;
} = {}) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const db = createDb(url);
  const app = await buildApp({
    db,
    env: {
      WEB_ORIGIN: "http://localhost:3000",
      AUTH_MODE: jwt ? "jwt" : "dev",
      LOG_LEVEL: "silent",
      AUTH0_DOMAIN: jwt?.domain,
      AUTH0_AUDIENCE: jwt?.audience,
      AUTH_LEGACY_OWNER_EMAIL: jwt?.legacyOwnerEmail,
      VERCEL_ENV: vercelEnv,
    },
    scheduler,
    jwtKeys: jwt?.keys,
  });
  const reset = () =>
    sql`TRUNCATE users, courses, units, items, cards, review_logs, prebuilt_courses RESTART IDENTITY CASCADE`.execute(
      db,
    );
  const close = async () => {
    await app.close();
    await db.destroy();
  };
  return { app, db, reset, close };
}

/** Time travel: move every card and review back by `ms`, as if that much time had passed. */
export async function travel(db: Database, ms: number) {
  const by = sql`make_interval(secs => ${ms / 1000}::double precision)`;
  await db
    .updateTable("cards")
    .set((eb) => ({
      dueAt: sql`${eb.ref("dueAt")} - ${by}`,
      lastReviewAt: sql`${eb.ref("lastReviewAt")} - ${by}`,
    }))
    .execute();
  await db
    .updateTable("reviewLogs")
    .set((eb) => ({ reviewedAt: sql`${eb.ref("reviewedAt")} - ${by}` }))
    .execute();
}

export const SAMPLE_CSV = `unit,term,definition,alternatives,notes
Basics,hola,hello,,
Basics,gracias,thank you,,
Basics,la biblioteca,library,biblioteca,"False friend: ""librería"" = bookshop"
Food,el agua,water,agua,
`;
