import type { AnswerResult, StudyItem } from "@app/shared";
import { describe, expect, it } from "vitest";
import { currentStep, initSession, isFinished, MAX_RETRIES, sessionReducer } from "./session.ts";

const item = (term: string): StudyItem => ({
  itemId: `id-${term}`,
  unitTitle: "U",
  term,
  definition: `def ${term}`,
  alternatives: [],
  notes: "",
  isNew: true,
});

const result = (
  verdict: AnswerResult["verdict"],
  overrides: Partial<AnswerResult> = {},
): AnswerResult => ({
  verdict,
  matched: "x",
  term: "x",
  rating: verdict === "exact" ? 3 : verdict === "typo" ? 2 : 1,
  nextDue: new Date().toISOString(),
  ...overrides,
});

describe("study session", () => {
  it("learn mode presents every item before quizzing", () => {
    const s = initSession("learn", [item("a"), item("b")]);
    expect(s.queue.map((q) => `${q.kind}:${q.item.term}`)).toEqual([
      "present:a",
      "present:b",
      "quiz:a",
      "quiz:b",
    ]);
  });

  it("review mode only quizzes", () => {
    const s = initSession("review", [item("a")]);
    expect(s.queue.map((q) => q.kind)).toEqual(["quiz"]);
  });

  it("advances through a perfect session", () => {
    let s = initSession("learn", [item("a")]);
    s = sessionReducer(s, { type: "presented" });
    s = sessionReducer(s, { type: "graded", result: result("exact") });
    expect(s.feedback?.verdict).toBe("exact");
    s = sessionReducer(s, { type: "next" });
    expect(isFinished(s)).toBe(true);
    expect(s.tally).toEqual({ exact: 1, typo: 0, wrong: 0 });
  });

  it("re-queues wrong answers up to MAX_RETRIES times", () => {
    let s = initSession("review", [item("a")]);
    for (let i = 0; i <= MAX_RETRIES; i++) {
      expect(currentStep(s)?.item.term).toBe("a");
      s = sessionReducer(s, { type: "graded", result: result("wrong") });
      s = sessionReducer(s, { type: "next" });
    }
    expect(isFinished(s)).toBe(true);
    expect(s.tally.wrong).toBe(MAX_RETRIES + 1);
  });

  it("does not re-queue typos", () => {
    let s = initSession("review", [item("a")]);
    s = sessionReducer(s, { type: "graded", result: result("typo") });
    s = sessionReducer(s, { type: "next" });
    expect(isFinished(s)).toBe(true);
  });

  it("ignores out-of-order actions", () => {
    const s = initSession("learn", [item("a")]);
    expect(sessionReducer(s, { type: "next" })).toBe(s);
    expect(sessionReducer(s, { type: "graded", result: result("exact") })).toBe(s);
  });

  it("re-queues an exact answer given with the whole word hinted (rated Again)", () => {
    let s = initSession("review", [item("a")]);
    s = sessionReducer(s, { type: "graded", result: result("exact", { rating: 1 }) });
    expect(s.queue).toHaveLength(2);
    expect(s.tally.exact).toBe(1);
  });
});

describe("study aids in the session", () => {
  const graded = (s: ReturnType<typeof initSession>, r: AnswerResult) =>
    sessionReducer(s, { type: "graded", result: r });

  it("remembers the latest answer and the session before it, one deep", () => {
    let s = initSession("review", [item("a"), item("b")]);
    expect(s.last).toBeNull();
    s = graded(s, result("exact", { reviewId: "r1" }));
    expect(s.last).toMatchObject({ reviewId: "r1", before: { index: 0, feedback: null } });
    s = sessionReducer(s, { type: "next" });
    s = graded(s, result("exact", { reviewId: "r2" }));
    expect(s.last?.reviewId).toBe("r2");
    expect(s.last?.before.last).toBeNull();
    // An API without review ids offers nothing to undo.
    const old = graded(initSession("review", [item("a")]), result("exact"));
    expect(old.last).toBeNull();
  });

  it("an override regrades the shown answer as correct: no re-queue, tallied exact", () => {
    let s = initSession("review", [item("a")]);
    s = graded(s, result("wrong", { reviewId: "r1" }));
    expect(s.queue).toHaveLength(2);
    s = sessionReducer(s, {
      type: "overridden",
      result: result("wrong", { reviewId: "r1", rating: 3, overridden: true }),
    });
    expect(s.queue).toHaveLength(1);
    expect(s.retries).toEqual({});
    expect(s.tally).toEqual({ exact: 1, typo: 0, wrong: 0 });
    expect(s.feedback?.overridden).toBe(true);
    expect(s.last?.reviewId).toBe("r1");
    s = sessionReducer(s, { type: "next" });
    expect(isFinished(s)).toBe(true);
  });

  it("ignores an override for another answer, or once it moved on", () => {
    let s = initSession("review", [item("a"), item("b")]);
    s = graded(s, result("wrong", { reviewId: "r1" }));
    const other = result("wrong", { reviewId: "r9", rating: 3, overridden: true });
    expect(sessionReducer(s, { type: "overridden", result: other })).toBe(s);
    const moved = sessionReducer(s, { type: "next" });
    const late = result("wrong", { reviewId: "r1", rating: 3, overridden: true });
    expect(sessionReducer(moved, { type: "overridden", result: late })).toBe(moved);
  });

  it("undo goes back to just before the latest answer, even from the summary", () => {
    let s = initSession("review", [item("a")]);
    const start = s;
    s = graded(s, result("wrong", { reviewId: "r1" }));
    s = sessionReducer(s, { type: "next" });
    s = graded(s, result("exact", { reviewId: "r2" }));
    s = sessionReducer(s, { type: "next" });
    expect(isFinished(s)).toBe(true);
    s = sessionReducer(s, { type: "undone" });
    expect(s).toMatchObject({ index: 1, feedback: null, last: null });
    expect(s.tally).toEqual({ exact: 0, typo: 0, wrong: 1 });
    // Only one answer: a second undo does nothing.
    expect(sessionReducer(s, { type: "undone" })).toBe(s);
    expect(start.last).toBeNull();
  });
});
