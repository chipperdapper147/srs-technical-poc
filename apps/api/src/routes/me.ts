import { MeSchema, UpdateMeSchema } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Database } from "../db/index.ts";

const columns = [
  "id",
  "displayName",
  "gradingMode",
  "accentSensitive",
  "newItemsPerSession",
] as const;

export const meRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get("/me", { schema: { tags: ["me"], response: { 200: MeSchema } } }, async (request) =>
    db
      .selectFrom("users")
      .select(columns)
      .where("id", "=", request.user.id)
      .executeTakeFirstOrThrow(),
  );

  app.patch(
    "/me",
    { schema: { tags: ["me"], body: UpdateMeSchema, response: { 200: MeSchema } } },
    async (request) => {
      const query = db.updateTable("users").where("id", "=", request.user.id);
      const updated = Object.keys(request.body).length
        ? query.set(request.body).returning(columns)
        : db.selectFrom("users").select(columns).where("id", "=", request.user.id);
      return updated.executeTakeFirstOrThrow();
    },
  );
};
