import { describe, expect, it } from "vitest";
import { queryKeys } from "../api/query-keys.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aMe, someWords } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { type ActiveStudyState, createStudyController, type StudyState } from "./controller.ts";
import { currentStep } from "./session.ts";

const course = aCourse({ title: "Spanish", targetLang: "es", itemCount: 3 });
const words = someWords();
const fake = setupFakeApi(() => ({
  me: aMe({ newItemsPerSession: 10 }),
  courses: [course],
  items: { [course.id]: words },
  due: { [course.id]: [words[0]?.itemId ?? ""] },
}));

const isActive = (s: StudyState): s is ActiveStudyState => s.status === "active";

async function startSession(mode: string | null = "learn") {
  const deps = createTestDeps();
  const controller = createStudyController(deps, { courseId: course.id, mode });
  const stop = controller.start();
  const state = await waitForState(controller.store, (s) => s.status !== "loading");
  return { deps, controller, stop, state };
}

const step = (s: StudyState) => (isActive(s) ? currentStep(s.session) : undefined);

describe("study controller", () => {
  it("loads the course and a learn session, presenting new words first", async () => {
    const { state } = await startSession("learn");
    expect(state.status).toBe("active");
    expect(step(state)).toMatchObject({ kind: "present", item: { term: "hola" } });
  });

  it("treats an unknown mode as learn, and review shows only due words", async () => {
    expect((await startSession("bogus")).state.mode).toBe("learn");
    const { state } = await startSession("review");
    expect(isActive(state) && state.session.queue.map((x) => x.item.term)).toEqual(["hola"]);
  });

  it("reports an empty session", async () => {
    fake.current.state.due[course.id] = [];
    expect((await startSession("review")).state.status).toBe("empty");
  });

  it("reports a load failure", async () => {
    fake.current.failNext("GET", `/courses/${course.id}/study`, 500, "Database down");
    expect((await startSession()).state).toMatchObject({
      status: "error",
      message: "Database down",
    });
  });

  it("insists the copy step matches the shown word, then moves on", async () => {
    const { controller } = await startSession();
    controller.actions.setInput("adios");
    controller.actions.submit();
    expect(controller.store.get()).toMatchObject({ copyMiss: true });
    controller.actions.setInput("hola");
    expect(controller.store.get()).toMatchObject({ copyMiss: false });
    controller.actions.submit();
    expect(controller.store.get()).toMatchObject({ input: "", session: { index: 1 } });
  });

  it("grades a quiz answer on the server, with the time taken, then continues", async () => {
    const { controller, deps } = await startSession();
    for (const w of words) {
      controller.actions.setInput(w.term);
      controller.actions.submit();
    }
    deps.tick(1500);
    controller.actions.setInput("hola");
    controller.actions.submit();
    const graded = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.feedback !== null,
    );
    expect(isActive(graded) && graded.session.feedback).toMatchObject({ verdict: "exact" });
    expect(fake.current.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/study/answers",
      body: { itemId: words[0]?.itemId, answer: "hola", durationMs: 1500 },
    });
    controller.actions.submit(); // Enter on feedback continues
    expect(step(controller.store.get())).toMatchObject({
      kind: "quiz",
      item: { term: "la biblioteca" },
    });
  });

  it("ignores Check with a blank answer and while a check is in flight", async () => {
    const { controller } = await startSession("review");
    controller.actions.setInput("   ");
    controller.actions.submit();
    controller.actions.setInput("hola");
    controller.actions.submit();
    controller.actions.submit();
    await waitForState(controller.store, (s) => isActive(s) && s.session.feedback !== null);
    expect(fake.current.requests.filter((r) => r.path === "/study/answers")).toHaveLength(1);
  });

  it("keeps the answer and shows the error when grading fails", async () => {
    const { controller } = await startSession("review");
    fake.current.failNext("POST", "/study/answers", 500, "Grading failed");
    controller.actions.setInput("hola");
    controller.actions.submit();
    const failed = await waitForState(
      controller.store,
      (s) => isActive(s) && s.answerError !== null,
    );
    expect(failed).toMatchObject({
      answerError: "Grading failed",
      input: "hola",
      submitting: false,
    });
  });

  it("refreshes course data when the session ends", async () => {
    const { controller, deps } = await startSession("review");
    deps.queryClient.setQueryData(queryKeys.courses, []);
    controller.actions.setInput("hola");
    controller.actions.submit();
    await waitForState(controller.store, (s) => isActive(s) && s.session.feedback !== null);
    expect(deps.queryClient.getQueryState(queryKeys.courses)?.isInvalidated).toBe(false);
    controller.actions.next();
    expect(step(controller.store.get())).toBeUndefined();
    expect(deps.queryClient.getQueryState(queryKeys.courses)?.isInvalidated).toBe(true);
  });

  it("ignores a load that finishes after the screen stopped", async () => {
    const deps = createTestDeps();
    const controller = createStudyController(deps, { courseId: course.id, mode: "learn" });
    const stop = controller.start();
    stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(controller.store.get().status).toBe("loading");
  });
});
