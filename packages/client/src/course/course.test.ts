import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aUnit } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { type CourseState, createCourseController } from "./controller.ts";
import { courseViewModel } from "./view-model.ts";

const mine = aCourse({
  title: "My Spanish",
  description: "Travel words",
  itemCount: 3,
  learnedCount: 1,
  dueCount: 0,
  units: [aUnit({ title: "Basics", itemCount: 3, learnedCount: 1 })],
});
const shared = aCourse({ title: "Sample", editable: false });
const fake = setupFakeApi(() => ({ courses: [mine, shared] }));

async function open(courseId = mine.id) {
  const deps = createTestDeps();
  const c = createCourseController(deps, { courseId });
  c.start();
  await waitForState(c.store, (s) => s.course.status !== "loading");
  return { c, deps };
}
const ready = (s: CourseState) => {
  const vm = courseViewModel(s);
  if (vm.kind !== "ready") throw new Error(vm.kind);
  return vm;
};

describe("course", () => {
  it("maps the course: study links, units, editing sections", async () => {
    const { c } = await open();
    const vm = ready(c.store.get());
    expect(vm).toMatchObject({
      title: "My Spanish",
      description: "Travel words",
      learn: {
        label: "Learn new words (2)",
        disabled: false,
        route: { to: "study", mode: "learn" },
      },
      review: { label: "Review (0 due)", disabled: true },
      unitsEmpty: null,
      units: [{ label: "1. Basics", count: "1 / 3" }],
      readOnlyNotice: null,
    });
    expect(vm.editing?.grading.mode.value).toBe("inherit");
    expect(vm.editing?.import).toMatchObject({
      canSubmit: false,
      submitLabel: "Import",
      result: null,
    });
  });

  it("makes shared courses read-only", async () => {
    const { c } = await open(shared.id);
    expect(ready(c.store.get())).toMatchObject({
      editing: null,
      readOnlyNotice: expect.stringContaining("This is a shared course"),
      unitsEmpty: "No words yet. Import a CSV below.",
    });
  });

  it("saves a grading override and shows the saved value", async () => {
    const { c } = await open();
    c.actions.setGradingMode("strict");
    await waitForState(c.store, (s) => ready(s).editing?.grading.mode.value === "strict");
    c.actions.setAccents("true");
    await waitForState(c.store, (s) => ready(s).editing?.grading.accents.value === "true");
    c.actions.setGradingMode("inherit");
    await waitForState(c.store, (s) => ready(s).editing?.grading.mode.value === "inherit");
    expect(fake.current.requests.filter((r) => r.method === "PATCH").map((r) => r.body)).toEqual([
      { gradingMode: "strict" },
      { accentSensitive: true },
      { gradingMode: null },
    ]);
  });

  it("imports CSV, clears the text, reports counts and refreshes the course", async () => {
    const { c } = await open();
    c.actions.setCsv("unit,term,definition\nFood,el agua,water\nFood,el pan,bread\n");
    expect(ready(c.store.get()).editing?.import.canSubmit).toBe(true);
    c.actions.importCsv();
    expect(ready(c.store.get()).editing?.import).toMatchObject({
      submitLabel: "Importing…",
      canSubmit: false,
    });
    const done = await waitForState(c.store, (s) => ready(s).units.length === 2);
    expect(ready(done).editing?.import).toMatchObject({
      csv: "",
      result: "Imported 2 words (1 new units).",
    });
  });

  it("shows an import error and keeps the text", async () => {
    const { c } = await open();
    c.actions.setCsv("word,meaning\nhola,hello\n");
    c.actions.importCsv();
    const s = await waitForState(c.store, (x) => x.importError !== null);
    expect(ready(s).editing?.import).toMatchObject({
      error: 'CSV is missing the "unit" column',
      csv: "word,meaning\nhola,hello\n",
    });
  });

  it("shows a grading save error", async () => {
    const { c } = await open();
    fake.current.failNext("PATCH", `/courses/${mine.id}`, 500, "Save failed");
    c.actions.setGradingMode("strict");
    const s = await waitForState(c.store, (x) => x.gradingError !== null);
    expect(ready(s).editing?.grading.error).toBe("Save failed");
  });

  it("reports a missing course", async () => {
    const { c } = await open("00000000-0000-4000-8000-999999999999");
    expect(courseViewModel(c.store.get())).toEqual({ kind: "error", message: "Course not found" });
  });
});
