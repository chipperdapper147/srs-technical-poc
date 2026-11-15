import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp, travel } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Headers = Record<string, string>;
type HeatmapDay = { date: string; reviewCount: number };

/** A course of the caller's with these words (none answered yet); ids by term. */
async function course(title: string, terms: string[], headers: Headers = {}) {
  const created = await app.inject({
    method: "POST",
    url: "/courses",
    headers,
    payload: { title, sourceLang: "en", targetLang: "es" },
  });
  expect(created.statusCode).toBe(201);
  const courseId: string = created.json().id;
  const csv = `unit,term,definition\n${terms.map((t) => `Basics,${t},${t} (en)`).join("\n")}\n`;
  await app.inject({
    method: "POST",
    url: `/courses/${courseId}/import`,
    headers,
    payload: { csv },
  });
  const { items } = (
    await app.inject({ url: `/courses/${courseId}/study?mode=learn&limit=50`, headers })
  ).json();
  const ids: Record<string, string> = {};
  for (const item of items as { itemId: string; term: string }[]) ids[item.term] = item.itemId;
  return { courseId, ids };
}

/** Answer a word: "right" types the term, "typo" drops its last letter, "wrong" types nonsense. */
async function answer(itemId: string, how: "right" | "typo" | "wrong", headers: Headers = {}) {
  const { term } = await db
    .selectFrom("items")
    .select("term")
    .where("id", "=", itemId)
    .executeTakeFirstOrThrow();
  const text = how === "right" ? term : how === "typo" ? `${term}x` : "zzzzzz";
  const res = await app.inject({
    method: "POST",
    url: "/study/answers",
    headers,
    payload: { itemId, answer: text },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().verdict).toBe(how === "right" ? "exact" : how);
}

async function stats(query = "", headers: Headers = {}) {
  const res = await app.inject({ url: `/stats${query}`, headers });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

/** YYYY-MM-DD of an instant in a time zone: the oracle the API's days are checked against. */
const dayIn = (timeZone: string, at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);

const addDays = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);

/** Current and longest runs of consecutive days, computed in JS from the days reviewed. */
function expectedStreak(days: Set<string>, today: string) {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const day of sorted) {
    run = prev !== undefined && addDays(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  const last = sorted.at(-1);
  const current = last === today || last === addDays(today, -1) ? run : 0;
  return { current, longest, reviewedToday: last === today };
}

describe("GET /stats", () => {
  it("is all zeros, with an empty heatmap ending today, before any review", async () => {
    await course("Spanish", ["hola"]);
    const s = await stats();
    const today = dayIn("UTC", new Date());
    expect(s).toMatchObject({
      courseId: null,
      today,
      totals: { wordsLearned: 0, reviewCount: 0 },
      retention: { days: 30, reviewCount: 0, correctCount: 0 },
      streak: { current: 0, longest: 0, reviewedToday: false },
      hardestWords: [],
    });
    expect(s.heatmap).toHaveLength(84);
    expect(s.heatmap[0].date).toBe(addDays(today, -83));
    expect(s.heatmap.at(-1).date).toBe(today);
    expect(s.heatmap.every((d: HeatmapDay) => d.reviewCount === 0)).toBe(true);
  });

  it("counts reviews per day and streaks in the learner's time zone", async () => {
    const es = await course("Spanish", ["hola", "gracias"]);
    const hola = es.ids.hola as string;
    const gracias = es.ids.gracias as string;
    // Review days, as days ago: 9, 8, 7 (a run of 3), 4, then 1 and 0 (the current run).
    const daysAgo = [9, 8, 7, 4, 1, 0];
    for (const [i, ago] of daysAgo.entries()) {
      await answer(hola, "right");
      if (ago === 4) await answer(gracias, "right");
      const next = daysAgo[i + 1];
      if (next !== undefined) await travel(db, (ago - next) * DAY);
    }

    // Seven answers in all; in UTC the days are exactly as built.
    const utc = await stats();
    expect(utc.totals).toEqual({ wordsLearned: 2, reviewCount: 7 });
    expect(utc.streak).toEqual({ current: 2, longest: 3, reviewedToday: true });
    const busy = utc.heatmap.find((d: HeatmapDay) => d.date === addDays(utc.today, -4));
    expect(busy.reviewCount).toBe(2);

    const logs = await db.selectFrom("reviewLogs").select("reviewedAt").execute();
    // Kiritimati is UTC+14 and Honolulu UTC-10: whatever the hour, one of them is
    // on a different calendar day from UTC, so "today" differs from UTC's.
    const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Honolulu", "America/Los_Angeles"];
    const now = new Date();
    expect(zones.slice(1).some((tz) => dayIn(tz, now) !== dayIn("UTC", now))).toBe(true);
    for (const timeZone of zones) {
      const s = await stats(`?timeZone=${encodeURIComponent(timeZone)}`);
      const today = dayIn(timeZone, now);
      expect(s.today, timeZone).toBe(today);

      const perDay = new Map<string, number>();
      for (const { reviewedAt } of logs) {
        const day = dayIn(timeZone, reviewedAt);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
      const dates = Array.from({ length: 84 }, (_, i) => addDays(today, i - 83));
      expect(s.heatmap, timeZone).toEqual(
        dates.map((date) => ({ date, reviewCount: perDay.get(date) ?? 0 })),
      );
      expect(s.streak, timeZone).toEqual(expectedStreak(new Set(perDay.keys()), today));
    }
  });

  it("keeps yesterday's run current until today ends, and breaks it after a missed day", async () => {
    const es = await course("Spanish", ["hola"]);
    const hola = es.ids.hola as string;
    await answer(hola, "right");
    await travel(db, DAY);
    await answer(hola, "right");
    await travel(db, DAY);
    expect((await stats()).streak).toEqual({ current: 2, longest: 2, reviewedToday: false });
    await travel(db, DAY);
    expect((await stats()).streak).toEqual({ current: 0, longest: 2, reviewedToday: false });
  });

  it("measures retention over the last 30 days on words past their learning steps", async () => {
    const es = await course("Spanish", ["hola", "gracias", "adiós", "el agua"]);
    const [hola, gracias, adios, agua] = ["hola", "gracias", "adiós", "el agua"].map(
      (t) => es.ids[t] as string,
    );
    // Two correct answers take a new word through its learning steps.
    for (const id of [hola, gracias, adios, agua]) await answer(id as string, "right");
    await travel(db, HOUR);
    for (const id of [hola, gracias, adios, agua]) await answer(id as string, "right");
    const states = await db.selectFrom("cards").select("state").execute();
    expect(states.every((c) => c.state === 2)).toBe(true);

    // An answer on a learned word 31 days ago: outside the window.
    await travel(db, 2 * DAY);
    await answer(agua as string, "wrong");
    await travel(db, 31 * DAY);
    // Inside it: correct, typo (counts as correct) and wrong.
    await answer(hola as string, "right");
    await answer(adios as string, "typo");
    await answer(gracias as string, "wrong");

    const s = await stats();
    expect(s.retention).toEqual({ days: 30, reviewCount: 3, correctCount: 2 });
    expect(s.totals).toEqual({ wordsLearned: 4, reviewCount: 12 });
    // Both wrong answers on learned words were lapses: the hardest words.
    expect(s.hardestWords.map((w: { term: string; lapses: number }) => [w.term, w.lapses])).toEqual(
      [
        ["el agua", 1],
        ["gracias", 1],
      ],
    );
  });

  it("ranks the hardest words by lapses, then share of wrong answers, ten at most", async () => {
    const terms = Array.from({ length: 13 }, (_, i) => `palabra${String(i).padStart(2, "0")}`);
    const es = await course("Spanish", terms);
    const id = (t: string) => es.ids[t] as string;
    // palabra00: a lapse (wrong after learning). Then wrong-answer shares 2/3, 1/2, 1/3 …
    await answer(id("palabra00"), "right");
    await travel(db, HOUR);
    await answer(id("palabra00"), "right");
    await travel(db, 2 * DAY);
    await answer(id("palabra00"), "wrong");
    await answer(id("palabra01"), "wrong");
    await answer(id("palabra01"), "wrong");
    await answer(id("palabra01"), "right");
    await answer(id("palabra02"), "wrong");
    await answer(id("palabra02"), "right");
    for (const t of terms.slice(3, 12)) {
      await answer(id(t), "wrong");
      await answer(id(t), "right");
      await answer(id(t), "right");
    }
    // Never wrong: not hard.
    await answer(id("palabra12"), "right");

    const { hardestWords } = await stats();
    expect(hardestWords).toHaveLength(10);
    expect(hardestWords[0]).toEqual({
      itemId: id("palabra00"),
      term: "palabra00",
      definition: "palabra00 (en)",
      courseId: es.courseId,
      courseTitle: "Spanish",
      lapses: 1,
      reviewCount: 3,
      wrongCount: 1,
    });
    expect(
      hardestWords.map((w: { term: string; reviewCount: number; wrongCount: number }) => [
        w.term,
        w.wrongCount,
        w.reviewCount,
      ]),
    ).toEqual([
      ["palabra00", 1, 3],
      ["palabra01", 2, 3],
      ["palabra02", 1, 2],
      // Equal shares: alphabetical. palabra10 and palabra11 don't fit.
      ...terms.slice(3, 10).map((t) => [t, 1, 3]),
    ]);
  });

  it("filters to one course, and 404s for a course the learner can't see", async () => {
    const es = await course("Spanish", ["hola", "gracias"]);
    const fr = await course("French", ["bonjour"]);
    await answer(es.ids.hola as string, "wrong");
    await answer(es.ids.gracias as string, "right");
    await answer(fr.ids.bonjour as string, "wrong");

    const all = await stats();
    expect(all.totals).toEqual({ wordsLearned: 3, reviewCount: 3 });
    expect(all.hardestWords.map((w: { courseTitle: string }) => w.courseTitle).sort()).toEqual([
      "French",
      "Spanish",
    ]);

    const spanish = await stats(`?courseId=${es.courseId}&timeZone=Asia%2FTokyo`);
    expect(spanish.courseId).toBe(es.courseId);
    expect(spanish.totals).toEqual({ wordsLearned: 2, reviewCount: 2 });
    expect(spanish.streak).toEqual({ current: 1, longest: 1, reviewedToday: true });
    expect(spanish.heatmap.at(-1)).toEqual({
      date: dayIn("Asia/Tokyo", new Date()),
      reviewCount: 2,
    });
    expect(spanish.hardestWords).toEqual([
      expect.objectContaining({ term: "hola", courseId: es.courseId, courseTitle: "Spanish" }),
    ]);

    const missing = await app.inject("/stats?courseId=00000000-0000-4000-8000-000000000000");
    expect(missing.statusCode).toBe(404);
    const others = await app.inject({
      url: `/stats?courseId=${es.courseId}`,
      headers: { "x-dev-user": "bob" },
    });
    expect(others.statusCode).toBe(404);
  });

  it("counts only the caller's reviews and rejects a name that isn't a time zone", async () => {
    const alice = { "x-dev-user": "alice" };
    const es = await course("Spanish", ["hola"], alice);
    await answer(es.ids.hola as string, "wrong", alice);
    expect((await stats("", alice)).totals.reviewCount).toBe(1);
    const bob = await stats("", { "x-dev-user": "bob" });
    expect(bob.totals).toEqual({ wordsLearned: 0, reviewCount: 0 });
    expect(bob.hardestWords).toEqual([]);

    const bad = await app.inject("/stats?timeZone=Mars%2FOlympus");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toContain("IANA time zone");
  });
});
