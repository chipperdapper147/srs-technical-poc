import {
  AnswerResultSchema,
  ErrorSchema,
  type GradingOptions,
  gradeAnswer,
  IdParamsSchema,
  ratingForVerdict,
  StudyQuerySchema,
  StudySessionSchema,
  SubmitAnswerSchema,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import type { Database } from "../db/index.ts";
import type { Scheduler } from "../srs.ts";

const DEFAULT_REVIEW_LIMIT = 20;

/** Course override, else the learner's own setting. */
async function gradingFor(db: Database, userId: string, courseId: string) {
  const row = await db
    .selectFrom("courses")
    .innerJoin("users", (join) => join.on("users.id", "=", userId))
    .select([
      "courses.id",
      "users.newItemsPerSession",
      (eb) => eb.fn.coalesce("courses.gradingMode", "users.gradingMode").as("mode"),
      (eb) =>
        eb.fn.coalesce("courses.accentSensitive", "users.accentSensitive").as("accentSensitive"),
    ])
    .where("courses.id", "=", courseId)
    .where((eb) => eb.or([eb("courses.ownerId", "is", null), eb("courses.ownerId", "=", userId)]))
    .executeTakeFirst();
  if (!row) return undefined;
  const grading: GradingOptions = { mode: row.mode, accentSensitive: row.accentSensitive };
  return { grading, newItemsPerSession: row.newItemsPerSession };
}

export const studyRoutes: FastifyPluginAsyncZod<{ db: Database; scheduler: Scheduler }> = async (
  app,
  { db, scheduler },
) => {
  app.get(
    "/courses/:id/study",
    {
      schema: {
        tags: ["study"],
        description:
          "learn: the next unseen items in course order. review: items whose card is due, most overdue first.",
        params: IdParamsSchema,
        querystring: StudyQuerySchema,
        response: { 200: StudySessionSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      const courseId = request.params.id;
      const { mode, limit } = request.query;
      const settings = await gradingFor(db, userId, courseId);
      if (!settings) throw app.httpErrors.notFound("Course not found");

      const base = db
        .selectFrom("items")
        .innerJoin("units", "units.id", "items.unitId")
        .leftJoin("cards", (join) =>
          join.onRef("cards.itemId", "=", "items.id").on("cards.userId", "=", userId),
        )
        .select([
          "items.id as itemId",
          "units.title as unitTitle",
          "items.term",
          "items.definition",
          "items.alternatives",
          "items.notes",
        ])
        .where("units.courseId", "=", courseId);

      const rows =
        mode === "learn"
          ? await base
              .where("cards.itemId", "is", null)
              .orderBy("units.position")
              .orderBy("items.position")
              .limit(limit ?? settings.newItemsPerSession)
              .execute()
          : await base
              .where("cards.dueAt", "<=", sql<Date>`now()`)
              .orderBy("cards.dueAt")
              .limit(limit ?? DEFAULT_REVIEW_LIMIT)
              .execute();

      return {
        mode,
        grading: settings.grading,
        items: rows.map((r) => ({ ...r, isNew: mode === "learn" })),
      };
    },
  );

  app.post(
    "/study/answers",
    {
      schema: {
        tags: ["study"],
        description:
          "Grade a typed answer (server-authoritative), update the FSRS card and log the review.",
        body: SubmitAnswerSchema,
        response: { 200: AnswerResultSchema, 404: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      const { itemId, answer, durationMs } = request.body;

      const item = await db
        .selectFrom("items")
        .innerJoin("units", "units.id", "items.unitId")
        .select(["items.id", "items.term", "items.alternatives", "units.courseId"])
        .where("items.id", "=", itemId)
        .executeTakeFirst();
      const settings = item && (await gradingFor(db, userId, item.courseId));
      if (!item || !settings) throw app.httpErrors.notFound("Item not found");

      const result = gradeAnswer(answer, [item.term, ...item.alternatives], settings.grading);
      const rating = ratingForVerdict(result.verdict);
      const now = new Date();

      const card = await db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom("cards")
          .selectAll()
          .where("userId", "=", userId)
          .where("itemId", "=", itemId)
          .forUpdate()
          .executeTakeFirst();
        const current = existing ?? scheduler.newCard(userId, itemId, now);
        const reviewed = scheduler.review(current, rating, now);
        const { userId: _u, itemId: _i, ...state } = reviewed.row;
        await trx
          .insertInto("cards")
          .values(reviewed.row)
          .onConflict((oc) => oc.columns(["userId", "itemId"]).doUpdateSet(state))
          .execute();
        await trx
          .insertInto("reviewLogs")
          .values({
            userId,
            itemId,
            rating,
            answer,
            verdict: result.verdict,
            durationMs: durationMs ?? null,
            revlog: JSON.stringify(reviewed.revlog),
            reviewedAt: now,
          })
          .execute();
        return reviewed.row;
      });

      return {
        verdict: result.verdict,
        matched: result.matched,
        term: item.term,
        rating,
        nextDue: card.dueAt.toISOString(),
      };
    },
  );
};
