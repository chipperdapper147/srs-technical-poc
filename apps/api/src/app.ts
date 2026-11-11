import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Database } from "./db/index.ts";
import type { Env } from "./env.ts";
import auth from "./plugins/auth.ts";
import { courseRoutes } from "./routes/courses.ts";
import { meRoutes } from "./routes/me.ts";
import { studyRoutes } from "./routes/study.ts";
import { createScheduler, type Scheduler } from "./srs.ts";

export interface AppOptions {
  db: Database;
  env: Pick<Env, "WEB_ORIGIN" | "AUTH_MODE" | "LOG_LEVEL">;
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
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", { schema: { hide: true } }, async () => {
    await db.selectNoFrom((eb) => eb.lit(1).as("ok")).execute();
    return { ok: true };
  });

  await app.register(auth, { db, mode: env.AUTH_MODE });
  await app.register(meRoutes, { db });
  await app.register(courseRoutes, { db });
  await app.register(studyRoutes, { db, scheduler: scheduler ?? (await createScheduler()) });

  return app;
}
