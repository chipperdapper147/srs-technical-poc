import type { Stats } from "@app/shared";
import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aHardWord, aHeatmap, aStats } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { ALL_COURSES, createStatsController, type StatsState } from "./controller.ts";
import { heatLevel, type StatsReadyVM, type StatsVM, statsViewModel } from "./view-model.ts";

const spanish = aCourse({ title: "Spanish" });
const german = aCourse({ title: "German", targetLang: "de" });

/** A learner with some history: 12 reviews over the last days, a broken streak. */
const history = (over: Partial<Stats> = {}) =>
  aStats({
    totals: { wordsLearned: 8, reviewCount: 1204 },
    retention: { days: 30, reviewCount: 30, correctCount: 26 },
    heatmap: aHeatmap([4, 0, 2, 6]),
    streak: { current: 2, longest: 5, reviewedToday: true },
    hardestWords: [
      aHardWord({ term: "la biblioteca", courseId: spanish.id, courseTitle: "Spanish" }),
      aHardWord({ term: "danke", lapses: 0, reviewCount: 3, wrongCount: 1, courseTitle: "German" }),
    ],
    ...over,
  });

const fake = setupFakeApi(() => ({
  courses: [spanish, german],
  stats: history(),
  courseStats: {
    [spanish.id]: history({ totals: { wordsLearned: 5, reviewCount: 40 } }),
  },
}));

async function load(deps = createTestDeps()) {
  const c = createStatsController(deps);
  c.start();
  await waitForState(
    c.store,
    (s) => s.stats.status !== "loading" && s.courses.status !== "loading",
  );
  return c;
}

/** The view model of a ready state built by hand. */
const vmOf = (stats: Stats, courseId: string | null = null): StatsVM =>
  statsViewModel({
    courseId,
    courses: { status: "ready", data: [spanish, german] },
    stats: { status: "ready", data: stats },
  });

const ready = (vm: StatsVM): StatsReadyVM => {
  if (vm.body.kind !== "ready") throw new Error(`expected ready, got ${vm.body.kind}`);
  return vm.body;
};

const tile = (vm: StatsReadyVM, id: string) => vm.tiles.find((t) => t.id === id);

describe("stats controller", () => {
  it("asks for every course's stats in the learner's time zone", async () => {
    await load(createTestDeps(undefined, { timeZone: "America/Los_Angeles" }));
    expect(fake.current.requests.find((r) => r.path === "/stats")).toMatchObject({
      method: "GET",
      search: "?timeZone=America%2FLos_Angeles",
    });
  });

  it("switches to one course and back, refetching only what isn't cached", async () => {
    const c = await load();
    c.actions.setCourse(spanish.id);
    expect(c.store.get().courseId).toBe(spanish.id);
    let s = await waitForState(
      c.store,
      (st) => st.stats.status === "ready" && st.stats.data.courseId === spanish.id,
    );
    expect(fake.current.requests.at(-1)?.search).toBe(
      `?timeZone=Europe%2FMadrid&courseId=${spanish.id}`,
    );
    expect(ready(statsViewModel(s)).tiles[1]?.value).toBe("40");

    const before = fake.current.requests.length;
    c.actions.setCourse(ALL_COURSES);
    s = await waitForState(
      c.store,
      (st) => st.stats.status === "ready" && st.stats.data.courseId === null,
    );
    expect(ready(statsViewModel(s)).tiles[1]?.value).toBe("1,204");
    // Still fresh in the cache: no second request for every course.
    expect(fake.current.requests.length).toBe(before);
  });

  it("names the error when the API fails", async () => {
    fake.current.failNext("GET", "/stats", 500, "Database down");
    const c = await load();
    expect(statsViewModel(c.store.get()).body).toEqual({ kind: "error", message: "Database down" });
  });
});

