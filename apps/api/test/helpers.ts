import { sql } from "kysely";
import { buildApp } from "../src/app.ts";
import { createDb, type Database } from "../src/db/index.ts";
import type { Scheduler } from "../src/srs.ts";

export async function setupTestApp({ scheduler }: { scheduler?: Scheduler } = {}) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const db = createDb(url);
  const app = await buildApp({
    db,
    env: { WEB_ORIGIN: "http://localhost:3000", AUTH_MODE: "dev", LOG_LEVEL: "silent" },
    scheduler,
  });
  const reset = () =>
    sql`TRUNCATE users, courses, units, items, cards, review_logs RESTART IDENTITY CASCADE`.execute(
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
