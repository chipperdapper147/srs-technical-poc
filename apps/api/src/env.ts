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
     * `x-dev-user` header). Local dev, tests and e2e.
     * `jwt`: every request needs an Auth0 access token (plugins/auth.ts).
     * Required on Vercel.
     */
    AUTH_MODE: z.enum(["dev", "jwt"]).default("dev"),
    /** The Auth0 tenant, e.g. `hallavo.eu.auth0.com`; the issuer is `https://<domain>/`. */
    AUTH0_DOMAIN: z
      .string()
      .regex(/^[a-z0-9.-]+$/i, "a host name, without https:// or a path")
      .optional(),
    /** The Auth0 API's identifier: access tokens must carry it as `aud`. */
    AUTH0_AUDIENCE: z.string().min(1).optional(),
    /**
     * Optional, Vercel only: the first sign-in with this email takes over the
     * `dev|local` user, which holds the owner's progress from before Auth0.
     * Kept out of the repository.
     */
    AUTH_LEGACY_OWNER_EMAIL: z.email().optional(),
    /** Set by Vercel on every deploy (production, preview, development). */
    VERCEL_ENV: z.string().optional(),
  })
  .refine((env) => env.AUTH_MODE !== "jwt" || (env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE), {
    message: "AUTH_MODE=jwt needs AUTH0_DOMAIN and AUTH0_AUDIENCE",
    path: ["AUTH_MODE"],
  })
  .refine((env) => !env.VERCEL_ENV || env.AUTH_MODE === "jwt", {
    message:
      "AUTH_MODE=jwt is required on Vercel: in dev mode anyone could act as any user with the x-dev-user header",
    path: ["AUTH_MODE"],
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
