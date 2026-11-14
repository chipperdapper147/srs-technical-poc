/**
 * Builds the Fastify app. Not named app.ts on purpose: Vercel takes
 * src/app.* as the entry point before src/server.*, and this module has
 * no default export. src/server.ts starts the server (decisions log).
 */
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Database } from "./db/index.ts";
import type { Env } from "./env.ts";
import accessKey from "./plugins/access-key.ts";
import auth from "./plugins/auth.ts";
import { courseRoutes } from "./routes/courses.ts";
import { meRoutes } from "./routes/me.ts";
import { studyRoutes } from "./routes/study.ts";
import { createScheduler, type Scheduler } from "./srs.ts";

export interface AppOptions {
  db: Database;
  env: Pick<Env, "WEB_ORIGIN" | "AUTH_MODE" | "LOG_LEVEL"> &
    Partial<Pick<Env, "API_ACCESS_KEY" | "VERCEL_ENV">>;
  /** Defaults to the learning steps in `learning-steps.ts`; tests pass their own. */
  scheduler?: Scheduler;
}

export async function buildApp({ db, env, scheduler }: AppOptions) {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(cors, { origin: env.WEB_ORIGIN, methods: ["GET", "POST", "PATCH"] });
  await app.register(swagger, {
    openapi: { info: { title: "SRS API", version: "0.0.0" } },
    transform: jsonSchemaTransform,
  });
  // Swagger UI (the browsable /docs page) only off Vercel. It needs
  // @fastify/static, which require()s an ES module; Vercel's function loader
  // doesn't support that and the API crashed on load. So it is imported only
  // when used, and on Vercel /docs/json is served directly.
  if (env.VERCEL_ENV) {
    app.get("/docs/json", { schema: { hide: true } }, async () => app.swagger());
  } else {
    const { default: swaggerUi } = await import("@fastify/swagger-ui");
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  app.get("/health", { schema: { hide: true } }, async () => {
    await db.selectNoFrom((eb) => eb.lit(1).as("ok")).execute();
    return { ok: true };
  });

  await app.register(accessKey, { key: env.API_ACCESS_KEY });
  await app.register(auth, { db, mode: env.AUTH_MODE });
  await app.register(meRoutes, { db });
  await app.register(courseRoutes, { db });
  await app.register(studyRoutes, { db, scheduler: scheduler ?? (await createScheduler()) });

  return app;
}
