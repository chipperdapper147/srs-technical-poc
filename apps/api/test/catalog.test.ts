import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importVocabulary } from "../src/import.ts";
import { SAMPLE_CSV, setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

type Headers = Record<string, string>;
const alice: Headers = { "x-dev-user": "alice" };
const bob: Headers = { "x-dev-user": "bob" };

/** A shared course (no owner), as the prebuilt ones are, optionally with words. */
async function sharedCourse(
  fields: { title: string; description?: string; targetLang?: string },
  csv?: string,
) {
  const { id } = await db
    .insertInto("courses")
    .values({ sourceLang: "en", targetLang: "es", ...fields })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (csv) await importVocabulary(db, id, csv);
  return id;
}

async function ownCourse(headers: Headers, title = "Mine") {
  const res = await app.inject({
    method: "POST",
    url: "/courses",
    headers,
    payload: { title, sourceLang: "en", targetLang: "es" },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

const catalog = async (query = "", headers: Headers = alice) => {
  const res = await app.inject({ url: `/catalog${query}`, headers });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    courses: { id: string; title: string; itemCount: number }[];
    targetLangs: string[];
  };
};
const titles = async (query = "") => (await catalog(query)).courses.map((c) => c.title);

const copy = (id: string, headers: Headers = alice) =>
  app.inject({ method: "POST", url: `/courses/${id}/copy`, headers });

/** Units and words of a course, without ids, in course order. */
async function contents(courseId: string) {
  return db
    .selectFrom("items")
    .innerJoin("units", "units.id", "items.unitId")
    .select([
      "units.position as unitPosition",
      "units.title as unitTitle",
      "items.position",
      "items.term",
      "items.definition",
      "items.alternatives",
      "items.notes",
    ])
    .where("units.courseId", "=", courseId)
    .orderBy("units.position")
    .orderBy("items.position")
    .execute();
}

const itemIds = async (courseId: string) =>
  (
    await db
      .selectFrom("items")
      .innerJoin("units", "units.id", "items.unitId")
      .select("items.id")
      .where("units.courseId", "=", courseId)
      .execute()
  ).map((i) => i.id);

const cardsOn = async (courseId: string) => {
  const ids = await itemIds(courseId);
  if (ids.length === 0) return 0;
  const { n } = await db
    .selectFrom("cards")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("itemId", "in", ids)
    .executeTakeFirstOrThrow();
  return Number(n);
};

/** Answer every new word of a course correctly, as `headers`' learner. */
async function learnAll(courseId: string, headers: Headers) {
  const { items } = (
    await app.inject({ url: `/courses/${courseId}/study?mode=learn&limit=50`, headers })
  ).json() as { items: { itemId: string; term: string }[] };
  for (const item of items) {
    const res = await app.inject({
      method: "POST",
      url: "/study/answers",
      headers,
      payload: { itemId: item.itemId, answer: item.term },
    });
    expect(res.statusCode).toBe(200);
  }
  return items.map((i) => i.itemId);
}

describe("GET /catalog", () => {
  it("lists shared courses by title with word counts, and no learner's own courses", async () => {
    const spanish = await sharedCourse({ title: "Spanish basics" }, SAMPLE_CSV);
    await sharedCourse({ title: "Empty French", targetLang: "fr" });
    await ownCourse(alice, "Alice's own");
    await ownCourse(bob, "Bob's own");

    const { courses, targetLangs } = await catalog();
    expect(courses).toEqual([
      expect.objectContaining({ title: "Empty French", targetLang: "fr", itemCount: 0 }),
      {
        id: spanish,
        title: "Spanish basics",
        description: "",
        sourceLang: "en",
        targetLang: "es",
        itemCount: 4,
      },
    ]);
    expect(targetLangs).toEqual(["es", "fr"]);
  });

  it("searches title and description, ignoring case, with wildcards taken literally", async () => {
    await sharedCourse({ title: "Capitals of the world", description: "Geography" });
    await sharedCourse({ title: "Kitchen words", description: "Food and cooking verbs" });
    await sharedCourse({ title: "Top 100% verbs", description: "" });

    expect(await titles("?q=capital")).toEqual(["Capitals of the world"]);
    expect(await titles("?q=COOKING")).toEqual(["Kitchen words"]);
    expect(await titles("?q=verbs")).toEqual(["Kitchen words", "Top 100% verbs"]);
    expect(await titles(`?q=${encodeURIComponent("%")}`)).toEqual(["Top 100% verbs"]);
    expect(await titles("?q=_")).toEqual([]);
    expect(await titles("?q=nothing-like-this")).toEqual([]);
    // Blank searches match everything.
    expect(await titles("?q=%20%20")).toHaveLength(3);
  });

  it("filters by target language, case-insensitively, and keeps every language listed", async () => {
    await sharedCourse({ title: "Spanish", targetLang: "es" });
    await sharedCourse({ title: "Brazilian Portuguese", targetLang: "pt-BR" });
    await sharedCourse({ title: "French verbs", targetLang: "fr" });

    expect(await titles("?targetLang=pt-br")).toEqual(["Brazilian Portuguese"]);
    const filtered = await catalog("?targetLang=fr&q=verbs");
    expect(filtered.courses.map((c) => c.title)).toEqual(["French verbs"]);
    expect(filtered.targetLangs).toEqual(["es", "fr", "pt-BR"]);
    expect(await titles("?targetLang=es&q=verbs")).toEqual([]);
  });

  it("rejects a malformed language filter", async () => {
    const res = await app.inject({ url: "/catalog?targetLang=not a tag", headers: alice });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /courses/:id/copy", () => {
  it("copies settings, units and words into an editable course the learner owns, with no progress", async () => {
    const source = await sharedCourse(
      { title: "Spanish basics", description: "First words" },
      SAMPLE_CSV,
    );
    await db
      .updateTable("courses")
      .set({ gradingMode: "strict", accentSensitive: true })
      .where("id", "=", source)
      .execute();
    // Progress on the source must not come along.
    await learnAll(source, alice);

    const res = await copy(source);
    expect(res.statusCode).toBe(201);
    const course = res.json();
    expect(course.id).not.toBe(source);
    expect(course).toMatchObject({
      title: "Spanish basics",
      description: "First words",
      sourceLang: "en",
      targetLang: "es",
      gradingMode: "strict",
      accentSensitive: true,
      editable: true,
      itemCount: 4,
      learnedCount: 0,
      dueCount: 0,
      units: [
        { title: "Basics", position: 1, itemCount: 3, learnedCount: 0 },
        { title: "Food", position: 2, itemCount: 1, learnedCount: 0 },
      ],
    });
    expect(await contents(course.id)).toEqual(await contents(source));
    expect((await contents(course.id)).find((i) => i.term === "la biblioteca")).toMatchObject({
      alternatives: ["biblioteca"],
      notes: 'False friend: "librería" = bookshop',
    });

    const owned = await db
      .selectFrom("courses")
      .innerJoin("users", "users.id", "courses.ownerId")
      .select("users.authSub")
      .where("courses.id", "=", course.id)
      .executeTakeFirstOrThrow();
    expect(owned.authSub).toBe("alice");
    expect(await cardsOn(course.id)).toBe(0);
    const history = await db
      .selectFrom("reviewLogs")
      .select("id")
      .where("itemId", "in", await itemIds(course.id))
      .execute();
    expect(history).toEqual([]);

    const learn = (
      await app.inject({ url: `/courses/${course.id}/study?mode=learn`, headers: alice })
    ).json();
    expect(learn.items.map((i: { term: string }) => i.term)).toEqual([
      "hola",
      "gracias",
      "la biblioteca",
      "el agua",
    ]);
  });

  it("copies an empty course", async () => {
    const source = await sharedCourse({ title: "Nothing yet" });
    const res = await copy(source);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: "Nothing yet", itemCount: 0, units: [] });
  });

  it("belongs to the learner who copied it, and copies are separate", async () => {
    const source = await sharedCourse({ title: "Shared" }, SAMPLE_CSV);
    const first = (await copy(source)).json().id as string;
    const second = (await copy(source)).json().id as string;
    expect(second).not.toBe(first);

    const list = (await app.inject({ url: "/courses", headers: alice })).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([source, first, second]);
    expect((await app.inject({ url: `/courses/${first}`, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ url: "/courses", headers: bob })).json()).toHaveLength(1);
    // A copy is the learner's, not shared: it isn't in the catalog.
    expect((await catalog()).courses.map((c) => c.id)).toEqual([source]);
  });

  it("copies shared courses only", async () => {
    const mine = await ownCourse(alice);
    const res = await copy(mine);
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe("Only shared courses can be copied");

    const bobs = await ownCourse(bob);
    expect((await copy(bobs)).statusCode).toBe(404);
    expect((await copy("00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    expect((await copy("not-a-uuid")).statusCode).toBe(400);
  });

  it("is independent of the source: studying, editing and deleting either side", async () => {
    const source = await sharedCourse({ title: "Shared" }, SAMPLE_CSV);
    const copied = (await copy(source)).json().id as string;
    const sourceItems = await itemIds(source);
    expect((await itemIds(copied)).some((id) => sourceItems.includes(id))).toBe(false);

    // Studying the copy leaves the source's cards alone.
    await learnAll(copied, alice);
    expect(await cardsOn(copied)).toBe(4);
    expect(await cardsOn(source)).toBe(0);
    const sourceDetail = (await app.inject({ url: `/courses/${source}`, headers: alice })).json();
    expect(sourceDetail).toMatchObject({ learnedCount: 0, editable: false });

    // The copy is editable; importing into it doesn't touch the source.
    const imported = await app.inject({
      method: "POST",
      url: `/courses/${copied}/import`,
      headers: alice,
      payload: { csv: "unit,term,definition\nTravel,el tren,train\n" },
    });
    expect(imported.json()).toEqual({ unitsCreated: 1, itemsCreated: 1 });
    expect(await itemIds(source)).toHaveLength(4);

    // Edits to the source don't reach the copy.
    await db.updateTable("items").set({ notes: "Edited" }).where("id", "in", sourceItems).execute();
    expect((await contents(copied)).map((i) => i.notes)).not.toContain("Edited");

    // Deleting the source keeps the copy and the learner's progress on it.
    await db.deleteFrom("courses").where("id", "=", source).execute();
    const after = (await app.inject({ url: `/courses/${copied}`, headers: alice })).json();
    expect(after).toMatchObject({ itemCount: 5, learnedCount: 4 });
  });
});
