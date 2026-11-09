import { parse } from "csv-parse/sync";
import type { Database } from "./db/index.ts";

export class CsvImportError extends Error {}

interface Row {
  unit: string;
  term: string;
  definition: string;
  alternatives: string[];
  notes: string;
}

const REQUIRED = ["unit", "term", "definition"] as const;

/** Parse the import CSV (header: unit,term,definition[,alternatives][,notes]). */
export function parseVocabularyCsv(csv: string): Row[] {
  let records: Record<string, string>[];
  try {
    records = parse(csv, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new CsvImportError(`Could not parse CSV: ${(err as Error).message}`);
  }
  if (records.length === 0) throw new CsvImportError("CSV has no rows");
  const first = records[0] ?? {};
  for (const col of REQUIRED) {
    if (!(col in first)) throw new CsvImportError(`CSV is missing the "${col}" column`);
  }
  return records.map((r, i) => {
    const line = i + 2;
    for (const col of REQUIRED) {
      if (!r[col]) throw new CsvImportError(`Row ${line}: "${col}" is empty`);
    }
    return {
      unit: r.unit as string,
      term: r.term as string,
      definition: r.definition as string,
      alternatives: (r.alternatives ?? "")
        .split("|")
        .map((a) => a.trim())
        .filter(Boolean),
      notes: r.notes ?? "",
    };
  });
}

/**
 * Append rows to a course. Rows go into the existing unit with the same
 * title, or a new unit at the end, preserving CSV order.
 */
export async function importVocabulary(db: Database, courseId: string, csv: string) {
  const rows = parseVocabularyCsv(csv);
  const inTransaction = <T>(fn: (trx: Database) => Promise<T>) =>
    db.isTransaction ? fn(db) : db.transaction().execute(fn);
  return inTransaction(async (trx) => {
    // Serialize concurrent imports into the same course.
    await trx.selectFrom("courses").select("id").where("id", "=", courseId).forUpdate().execute();
    const units = await trx
      .selectFrom("units")
      .leftJoin("items", "items.unitId", "units.id")
      .select(["units.id", "units.title", "units.position"])
      .select((eb) => eb.fn.coalesce(eb.fn.max("items.position"), eb.lit(0)).as("maxItem"))
      .where("units.courseId", "=", courseId)
      .groupBy("units.id")
      .execute();

    const byTitle = new Map(units.map((u) => [u.title, { id: u.id, next: Number(u.maxItem) + 1 }]));
    let nextUnitPosition = Math.max(0, ...units.map((u) => u.position)) + 1;
    let unitsCreated = 0;
    const items = [];

    for (const row of rows) {
      let unit = byTitle.get(row.unit);
      if (!unit) {
        const created = await trx
          .insertInto("units")
          .values({ courseId, title: row.unit, position: nextUnitPosition++ })
          .returning("id")
          .executeTakeFirstOrThrow();
        unit = { id: created.id, next: 1 };
        byTitle.set(row.unit, unit);
        unitsCreated++;
      }
      items.push({
        unitId: unit.id,
        position: unit.next++,
        term: row.term,
        definition: row.definition,
        alternatives: row.alternatives,
        notes: row.notes,
      });
    }

    await trx.insertInto("items").values(items).execute();
    return { unitsCreated, itemsCreated: items.length };
  });
}
