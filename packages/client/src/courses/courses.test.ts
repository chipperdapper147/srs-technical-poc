import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createCoursesController } from "./controller.ts";
import { coursesViewModel } from "./view-model.ts";

const fake = setupFakeApi(() => ({
  courses: [
    aCourse({
      title: "Spanish",
      targetLang: "es",
      sourceLang: "en",
      itemCount: 4,
      learnedCount: 1,
      dueCount: 2,
    }),
  ],
}));

describe("courses", () => {
  it("loads the list and maps cards", async () => {
    const c = createCoursesController(createTestDeps());
    c.start();
    const s = await waitForState(c.store, (x) => x.courses.status === "ready");
    const vm = coursesViewModel(s);
    expect(vm.newCourse).toEqual({ label: "New course", route: { to: "newCourse" } });
    expect(vm.body).toMatchObject({
      kind: "list",
      courses: [
        {
          title: "Spanish",
          languages: "Spanish for English speakers",
          due: "2 due",
          progress: { value: 25, label: "Spanish progress" },
          learned: "1 / 4 words learned",
        },
      ],
    });
  });

  it("shows the empty state and errors", async () => {
    fake.current.state.courses = [];
    const c = createCoursesController(createTestDeps());
    c.start();
    expect(
      coursesViewModel(await waitForState(c.store, (x) => x.courses.status === "ready")).body.kind,
    ).toBe("empty");

    fake.current.failNext("GET", "/courses", 500, "Database down");
    const d = createCoursesController(createTestDeps());
    d.start();
    const s = await waitForState(d.store, (x) => x.courses.status === "error");
    expect(coursesViewModel(s).body).toEqual({ kind: "error", message: "Database down" });
  });

  it("mentions the seed only in a development build (#40)", () => {
    const empty = { status: "ready" as const, data: [] };
    expect(coursesViewModel({ courses: empty, environment: "development" }).body).toEqual({
      kind: "empty",
      message: "No courses yet. Create one or run `pnpm db:seed`.",
    });
    expect(coursesViewModel({ courses: empty, environment: "production" }).body).toEqual({
      kind: "empty",
      message: "No courses yet. Create one to get started.",
    });
  });

  it("takes the environment from the platform", async () => {
    fake.current.state.courses = [];
    const c = createCoursesController(createTestDeps(undefined, { environment: "development" }));
    c.start();
    const s = await waitForState(c.store, (x) => x.courses.status === "ready");
    expect(coursesViewModel(s).body).toMatchObject({ message: expect.stringContaining("db:seed") });
  });

  it("hides the due badge when nothing is due, and handles empty courses", () => {
    const vm = coursesViewModel({
      courses: { status: "ready", data: [aCourse({ title: "Empty", itemCount: 0, dueCount: 0 })] },
      environment: "production",
    });
    expect(vm.body).toMatchObject({ courses: [{ due: null, progress: { value: 0 } }] });
  });
});
