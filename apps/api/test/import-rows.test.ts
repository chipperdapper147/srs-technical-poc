/** POST /courses/:id/import/rows: words the client parsed, into one unit. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseImport } from "../src/shared.ts";
import { SAMPLE_CSV, setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

async function createCourse() {
  const res = await app.inject({
    method: "POST",
    url: "/courses",
    payload: { title: "Test Spanish", sourceLang: "en", targetLang: "es" },
  });
  return res.json().id as string;
}

const importRows = (id: string, payload: object) =>
  app.inject({ method: "POST", url: `/courses/${id}/import/rows`, payload });

describe("row import", () => {
  it("creates a new unit at the end with the words in order", async () => {
    const id = await createCourse();
    await app.inject({
      method: "POST",
      url: `/courses/${id}/import`,
      payload: { csv: SAMPLE_CSV },
    });
    const res = await importRows(id, {
      unit: "  Animals ",
      rows: [
        { term: "el perro", definition: "the dog" },
        { term: "el gato", definition: "the cat", alternatives: ["gato"], notes: "m." },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ unitsCreated: 1, itemsCreated: 2 });
    const detail = (await app.inject(`/courses/${id}`)).json();
    expect(detail.units.at(-1)).toMatchObject({ title: "Animals", position: 3, itemCount: 2 });
    const items = await db
      .selectFrom("items")
      .innerJoin("units", "units.id", "items.unitId")
      .select(["items.term", "items.definition", "items.alternatives", "items.notes"])
      .where("units.title", "=", "Animals")
      .orderBy("items.position")
      .execute();
    expect(items).toEqual([
      { term: "el perro", definition: "the dog", alternatives: [], notes: "" },
      { term: "el gato", definition: "the cat", alternatives: ["gato"], notes: "m." },
    ]);
  });

  it("appends to an existing unit with the same title", async () => {
    const id = await createCourse();
    await app.inject({
      method: "POST",
      url: `/courses/${id}/import`,
      payload: { csv: SAMPLE_CSV },
    });
    const res = await importRows(id, {
      unit: "Food",
      rows: [{ term: "el pan", definition: "bread" }],
    });
    expect(res.json()).toEqual({ unitsCreated: 0, itemsCreated: 1 });
    const detail = (await app.inject(`/courses/${id}`)).json();
    expect(detail.units).toMatchObject([
      { title: "Basics", itemCount: 3 },
      { title: "Food", itemCount: 2 },
    ]);
  });

  it("imports what the shared Anki parser produced from an export", async () => {
    const id = await createCourse();
    const parsed = parseImport(
      "#separator:tab\n#html:true\n#tags column:3\nel perro\t<b>the dog</b>\tanimals\n",
    );
    const res = await importRows(id, { unit: "Anki", rows: parsed.words });
    expect(res.json()).toEqual({ unitsCreated: 1, itemsCreated: 1 });
    const item = await db.selectFrom("items").select(["term", "definition"]).executeTakeFirst();
    expect(item).toEqual({ term: "el perro", definition: "the dog" });
  });

  it.each([
    ["no rows", { unit: "U", rows: [] }],
    ["an empty unit title", { unit: "  ", rows: [{ term: "a", definition: "b" }] }],
    ["a blank term", { unit: "U", rows: [{ term: " ", definition: "b" }] }],
    [
      "a term over 500 characters",
      { unit: "U", rows: [{ term: "a".repeat(501), definition: "b" }] },
    ],
    ["a NUL character", { unit: "U", rows: [{ term: "a\u0000b", definition: "b" }] }],
  ])("rejects %s with 400 and imports nothing", async (_, payload) => {
    const id = await createCourse();
    const res = await importRows(id, payload);
    expect(res.statusCode).toBe(400);
    expect(await db.selectFrom("items").select("id").execute()).toEqual([]);
  });

  it("treats shared courses as read-only and other learners' courses as missing", async () => {
    const { id: shared } = await db
      .insertInto("courses")
      .values({ title: "Shared", sourceLang: "en", targetLang: "es" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const body = { unit: "U", rows: [{ term: "a", definition: "b" }] };
    expect((await importRows(shared, body)).statusCode).toBe(403);
    const mine = await createCourse();
    const other = await app.inject({
      method: "POST",
      url: `/courses/${mine}/import/rows`,
      headers: { "x-dev-user": "someone-else" },
      payload: body,
    });
    expect(other.statusCode).toBe(404);
  });
});
