import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aForecast } from "../testing/fake-api.ts";
import { aCourse } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createDashboardController, type DashboardState } from "./controller.ts";
import { type DashboardReadyVM, dashboardViewModel } from "./view-model.ts";

const fake = setupFakeApi(() => ({
  courses: [
    aCourse({ title: "Spanish", targetLang: "es", sourceLang: "en", dueCount: 3 }),
    aCourse({ title: "German", targetLang: "de", sourceLang: "en", dueCount: 0 }),
  ],
  forecast: aForecast([4, 0, 2, 1, 0, 0, 8]),
}));

async function load(deps = createTestDeps()) {
  const c = createDashboardController(deps);
  c.start();
  return waitForState(c.store, (s) => s.dashboard.status !== "loading");
}

const ready = (s: DashboardState): DashboardReadyVM => {
  const { body } = dashboardViewModel(s);
  if (body.kind !== "ready") throw new Error(`expected ready, got ${body.kind}`);
  return body;
};

describe("dashboard", () => {
  it("asks for the forecast in the learner's time zone", async () => {
    await load(createTestDeps(undefined, { timeZone: "America/Los_Angeles" }));
    expect(fake.current.requests.at(-1)).toMatchObject({
      method: "GET",
      path: "/dashboard",
      search: "?timeZone=America%2FLos_Angeles",
    });
  });

  it("shows the total due, one review-all action, and due counts per course", async () => {
    const vm = ready(await load());
    expect(vm.summary).toEqual({ count: "3", unit: "reviews due", detail: "in Spanish" });
    expect(vm.reviewAll).toEqual({
      label: "Review all due",
      route: { to: "reviewAll" },
      disabled: false,
    });
    expect(vm.coursesTitle).toBe("Due by course");
    expect(vm.courses).toEqual([
      expect.objectContaining({
        title: "Spanish",
        languages: "Spanish for English speakers",
        due: "3 due",
        hasDue: true,
        route: { to: "course", courseId: fake.current.state.courses[0]?.id },
      }),
      expect.objectContaining({ title: "German", due: "Nothing due", hasDue: false }),
    ]);
  });

  it("counts courses and disables review-all when nothing is due", async () => {
    const [es, de] = fake.current.state.courses;
    if (!es || !de) throw new Error("seed");
    fake.current.state.courses = [
      { ...es, dueCount: 1 },
      { ...de, dueCount: 2 },
    ];
    expect(ready(await load()).summary).toEqual({
      count: "3",
      unit: "reviews due",
      detail: "across 2 courses",
    });

    fake.current.state.courses = [{ ...es, dueCount: 0 }];
    fake.current.state.forecast = aForecast([1]);
    const none = ready(await load());
    expect(none.summary).toEqual({
      count: "0",
      unit: "reviews due",
      detail: "Nothing due right now.",
    });
    expect(none.reviewAll.disabled).toBe(true);
  });

  it("labels the forecast by day, with bars relative to the busiest day", async () => {
    const { forecast } = ready(await load());
    expect(forecast.title).toBe("Next 7 days");
    expect(forecast.description).toBe("Reviews falling due each day. Today includes any overdue.");
    expect(forecast.days.map((d) => [d.day, d.dateLabel, d.countLabel, d.share])).toEqual([
      ["Today", "Nov 14", "4 reviews", 50],
      ["Tomorrow", "Nov 15", "None", 0],
      ["Mon", "Nov 16", "2 reviews", 25],
      ["Tue", "Nov 17", "1 review", 12.5],
      ["Wed", "Nov 18", "None", 0],
      ["Thu", "Nov 19", "None", 0],
      ["Fri", "Nov 20", "8 reviews", 100],
    ]);
    expect(forecast.days[0]).toMatchObject({ date: "2026-11-14", count: 4 });
  });

  it("draws empty bars when nothing is coming up", () => {
    const vm = dashboardViewModel({
      environment: "production",
      dashboard: {
        status: "ready",
        data: { dueCount: 0, courses: [aCourse()], forecast: aForecast() },
      },
    });
    expect(vm.body.kind === "ready" && vm.body.forecast.days.every((d) => d.share === 0)).toBe(
      true,
    );
  });

  it("without courses, points to creating one; the seed hint only in development (#40)", () => {
    const data = { dueCount: 0, courses: [], forecast: aForecast() };
    const empty = (environment: DashboardState["environment"]) =>
      dashboardViewModel({ environment, dashboard: { status: "ready", data } }).body;
    expect(empty("production")).toEqual({
      kind: "empty",
      message: "No courses yet. Create one to get started.",
      newCourse: { label: "New course", route: { to: "newCourse" } },
    });
    expect(empty("development")).toMatchObject({
      message: "No courses yet. Create one or run `pnpm db:seed`.",
    });
  });

  it("maps loading and errors under the heading", async () => {
    expect(
      dashboardViewModel({ environment: "production", dashboard: { status: "loading" } }),
    ).toEqual({ heading: "Home", body: { kind: "loading" } });
    fake.current.failNext("GET", "/dashboard", 500, "Database down");
    const s = await load();
    expect(dashboardViewModel(s)).toEqual({
      heading: "Home",
      body: { kind: "error", message: "Database down" },
    });
  });
});
