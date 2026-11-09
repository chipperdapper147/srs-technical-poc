import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_CSV, setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

async function createCourse(headers: Record<string, string> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/courses",
    headers,
    payload: { title: "Test Spanish", sourceLang: "en", targetLang: "es" },
  });
  expect(res.statusCode).toBe(201);
  const course = res.json();
  const imported = await app.inject({
    method: "POST",
    url: `/courses/${course.id}/import`,
    headers,
    payload: { csv: SAMPLE_CSV },
  });
  expect(imported.json()).toEqual({ unitsCreated: 2, itemsCreated: 4 });
  return course.id as string;
}

describe("health and docs", () => {
  it("reports healthy", async () => {
    const res = await app.inject("/health");
    expect(res.json()).toEqual({ ok: true });
  });

  it("serves an OpenAPI document generated from the Zod contracts", async () => {
    const res = await app.inject("/docs/json");
    expect(Object.keys(res.json().paths)).toContain("/study/answers");
  });
});

describe("dev auth stub", () => {
  it("creates the local user on first request", async () => {
    const res = await app.inject("/me");
    expect(res.json()).toMatchObject({ displayName: "Local learner", gradingMode: "lenient" });
  });

  it("isolates users by x-dev-user header", async () => {
    const id = await createCourse({ "x-dev-user": "alice" });
    const bob = await app.inject({ url: `/courses/${id}`, headers: { "x-dev-user": "bob" } });
    expect(bob.statusCode).toBe(404);
  });
});

describe("courses and import", () => {
  it("lists units with item counts", async () => {
    const id = await createCourse();
    const res = await app.inject(`/courses/${id}`);
    expect(res.json()).toMatchObject({
      itemCount: 4,
      learnedCount: 0,
      editable: true,
      units: [
        { title: "Basics", position: 1, itemCount: 3 },
        { title: "Food", position: 2, itemCount: 1 },
      ],
    });
  });

  it("appends to existing units on re-import", async () => {
    const id = await createCourse();
    const res = await app.inject({
      method: "POST",
      url: `/courses/${id}/import`,
      payload: { csv: "unit,term,definition\nFood,el pan,bread\nTravel,el tren,train\n" },
    });
    expect(res.json()).toEqual({ unitsCreated: 1, itemsCreated: 2 });
    const detail = (await app.inject(`/courses/${id}`)).json();
    expect(detail.units.map((u: { itemCount: number }) => u.itemCount)).toEqual([3, 2, 1]);
  });

  it("rejects CSV without required columns", async () => {
    const id = await createCourse();
    const res = await app.inject({
      method: "POST",
      url: `/courses/${id}/import`,
      payload: { csv: "word,meaning\nhola,hello\n" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/unit/);
  });

  it("validates language tags", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/courses",
      payload: { title: "Bad", sourceLang: "english", targetLang: "es" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("treats shared courses as read-only", async () => {
    const { id } = await db
      .insertInto("courses")
      .values({ title: "Shared", sourceLang: "en", targetLang: "es" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const res = await app.inject({
      method: "POST",
      url: `/courses/${id}/import`,
      payload: { csv: SAMPLE_CSV },
    });
    expect(res.statusCode).toBe(403);
  });

  it("updates only the fields a PATCH names", async () => {
    const id = await createCourse();
    const patch = (payload: object) =>
      app.inject({ method: "PATCH", url: `/courses/${id}`, payload });
    await patch({ description: "Travel words", gradingMode: "strict" });
    const res = await patch({ accentSensitive: true });
    expect(res.json()).toMatchObject({
      title: "Test Spanish",
      description: "Travel words",
      gradingMode: "strict",
      accentSensitive: true,
    });
  });
});

describe("study flow", () => {
  it("serves new items in course order, then schedules them once answered", async () => {
    const id = await createCourse();
    const learn = (await app.inject(`/courses/${id}/study?mode=learn&limit=2`)).json();
    expect(learn.items.map((i: { term: string }) => i.term)).toEqual(["hola", "gracias"]);

    const answer = await app.inject({
      method: "POST",
      url: "/study/answers",
      payload: { itemId: learn.items[0].itemId, answer: " Hola! ", durationMs: 1500 },
    });
    expect(answer.json()).toMatchObject({ verdict: "exact", rating: 3, term: "hola" });
    expect(new Date(answer.json().nextDue).getTime()).toBeGreaterThan(Date.now());

    const next = (await app.inject(`/courses/${id}/study?mode=learn&limit=2`)).json();
    expect(next.items.map((i: { term: string }) => i.term)).toEqual(["gracias", "la biblioteca"]);

    const detail = (await app.inject(`/courses/${id}`)).json();
    expect(detail).toMatchObject({ learnedCount: 1, dueCount: 0 });

    const logs = await db.selectFrom("reviewLogs").selectAll().execute();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ verdict: "exact", rating: 3, durationMs: 1500 });
  });

  it("grades typos as Hard and wrong answers as Again, keeping wrong items due soon", async () => {
    const id = await createCourse();
    const items = (await app.inject(`/courses/${id}/study?mode=learn&limit=4`)).json().items;
    const byTerm = Object.fromEntries(items.map((i: { term: string }) => [i.term, i]));

    const typo = await app.inject({
      method: "POST",
      url: "/study/answers",
      payload: { itemId: byTerm["la biblioteca"].itemId, answer: "la biblioteka" },
    });
    expect(typo.json()).toMatchObject({ verdict: "typo", rating: 2 });

    const wrong = await app.inject({
      method: "POST",
      url: "/study/answers",
      payload: { itemId: byTerm.gracias.itemId, answer: "de nada" },
    });
    expect(wrong.json()).toMatchObject({ verdict: "wrong", rating: 1 });
    const dueInMs = new Date(wrong.json().nextDue).getTime() - Date.now();
    expect(dueInMs).toBeLessThan(60 * 60 * 1000);
  });

  it("returns due cards in review mode", async () => {
    const id = await createCourse();
    const [first] = (await app.inject(`/courses/${id}/study?mode=learn&limit=1`)).json().items;
    await app.inject({
      method: "POST",
      url: "/study/answers",
      payload: { itemId: first.itemId, answer: "hola" },
    });
    await db
      .updateTable("cards")
      .set({ dueAt: new Date(Date.now() - 1000) })
      .execute();

    const review = (await app.inject(`/courses/${id}/study?mode=review`)).json();
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ term: "hola", isNew: false });
  });

  it("applies course grading overrides over user settings", async () => {
    const id = await createCourse();
    await app.inject({
      method: "PATCH",
      url: `/courses/${id}`,
      payload: { gradingMode: "strict" },
    });
    const session = (await app.inject(`/courses/${id}/study?mode=learn&limit=4`)).json();
    expect(session.grading).toEqual({ mode: "strict", accentSensitive: false });

    const item = session.items.find((i: { term: string }) => i.term === "la biblioteca");
    const res = await app.inject({
      method: "POST",
      url: "/study/answers",
      payload: { itemId: item.itemId, answer: "la biblioteka" },
    });
    expect(res.json().verdict).toBe("wrong");

    await app.inject({ method: "PATCH", url: "/me", payload: { accentSensitive: true } });
    const after = (await app.inject(`/courses/${id}/study?mode=learn`)).json();
    expect(after.grading).toEqual({ mode: "strict", accentSensitive: true });
  });
});
