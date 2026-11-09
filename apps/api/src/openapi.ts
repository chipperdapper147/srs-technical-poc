/**
 * Writes the OpenAPI document generated from the Zod contracts to
 * apps/api/openapi.json. The file is committed so contract changes show up
 * as a reviewable diff on the PR; the `openapi-drift` check keeps it current.
 * Never edit the JSON by hand: run `pnpm api:openapi`.
 */
import { writeFileSync } from "node:fs";
import { buildApp } from "./app.ts";
import { createDb } from "./db/index.ts";

// Building the app opens no connection; the pool connects on first query.
const db = createDb("postgres://unused@localhost/unused");
const app = await buildApp({
  db,
  env: { WEB_ORIGIN: "http://localhost:3000", AUTH_MODE: "dev", LOG_LEVEL: "silent" },
});
await app.ready();
const out = new URL("../openapi.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
await db.destroy();
