/**
 * Resolves `request.user` for every request; routes rely only on its `id`.
 *
 * - `dev` (local dev, tests, e2e): the caller is the user whose `auth_sub`
 *   is the `x-dev-user` header (default `dev|local`), created on first use.
 * - `jwt` (production): the caller sends an Auth0 access token as
 *   `Authorization: Bearer <token>`. It is verified (RS256 against the
 *   tenant's JWKS, issuer, audience, expiry) and its `sub` is the user,
 *   created on first sign-in and named from the token's profile claims.
 *
 * `/health`, `/docs` and CORS preflights stay open; they carry no data.
 */
import fp from "fastify-plugin";
import { createRemoteJWKSet, errors, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Database } from "../db/index.ts";
import type { Env } from "../env.ts";

export interface CurrentUser {
  id: string;
  authSub: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: CurrentUser;
  }
}

export const DEV_USER_SUB = "dev|local";

/**
 * Where the tenant's Post Login Action puts the profile in access tokens
 * (custom claims must be namespaced).
 */
export const CLAIM_NAMESPACE = "https://srs-technical-poc.vercel.app/";

export interface JwtOptions {
  /** `https://<AUTH0_DOMAIN>/`, the token's `iss`. */
  issuer: string;
  /** `AUTH0_AUDIENCE`, the token's `aud`. */
  audience: string;
  /**
   * The signing keys. Defaults to the tenant's JWKS (fetched on first use and
   * cached by jose); tests pass a local key set so they never touch the network.
   */
  keys?: JWTVerifyGetKey;
  /**
   * `AUTH_LEGACY_OWNER_EMAIL`: the first sign-in with this email takes over
   * the `dev|local` user (the owner's progress from before Auth0) instead of
   * creating a new one. Off when unset.
   */
  legacyOwnerEmail?: string;
}

export type AuthOptions =
  | { db: Database; mode: Extract<Env["AUTH_MODE"], "dev"> }
  | { db: Database; mode: Extract<Env["AUTH_MODE"], "jwt">; jwt: JwtOptions };

async function upsertUser(db: Database, authSub: string, displayName: string) {
  return db
    .insertInto("users")
    .values({ authSub, displayName })
    .onConflict((oc) => oc.column("authSub").doUpdateSet({ authSub }))
    .returning(["id", "authSub"])
    .executeTakeFirstOrThrow();
}

function claim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[`${CLAIM_NAMESPACE}${name}`];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The token's user, created on first sign-in (or the legacy owner's row, claimed). */
export async function resolveTokenUser(
  db: Database,
  payload: JWTPayload & { sub: string },
  legacyOwnerEmail: string | undefined,
): Promise<CurrentUser> {
  const existing = await db
    .selectFrom("users")
    .select(["id", "authSub"])
    .where("authSub", "=", payload.sub)
    .executeTakeFirst();
  if (existing) return existing;
  const email = claim(payload, "email");
  const displayName = claim(payload, "name") ?? email ?? "Learner";
  if (legacyOwnerEmail && email?.toLowerCase() === legacyOwnerEmail.trim().toLowerCase()) {
    // Only matches while `dev|local` exists, so it happens once.
    const claimed = await db
      .updateTable("users")
      .set({ authSub: payload.sub, displayName })
      .where("authSub", "=", DEV_USER_SUB)
      .returning(["id", "authSub"])
      .executeTakeFirst();
    if (claimed) return claimed;
  }
  return upsertUser(db, payload.sub, displayName);
}

function bearer(header: string | undefined): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}

export default fp<AuthOptions>(
  async (app, options) => {
    const { db } = options;
    const verify =
      options.mode === "jwt"
        ? (() => {
            const { issuer, audience, keys, legacyOwnerEmail } = options.jwt;
            const keySet = keys ?? createRemoteJWKSet(new URL(".well-known/jwks.json", issuer));
            return async (token: string) => {
              const { payload } = await jwtVerify(token, keySet, {
                issuer,
                audience,
                algorithms: ["RS256"],
                requiredClaims: ["sub", "exp"],
              });
              return resolveTokenUser(
                db,
                payload as JWTPayload & { sub: string },
                legacyOwnerEmail,
              );
            };
          })()
        : null;

    app.decorateRequest("user", null as unknown as CurrentUser);
    app.addHook("onRequest", async (request, reply) => {
      if (request.method === "OPTIONS") return;
      if (request.url === "/health" || request.url.startsWith("/docs")) return;
      if (!verify) {
        const header = request.headers["x-dev-user"];
        const sub = (Array.isArray(header) ? header[0] : header) || DEV_USER_SUB;
        request.user = await upsertUser(db, sub, sub === DEV_USER_SUB ? "Local learner" : sub);
        return;
      }
      const token = bearer(request.headers.authorization);
      if (!token) {
        return reply.code(401).send({ message: "Sign in required: no access token was sent." });
      }
      try {
        request.user = await verify(token);
      } catch (error) {
        if (error instanceof errors.JWKSTimeout) {
          request.log.warn({ err: error }, "auth: JWKS fetch timed out");
          return reply.code(503).send({ message: "Couldn't check the access token. Try again." });
        }
        if (!(error instanceof errors.JOSEError)) throw error;
        request.log.info({ code: error.code }, "auth: access token rejected");
        return reply.code(401).send({
          message:
            error instanceof errors.JWTExpired
              ? "Your session has expired. Sign in again."
              : "Invalid access token. Sign in again.",
        });
      }
    });
  },
  { name: "auth" },
);
