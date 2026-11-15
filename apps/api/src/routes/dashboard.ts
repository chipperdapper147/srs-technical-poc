import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import { addDays, isUnknownTimeZone, todayIn } from "../calendar.ts";
import type { Database } from "../db/index.ts";
import {
  DashboardQuerySchema,
  DashboardSchema,
  ErrorSchema,
  FORECAST_DAYS,
  type ForecastDay,
} from "../shared.ts";
import { summaries, toSummary } from "./courses.ts";

/**
 * Reviews per calendar day in `timeZone`, today first. Overdue reviews count
 * as today's, so day one is everything to do by the end of today.
 */
async function forecast(db: Database, userId: string, timeZone: string): Promise<ForecastDay[]> {
  const today = await todayIn(db, timeZone);
  const end = addDays(today, FORECAST_DAYS);

  const { rows } = await sql<{ day: string; n: string }>`
    SELECT to_char(greatest((cards.due_at AT TIME ZONE ${timeZone})::date, ${today}::date),
                   'YYYY-MM-DD') AS day,
           count(*) AS n
    FROM cards
    JOIN items ON items.id = cards.item_id
    JOIN units ON units.id = items.unit_id
    JOIN courses ON courses.id = units.course_id
    WHERE cards.user_id = ${userId}
      AND (courses.owner_id IS NULL OR courses.owner_id = ${userId})
      AND cards.due_at < (${end}::date::timestamp AT TIME ZONE ${timeZone})
    GROUP BY 1
  `.execute(db);
  const counts = new Map(rows.map((r) => [r.day, Number(r.n)]));
  return Array.from({ length: FORECAST_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return { date, dueCount: counts.get(date) ?? 0 };
  });
}

export const dashboardRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    "/dashboard",
    {
      schema: {
        tags: ["dashboard"],
        description:
          "Home screen summary: reviews due now per course and in total, and a forecast of reviews per day (today includes overdue ones) in the given time zone.",
        querystring: DashboardQuerySchema,
        response: { 200: DashboardSchema, 400: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user.id;
      const { timeZone } = request.query;
      const [courses, days] = await Promise.all([
        summaries(db, userId).execute(),
        forecast(db, userId, timeZone).catch((error: unknown) => {
          // Intl accepted the name but this Postgres' time zone database doesn't know it.
          if (isUnknownTimeZone(error)) {
            throw app.httpErrors.badRequest(`Unknown time zone "${timeZone}"`);
          }
          throw error;
        }),
      ]);
      const list = courses.map(toSummary).map((c) => ({
        id: c.id,
        title: c.title,
        sourceLang: c.sourceLang,
        targetLang: c.targetLang,
        dueCount: c.dueCount,
      }));
      return {
        dueCount: list.reduce((sum, c) => sum + c.dueCount, 0),
        courses: list,
        forecast: days,
      };
    },
  );
};
