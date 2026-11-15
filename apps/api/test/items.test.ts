import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_CSV, setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

const as = (user: string) => ({ "x-dev-user": user });

/** A course owned by `user` with SAMPLE_CSV's two units (Basics: 3 words, Food: 1). */
async function ownCourse(user = "owner") {
  const course = (
    await app.inject({
      method: "POST",
      url: "/courses",
      headers: as(user),
      payload: { title: "Mine", sourceLang: "en", targetLang: "es" },
    })
  ).json();
  await app.inject({
    method: "POST",
    url: `/courses/${course.id}/import`,
    headers: as(user),
    payload: { csv: SAMPLE_CSV },
  });
  return course.id as string;
}

async function sharedCourse() {
  const { id } = await db
    .insertInto("courses")
    .values({ title: "Shared", sourceLang: "en", targetLang: "es" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const unit = await db
    .insertInto("units")
    .values({ courseId: id, position: 1, title: "Basics" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const item = await db
    .insertInto("items")
    .values({ unitId: unit.id, position: 1, term: "hola", definition: "hello" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { courseId: id, unitId: unit.id, itemId: item.id };
}

async function list(courseId: string, user = "owner", q?: string) {
  const query = q === undefined ? "" : `?q=${encodeURIComponent(q)}`;
  return app.inject({ url: `/courses/${courseId}/items${query}`, headers: as(user) });
}

async function unitIds(courseId: string, user = "owner") {
  const detail = (await app.inject({ url: `/courses/${courseId}`, headers: as(user) })).json();
  return detail.units.map((u: { id: string }) => u.id) as string[];
}

function add(courseId: string, unitId: string, payload: object, user = "owner") {
  return app.inject({
    method: "POST",
    url: `/courses/${courseId}/units/${unitId}/items`,
    headers: as(user),
    payload,
  });
}

describe("GET /courses/:id/items", () => {
  it("lists a course's items in course order", async () => {
    const id = await ownCourse();
    const res = await list(id);
    expect(res.statusCode).toBe(200);
    const [basics, food] = await unitIds(id);
    expect(res.json().items).toEqual([
      expect.objectContaining({ unitId: basics, position: 1, term: "hola", definition: "hello" }),
      expect.objectContaining({ unitId: basics, position: 2, term: "gracias" }),
      expect.objectContaining({
        unitId: basics,
        position: 3,
        term: "la biblioteca",
        alternatives: ["biblioteca"],
        notes: 'False friend: "librería" = bookshop',
      }),
      expect.objectContaining({ unitId: food, position: 1, term: "el agua" }),
    ]);
  });

  it("searches term, definition and alternatives, ignoring case and accents", async () => {
    const id = await ownCourse();
    const terms = async (q: string) =>
      (await list(id, "owner", q)).json().items.map((i: { term: string }) => i.term);
    expect(await terms("BIBLIO")).toEqual(["la biblioteca"]);
    expect(await terms("thank")).toEqual(["gracias"]);
    expect(await terms("agua")).toEqual(["el agua"]);
    expect(await terms("")).toHaveLength(4);
    expect(await terms("nothing like it")).toEqual([]);

    const [basics] = await unitIds(id);
    await add(id, basics as string, { term: "la canción", definition: "song" });
    expect(await terms("cancion")).toEqual(["la canción"]);
  });

  it("lets learners search shared courses, and hides other learners' courses", async () => {
    const { courseId } = await sharedCourse();
    expect((await list(courseId, "learner", "HOLA")).json().items).toHaveLength(1);
    const theirs = await ownCourse("alice");
    expect((await list(theirs, "bob")).statusCode).toBe(404);
  });
});

describe("POST /courses/:id/units/:unitId/items", () => {
  it("appends to the end of the unit, with defaults for alternatives and notes", async () => {
    const id = await ownCourse();
    const [basics] = await unitIds(id);
    const res = await add(id, basics as string, { term: "  adiós ", definition: "goodbye" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      unitId: basics,
      position: 4,
      term: "adiós",
      definition: "goodbye",
      alternatives: [],
      notes: "",
    });
    const second = await add(id, basics as string, {
      term: "buenos días",
      definition: "good morning",
      alternatives: ["buen día"],
      notes: "Until lunch",
    });
    expect(second.json()).toMatchObject({ position: 5, alternatives: ["buen día"] });

    const detail = (await app.inject({ url: `/courses/${id}`, headers: as("owner") })).json();
    expect(detail).toMatchObject({ itemCount: 6, units: [{ itemCount: 5 }, { itemCount: 1 }] });
  });

  it("serves an added word in the next learn session", async () => {
    const id = await ownCourse();
    const [, food] = await unitIds(id);
    await add(id, food as string, { term: "el pan", definition: "bread" });
    const session = await app.inject({
      url: `/courses/${id}/study?mode=learn&limit=10`,
      headers: as("owner"),
    });
    expect(session.json().items.map((i: { term: string }) => i.term)).toContain("el pan");
  });

  it("rejects an empty term or definition and bad alternatives", async () => {
    const id = await ownCourse();
    const [basics] = await unitIds(id);
    for (const payload of [
      { term: "   ", definition: "x" },
      { term: "x", definition: "" },
      { definition: "x" },
      { term: "x", definition: "y", alternatives: [""] },
      { term: "x", definition: "y", alternatives: "a|b" },
    ]) {
      expect((await add(id, basics as string, payload)).statusCode).toBe(400);
    }
  });

  it("is 404 for shared courses, other learners' courses and units of another course", async () => {
    const shared = await sharedCourse();
    const word = { term: "x", definition: "y" };
    expect((await add(shared.courseId, shared.unitId, word)).statusCode).toBe(404);

    const theirs = await ownCourse("alice");
    const [theirUnit] = await unitIds(theirs, "alice");
    expect((await add(theirs, theirUnit as string, word, "bob")).statusCode).toBe(404);

    const mine = await ownCourse();
    expect((await add(mine, theirUnit as string, word)).statusCode).toBe(404);
    expect((await list(theirs, "alice")).json().items).toHaveLength(4);
  });
});

describe("PATCH /items/:id", () => {
  async function firstItem(courseId: string, user = "owner") {
    return (await list(courseId, user)).json().items[0] as { id: string };
  }
  const patch = (id: string, payload: object, user = "owner") =>
    app.inject({ method: "PATCH", url: `/items/${id}`, headers: as(user), payload });

  it("changes only the named fields", async () => {
    const id = await ownCourse();
    const item = await firstItem(id);
    const res = await patch(item.id, { alternatives: ["buenas", "qué tal"], notes: "Informal" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: item.id,
      term: "hola",
      definition: "hello",
      alternatives: ["buenas", "qué tal"],
      notes: "Informal",
    });
    const renamed = await patch(item.id, { term: "¡hola!" });
    expect(renamed.json()).toMatchObject({ term: "¡hola!", alternatives: ["buenas", "qué tal"] });
    expect((await patch(item.id, {})).json()).toMatchObject({ term: "¡hola!" });
  });

  it("grades answers against the edited word", async () => {
    const id = await ownCourse();
    const item = await firstItem(id);
    await patch(item.id, { term: "buenas" });
    const answer = await app.inject({
      method: "POST",
      url: "/study/answers",
      headers: as("owner"),
      payload: { itemId: item.id, answer: "buenas" },
    });
    expect(answer.json()).toMatchObject({ verdict: "exact", term: "buenas" });
  });

  it("rejects an empty term", async () => {
    const id = await ownCourse();
    const item = await firstItem(id);
    expect((await patch(item.id, { term: "" })).statusCode).toBe(400);
  });

  it("is 404 for shared items, other learners' items and unknown ids", async () => {
    const shared = await sharedCourse();
    expect((await patch(shared.itemId, { term: "adiós" })).statusCode).toBe(404);
    const theirs = await firstItem(await ownCourse("alice"), "alice");
    expect((await patch(theirs.id, { term: "x" }, "bob")).statusCode).toBe(404);
    expect((await patch(theirs.id, {}, "bob")).statusCode).toBe(404);
    expect((await patch("00000000-0000-4000-8000-000000000000", { term: "x" })).statusCode).toBe(
      404,
    );
    const unchanged = await db
      .selectFrom("items")
      .select("term")
      .where("id", "=", shared.itemId)
      .executeTakeFirstOrThrow();
    expect(unchanged.term).toBe("hola");
  });
});

describe("DELETE /items/:id", () => {
  const remove = (id: string, user = "owner") =>
    app.inject({ method: "DELETE", url: `/items/${id}`, headers: as(user) });

  it("deletes the item with its cards and review history", async () => {
    const id = await ownCourse();
    const [item] = (await list(id)).json().items as { id: string; term: string }[];
    if (!item) throw new Error("no item");
    await app.inject({
      method: "POST",
      url: "/study/answers",
      headers: as("owner"),
      payload: { itemId: item.id, answer: item.term },
    });
    const count = async (table: "cards" | "reviewLogs") =>
      Number(
        (
          await db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("itemId", "=", item.id)
            .executeTakeFirstOrThrow()
        ).n,
      );
    expect(await count("cards")).toBe(1);
    expect(await count("reviewLogs")).toBe(1);

    const res = await remove(item.id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(await count("cards")).toBe(0);
    expect(await count("reviewLogs")).toBe(0);
    expect((await list(id)).json().items).toHaveLength(3);
    expect((await remove(item.id)).statusCode).toBe(404);
  });

  it("is 404 for shared items and other learners' items, which stay", async () => {
    const shared = await sharedCourse();
    expect((await remove(shared.itemId)).statusCode).toBe(404);
    const theirs = await ownCourse("alice");
    const [item] = (await list(theirs, "alice")).json().items as { id: string }[];
    expect((await remove(item?.id as string, "bob")).statusCode).toBe(404);
    expect((await list(theirs, "alice")).json().items).toHaveLength(4);
    expect((await list(shared.courseId, "learner")).json().items).toHaveLength(1);
  });
});

describe("CORS", () => {
  it("allows DELETE from the web app", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/items/00000000-0000-4000-8000-000000000000",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "DELETE",
      },
    });
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
  });
});
