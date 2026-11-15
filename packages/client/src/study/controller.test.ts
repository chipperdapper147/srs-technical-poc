import { describe, expect, it } from "vitest";
import { queryKeys } from "../api/query-keys.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aMe, aStats, aStudyItem, someWords } from "../testing/fixtures.ts";
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

  it("refreshes the dashboard and the stats when the session ends", async () => {
    const { controller, deps } = await startSession("review");
    const key = queryKeys.dashboard(deps.clock.timeZone());
    const statsKey = queryKeys.stats(deps.clock.timeZone(), course.id);
    deps.queryClient.setQueryData(key, { dueCount: 1, courses: [], forecast: [] });
    deps.queryClient.setQueryData(statsKey, aStats());
    controller.actions.setInput("hola");
    controller.actions.submit();
    await waitForState(controller.store, (s) => isActive(s) && s.session.feedback !== null);
    expect(deps.queryClient.getQueryState(statsKey)?.isInvalidated).toBe(false);
    controller.actions.next();
    expect(deps.queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(deps.queryClient.getQueryState(statsKey)?.isInvalidated).toBe(true);
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

describe("study controller, all courses", () => {
  const danke = aStudyItem({ term: "danke", definition: "thanks", isNew: false });

  /** Add a strict German course with one due word next to the Spanish one. */
  function addGerman() {
    const german = aCourse({ title: "German", targetLang: "de", gradingMode: "strict" });
    fake.current.state.courses.push(german);
    fake.current.state.items[german.id] = [danke];
    fake.current.state.due[german.id] = [danke.itemId];
    return german;
  }

  async function startAll() {
    const deps = createTestDeps();
    // The mode is ignored: all courses are only ever reviewed.
    const controller = createStudyController(deps, { courseId: null, mode: "learn" });
    controller.start();
    const state = await waitForState(controller.store, (s) => s.status !== "loading");
    return { deps, controller, state };
  }

  it("reviews due words from every course in one session", async () => {
    addGerman();
    const { state } = await startAll();
    expect(state).toMatchObject({ courseId: null, mode: "review", status: "active" });
    if (!isActive(state)) throw new Error("expected an active session");
    expect(state.courseTitle).toBeNull();
    expect(state.session.queue.map((s) => `${s.kind}:${s.item.term}`)).toEqual([
      "quiz:hola",
      "quiz:danke",
    ]);
    expect(state.context[danke.itemId]).toEqual({
      courseTitle: "German",
      lang: "de",
      grading: { mode: "strict", accentSensitive: false },
    });
    expect(state.context[words[0]?.itemId ?? ""]).toMatchObject({ courseTitle: "Spanish" });
    expect(fake.current.requests.map((r) => r.path)).toEqual(["/study/review"]);
  });

  it("has the API grade each answer with its own course's settings", async () => {
    addGerman();
    const { controller } = await startAll();
    controller.actions.setInput("ola"); // lenient Spanish: a typo
    controller.actions.submit();
    const first = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.feedback !== null,
    );
    expect(isActive(first) && first.session.feedback?.verdict).toBe("typo");
    controller.actions.next();
    controller.actions.setInput("dank"); // strict German: wrong
    controller.actions.submit();
    const second = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.index === 1 && s.session.feedback !== null,
    );
    expect(isActive(second) && second.session.feedback?.verdict).toBe("wrong");
    expect(
      fake.current.requests.filter((r) => r.path === "/study/answers").map((r) => r.body),
    ).toEqual([
      expect.objectContaining({ itemId: words[0]?.itemId, answer: "ola" }),
      expect.objectContaining({ itemId: danke.itemId, answer: "dank" }),
    ]);
  });

  it("reports an empty review and a failed load", async () => {
    fake.current.state.due = {};
    expect((await startAll()).state.status).toBe("empty");
    fake.current.failNext("GET", "/study/review", 500, "Database down");
    expect((await startAll()).state).toMatchObject({ status: "error", message: "Database down" });
  });
});

describe("study controller, study aids", () => {
  const feedbackShown = (s: StudyState) => isActive(s) && s.session.feedback !== null;

  /** A review of the one due word, "hola". */
  async function review() {
    const started = await startSession("review");
    return started;
  }

  async function answerWith(
    controller: Awaited<ReturnType<typeof review>>["controller"],
    text: string,
  ) {
    controller.actions.setInput(text);
    controller.actions.submit();
    return waitForState(controller.store, feedbackShown);
  }

  const answers = () => fake.current.requests.filter((r) => r.path === "/study/answers");

  it("reveals a letter per hint, up to the whole word, and sends the count with the answer", async () => {
    const { controller } = await review();
    controller.actions.hint();
    controller.actions.hint();
    expect(controller.store.get()).toMatchObject({ hints: 2 });
    for (let i = 0; i < 5; i++) controller.actions.hint();
    expect(controller.store.get()).toMatchObject({ hints: 4 }); // "hola" has four letters
    const graded = await answerWith(controller, "hola");
    expect(answers().at(-1)?.body).toMatchObject({ answer: "hola", hints: 4 });
    expect(isActive(graded) && graded.session.feedback).toMatchObject({
      verdict: "exact",
      rating: 1,
    });
    controller.actions.hint(); // no hints once graded
    expect(controller.store.get()).toMatchObject({ hints: 4 });
  });

  it("starts each step without hints", async () => {
    const { controller } = await startSession("learn");
    for (const w of words) {
      controller.actions.setInput(w.term);
      controller.actions.submit();
    }
    controller.actions.hint();
    await answerWith(controller, "hola");
    controller.actions.next();
    expect(controller.store.get()).toMatchObject({ hints: 0, input: "" });
  });

  it('"I was right" regrades the shown answer on the server', async () => {
    const { controller } = await review();
    const wrong = await answerWith(controller, "adiós");
    if (!isActive(wrong)) throw new Error("expected an active session");
    expect(wrong.session.queue).toHaveLength(2); // re-queued
    const reviewId = wrong.session.feedback?.reviewId;
    controller.actions.override();
    expect(controller.store.get()).toMatchObject({ aidPending: "override" });
    const overridden = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.feedback?.overridden === true,
    );
    expect(fake.current.requests.at(-1)).toMatchObject({
      method: "POST",
      path: `/study/answers/${reviewId}/override`,
    });
    expect(overridden).toMatchObject({
      aidPending: null,
      session: { tally: { exact: 1, wrong: 0 }, feedback: { rating: 3 } },
    });
    expect(isActive(overridden) && overridden.session.queue).toHaveLength(1);
    controller.actions.next();
    expect(step(controller.store.get())).toBeUndefined();
  });

  it("waits for an override before moving on", async () => {
    const { controller } = await review();
    await answerWith(controller, "adiós");
    controller.actions.override();
    controller.actions.submit();
    controller.actions.next();
    await waitForState(controller.store, (s) => isActive(s) && s.aidPending === null);
    expect(controller.store.get()).toMatchObject({ session: { index: 0 } });
  });

  it("undoes the latest answer from the next step and goes back to it", async () => {
    const { controller, deps } = await startSession("learn");
    for (const w of words) {
      controller.actions.setInput(w.term);
      controller.actions.submit();
    }
    const graded = await answerWith(controller, "hola");
    const reviewId = isActive(graded) ? graded.session.feedback?.reviewId : undefined;
    controller.actions.next();
    controller.actions.setInput("bibli");
    deps.queryClient.setQueryData(queryKeys.courses, []);

    controller.actions.undo();
    const back = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.index === 3 && s.aidPending === null,
    );
    expect(fake.current.requests.at(-1)).toMatchObject({
      path: `/study/answers/${reviewId}/undo`,
    });
    expect(back).toMatchObject({
      input: "",
      hints: 0,
      session: { feedback: null, last: null, tally: { exact: 0 } },
    });
    expect(step(back)).toMatchObject({ kind: "quiz", item: { term: "hola" } });
    // The word is new again on the (fake) server, and the course data refetches.
    expect(fake.current.state.items[course.id]?.[0]?.isNew).toBe(true);
    expect(deps.queryClient.getQueryState(queryKeys.courses)?.isInvalidated).toBe(true);
  });

  it("undoes while the feedback shows, restarting the step", async () => {
    const { controller } = await review();
    await answerWith(controller, "hola");
    const before = controller.store.get();
    controller.actions.undo();
    const back = await waitForState(controller.store, (s) => isActive(s) && !s.session.feedback);
    expect(back).toMatchObject({ session: { index: 0 }, input: "" });
    expect(isActive(back) && isActive(before) && back.attempt).toBe(
      isActive(before) ? before.attempt + 1 : -1,
    );
  });

  it("stops offering an aid the server refuses as too late, and says why", async () => {
    const { controller } = await review();
    const graded = await answerWith(controller, "hola");
    const reviewId = isActive(graded) ? graded.session.feedback?.reviewId : "";
    fake.current.failNext(
      "POST",
      `/study/answers/${reviewId}/undo`,
      409,
      "Answers can only be changed for 10 minutes.",
    );
    controller.actions.undo();
    const refused = await waitForState(controller.store, (s) => isActive(s) && s.aidError !== null);
    expect(refused).toMatchObject({
      aidError: "Answers can only be changed for 10 minutes.",
      session: { last: null, index: 0 },
    });
  });

  it("keeps the aid on any other failure", async () => {
    const { controller } = await review();
    const graded = await answerWith(controller, "adiós");
    const reviewId = isActive(graded) ? graded.session.feedback?.reviewId : "";
    fake.current.failNext("POST", `/study/answers/${reviewId}/override`, 500, "Server down");
    controller.actions.override();
    const failed = await waitForState(controller.store, (s) => isActive(s) && s.aidError !== null);
    expect(failed).toMatchObject({ aidError: "Server down", session: { last: { reviewId } } });
  });

  it("works in a review of all courses", async () => {
    const deps = createTestDeps();
    const controller = createStudyController(deps, { courseId: null, mode: null });
    controller.start();
    await waitForState(controller.store, isActive);
    controller.actions.hint();
    const wrong = await answerWith(controller, "adiós");
    expect(answers().at(-1)?.body).toMatchObject({ hints: 1 });
    expect(isActive(wrong) && wrong.session.feedback?.rating).toBe(1);
    controller.actions.override();
    const overridden = await waitForState(
      controller.store,
      (s) => isActive(s) && s.session.feedback?.overridden === true,
    );
    // One hint: the override counts as Hard, not Good.
    expect(isActive(overridden) && overridden.session.feedback?.rating).toBe(2);
    controller.actions.undo();
    await waitForState(controller.store, (s) => isActive(s) && !s.session.feedback);
    expect(fake.current.requests.at(-1)?.path).toMatch(/\/undo$/);
  });
});
