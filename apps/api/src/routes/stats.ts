/**
 * Progress stats, computed in Postgres from `review_logs` and `cards`:
 * totals, retention, a review heatmap, streaks and the hardest words. Days
 * are calendar days in the learner's time zone, as in the dashboard.
 * `review_logs_user_id_reviewed_at_idx` serves every per-learner scan.
 */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import { addDays, isUnknownTimeZone, todayIn } from "../calendar.ts";
import type { Database } from "../db/index.ts";
import {
  ErrorSchema,
  HARDEST_WORDS_LIMIT,
  HEATMAP_DAYS,
  RETENTION_DAYS,
  type Stats,
  StatsQuerySchema,
  StatsSchema,
} from "../shared.ts";
import { NEW_STATE, REVIEW_STATE } from "../srs.ts";
import { visibleTo } from "./courses.ts";

interface Scope {
  userId: string;
  /** One course, or every course the learner can see. */
  courseId: string | undefined;
  timeZone: string;
}

/**
 * `<table>` (review_logs or cards) joined to its course, keeping the
 * learner's rows in the courses in scope. Ends in a WHERE clause, so
 * callers add conditions with AND.
 */
function from(table: "review_logs" | "cards", { userId, courseId }: Scope) {
  const t = sql.raw(table);
  return sql`${t}
    JOIN items ON items.id = ${t}.item_id
    JOIN units ON units.id = items.unit_id
    JOIN courses ON courses.id = units.course_id
    WHERE ${t}.user_id = ${userId}
      AND (courses.owner_id IS NULL OR courses.owner_id = ${userId})
      ${courseId === undefined ? sql`` : sql`AND courses.id = ${courseId}`}`;
}

/** A review's calendar day in the learner's time zone. */
const reviewDay = (timeZone: string) =>
  sql`(review_logs.reviewed_at AT TIME ZONE ${timeZone})::date`;

/** The instant `date` (YYYY-MM-DD) starts in `timeZone`. */
const startOf = (date: string, timeZone: string) =>
  sql`(${date}::date::timestamp AT TIME ZONE ${timeZone})`;

async function totals(db: Database, scope: Scope) {
  const { rows } = await sql<{ reviews: string; learned: string }>`
    SELECT (SELECT count(*) FROM ${from("review_logs", scope)}) AS reviews,
           (SELECT count(*) FROM ${from("cards", scope)} AND cards.state <> ${NEW_STATE}) AS learned
  `.execute(db);
  return {
    wordsLearned: Number(rows[0]?.learned ?? 0),
    reviewCount: Number(rows[0]?.reviews ?? 0),
  };
}

async function retention(db: Database, scope: Scope, today: string) {
  const { rows } = await sql<{ reviews: string; correct: string }>`
    SELECT count(*) AS reviews,
           count(*) FILTER (
             WHERE review_logs.verdict IN ('exact', 'typo') OR review_logs.overridden_at IS NOT NULL
           ) AS correct
    FROM ${from("review_logs", scope)}
      AND (review_logs.revlog ->> 'state')::int = ${REVIEW_STATE}
      AND review_logs.reviewed_at >= ${startOf(addDays(today, 1 - RETENTION_DAYS), scope.timeZone)}
  `.execute(db);
  return {
    days: RETENTION_DAYS,
    reviewCount: Number(rows[0]?.reviews ?? 0),
    correctCount: Number(rows[0]?.correct ?? 0),
  };
}

async function heatmap(db: Database, scope: Scope, today: string) {
  const first = addDays(today, 1 - HEATMAP_DAYS);
  const { rows } = await sql<{ day: string; n: string }>`
    SELECT to_char(${reviewDay(scope.timeZone)}, 'YYYY-MM-DD') AS day, count(*) AS n
    FROM ${from("review_logs", scope)}
      AND review_logs.reviewed_at >= ${startOf(first, scope.timeZone)}
    GROUP BY 1
  `.execute(db);
  const counts = new Map(rows.map((r) => [r.day, Number(r.n)]));
  return Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const date = addDays(first, i);
    return { date, reviewCount: counts.get(date) ?? 0 };
  });
}

/**
 * Gaps and islands: distinct review days minus their rank is constant
 * within a run of consecutive days, so grouping by it yields the runs.
 */
