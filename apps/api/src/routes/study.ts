import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql, type Transaction } from "kysely";
import type { Database } from "../db/index.ts";
import type { DB } from "../db/types.ts";
import {
  ANSWER_WINDOW_MINUTES,
  AnswerResultSchema,
  ErrorSchema,
  type GradingOptions,
  gradeAnswer,
  IdParamsSchema,
  maxHints,
  ReviewQuerySchema,
  ReviewSessionSchema,
  ratingForAnswer,
  StudyQuerySchema,
  StudySessionSchema,
  SubmitAnswerSchema,
  UndoResultSchema,
} from "../shared.ts";
import type { CardRow, Scheduler } from "../srs.ts";
import { visibleTo } from "./courses.ts";

const DEFAULT_REVIEW_LIMIT = 20;
/** "Review all due" means all of it, up to the largest session a request may ask for. */
const DEFAULT_ALL_REVIEW_LIMIT = 100;
const ANSWER_WINDOW_MS = ANSWER_WINDOW_MINUTES * 60 * 1000;

/** A card's scheduling columns, for an update. */
function cardState({ userId: _u, itemId: _i, ...state }: CardRow) {
  return state;
}

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
    .where(visibleTo(userId))
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

  app.get(
    "/study/review",
    {
      schema: {
        tags: ["study"],
        description:
          "Review across all courses: items whose card is due, most overdue first. Each item names its course and that course's grading.",
        querystring: ReviewQuerySchema,
        response: { 200: ReviewSessionSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      const rows = await db
        .selectFrom("cards")
        .innerJoin("items", "items.id", "cards.itemId")
        .innerJoin("units", "units.id", "items.unitId")
        .innerJoin("courses", "courses.id", "units.courseId")
        .innerJoin("users", "users.id", "cards.userId")
        .select([
          "items.id as itemId",
          "units.title as unitTitle",
          "items.term",
          "items.definition",
          "items.alternatives",
          "items.notes",
          "courses.id as courseId",
          "courses.title as courseTitle",
          "courses.targetLang",
          (eb) => eb.fn.coalesce("courses.gradingMode", "users.gradingMode").as("mode"),
          (eb) =>
            eb.fn
              .coalesce("courses.accentSensitive", "users.accentSensitive")
              .as("accentSensitive"),
        ])
        .where("cards.userId", "=", userId)
        .where("cards.dueAt", "<=", sql<Date>`now()`)
        .where(visibleTo(userId))
        .orderBy("cards.dueAt")
        .orderBy("items.id")
        .limit(request.query.limit ?? DEFAULT_ALL_REVIEW_LIMIT)
        .execute();

      return {
        items: rows.map(({ mode, accentSensitive, ...item }) => ({
          ...item,
          isNew: false,
          grading: { mode, accentSensitive } satisfies GradingOptions,
        })),
      };
    },
  );

  app.post(
    "/study/answers",
    {
      schema: {
        tags: ["study"],
        description:
          "Grade a typed answer (server-authoritative), update the FSRS card and log the review. Hints cap the rating: any hint at Hard, the whole term at Again.",
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

      const hints = Math.min(request.body.hints ?? 0, maxHints(item.term));
      const result = gradeAnswer(answer, [item.term, ...item.alternatives], settings.grading);
      const rating = ratingForAnswer(result.verdict, hints, item.term);
      const now = new Date();

      const { card, reviewId } = await db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom("cards")
          .selectAll()
          .where("userId", "=", userId)
          .where("itemId", "=", itemId)
          .forUpdate()
          .executeTakeFirst();
        const current = existing ?? scheduler.newCard(userId, itemId, now);
        const reviewed = scheduler.review(current, rating, now);
        await trx
          .insertInto("cards")
          .values(reviewed.row)
          .onConflict((oc) => oc.columns(["userId", "itemId"]).doUpdateSet(cardState(reviewed.row)))
          .execute();
        const log = await trx
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
            hints,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { card: reviewed.row, reviewId: log.id };
      });

      return {
        verdict: result.verdict,
        matched: result.matched,
        term: item.term,
        rating,
        nextDue: card.dueAt.toISOString(),
        reviewId,
        overridden: false,
      };
    },
  );

  /**
   * The learner's answer `reviewId` with its card, locked, if it is their
   * latest answer and at most ANSWER_WINDOW_MINUTES old; else 404 or 409.
   */
  async function latestAnswer(trx: Transaction<DB>, userId: string, reviewId: string) {
    const log = await trx
      .selectFrom("reviewLogs")
      .selectAll()
      .where("id", "=", reviewId)
      .where("userId", "=", userId)
      .executeTakeFirst();
    if (!log) throw app.httpErrors.notFound("Answer not found");
    const card = await trx
      .selectFrom("cards")
      .selectAll()
      .where("userId", "=", userId)
      .where("itemId", "=", log.itemId)
      .forUpdate()
      .executeTakeFirst();
    const latest = await trx
      .selectFrom("reviewLogs")
      .select("id")
      .where("userId", "=", userId)
      .orderBy("reviewedAt", "desc")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!card || latest?.id !== log.id) {
      throw app.httpErrors.conflict("Only your latest answer can be changed.");
    }
    if (Date.now() - log.reviewedAt.getTime() > ANSWER_WINDOW_MS) {
      throw app.httpErrors.conflict(
        `Answers can only be changed for ${ANSWER_WINDOW_MINUTES} minutes.`,
      );
    }
    const { createdAt: _c, ...row } = card;
    return { log, card: row };
  }

  app.post(
    "/study/answers/:id/override",
    {
      schema: {
        tags: ["study"],
        description: `"I was right": count a wrong or typo answer as correct (Good, capped by its hints). The card is rescheduled from its state before the answer; the review log keeps the grader's verdict and records the override. Only the learner's latest answer, within ${ANSWER_WINDOW_MINUTES} minutes.`,
        params: IdParamsSchema,
        response: { 200: AnswerResultSchema, 404: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      return db.transaction().execute(async (trx) => {
        const { log, card } = await latestAnswer(trx, userId, request.params.id);
        if (log.verdict === "exact" || log.overriddenAt) {
          throw app.httpErrors.conflict("Only a wrong or misspelt answer can be overridden.");
        }
        const item = await trx
          .selectFrom("items")
          .innerJoin("units", "units.id", "items.unitId")
          .select(["items.term", "items.alternatives", "units.courseId"])
          .where("items.id", "=", log.itemId)
          .executeTakeFirstOrThrow();
        const rating = ratingForAnswer("exact", log.hints, item.term);
        if (rating <= log.rating) {
          throw app.httpErrors.conflict("With those hints, overriding wouldn't change the rating.");
        }
        const before = scheduler.rollback(card, log.revlog);
        const redone = scheduler.review(before.row, rating, log.reviewedAt);
        await trx
          .updateTable("cards")
          .set(cardState(redone.row))
          .where("userId", "=", userId)
          .where("itemId", "=", log.itemId)
          .execute();
        await trx
          .updateTable("reviewLogs")
          .set({ rating, revlog: JSON.stringify(redone.revlog), overriddenAt: new Date() })
          .where("id", "=", log.id)
          .execute();
        const settings = await gradingFor(trx, userId, item.courseId);
        const graded = gradeAnswer(
          log.answer,
          [item.term, ...item.alternatives],
          settings?.grading,
        );
        return {
          verdict: log.verdict as "typo" | "wrong",
          matched: graded.matched,
          term: item.term,
          rating,
          nextDue: redone.row.dueAt.toISOString(),
          reviewId: log.id,
          overridden: true,
        };
      });
    },
  );

  app.post(
    "/study/answers/:id/undo",
    {
      schema: {
        tags: ["study"],
        description: `Undo an answer: the card goes back to exactly its state before it (a first answer removes the card, so the word is new again) and the review log entry is deleted. Only the learner's latest answer, within ${ANSWER_WINDOW_MINUTES} minutes.`,
        params: IdParamsSchema,
        response: { 200: UndoResultSchema, 404: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      return db.transaction().execute(async (trx) => {
        const { log, card } = await latestAnswer(trx, userId, request.params.id);
        const before = scheduler.rollback(card, log.revlog);
        // A card that was new had no row: the word is unlearned again.
        if (before.isNew) {
          await trx
            .deleteFrom("cards")
            .where("userId", "=", userId)
            .where("itemId", "=", log.itemId)
            .execute();
        } else {
          await trx
            .updateTable("cards")
            .set(cardState(before.row))
            .where("userId", "=", userId)
            .where("itemId", "=", log.itemId)
            .execute();
        }
        await trx.deleteFrom("reviewLogs").where("id", "=", log.id).execute();
        return { itemId: log.itemId };
      });
    },
  );
};
