/**
 * The API's entry point, locally and on Vercel.
 *
 * Locally it listens on API_PORT. On Vercel it exports a (req, res) handler
 * instead: Vercel replaces http.Server#listen with a stub that never calls
 * back, so `await app.listen()` would never resolve and every request hung
 * until it timed out. Vercel's Fastify support also requires this file to
 * import fastify, and to be the only src/app|index|server.* file
 * (scripts/deploy/entrypoint.test.ts).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./build-app.ts";
import { createDb } from "./db/index.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app: FastifyInstance = await buildApp({ db, env });

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}

if (!env.VERCEL_ENV) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      await app.close();
      await db.destroy();
      process.exit(0);
    });
  }
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}
