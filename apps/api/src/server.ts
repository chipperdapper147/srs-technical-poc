// Vercel's Fastify support only accepts an entry point that imports fastify itself.
import type { FastifyInstance } from "fastify";
import { buildApp } from "./build-app.ts";
import { createDb } from "./db/index.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app: FastifyInstance = await buildApp({ db, env });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.destroy();
    process.exit(0);
  });
}

await app.listen({ port: env.API_PORT, host: env.API_HOST });
