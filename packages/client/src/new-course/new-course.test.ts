import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../api/query-keys.ts";
import { createTestDeps } from "../testing/deps.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createNewCourseController } from "./controller.ts";
import { newCourseViewModel } from "./view-model.ts";

const fake = setupFakeApi();

describe("new course", () => {
  it("creates the course, refreshes the list and navigates to it", async () => {
    const deps = createTestDeps();
    deps.queryClient.setQueryData(queryKeys.courses, []);
    const c = createNewCourseController(deps);
    c.start();
    expect(newCourseViewModel(c.store.get()).fields.sourceLang.value).toBe("en");
    c.actions.setField("title", "My French");
    c.actions.setField("targetLang", "fr");
    c.actions.submit();
    expect(newCourseViewModel(c.store.get()).submitting).toBe(true);
    await vi.waitFor(() => expect(deps.routes).toHaveLength(1));
    const created = fake.current.state.courses[0];
    expect(created).toMatchObject({ title: "My French", targetLang: "fr", sourceLang: "en" });
    expect(deps.routes).toEqual([{ to: "course", courseId: created?.id }]);
    expect(deps.queryClient.getQueryState(queryKeys.courses)?.isInvalidated).toBe(true);
  });

  it("shows the API's validation message and lets the learner retry", async () => {
    const deps = createTestDeps();
    const c = createNewCourseController(deps);
    c.start();
    c.actions.setField("title", "Bad");
    c.actions.setField("targetLang", "not a code");
    c.actions.submit();
    const s = await waitForState(c.store, (x) => x.error !== null);
    expect(newCourseViewModel(s)).toMatchObject({
      submitting: false,
      error: "Expected a BCP 47 language tag, e.g. 'es'",
    });
    expect(deps.routes).toEqual([]);
  });

  it("doesn't navigate after the screen is gone", async () => {
    const deps = createTestDeps();
    const c = createNewCourseController(deps);
    const stop = c.start();
    c.actions.setField("title", "Later");
    c.actions.setField("targetLang", "de");
    c.actions.submit();
    stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(deps.routes).toEqual([]);
  });
});