describe("stats view model", () => {
  it("offers every course in the picker once the course list loads", async () => {
    const c = await load();
    expect(statsViewModel(c.store.get()).filter).toEqual({
      id: "stats-course",
      label: "Course",
      value: "all",
      options: [
        { value: "all", label: "All courses" },
        { value: spanish.id, label: "Spanish" },
        { value: german.id, label: "German" },
      ],
    });
    const loading: StatsState = {
      courseId: null,
      courses: { status: "loading" },
      stats: { status: "loading" },
    };
    expect(statsViewModel(loading)).toEqual({
      heading: "Stats",
      filter: null,
      body: { kind: "loading" },
    });
  });

  it("with no reviews yet, points to the courses; for one course, says so", () => {
    expect(vmOf(aStats()).body).toEqual({
      kind: "empty",
      message: "No reviews yet. Learn some words and progress shows up here.",
      action: { label: "Go to courses", route: { to: "courses" } },
    });
    const one = vmOf(aStats({ courseId: spanish.id }), spanish.id);
    expect(one.body).toEqual({
      kind: "empty",
      message: "No reviews in this course yet.",
      action: null,
    });
    expect(one.filter?.value).toBe(spanish.id);
  });

  it("turns counts into tiles: totals, retention as a percentage, and the streak", () => {
    const vm = ready(vmOf(history()));
    expect(vm.tiles).toEqual([
      { id: "learned", label: "Words learned", value: "8", detail: "Answered at least once." },
      { id: "reviews", label: "Reviews done", value: "1,204", detail: "Every answer, all time." },
      {
        id: "retention",
        label: "Retention",
        value: "87%",
        detail: "26 of 30 learned-word reviews correct in the last 30 days.",
      },
      {
        id: "streak",
        label: "Current streak",
        value: "2 days",
        detail: "Reviewed today. Longest: 5 days.",
      },
    ]);
  });

  it("a single day of reviews: one-day streak, one lit cell, no retention yet", () => {
    const vm = ready(
      vmOf(
        aStats({
          totals: { wordsLearned: 3, reviewCount: 4 },
          heatmap: aHeatmap([4]),
          streak: { current: 1, longest: 1, reviewedToday: true },
        }),
      ),
    );
    expect(tile(vm, "streak")).toMatchObject({
      value: "1 day",
      detail: "Reviewed today. Longest: 1 day.",
    });
    expect(tile(vm, "retention")).toMatchObject({
      value: "No data",
      detail: "No reviews of learned words in the last 30 days.",
    });
    expect(vm.heatmap.description).toBe("4 reviews on 1 day");
    expect(vm.heatmap.cells.filter((c) => c.level > 0)).toEqual([
      { date: "2026-11-15", label: "Sun, Nov 15: 4 reviews", level: 4 },
    ]);
    expect(vm.hardest.words).toEqual([]);
    expect(vm.hardest.emptyMessage).toBe("Nothing forgotten or answered wrong yet.");
  });

  it("a broken streak asks for a review today; an unbroken one waits for today", () => {
    const broken = ready(
      vmOf(history({ streak: { current: 0, longest: 4, reviewedToday: false } })),
    );
    expect(tile(broken, "streak")).toMatchObject({
      value: "0 days",
      detail: "Review today to start a new one. Longest: 4 days.",
    });
    const pending = ready(
      vmOf(history({ streak: { current: 3, longest: 3, reviewedToday: false } })),
    );
    expect(tile(pending, "streak")?.detail).toBe("Review today to keep it going. Longest: 3 days.");
  });

  it("lays the heatmap out in weeks from Monday, in quarter steps of the busiest day", () => {
    const vm = ready(vmOf(history()));
    expect(vm.heatmap).toMatchObject({
      title: "Last 12 weeks",
      description: "12 reviews on 3 days",
      range: "Aug 24 – Nov 15",
      // Aug 24, 2026 is a Monday.
      leadingBlanks: 0,
      legend: { less: "Less", more: "More" },
    });
    expect(vm.heatmap.cells).toHaveLength(84);
    expect(vm.heatmap.cells.slice(-4).map((c) => [c.label, c.level])).toEqual([
      ["Thu, Nov 12: 4 reviews", 3],
      ["Fri, Nov 13: No reviews", 0],
      ["Sat, Nov 14: 2 reviews", 2],
      ["Sun, Nov 15: 6 reviews", 4],
    ]);
    // Ending on a Wednesday, the first day is a Thursday: three blanks.
    const wed = ready(vmOf(history({ heatmap: aHeatmap([1], "2026-11-18") })));
    expect(wed.heatmap.leadingBlanks).toBe(3);
    expect(wed.heatmap.range).toBe("Aug 27 – Nov 18");

    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => heatLevel(n, 8))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(heatLevel(0, 0)).toBe(0);
  });

  it("lists the hardest words with their course, linking to it", () => {
    const vm = ready(vmOf(history()));
    expect(vm.hardest.title).toBe("Hardest words");
    expect(vm.hardest.words.map(({ term, course, detail }) => ({ term, course, detail }))).toEqual([
      { term: "la biblioteca", course: "Spanish", detail: "1 lapse · 2 of 4 wrong" },
      { term: "danke", course: "German", detail: "No lapses · 1 of 3 wrong" },
    ]);
    expect(vm.hardest.words[0]?.route).toEqual({ to: "course", courseId: spanish.id });
  });
});