async function streak(db: Database, scope: Scope, today: string) {
  const { rows } = await sql<{ longest: string; current: string; reviewedToday: boolean }>`
    WITH days AS (
      SELECT DISTINCT ${reviewDay(scope.timeZone)} AS day FROM ${from("review_logs", scope)}
    ),
    runs AS (
      SELECT max(day) AS last_day, count(*) AS length
      FROM (SELECT day, day - (row_number() OVER (ORDER BY day))::int AS run FROM days) ranked
      GROUP BY run
    )
    SELECT coalesce(max(length), 0) AS longest,
           coalesce(max(length) FILTER (WHERE last_day >= ${today}::date - 1), 0) AS current,
           coalesce(bool_or(last_day >= ${today}::date), false) AS reviewed_today
    FROM runs
  `.execute(db);
  const row = rows[0];
  return {
    current: Number(row?.current ?? 0),
    longest: Number(row?.longest ?? 0),
    reviewedToday: row?.reviewedToday ?? false,
  };
}

async function hardestWords(db: Database, { userId, courseId }: Scope) {
  // An overridden answer ("I was right") counts as correct here, as in retention.
  const wrong = sql`count(review_logs.id) FILTER (
    WHERE review_logs.verdict = 'wrong' AND review_logs.overridden_at IS NULL
  )`;
  // Result keys arrive camelCase (CamelCasePlugin maps raw rows too).
  const { rows } = await sql<{
    itemId: string;
    term: string;
    definition: string;
    courseId: string;
    courseTitle: string;
    lapses: number;
    reviews: string;
    wrong: string;
  }>`
    SELECT items.id AS item_id, items.term, items.definition,
           courses.id AS course_id, courses.title AS course_title, cards.lapses,
           count(review_logs.id) AS reviews, ${wrong} AS wrong
    FROM cards
    JOIN items ON items.id = cards.item_id
    JOIN units ON units.id = items.unit_id
    JOIN courses ON courses.id = units.course_id
    LEFT JOIN review_logs
      ON review_logs.item_id = cards.item_id AND review_logs.user_id = cards.user_id
    WHERE cards.user_id = ${userId}
      AND (courses.owner_id IS NULL OR courses.owner_id = ${userId})
      ${courseId === undefined ? sql`` : sql`AND courses.id = ${courseId}`}
    GROUP BY items.id, courses.id, cards.lapses
    HAVING cards.lapses > 0 OR ${wrong} > 0
    ORDER BY cards.lapses DESC,
             ${wrong}::float / greatest(count(review_logs.id), 1) DESC,
             count(review_logs.id) DESC,
             items.term, items.id
    LIMIT ${HARDEST_WORDS_LIMIT}
  `.execute(db);
  return rows.map(({ reviews, wrong: wrongCount, lapses, ...word }) => ({
    ...word,
    lapses: Number(lapses),
    reviewCount: Number(reviews),
    wrongCount: Number(wrongCount),
  }));
}

export const statsRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    "/stats",
    {
      schema: {
        tags: ["stats"],
        description:
          "Progress for every course, or one: words learned, reviews done, retention over the last 30 days, reviews per day for 12 weeks, the current and longest streak of review days, and the hardest words. Days are counted in the given time zone.",
        querystring: StatsQuerySchema,
        response: { 200: StatsSchema, 400: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request): Promise<Stats> => {
      const { timeZone, courseId } = request.query;
      const scope: Scope = { userId: request.user.id, timeZone, courseId };
      if (scope.courseId !== undefined) {
        const course = await db
          .selectFrom("courses")
          .select("courses.id")
          .where("courses.id", "=", scope.courseId)
          .where(visibleTo(scope.userId))
          .executeTakeFirst();
        if (!course) throw app.httpErrors.notFound("Course not found");
      }
      try {
        const today = await todayIn(db, scope.timeZone);
        const [t, r, h, s, w] = await Promise.all([
          totals(db, scope),
          retention(db, scope, today),
          heatmap(db, scope, today),
          streak(db, scope, today),
          hardestWords(db, scope),
        ]);
        return {
          courseId: scope.courseId ?? null,
          today,
          totals: t,
          retention: r,
          heatmap: h,
          streak: s,
          hardestWords: w,
        };
      } catch (error) {
        if (isUnknownTimeZone(error)) {
          throw app.httpErrors.badRequest(`Unknown time zone "${scope.timeZone}"`);
        }
        throw error;
      }
    },
  );
};
