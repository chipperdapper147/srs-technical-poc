/**
 * Prebuilt courses: shared courses (no owner, so read-only for learners)
 * that every environment gets. A course is inserted only if no shared course
 * with its title exists yet, through the same CSV import path users get. It
 * is never deleted or overwritten, so edits made later in the database stick.
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
    title: "Capitals of the 20 most populous countries",
    description:
      "Type the capital of each country. Ranked by population in the UN World Population Prospects 2024.",
    sourceLang: "en",
    targetLang: "en",
    csv: data("capitals-20-most-populous.csv"),
  },
];

export type EnsureResult =
  | { title: string; courseId: string; created: false }
  | { title: string; courseId: string; created: true; unitsCreated: number; itemsCreated: number };

/** Insert the course unless a shared course with its title exists. */
export async function ensureCourse(db: Database, course: CourseSource): Promise<EnsureResult> {
  const csv = await readFile(course.csv, "utf8");
  return db.transaction().execute(async (trx) => {
    // Two deploys of the same database at once must not both insert it.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`course:${course.title}`}))`.execute(trx);
    const existing = await trx
      .selectFrom("courses")
      .select("id")
      .where("title", "=", course.title)
      .where("ownerId", "is", null)
      .executeTakeFirst();
    if (existing) return { title: course.title, courseId: existing.id, created: false };

    const { id } = await trx
      .insertInto("courses")
      .values({
        title: course.title,
        description: course.description,
        sourceLang: course.sourceLang,
        targetLang: course.targetLang,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const imported = await importVocabulary(trx, id, csv);
    return { title: course.title, courseId: id, created: true, ...imported };
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
  return result.created
    ? `created "${result.title}" (${result.unitsCreated} units, ${result.itemsCreated} items)`
    : `"${result.title}" already present, left as it is`;
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
