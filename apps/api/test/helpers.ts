import { sql } from "kysely";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db/index.ts";

export async function setupTestApp() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const db = createDb(url);
  const app = await buildApp({
    db,
    env: { WEB_ORIGIN: "http://localhost:3000", AUTH_MODE: "dev", LOG_LEVEL: "silent" },
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

export const SAMPLE_CSV = `unit,term,definition,alternatives,notes
Basics,hola,hello,,
Basics,gracias,thank you,,
Basics,la biblioteca,library,biblioteca,"False friend: ""librería"" = bookshop"
Food,el agua,water,agua,
`;
