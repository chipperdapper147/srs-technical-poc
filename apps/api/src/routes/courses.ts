import {
  CourseDetailSchema,
  CourseSummarySchema,
  CreateCourseSchema,
  ErrorSchema,
  IdParamsSchema,
  ImportCsvSchema,
  ImportResultSchema,
  UpdateCourseSchema,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { type ExpressionBuilder, sql } from "kysely";
import { z } from "zod";
import type { Database } from "../db/index.ts";
import type { DB } from "../db/types.ts";
import { CsvImportError, importVocabulary } from "../import.ts";

/** Courses a user can see: shared (no owner) or their own. */
const visibleTo = (userId: string) => (eb: ExpressionBuilder<DB, "courses">) =>
  eb.or([eb("courses.ownerId", "is", null), eb("courses.ownerId", "=", userId)]);

function summaries(db: Database, userId: string) {
  return db
    .selectFrom("courses")
    .leftJoin("units", "units.courseId", "courses.id")
    .leftJoin("items", "items.unitId", "units.id")
    .leftJoin("cards", (join) =>
      join.onRef("cards.itemId", "=", "items.id").on("cards.userId", "=", userId),
    )
    .select([
      "courses.id",
      "courses.title",
      "courses.description",
      "courses.sourceLang",
      "courses.targetLang",
      "courses.gradingMode",
      "courses.accentSensitive",
      "courses.ownerId",
    ])
    .select((eb) => [
      eb.fn.count<string>("items.id").as("itemCount"),
      eb.fn.count<string>("cards.itemId").as("learnedCount"),
      eb.fn
        .count<string>("cards.itemId")
        .filterWhere("cards.dueAt", "<=", sql<Date>`now()`)
        .as("dueCount"),
    ])
    .where(visibleTo(userId))
    .groupBy("courses.id")
    .orderBy("courses.createdAt");
}

const toSummary = (row: {
  id: string;
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  itemCount: string | number;
  learnedCount: string | number;
  dueCount: string | number;
}) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  sourceLang: row.sourceLang,
  targetLang: row.targetLang,
  itemCount: Number(row.itemCount),
  learnedCount: Number(row.learnedCount),
  dueCount: Number(row.dueCount),
});

export const courseRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  async function loadDetail(courseId: string, userId: string) {
    const course = await summaries(db, userId)
      .where("courses.id", "=", courseId)
      .executeTakeFirst();
    if (!course) return undefined;
    const units = await db
      .selectFrom("units")
      .leftJoin("items", "items.unitId", "units.id")
      .leftJoin("cards", (join) =>
        join.onRef("cards.itemId", "=", "items.id").on("cards.userId", "=", userId),
      )
      .select(["units.id", "units.position", "units.title"])
      .select((eb) => [
        eb.fn.count<string>("items.id").as("itemCount"),
        eb.fn.count<string>("cards.itemId").as("learnedCount"),
      ])
      .where("units.courseId", "=", courseId)
      .groupBy("units.id")
      .orderBy("units.position")
      .execute();
    return {
      ...toSummary(course),
      gradingMode: course.gradingMode,
      accentSensitive: course.accentSensitive,
      editable: course.ownerId === userId,
      units: units.map((u) => ({
        ...u,
        itemCount: Number(u.itemCount),
        learnedCount: Number(u.learnedCount),
      })),
    };
  }

  /** 404 unless the course exists and belongs to the user (shared courses are read-only). */
  async function requireOwned(courseId: string, userId: string) {
    const course = await db
      .selectFrom("courses")
      .select(["id", "ownerId"])
      .where("id", "=", courseId)
      .where(visibleTo(userId))
      .executeTakeFirst();
    if (!course) throw app.httpErrors.notFound("Course not found");
    if (course.ownerId !== userId) throw app.httpErrors.forbidden("Shared courses are read-only");
  }

  app.get(
    "/courses",
    { schema: { tags: ["courses"], response: { 200: z.array(CourseSummarySchema) } } },
    async (request) => (await summaries(db, request.user.id).execute()).map(toSummary),
  );

  app.post(
    "/courses",
    {
      schema: {
        tags: ["courses"],
        body: CreateCourseSchema,
        response: { 201: CourseDetailSchema },
      },
    },
    async (request, reply) => {
      const { id } = await db
        .insertInto("courses")
        .values({ ...request.body, ownerId: request.user.id })
        .returning("id")
        .executeTakeFirstOrThrow();
      reply.code(201);
      return (await loadDetail(id, request.user.id)) as NonNullable<
        Awaited<ReturnType<typeof loadDetail>>
      >;
    },
  );

  app.get(
    "/courses/:id",
    {
      schema: {
        tags: ["courses"],
        params: IdParamsSchema,
        response: { 200: CourseDetailSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      const detail = await loadDetail(request.params.id, request.user.id);
      if (!detail) throw app.httpErrors.notFound("Course not found");
      return detail;
    },
  );

  app.patch(
    "/courses/:id",
    {
      schema: {
        tags: ["courses"],
        params: IdParamsSchema,
        body: UpdateCourseSchema,
        response: { 200: CourseDetailSchema, 403: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      await requireOwned(request.params.id, request.user.id);
      if (Object.keys(request.body).length) {
        await db
          .updateTable("courses")
          .set(request.body)
          .where("id", "=", request.params.id)
          .execute();
      }
      return (await loadDetail(request.params.id, request.user.id)) as NonNullable<
        Awaited<ReturnType<typeof loadDetail>>
      >;
    },
  );

  app.post(
    "/courses/:id/import",
    {
      bodyLimit: 2_500_000,
      schema: {
        tags: ["courses"],
        params: IdParamsSchema,
        body: ImportCsvSchema,
        response: { 200: ImportResultSchema, 400: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      await requireOwned(request.params.id, request.user.id);
      try {
        return await importVocabulary(db, request.params.id, request.body.csv);
      } catch (err) {
        if (err instanceof CsvImportError) throw app.httpErrors.badRequest(err.message);
        throw err;
      }
    },
  );
};
