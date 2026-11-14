import { z } from "zod";

const EnvSchema = z
  .object({
    DATABASE_URL: z.url(),
    API_PORT: z.coerce.number().int().default(4000),
    API_HOST: z.string().default("0.0.0.0"),
    WEB_ORIGIN: z.string().default("http://localhost:3000"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /**
     * `dev`: every request acts as a local stub user (override with the
     * `x-dev-user` header). Replaced by Auth0 JWT verification later.
     */
    AUTH_MODE: z.enum(["dev"]).default("dev"),
    /**
     * Shared key every request must send as `Authorization: Bearer <key>`
     * (except /health and /docs). A stopgap that keeps a deploy closed while
     * auth is the dev stub; removed when Auth0 lands. Unset locally and in tests.
     */
    API_ACCESS_KEY: z.string().min(32).optional(),
    /** Set by Vercel on every deploy (production, preview, development). */
    VERCEL_ENV: z.string().optional(),
  })
  .refine((env) => !env.VERCEL_ENV || env.API_ACCESS_KEY, {
    message:
      "API_ACCESS_KEY is required on Vercel: auth is still the dev stub, so an open deploy would let anyone act as any user",
    path: ["API_ACCESS_KEY"],
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
