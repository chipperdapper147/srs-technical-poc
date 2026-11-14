/**
 * Idempotent development seed: the prebuilt courses every environment gets,
 * plus a shared sample course that only local databases get, all loaded
 * through the same CSV import path users get. Run with `pnpm db:seed`.
 */
import { loadEnv } from "../env.ts";
import { createDb } from "./index.ts";
import { type CourseSource, describe, ensureCourse, ensurePrebuiltCourses } from "./prebuilt.ts";

// Loaded and recorded like a prebuilt course, so it too is inserted once.
// To get it back after deleting it, delete its prebuilt_courses row as well.
const SAMPLE: CourseSource = {
  key: "spanish-basics-sample",
  title: "Spanish basics (sample)",
  description: "Placeholder content: three short units of everyday vocabulary.",
  sourceLang: "en",
  targetLang: "es",
  csv: new URL("../../../../db/seed/spanish-basics.csv", import.meta.url),
};

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

try {
  console.log(`Seed: ${describe(await ensureCourse(db, SAMPLE))}`);
  for (const result of await ensurePrebuiltCourses(db)) console.log(`Seed: ${describe(result)}`);
} finally {
  await db.destroy();
}
