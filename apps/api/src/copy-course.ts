/**
 * Copy a course for a learner: a new course they own, with the same
 * settings, units and items (terms, definitions, alternatives, notes). The
 * copy starts fresh, with no cards or history, and shares no rows with the
 * source, so later changes to either side leave the other alone.
 *
 * One transaction, three set-based INSERT … SELECT statements: the course,
 * its units, then its items, each item joined to its new unit through the
 * unit's position (unique within a course).
 */
import { sql } from "kysely";
import type { Database } from "./db/index.ts";

/** Returns the new course's id, or undefined when the source doesn't exist. */
export async function copyCourse(
  db: Database,
  sourceId: string,
  ownerId: string,
): Promise<string | undefined> {
  return db.transaction().execute(async (trx) => {
    const course = await trx
      .insertInto("courses")
      .columns([
        "ownerId",
        "title",
        "description",
        "sourceLang",
        "targetLang",
        "gradingMode",
        "accentSensitive",
      ])
      .expression((eb) =>
        eb
          .selectFrom("courses")
          .select([
            sql<string>`${ownerId}::uuid`.as("ownerId"),
            "title",
            "description",
            "sourceLang",
            "targetLang",
            "gradingMode",
            "accentSensitive",
          ])
          .where("id", "=", sourceId),
      )
      .returning("id")
      .executeTakeFirst();
    if (!course) return undefined;

    await trx
      .insertInto("units")
      .columns(["courseId", "position", "title"])
      .expression((eb) =>
        eb
          .selectFrom("units")
          .select([sql<string>`${course.id}::uuid`.as("courseId"), "position", "title"])
          .where("courseId", "=", sourceId),
      )
      .execute();

    await trx
      .insertInto("items")
      .columns(["unitId", "position", "term", "definition", "alternatives", "notes"])
      .expression((eb) =>
        eb
          .selectFrom("items")
          .innerJoin("units as source", "source.id", "items.unitId")
          .innerJoin("units as copy", (join) =>
            join.onRef("copy.position", "=", "source.position").on("copy.courseId", "=", course.id),
          )
          .select([
            "copy.id as unitId",
            "items.position",
            "items.term",
            "items.definition",
            "items.alternatives",
            "items.notes",
          ])
          .where("source.courseId", "=", sourceId),
      )
      .execute();

    return course.id;
  });
}
