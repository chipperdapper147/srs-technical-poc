/**
 * Idempotent development seed: one shared sample course loaded through the
 * same CSV import path users get. Run with `pnpm db:seed`.
 */
import { readFile } from "node:fs/promises";
import { loadEnv } from "../env.ts";
import { importVocabulary } from "../import.ts";
import { createDb } from "./index.ts";

const SAMPLE_TITLE = "Spanish basics (sample)";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

try {
  const existing = await db
    .selectFrom("courses")
    .select("id")
    .where("title", "=", SAMPLE_TITLE)
    .where("ownerId", "is", null)
    .executeTakeFirst();

  if (existing) {
    console.log(`Seed: "${SAMPLE_TITLE}" already present, skipping.`);
  } else {
    const csv = await readFile(
      new URL("../../../../db/seed/spanish-basics.csv", import.meta.url),
      "utf8",
    );
    const result = await db.transaction().execute(async (trx) => {
      const course = await trx
        .insertInto("courses")
        .values({
          title: SAMPLE_TITLE,
          description: "Placeholder content: three short units of everyday vocabulary.",
          sourceLang: "en",
          targetLang: "es",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return importVocabulary(trx, course.id, csv);
    });
    console.log(
      `Seed: created "${SAMPLE_TITLE}" (${result.unitsCreated} units, ${result.itemsCreated} items).`,
    );
  }
} finally {
  await db.destroy();
}
