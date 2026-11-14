import { describe, expect, it } from "vitest";
import { aCourse, anAnswerResult, aStudyItem } from "../testing/fixtures.ts";
import type { ActiveStudyState, StudyState } from "./controller.ts";
import { initSession, sessionReducer } from "./session.ts";
import { studyViewModel } from "./view-model.ts";

const base = { courseId: "c1", mode: "learn" as const };
const fmt = (iso: string) => `<${iso}>`;

function active(overrides: Partial<ActiveStudyState> = {}): ActiveStudyState {
  const item = aStudyItem({
    term: "la biblioteca",
    definition: "library",
    alternatives: ["biblioteca"],
    notes: "False friend",
  });
  return {
    ...base,
    status: "active",
    course: aCourse({ title: "Spanish", targetLang: "es" }),
    grading: { mode: "lenient", accentSensitive: false },
    session: initSession("learn", [item]),
    input: "",
    copyMiss: false,
    submitting: false,
    answerError: null,
    stepStartedAt: 0,
    ...overrides,
  };
}

const vm = (s: StudyState) => studyViewModel(s, fmt);
const step = (s: StudyState) => {
  const v = vm(s);
  if (v.kind !== "session") throw new Error(`expected session, got ${v.kind}`);
  return v.step;
};

describe("studyViewModel", () => {
  it("maps loading and errors", () => {
    expect(vm({ ...base, status: "loading" })).toEqual({ kind: "loading" });
    expect(vm({ ...base, status: "error", message: "boom" })).toEqual({
      kind: "error",
      message: "boom",
    });
  });

  it("explains an empty session per mode, with a way back", () => {
    expect(vm({ ...base, status: "empty" })).toMatchObject({
      kind: "empty",
      message: "No new words left in this course.",
      back: { to: "course", courseId: "c1" },
    });
    expect(vm({ ...base, mode: "review", status: "empty" })).toMatchObject({
      message: "Nothing due right now.",
    });
  });

  it("presents a new word with its alternatives and notes", () => {
    expect(step(active())).toMatchObject({
      kind: "present",
      badge: "New word",
      term: "la biblioteca",
      definition: "library",
      alsoAccepted: "Also: biblioteca",
      notes: "False friend",
      placeholder: "Type it to continue",
      miss: null,
    });
    expect(step(active({ copyMiss: true }))).toMatchObject({
      miss: "Type the word as shown above.",
    });
  });

  it("enables Check only for a non-blank answer that isn't already submitting", () => {
    const quiz = active();
    const s = { ...quiz, session: sessionReducer(quiz.session, { type: "presented" }) };
    expect(step({ ...s, input: "  " })).toMatchObject({
      kind: "quiz",
      prompt: "library",
      canCheck: false,
    });
    expect(step({ ...s, input: "biblioteca" })).toMatchObject({ canCheck: true, locked: false });
    expect(step({ ...s, input: "biblioteca", submitting: true })).toMatchObject({
      canCheck: false,
    });
  });

  it("shows feedback: the matched spelling for a typo, the term when wrong, nothing when exact", () => {
    const quiz = active();
    const at = (result: ReturnType<typeof anAnswerResult>) => {
      const presented = sessionReducer(quiz.session, { type: "presented" });
      return step({ ...quiz, session: sessionReducer(presented, { type: "graded", result }) });
    };
    expect(at(anAnswerResult({ verdict: "exact" }))).toMatchObject({
      locked: true,
      feedback: {
        verdict: "exact",
        title: "Correct",
        answer: null,
        nextReview: "Next review <2026-11-14T09:00:00.000Z>",
      },
    });
    expect(
      at(anAnswerResult({ verdict: "typo", matched: "biblioteca", term: "la biblioteca" })),
    ).toMatchObject({
      feedback: { title: "Almost: watch the spelling", answer: "biblioteca" },
    });
    expect(
      at(anAnswerResult({ verdict: "wrong", matched: "biblioteca", term: "la biblioteca" })),
    ).toMatchObject({
      feedback: { title: "Not quite", answer: "la biblioteca" },
    });
  });

  it("summarises the tally when the session is done", () => {
    const s = active();
    const done = {
      ...s,
      session: {
        ...s.session,
        index: s.session.queue.length,
        tally: { exact: 2, typo: 1, wrong: 0 },
      },
    };
    const v = vm(done);
    expect(v).toMatchObject({
      kind: "session",
      heading: "Study: Spanish",
      progress: 100,
      progressLabel: "Session progress",
      stepIndex: 2,
    });
    expect(step(done)).toEqual({
      kind: "summary",
      title: "Session complete",
      tally: [
        { label: "Correct", verdict: "exact", count: 2 },
        { label: "Almost (typo)", verdict: "typo", count: 1 },
        { label: "Wrong", verdict: "wrong", count: 0 },
      ],
      backLabel: "Back to course",
      back: { to: "course", courseId: "c1" },
    });
  });
});
