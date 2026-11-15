/**
 * Study aids: hints cap the rating, "I was right" overrides a verdict, and
 * undo takes back the latest answer. The server applies all three.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createScheduler } from "../src/srs.ts";
import { SAMPLE_CSV, setupTestApp, travel } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

type Headers = Record<string, string>;

/** A course with the sample words; their item ids by term. */
async function words(headers: Headers = {}) {
  const course = await app.inject({
    method: "POST",
    url: "/courses",
    headers,
    payload: { title: "Spanish", sourceLang: "en", targetLang: "es" },
  });
  const courseId: string = course.json().id;
  await app.inject({
    method: "POST",
    url: `/courses/${courseId}/import`,
    headers,
    payload: { csv: SAMPLE_CSV },
  });
  const { items } = (
    await app.inject({ url: `/courses/${courseId}/study?mode=learn&limit=10`, headers })
  ).json();
  const ids: Record<string, string> = Object.fromEntries(
    items.map((i: { term: string; itemId: string }) => [i.term, i.itemId]),
  );
  return { courseId, ids };
}

async function answer(itemId: string, text: string, hints?: number, headers: Headers = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/study/answers",
    headers,
    payload: { itemId, answer: text, hints },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

const override = (reviewId: string, headers: Headers = {}) =>
  app.inject({ method: "POST", url: `/study/answers/${reviewId}/override`, headers });
const undo = (reviewId: string, headers: Headers = {}) =>
  app.inject({ method: "POST", url: `/study/answers/${reviewId}/undo`, headers });

async function cardOf(itemId: string) {
  return db.selectFrom("cards").selectAll().where("itemId", "=", itemId).executeTakeFirst();
}

async function logsOf(itemId: string) {
  return db
    .selectFrom("reviewLogs")
    .selectAll()
    .where("itemId", "=", itemId)
    .orderBy("reviewedAt")
    .execute();
}

/** Take a word through its learning steps (10 minutes, a day), so it is in FSRS review. */
async function graduate(itemId: string, term: string) {
  await answer(itemId, term);
  await travel(db, 10 * MINUTE);
  await answer(itemId, term);
  await travel(db, DAY);
  const card = await cardOf(itemId);
  expect(card).toMatchObject({ scheduleStatus: "review" });
  return card;
}

describe("hints", () => {
  it("cap an exact answer at Hard and record how many were used", async () => {
    const { ids } = await words();
    const result = await answer(ids.hola as string, "hola", 1);
    expect(result).toMatchObject({ verdict: "exact", rating: 2 });
    expect(await logsOf(ids.hola as string)).toMatchObject([
      { verdict: "exact", rating: 2, hints: 1, overriddenAt: null },
    ]);
  });

  it("make an answer Again once they reveal the whole word, counting letters only", async () => {
    const { ids } = await words();
    // "la biblioteca" has 12 letters; the space is free.
    expect(await answer(ids["la biblioteca"] as string, "la biblioteca", 11)).toMatchObject({
      verdict: "exact",
      rating: 2,
    });
    await travel(db, DAY);
    expect(await answer(ids["la biblioteca"] as string, "la biblioteca", 12)).toMatchObject({
      rating: 1,
    });
    // More hints than letters count as the whole word, and are stored as that.
    expect(await answer(ids.hola as string, "hola", 99)).toMatchObject({ rating: 1 });
    expect((await logsOf(ids.hola as string))[0]?.hints).toBe(4);
  });

  it("leave answers without hints as before, and never raise a wrong answer", async () => {
    const { ids } = await words();
    expect(await answer(ids.hola as string, "hola")).toMatchObject({ rating: 3 });
    expect(await answer(ids.gracias as string, "de nada", 2)).toMatchObject({
      verdict: "wrong",
      rating: 1,
    });
    expect((await logsOf(ids.hola as string))[0]?.hints).toBe(0);
  });
});

describe('"I was right"', () => {
  it("reschedules a wrong answer as Good from the card before it, keeping the log honest", async () => {
    const { ids } = await words();
    const itemId = ids.hola as string;
    const before = await graduate(itemId, "hola");
    if (!before) throw new Error("no card");

    const wrong = await answer(itemId, "hasta luego!");
    expect(wrong).toMatchObject({ verdict: "wrong", rating: 1, overridden: false });
    expect(await cardOf(itemId)).toMatchObject({ lapses: 1, scheduleStatus: "learning" });

    const res = await override(wrong.reviewId);
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result).toMatchObject({
      verdict: "wrong",
      rating: 3,
      overridden: true,
      reviewId: wrong.reviewId,
      term: "hola",
    });

    // The same card a Good answer at that moment would have produced.
    const [log] = (await logsOf(itemId)).slice(-1);
    if (!log) throw new Error("no log");
    const scheduler = await createScheduler();
    const { createdAt: _c, ...beforeRow } = before;
    const expected = scheduler.review(beforeRow, 3, log.reviewedAt).row;
    const { createdAt: _d, ...after } = (await cardOf(itemId)) ?? {};
    expect(after).toEqual(expected);
    expect(after).toMatchObject({ lapses: 0, scheduleStatus: "review", reps: before.reps + 1 });
    expect(new Date(result.nextDue).getTime()).toBe(expected.dueAt.getTime());
    expect(expected.dueAt.getTime() - Date.now()).toBeGreaterThan(DAY);

    // The entry stays: the grader's verdict and answer, the new rating, and when it was overridden.
    expect(await logsOf(itemId)).toHaveLength(3);
    expect(log).toMatchObject({ answer: "hasta luego!", verdict: "wrong", rating: 3 });
    expect(log.overriddenAt).toBeInstanceOf(Date);
    expect(log.revlog).toMatchObject({ rating: 3 });
  });

  it("turns a typo into Good, and a hinted wrong answer into Hard", async () => {
    const { ids } = await words();
    const typo = await answer(ids["la biblioteca"] as string, "la biblioteka");
    expect((await override(typo.reviewId)).json()).toMatchObject({
      verdict: "typo",
      matched: "la biblioteca",
      rating: 3,
    });
    const hinted = await answer(ids.gracias as string, "grac", 2);
    expect((await override(hinted.reviewId)).json()).toMatchObject({ rating: 2 });
  });

  it("refuses what it can't or mustn't change", async () => {
    const { ids } = await words();
    const exact = await answer(ids.hola as string, "hola");
    expect((await override(exact.reviewId)).statusCode).toBe(409);

    // A hinted typo is already Hard: nothing to raise.
    const hintedTypo = await answer(ids["la biblioteca"] as string, "la biblioteka", 1);
    expect((await override(hintedTypo.reviewId)).statusCode).toBe(409);

    // Only the latest answer.
    const older = await answer(ids.gracias as string, "nada");
    await answer(ids["el agua"] as string, "el agua");
    const notLatest = await override(older.reviewId);
    expect(notLatest.statusCode).toBe(409);
    expect(notLatest.json().message).toBe("Only your latest answer can be changed.");

    // Only once.
    const wrong = await answer(ids.gracias as string, "nada");
    expect((await override(wrong.reviewId)).statusCode).toBe(200);
    expect((await override(wrong.reviewId)).statusCode).toBe(409);
  });

  it("allows ten minutes, and only the learner's own answers", async () => {
    const { ids } = await words();
    const wrong = await answer(ids.hola as string, "adiós");
    expect((await override(wrong.reviewId, { "x-dev-user": "someone-else" })).statusCode).toBe(404);
    await travel(db, 11 * MINUTE);
    const late = await override(wrong.reviewId);
    expect(late.statusCode).toBe(409);
    expect(late.json().message).toBe("Answers can only be changed for 10 minutes.");
  });

  it("counts as correct in the stats", async () => {
    const { ids } = await words();
    const itemId = ids.hola as string;
    await graduate(itemId, "hola");
    const wrong = await answer(itemId, "adiós");
    const retention = async () => (await app.inject("/stats")).json().retention;
    expect(await retention()).toMatchObject({ reviewCount: 1, correctCount: 0 });
    await override(wrong.reviewId);
    expect(await retention()).toMatchObject({ reviewCount: 1, correctCount: 1 });
  });
});

