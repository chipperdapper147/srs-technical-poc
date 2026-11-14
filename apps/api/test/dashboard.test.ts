import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.ts";

const ctx = await setupTestApp();
const { app, db } = ctx;
afterAll(ctx.close);
beforeEach(ctx.reset);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Headers = Record<string, string>;

/** A course with these words, every one answered correctly once so it has a card. */
async function learnedCourse(
  title: string,
  words: [term: string, definition: string][],
  headers: Headers = {},
) {
  const created = await app.inject({
    method: "POST",
    url: "/courses",
    headers,
    payload: { title, sourceLang: "en", targetLang: title === "German" ? "de" : "es" },
  });
  expect(created.statusCode).toBe(201);
  const courseId: string = created.json().id;
  const csv = `unit,term,definition\n${words.map(([t, d]) => `Basics,${t},${d}`).join("\n")}\n`;
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
  for (const item of items as { itemId: string; term: string }[]) {
    await app.inject({
      method: "POST",
      url: "/study/answers",
      headers,
      payload: { itemId: item.itemId, answer: item.term },
    });
    ids[item.term] = item.itemId;
  }
  return { courseId, ids };
}

/** Move a card's due date to `offsetMs` from now. */
async function dueIn(itemId: string, offsetMs: number) {
  await db
    .updateTable("cards")
    .set({ dueAt: new Date(Date.now() + offsetMs) })
    .where("itemId", "=", itemId)
    .execute();
}

/** YYYY-MM-DD of an instant in a time zone: the oracle the API's buckets are checked against. */
const dayIn = (timeZone: string, at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);

describe("GET /dashboard", () => {
  it("counts reviews due now per course and in total", async () => {
    const es = await learnedCourse("Spanish", [
      ["hola", "hello"],
      ["gracias", "thank you"],
      ["adiós", "goodbye"],
    ]);
    const de = await learnedCourse("German", [["danke", "thanks"]]);
    const empty = (
      await app.inject({
        method: "POST",
        url: "/courses",
        payload: { title: "Empty", sourceLang: "en", targetLang: "fr" },
      })
    ).json();
    await dueIn(es.ids.hola as string, -3 * DAY);
    await dueIn(es.ids.gracias as string, -HOUR);
    await dueIn(de.ids.danke as string, -1000);

    const res = await app.inject("/dashboard");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dueCount: 3,
      courses: [
        { id: es.courseId, title: "Spanish", sourceLang: "en", targetLang: "es", dueCount: 2 },
        { id: de.courseId, title: "German", targetLang: "de", dueCount: 1 },
        { id: empty.id, title: "Empty", dueCount: 0 },
      ],
    });
  });

  it("forecasts reviews per day in the learner's time zone, overdue ones counted today", async () => {
    const es = await learnedCourse("Spanish", [
      ["hola", "hello"],
      ["gracias", "thank you"],
      ["adiós", "goodbye"],
      ["el agua", "water"],
      ["el pan", "bread"],
    ]);
    const offsets: Record<string, number> = {
      hola: -3 * DAY,
      gracias: 13 * HOUR,
      adiós: 2 * DAY + HOUR,
      "el agua": 6 * DAY,
      "el pan": 9 * DAY,
    };
    for (const [term, offset] of Object.entries(offsets)) {
      await dueIn(es.ids[term] as string, offset);
    }

    for (const timeZone of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"]) {
      const res = await app.inject(`/dashboard?timeZone=${encodeURIComponent(timeZone)}`);
      expect(res.statusCode).toBe(200);
      const { forecast } = res.json() as { forecast: { date: string; dueCount: number }[] };

      const now = new Date();
      const today = dayIn(timeZone, now);
      const dates = forecast.map((d) => d.date);
      expect(dates).toHaveLength(7);
      expect(dates[0]).toBe(today);
      // Consecutive calendar days.
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(`${dates[i - 1]}T00:00:00Z`).getTime();
        expect(new Date(`${dates[i]}T00:00:00Z`).getTime() - prev).toBe(DAY);
      }

      const expected = new Map(dates.map((d) => [d, 0]));
      for (const offset of Object.values(offsets)) {
        const day = dayIn(timeZone, new Date(now.getTime() + offset));
        // Overdue counts as today (YYYY-MM-DD strings sort as dates).
        const bucket = day.localeCompare(today) < 0 ? today : day;
        if (expected.has(bucket)) expected.set(bucket, (expected.get(bucket) ?? 0) + 1);
      }
      expect(forecast, timeZone).toEqual(
        dates.map((date) => ({ date, dueCount: expected.get(date) })),
      );
      expect(
        forecast.reduce((sum, d) => sum + d.dueCount, 0),
        timeZone,
      ).toBe(4);
    }
  });

  it("defaults to UTC and rejects a name that isn't a time zone", async () => {
    const res = await app.inject("/dashboard");
    expect(res.json().forecast[0].date).toBe(dayIn("UTC", new Date()));
    expect(res.json()).toMatchObject({ dueCount: 0, courses: [] });

    const bad = await app.inject("/dashboard?timeZone=Mars%2FOlympus");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toContain("IANA time zone");
  });

  it("counts only the caller's own cards", async () => {
    const alice = { "x-dev-user": "alice" };
    const es = await learnedCourse("Spanish", [["hola", "hello"]], alice);
    await dueIn(es.ids.hola as string, -HOUR);

    const mine = (await app.inject({ url: "/dashboard", headers: alice })).json();
    expect(mine.dueCount).toBe(1);
    expect(mine.forecast[0].dueCount).toBe(1);
    const bob = (await app.inject({ url: "/dashboard", headers: { "x-dev-user": "bob" } })).json();
    expect(bob.dueCount).toBe(0);
    expect(bob.courses).toEqual([]);
    expect(bob.forecast.every((d: { dueCount: number }) => d.dueCount === 0)).toBe(true);
  });
});

