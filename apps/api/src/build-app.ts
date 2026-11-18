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
import type { JWTVerifyGetKey } from "jose";
import type { Database } from "./db/index.ts";
import type { Env } from "./env.ts";
import auth, { type AuthOptions } from "./plugins/auth.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { courseRoutes } from "./routes/courses.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";
import { itemRoutes } from "./routes/items.ts";
import { meRoutes } from "./routes/me.ts";
import { statsRoutes } from "./routes/stats.ts";
import { studyRoutes } from "./routes/study.ts";
import { createScheduler, type Scheduler } from "./srs.ts";

export interface AppOptions {
  db: Database;
  env: Pick<Env, "WEB_ORIGIN" | "AUTH_MODE" | "LOG_LEVEL"> &
    Partial<
      Pick<Env, "AUTH0_DOMAIN" | "AUTH0_AUDIENCE" | "AUTH_LEGACY_OWNER_EMAIL" | "VERCEL_ENV">
    >;
  /** Defaults to the learning steps in `learning-steps.ts`; tests pass their own. */
  scheduler?: Scheduler;
  /** `jwt` mode's signing keys. Defaults to the tenant's JWKS; tests pass a local key set. */
  jwtKeys?: JWTVerifyGetKey;
}

function authOptions(db: Database, env: AppOptions["env"], keys?: JWTVerifyGetKey): AuthOptions {
  if (env.AUTH_MODE === "dev") return { db, mode: "dev" };
  if (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE) {
    throw new Error("AUTH_MODE=jwt needs AUTH0_DOMAIN and AUTH0_AUDIENCE");
  }
  return {
    db,
    mode: "jwt",
    jwt: {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE,
      keys,
      legacyOwnerEmail: env.AUTH_LEGACY_OWNER_EMAIL,
    },
  };
}

export async function buildApp({ db, env, scheduler, jwtKeys }: AppOptions) {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(cors, { origin: env.WEB_ORIGIN, methods: ["GET", "POST", "PATCH", "DELETE"] });
  await app.register(swagger, {
    openapi: {
      info: { title: "SRS API", version: "0.0.0" },
      components: {
        securitySchemes: {
          auth0: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "An Auth0 access token for the API's audience. Production only: local dev and tests run AUTH_MODE=dev, where the x-dev-user header picks the user.",
          },
        },
      },
      security: [{ auth0: [] }],
    },
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

  await app.register(auth, authOptions(db, env, jwtKeys));
  await app.register(meRoutes, { db });
  await app.register(courseRoutes, { db });
  await app.register(catalogRoutes, { db });
  await app.register(dashboardRoutes, { db });
  await app.register(statsRoutes, { db });
  await app.register(itemRoutes, { db });
  await app.register(studyRoutes, { db, scheduler: scheduler ?? (await createScheduler()) });

  return app;
}