describe("undo", () => {
  it("restores the exact card state before the answer and deletes its log entry", async () => {
    const { ids } = await words();
    const itemId = ids.hola as string;
    const before = await graduate(itemId, "hola");

    const wrong = await answer(itemId, "adiós");
    expect(await cardOf(itemId)).not.toEqual(before);
    const res = await undo(wrong.reviewId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ itemId });

    expect(await cardOf(itemId)).toEqual(before);
    expect(await logsOf(itemId)).toHaveLength(2);
    // The word is due again, as it was.
    const due = (await app.inject("/study/review")).json().items;
    expect(due.map((i: { term: string }) => i.term)).toEqual(["hola"]);
  });

  it("makes a word new again when it undoes the first answer", async () => {
    const { courseId, ids } = await words();
    const first = await answer(ids.hola as string, "hola");
    expect((await undo(first.reviewId)).statusCode).toBe(200);
    expect(await cardOf(ids.hola as string)).toBeUndefined();
    expect(await logsOf(ids.hola as string)).toEqual([]);
    const learn = (await app.inject(`/courses/${courseId}/study?mode=learn&limit=1`)).json();
    expect(learn.items[0].term).toBe("hola");
    expect((await app.inject(`/courses/${courseId}`)).json()).toMatchObject({ learnedCount: 0 });
  });

  it("takes back an overridden answer too", async () => {
    const { ids } = await words();
    const itemId = ids.hola as string;
    const before = await graduate(itemId, "hola");
    const wrong = await answer(itemId, "adiós");
    await override(wrong.reviewId);
    expect((await undo(wrong.reviewId)).statusCode).toBe(200);
    expect(await cardOf(itemId)).toEqual(before);
  });

  it("works in a review of all courses", async () => {
    const { ids } = await words();
    const before = await graduate(ids.hola as string, "hola");
    const [item] = (await app.inject("/study/review")).json().items;
    const result = await answer(item.itemId, "hola", 1);
    expect(result.rating).toBe(2);
    expect((await undo(result.reviewId)).statusCode).toBe(200);
    expect(await cardOf(ids.hola as string)).toEqual(before);
  });

  it("only takes back the latest answer, within ten minutes, once", async () => {
    const { ids } = await words();
    const older = await answer(ids.hola as string, "hola");
    const latest = await answer(ids.gracias as string, "gracias");
    expect((await undo(older.reviewId)).statusCode).toBe(409);
    expect((await undo(latest.reviewId, { "x-dev-user": "someone-else" })).statusCode).toBe(404);
    expect((await undo(latest.reviewId)).statusCode).toBe(200);
    expect((await undo(latest.reviewId)).statusCode).toBe(404);

    await travel(db, 11 * MINUTE);
    expect((await undo(older.reviewId)).statusCode).toBe(409);
    expect(await cardOf(ids.hola as string)).toBeDefined();
  });
});
