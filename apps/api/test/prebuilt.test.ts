import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  type CourseSource,
  ensureCourse,
  ensurePrebuiltCourses,
  PREBUILT_COURSES,
} from "../src/db/prebuilt.ts";
import { importVocabulary } from "../src/import.ts";
import { gradeAnswer } from "../src/shared.ts";
import { setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

const CAPITALS = "Capitals of the 20 most populous countries";
const KEY = "capitals-20-most-populous";
const capitals = PREBUILT_COURSES.find((c) => c.key === KEY) as CourseSource;

const sharedCourses = () =>
  db.selectFrom("courses").selectAll().where("ownerId", "is", null).orderBy("createdAt").execute();
const ledger = () =>
  db.selectFrom("prebuiltCourses").select(["key", "courseId"]).orderBy("key").execute();

/** Load the capitals course and return its id. */
async function load() {
  const [result] = await ensurePrebuiltCourses(db);
  expect(result?.status).toBe("created");
  return result?.courseId as string;
}

/** Everything a later edit could touch, in a comparable shape. */
async function snapshot(courseId: string) {
  const course = await db
    .selectFrom("courses")
    .select(["title", "description", "gradingMode", "accentSensitive"])
    .where("id", "=", courseId)
    .executeTakeFirstOrThrow();
  const units = await db
    .selectFrom("units")
    .select(["id", "title", "position"])
    .where("courseId", "=", courseId)
    .orderBy("position")
    .execute();
  const items = await db
    .selectFrom("items")
    .innerJoin("units", "units.id", "items.unitId")
    .select(["items.id", "items.term", "items.definition", "items.alternatives", "items.notes"])
    .where("units.courseId", "=", courseId)
    .orderBy("items.id")
    .execute();
  return { course, units, items };
}

describe("prebuilt courses", () => {
  it("inserts the capitals course as a shared, read-only course and records its key", async () => {
    const [result] = await ensurePrebuiltCourses(db);
    expect(result).toMatchObject({
      key: KEY,
      title: CAPITALS,
      status: "created",
      unitsCreated: 2,
      itemsCreated: 20,
    });
    expect(await ledger()).toEqual([{ key: KEY, courseId: result?.courseId }]);

    const list = await app.inject({ url: "/courses", headers: { "x-dev-user": "learner" } });
    expect(list.json()).toContainEqual(
      expect.objectContaining({ title: CAPITALS, itemCount: 20, learnedCount: 0 }),
    );
    const detail = await app.inject({
      url: `/courses/${result?.courseId}`,
      headers: { "x-dev-user": "learner" },
    });
    expect(detail.json()).toMatchObject({
      editable: false,
      units: [
        { title: "Top 10", itemCount: 10 },
        { title: "Ranks 11–20", itemCount: 10 },
      ],
    });
    const [course] = await sharedCourses();
    expect(course?.ownerId).toBeNull();
  });

  it("is idempotent: a second run inserts nothing", async () => {
    const courseId = await load();
    const before = await snapshot(courseId);
    const [second] = await ensurePrebuiltCourses(db);
    expect(second).toEqual({ key: KEY, title: CAPITALS, status: "present", courseId });
    expect(await sharedCourses()).toHaveLength(1);
    expect(await ledger()).toHaveLength(1);
    expect(await snapshot(courseId)).toEqual(before);
  });

  it("leaves an existing, edited course alone", async () => {
    const courseId = await load();
    // Edits made in the database after the first deploy.
    await db
      .updateTable("courses")
      .set({ description: "Edited", accentSensitive: true })
      .where("id", "=", courseId)
      .execute();
    const units = await db
      .selectFrom("units")
      .select("id")
      .where("courseId", "=", courseId)
      .orderBy("position")
      .execute();
    await db
      .updateTable("units")
      .set({ title: "First ten" })
      .where("id", "=", units[0]?.id as string)
      .execute();
    await db
      .updateTable("items")
      .set({ alternatives: ["DC"], notes: "Edited note" })
      .where("term", "=", "Washington, D.C.")
      .execute();
    await db.deleteFrom("items").where("term", "=", "Bangkok").execute();
    const edited = await snapshot(courseId);

    const [again] = await ensurePrebuiltCourses(db);
    expect(again).toMatchObject({ courseId, status: "present" });
    expect(await snapshot(courseId)).toEqual(edited);
    expect(edited.items).toHaveLength(19);
    expect(await sharedCourses()).toHaveLength(1);
  });

  it("does not insert a renamed course again", async () => {
    const courseId = await load();
    await db
      .updateTable("courses")
      .set({ title: "World capitals" })
      .where("id", "=", courseId)
      .execute();

    const [again] = await ensurePrebuiltCourses(db);
    expect(again).toMatchObject({ status: "present", courseId });
    expect((await sharedCourses()).map((c) => c.title)).toEqual(["World capitals"]);
  });

  it("does not insert a deleted course again", async () => {
    const courseId = await load();
    await db.deleteFrom("courses").where("id", "=", courseId).execute();
    expect(await ledger()).toEqual([{ key: KEY, courseId: null }]);

    const [again] = await ensurePrebuiltCourses(db);
    expect(again).toEqual({ key: KEY, title: CAPITALS, status: "present", courseId: null });
    expect(await sharedCourses()).toEqual([]);
    expect(await db.selectFrom("items").select("id").execute()).toEqual([]);
  });

  it("records a course loaded before the ledger existed instead of inserting it", async () => {
    // What the first version of this step left behind: the course, no ledger row.
    const { id } = await db
      .insertInto("courses")
      .values({ title: CAPITALS, description: "Edited before", sourceLang: "en", targetLang: "en" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await importVocabulary(db, id, "unit,term,definition\nTop 10,Beijing,China\n");
    const before = await snapshot(id);

    const [result] = await ensurePrebuiltCourses(db);
    expect(result).toEqual({ key: KEY, title: CAPITALS, status: "recorded", courseId: id });
    expect(await ledger()).toEqual([{ key: KEY, courseId: id }]);
    expect(await snapshot(id)).toEqual(before);
    expect(await sharedCourses()).toHaveLength(1);

    const [again] = await ensurePrebuiltCourses(db);
    expect(again).toMatchObject({ status: "present", courseId: id });
  });

  it("ignores courses a learner owns with the same title", async () => {
    await app.inject({
      method: "POST",
      url: "/courses",
      headers: { "x-dev-user": "alice" },
      payload: { title: CAPITALS, sourceLang: "en", targetLang: "en" },
    });
    const [result] = await ensurePrebuiltCourses(db);
    expect(result?.status).toBe("created");
    expect(await sharedCourses()).toHaveLength(1);
  });

  it("concurrent runs insert the course once", async () => {
    const results = await Promise.all([ensureCourse(db, capitals), ensureCourse(db, capitals)]);
    expect(results.map((r) => r.status).sort()).toEqual(["created", "present"]);
    expect(await sharedCourses()).toHaveLength(1);
    expect(await ledger()).toHaveLength(1);
  });

  it("runs as the command the deploy uses, against DATABASE_URL", async () => {
    const run = () =>
      promisify(execFile)(process.execPath, ["src/db/prebuilt.ts"], {
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      });
    expect((await run()).stdout).toContain(`created "${CAPITALS}" (2 units, 20 items)`);
    expect((await run()).stdout).toContain(`${KEY} was loaded before; left as it is`);
    expect(await sharedCourses()).toHaveLength(1);
  });

  it("gives every prebuilt course its own key", () => {
    const keys = PREBUILT_COURSES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("the capitals course", () => {
  async function accepted(country: string) {
    await ensurePrebuiltCourses(db);
    const item = await db
      .selectFrom("items")
      .select(["term", "alternatives"])
      .where("definition", "=", country)
      .executeTakeFirstOrThrow();
    return [item.term, ...item.alternatives];
  }

  it.each([
    ["United States", "Washington"],
    ["United States", "Washington DC"],
    ["United States", "washington d.c."],
    ["Brazil", "Brasilia"],
    ["Vietnam", "Ha Noi"],
    ["India", "Delhi"],
  ])("accepts %s → %s as exact by default", async (country, answer) => {
    expect(gradeAnswer(answer, await accepted(country)).verdict).toBe("exact");
  });

  it("still needs the accent when a learner asks for accents", async () => {
    const result = gradeAnswer("Brasilia", await accepted("Brazil"), {
      mode: "strict",
      accentSensitive: true,
    });
    expect(result.verdict).toBe("wrong");
  });

  it("asks for each of 20 different countries", async () => {
    await ensurePrebuiltCourses(db);
    const items = await db.selectFrom("items").select(["definition", "term"]).execute();
    expect(new Set(items.map((i) => i.definition)).size).toBe(20);
    expect(new Set(items.map((i) => i.term)).size).toBe(20);
  });
});
