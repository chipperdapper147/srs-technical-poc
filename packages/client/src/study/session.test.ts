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

const result = (verdict: AnswerResult["verdict"]): AnswerResult => ({
  verdict,
  matched: "x",
  term: "x",
  rating: verdict === "exact" ? 3 : verdict === "typo" ? 2 : 1,
  nextDue: new Date().toISOString(),
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
});
