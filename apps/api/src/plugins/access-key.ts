/**
 * Stopgap until Auth0: when `API_ACCESS_KEY` is set, every request must send
 * `Authorization: Bearer <key>`. /health, /docs and CORS preflights stay
 * open; they carry no data. Registered before `auth`, so a rejected request
 * never creates a user.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import fp from "fastify-plugin";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function bearerMatches(header: string | undefined, key: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  // Hashing gives both sides the same length, so the comparison is constant time.
  return !!match?.[1] && timingSafeEqual(digest(match[1]), digest(key));
}

export default fp<{ key: string | undefined }>(
  async (app, { key }) => {
    if (!key) return;
    app.addHook("onRequest", async (request, reply) => {
      if (request.method === "OPTIONS") return;
      if (request.url === "/health" || request.url.startsWith("/docs")) return;
      if (!bearerMatches(request.headers.authorization, key)) {
        return reply.code(401).send({ message: "Access key required" });
      }
    });
  },
  { name: "access-key" },
);
