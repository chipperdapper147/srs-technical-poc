/**
 * Prebuilt courses: shared courses (no owner, so read-only for learners)
 * that every environment gets, through the same CSV import path users get.
 *
 * Each has a stable key. A course is inserted only while its key is missing
 * from the `prebuilt_courses` ledger, and the key is recorded in the same
 * transaction. From then on it is never inserted again, whatever happens to
 * the course: edited, renamed or deleted, it stays that way. Nothing here
 * deletes or overwrites.
 *
 *   node src/db/prebuilt.ts      loads them into DATABASE_URL
 *
 * The API's Vercel build runs this after migrations
 * (scripts/deploy/migrate.ts); `pnpm db:seed` runs it locally.
 */
import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { importVocabulary } from "../import.ts";
import { createDb, type Database } from "./index.ts";

export interface CourseSource {
  /** Stable identity in the ledger. Never change it: a new key inserts the course again. */
  key: string;
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  /** The words, in the import format: unit,term,definition,alternatives,notes. */
  csv: URL;
}

const data = (file: string) => new URL(`../../../../db/courses/${file}`, import.meta.url);

export const PREBUILT_COURSES: readonly CourseSource[] = [
  {
    // Ranking: UN World Population Prospects 2024 (the latest edition in
    // November 2026), the estimates for 1 July 2023, its latest estimate
    // year. Rows are in that order. English country and capital names.
    // Accents are optional unless a learner turns them on ("Brasilia"
    // passes for "Brasília"), and punctuation is ignored, so the
    // alternatives are only other names: "Washington", "Delhi", "Ha Noi"…
    key: "capitals-20-most-populous",
    title: "Capitals of the 20 most populous countries",
    description:
      "Type the capital of each country. Ranked by population in the UN World Population Prospects 2024.",
    sourceLang: "en",
    targetLang: "en",
    csv: data("capitals-20-most-populous.csv"),
  },
];

/**
 * - `created`: inserted now.
 * - `recorded`: no ledger row yet, but a shared course with this exact
 *   title was already there (loaded before the ledger existed); recorded
 *   as this key, unchanged.
 * - `present`: the key was recorded before; nothing done. `courseId` is
 *   null once the course has been deleted.
 */
export type EnsureResult = { key: string; title: string } & (
  | { status: "created"; courseId: string; unitsCreated: number; itemsCreated: number }
  | { status: "recorded"; courseId: string }
  | { status: "present"; courseId: string | null }
);

/** Insert the course unless its key is in the ledger. */
export async function ensureCourse(db: Database, course: CourseSource): Promise<EnsureResult> {
  const csv = await readFile(course.csv, "utf8");
  const { key, title } = course;
  return db.transaction().execute(async (trx) => {
    // Two deploys of the same database at once must not both insert it.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`prebuilt-course:${key}`}))`.execute(trx);
    const recorded = await trx
      .selectFrom("prebuiltCourses")
      .select("courseId")
      .where("key", "=", key)
      .executeTakeFirst();
    if (recorded) return { key, title, status: "present", courseId: recorded.courseId };

    const existing = await trx
      .selectFrom("courses")
      .select("id")
      .where("title", "=", title)
      .where("ownerId", "is", null)
      .orderBy("createdAt")
      .executeTakeFirst();
    if (existing) {
      await trx.insertInto("prebuiltCourses").values({ key, courseId: existing.id }).execute();
      return { key, title, status: "recorded", courseId: existing.id };
    }

    const { id } = await trx
      .insertInto("courses")
      .values({
        title,
        description: course.description,
        sourceLang: course.sourceLang,
        targetLang: course.targetLang,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const imported = await importVocabulary(trx, id, csv);
    await trx.insertInto("prebuiltCourses").values({ key, courseId: id }).execute();
    return { key, title, status: "created", courseId: id, ...imported };
  });
}

export async function ensurePrebuiltCourses(
  db: Database,
  courses: readonly CourseSource[] = PREBUILT_COURSES,
): Promise<EnsureResult[]> {
  const results = [];
  for (const course of courses) results.push(await ensureCourse(db, course));
  return results;
}

export function describe(result: EnsureResult): string {
  switch (result.status) {
    case "created":
      return `created "${result.title}" (${result.unitsCreated} units, ${result.itemsCreated} items)`;
    case "recorded":
      return `"${result.title}" was already here; recorded it as ${result.key}, unchanged`;
    case "present":
      return result.courseId
        ? `${result.key} was loaded before; left as it is`
        : `${result.key} was loaded before and its course deleted since; not inserting it again`;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  try {
    for (const result of await ensurePrebuiltCourses(db)) {
      console.log(`prebuilt courses: ${describe(result)}`);
    }
  } finally {
    await db.destroy();
  }
}

if (import.meta.main) await main();
