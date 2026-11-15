/**
 * Editing words: list and search a course's items, and add, change or delete
 * them. Anyone who can see a course can list and search it; only its owner
 * may change it. Everyone else gets 404 on a change, shared courses included,
 * so the API never says whether a course or item it won't change exists.
 */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ExpressionBuilder } from "kysely";
import { z } from "zod";
import type { Database } from "../db/index.ts";
import type { DB } from "../db/types.ts";
import {
  CourseItemSchema,
  CourseItemsSchema,
  CreateItemSchema,
  ErrorSchema,
  IdParamsSchema,
  ItemSearchQuerySchema,
  itemMatchesSearch,
  UnitParamsSchema,
  UpdateItemSchema,
} from "../shared.ts";
import { visibleTo } from "./courses.ts";

const columns = [
  "items.id",
  "items.unitId",
  "items.position",
  "items.term",
  "items.definition",
  "items.alternatives",
  "items.notes",
] as const;

/** Items in a course the user owns. */
const ownedBy = (userId: string) => (eb: ExpressionBuilder<DB, "items">) =>
  eb(
    "items.unitId",
    "in",
    eb
      .selectFrom("units")
      .innerJoin("courses", "courses.id", "units.courseId")
      .select("units.id")
      .where("courses.ownerId", "=", userId),
  );

export const itemRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    "/courses/:id/items",
    {
      schema: {
        tags: ["items"],
        params: IdParamsSchema,
        querystring: ItemSearchQuerySchema,
        response: { 200: CourseItemsSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      const course = await db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", request.params.id)
        .where(visibleTo(request.user.id))
        .executeTakeFirst();
      if (!course) throw app.httpErrors.notFound("Course not found");
      const items = await db
        .selectFrom("items")
        .innerJoin("units", "units.id", "items.unitId")
        .select(columns)
        .where("units.courseId", "=", course.id)
        .orderBy("units.position")
        .orderBy("items.position")
        .execute();
      // Filtered here rather than in SQL so search matches exactly what the
      // client's as-you-type filter does (the shared normaliser). Courses
      // are small; revisit with an index if they stop being.
      const q = request.query.q ?? "";
      return { items: items.filter((item) => itemMatchesSearch(item, q)) };
    },
  );

  app.post(
    "/courses/:id/units/:unitId/items",
    {
      schema: {
        tags: ["items"],
        params: UnitParamsSchema,
        body: CreateItemSchema,
        response: { 201: CourseItemSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { id: courseId, unitId } = request.params;
      const item = await db.transaction().execute(async (trx) => {
        // Locking the unit serializes adds (and imports) into it, so the
        // next position can't be taken twice.
        const unit = await trx
          .selectFrom("units")
          .innerJoin("courses", "courses.id", "units.courseId")
          .select("units.id")
          .where("units.id", "=", unitId)
          .where("units.courseId", "=", courseId)
          .where("courses.ownerId", "=", request.user.id)
          .forUpdate("units")
          .executeTakeFirst();
        if (!unit) return undefined;
        const { last } = await trx
          .selectFrom("items")
          .select((eb) => eb.fn.coalesce(eb.fn.max("position"), eb.lit(0)).as("last"))
          .where("unitId", "=", unitId)
          .executeTakeFirstOrThrow();
        return trx
          .insertInto("items")
          .values({ ...request.body, unitId, position: Number(last) + 1 })
          .returning(columns)
          .executeTakeFirstOrThrow();
      });
      if (!item) throw app.httpErrors.notFound("Unit not found");
      reply.code(201);
      return item;
    },
  );

  app.patch(
    "/items/:id",
    {
      schema: {
        tags: ["items"],
        params: IdParamsSchema,
        body: UpdateItemSchema,
        response: { 200: CourseItemSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      const owned = (eb: ExpressionBuilder<DB, "items">) =>
        eb.and([eb("items.id", "=", request.params.id), ownedBy(request.user.id)(eb)]);
      const item = Object.keys(request.body).length
        ? await db
            .updateTable("items")
            .set(request.body)
            .where(owned)
            .returning(columns)
            .executeTakeFirst()
        : await db.selectFrom("items").select(columns).where(owned).executeTakeFirst();
      if (!item) throw app.httpErrors.notFound("Item not found");
      return item;
    },
  );

  app.delete(
    "/items/:id",
    {
      schema: {
        tags: ["items"],
        params: IdParamsSchema,
        response: { 204: z.null().describe("Deleted"), 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      // Its cards and review history go with it (ON DELETE CASCADE).
      const deleted = await db
        .deleteFrom("items")
        .where("items.id", "=", request.params.id)
        .where(ownedBy(request.user.id))
        .returning("items.id")
        .executeTakeFirst();
      if (!deleted) throw app.httpErrors.notFound("Item not found");
      return reply.code(204).send(null);
    },
  );
};
