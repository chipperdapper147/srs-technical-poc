/**
 * Resolves `request.user` for every request.
 *
 * Today only the `dev` mode exists: the caller is the user whose `auth_sub`
 * is the `x-dev-user` header (default `dev|local`), created on first use.
 * When Auth0 lands, a `jwt` mode verifies the bearer token and uses its
 * `sub` claim the same way; routes don't change.
 */
import fp from "fastify-plugin";
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

async function upsertUser(db: Database, authSub: string, displayName: string) {
  return db
    .insertInto("users")
    .values({ authSub, displayName })
    .onConflict((oc) => oc.column("authSub").doUpdateSet({ authSub }))
    .returning(["id", "authSub"])
    .executeTakeFirstOrThrow();
}

export default fp<{ db: Database; mode: Env["AUTH_MODE"] }>(
  async (app, { db, mode }) => {
    app.decorateRequest("user", null as unknown as CurrentUser);
    app.addHook("onRequest", async (request) => {
      if (request.url === "/health" || request.url.startsWith("/docs")) return;
      if (mode === "dev") {
        const header = request.headers["x-dev-user"];
        const sub = (Array.isArray(header) ? header[0] : header) || DEV_USER_SUB;
        request.user = await upsertUser(db, sub, sub === DEV_USER_SUB ? "Local learner" : sub);
      }
    });
  },
  { name: "auth" },
);