describe("GET /study/review", () => {
  it("mixes due items from every course, most overdue first, each with its course", async () => {
    const es = await learnedCourse("Spanish", [
      ["hola", "hello"],
      ["gracias", "thank you"],
      ["adiós", "goodbye"],
    ]);
    const de = await learnedCourse("German", [["danke", "thanks"]]);
    await dueIn(es.ids.hola as string, -HOUR);
    await dueIn(de.ids.danke as string, -2 * DAY);
    await dueIn(es.ids.gracias as string, -3 * DAY);
    await dueIn(es.ids.adiós as string, DAY);

    const res = await app.inject("/study/review");
    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items.map((i: { term: string }) => i.term)).toEqual(["gracias", "danke", "hola"]);
    expect(items[1]).toMatchObject({
      itemId: de.ids.danke,
      courseId: de.courseId,
      courseTitle: "German",
      targetLang: "de",
      unitTitle: "Basics",
      definition: "thanks",
      isNew: false,
      grading: { mode: "lenient", accentSensitive: false },
    });

    const limited = (await app.inject("/study/review?limit=2")).json();
    expect(limited.items.map((i: { term: string }) => i.term)).toEqual(["gracias", "danke"]);
  });

  it("grades each answer with its own course's settings", async () => {
    const strict = await learnedCourse("Spanish", [["la biblioteca", "library"]]);
    const lenient = await learnedCourse("German", [["die Bibliothek", "library (de)"]]);
    await app.inject({
      method: "PATCH",
      url: `/courses/${strict.courseId}`,
      payload: { gradingMode: "strict" },
    });
    await dueIn(strict.ids["la biblioteca"] as string, -2 * HOUR);
    await dueIn(lenient.ids["die Bibliothek"] as string, -HOUR);

    const { items } = (await app.inject("/study/review")).json();
    expect(
      items.map((i: { courseTitle: string; grading: unknown }) => [i.courseTitle, i.grading]),
    ).toEqual([
      ["Spanish", { mode: "strict", accentSensitive: false }],
      ["German", { mode: "lenient", accentSensitive: false }],
    ]);

    const answer = async (itemId: string, text: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/study/answers",
          payload: { itemId, answer: text },
        })
      ).json().verdict;
    expect(await answer(items[0].itemId, "la biblioteka")).toBe("wrong");
    expect(await answer(items[1].itemId, "die Bibliotek")).toBe("typo");
  });

  it("serves nothing when nothing is due, and never another learner's cards", async () => {
    const alice = { "x-dev-user": "alice" };
    const es = await learnedCourse("Spanish", [["hola", "hello"]], alice);
    expect((await app.inject({ url: "/study/review", headers: alice })).json()).toEqual({
      items: [],
    });
    await dueIn(es.ids.hola as string, -HOUR);
    expect((await app.inject({ url: "/study/review", headers: alice })).json().items).toHaveLength(
      1,
    );
    expect(
      (await app.inject({ url: "/study/review", headers: { "x-dev-user": "bob" } })).json(),
    ).toEqual({ items: [] });
  });
});
