import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import type { Database } from "../db/index.ts";
import { CATALOG_LIMIT, CatalogQuerySchema, CatalogSchema, ErrorSchema } from "../shared.ts";

/** `%` and `_` are LIKE wildcards; a search for "50%" means those characters. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const catalogRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    "/catalog",
    {
      schema: {
        tags: ["catalog"],
        description:
          "Shared courses (prebuilt ones included) to browse and copy, searched by title and description and filtered by target language.",
        querystring: CatalogQuerySchema,
        response: { 200: CatalogSchema, 400: ErrorSchema },
      },
    },
    async (request) => {
      const { q, targetLang } = request.query;
      let courses = db
        .selectFrom("courses")
        .leftJoin("units", "units.courseId", "courses.id")
        .leftJoin("items", "items.unitId", "units.id")
        .select([
          "courses.id",
          "courses.title",
          "courses.description",
          "courses.sourceLang",
          "courses.targetLang",
        ])
        .select((eb) => eb.fn.count<string>("items.id").as("itemCount"))
        .where("courses.ownerId", "is", null)
        .groupBy("courses.id")
        .orderBy("courses.title")
        .orderBy("courses.id")
        .limit(CATALOG_LIMIT);
      if (q) {
        const pattern = likePattern(q);
        courses = courses.where((eb) =>
          eb.or([
            eb("courses.title", "ilike", pattern),
            eb("courses.description", "ilike", pattern),
          ]),
        );
      }
      if (targetLang) {
        courses = courses.where(sql`lower(courses.target_lang)`, "=", targetLang.toLowerCase());
      }
      const langs = await db
        .selectFrom("courses")
        .select("targetLang")
        .distinct()
        .where("ownerId", "is", null)
        .orderBy("targetLang")
        .execute();
      return {
        courses: (await courses.execute()).map((c) => ({ ...c, itemCount: Number(c.itemCount) })),
        targetLangs: langs.map((l) => l.targetLang),
      };
    },
  );
};
