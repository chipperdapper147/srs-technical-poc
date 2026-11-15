import { describe, expect, it } from "vitest";
import { anAnswerResult, aStudyItem } from "../testing/fixtures.ts";
import type { ActiveStudyState, StudyState } from "./controller.ts";
import { initSession, sessionReducer } from "./session.ts";
import { studyViewModel } from "./view-model.ts";

const base = { courseId: "c1" as string | null, mode: "learn" as const };
const lenient = { mode: "lenient", accentSensitive: false } as const;
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
    courseTitle: "Spanish",
    context: { [item.itemId]: { courseTitle: "Spanish", lang: "es", grading: lenient } },
    session: initSession("learn", [item]),
    input: "",
    copyMiss: false,
    submitting: false,
    answerError: null,
    stepStartedAt: 0,
    hints: 0,
    attempt: 0,
    aidPending: null,
    aidError: null,
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
    expect(vm(active())).toMatchObject({
      heading: "Study: Spanish",
      backLabel: "Spanish",
      back: { to: "course", courseId: "c1" },
      lang: "es",
    });
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
      courseTitle: null,
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
        note: null,
        nextReview: "Next review <2026-11-14T09:00:00.000Z>",
        override: null,
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

  it("reviews across courses: names each item's course, types in its language, goes back home", () => {
    const hola = aStudyItem({ term: "hola", definition: "hello", isNew: false });
    const danke = aStudyItem({ term: "danke", definition: "thanks", isNew: false });
    const mixed: ActiveStudyState = {
      ...active(),
      courseId: null,
      mode: "review",
      courseTitle: null,
      context: {
        [hola.itemId]: { courseTitle: "Spanish", lang: "es", grading: lenient },
        [danke.itemId]: { courseTitle: "German", lang: "de", grading: lenient },
      },
      session: initSession("review", [hola, danke]),
    };
    expect(vm(mixed)).toMatchObject({
      kind: "session",
      heading: "Review: all courses",
      backLabel: "Home",
      back: { to: "home" },
      lang: "es",
      step: { kind: "quiz", courseTitle: "Spanish", prompt: "hello" },
    });
    const second = { ...mixed, session: { ...mixed.session, index: 1 } };
    expect(vm(second)).toMatchObject({
      lang: "de",
      step: { courseTitle: "German", prompt: "thanks" },
    });
    expect(step({ ...mixed, session: { ...mixed.session, index: 2 } })).toMatchObject({
      kind: "summary",
      backLabel: "Back to home",
      back: { to: "home" },
    });
    expect(vm({ courseId: null, mode: "review", status: "empty" })).toEqual({
      kind: "empty",
      message: "Nothing due right now.",
      backLabel: "Back to home",
      back: { to: "home" },
    });
  });

  describe("study aids", () => {
    /** The quiz step for "la biblioteca", after the copy step. */
    function quiz(overrides: Partial<ActiveStudyState> = {}): ActiveStudyState {
      const s = active(overrides);
      return { ...s, session: sessionReducer(s.session, { type: "presented" }) };
    }
    const graded = (s: ActiveStudyState, result: ReturnType<typeof anAnswerResult>) => ({
      ...s,
      session: sessionReducer(s.session, { type: "graded", result }),
    });

    it("offers a hint, showing one more letter each time, and says what it costs", () => {
      expect(step(quiz())).toMatchObject({
        hint: { label: "Hint", canHint: true, text: null, note: null },
      });
      expect(step(quiz({ hints: 3 }))).toMatchObject({
        hint: {
          canHint: true,
          text: "la b…",
          note: "With a hint, a correct answer counts as hard.",
        },
      });
      expect(step(quiz({ hints: 12 }))).toMatchObject({
        hint: {
          canHint: false,
          text: "la biblioteca",
          note: "The whole word is shown: this answer will count as not known yet.",
        },
      });
      expect(step(quiz({ hints: 1, submitting: true }))).toMatchObject({
        hint: { canHint: false },
      });
      expect(step(graded(quiz(), anAnswerResult()))).toMatchObject({ hint: null });
    });

    it("explains a rating the hints capped", () => {
      expect(step(graded(quiz({ hints: 1 }), anAnswerResult({ rating: 2 })))).toMatchObject({
        feedback: {
          verdict: "exact",
          title: "Correct",
          note: "Rated hard because you used a hint.",
        },
      });
      expect(step(graded(quiz({ hints: 12 }), anAnswerResult({ rating: 1 })))).toMatchObject({
        feedback: { note: "The whole word was shown, so it counts as not known yet." },
      });
    });

    it('offers "I was right" for a wrong or typo answer while it would raise the rating', () => {
      const wrong = anAnswerResult({ verdict: "wrong", rating: 1, term: "la biblioteca" });
      const typo = anAnswerResult({ verdict: "typo", rating: 2, matched: "biblioteca" });
      expect(step(graded(quiz(), wrong))).toMatchObject({
        feedback: { override: { label: "I was right", busy: false } },
      });
      expect(step(graded(quiz(), typo))).toMatchObject({ feedback: { override: { busy: false } } });
      expect(step(graded(quiz({ aidPending: "override" }), wrong))).toMatchObject({
        feedback: { override: { busy: true } },
      });
      // A hinted typo is Hard already, and the whole word shown stays Again.
      expect(step(graded(quiz({ hints: 1 }), typo))).toMatchObject({
        feedback: { override: null },
      });
      expect(step(graded(quiz({ hints: 12 }), wrong))).toMatchObject({
        feedback: { override: null },
      });
      // Not against an API without review ids.
      const old = anAnswerResult({ verdict: "wrong", rating: 1, reviewId: undefined });
      expect(step(graded(quiz(), old))).toMatchObject({ feedback: { override: null } });
    });

    it("shows an overridden answer as counted correct", () => {
      const wrong = anAnswerResult({ verdict: "wrong", rating: 1, term: "la biblioteca" });
      const s = graded(quiz(), wrong);
      const overridden = {
        ...s,
        session: sessionReducer(s.session, {
          type: "overridden",
          result: { ...wrong, rating: 3, overridden: true },
        }),
      };
      expect(step(overridden)).toMatchObject({
        feedback: {
          verdict: "exact",
          title: "Counted as correct",
          answer: "la biblioteca",
          note: null,
          override: null,
        },
      });
    });

    it("offers undo once there is an answer, from any later step, and reports failures", () => {
      expect(vm(quiz())).toMatchObject({ undo: null, aidError: null, stepKey: "1.0" });
      const s = graded(quiz(), anAnswerResult());
      expect(vm(s)).toMatchObject({ undo: { label: "Undo last answer", busy: false } });
      const done = { ...s, session: sessionReducer(s.session, { type: "next" }), attempt: 1 };
      expect(vm(done)).toMatchObject({ stepKey: "2.1", undo: { busy: false } });
      expect(vm({ ...done, aidPending: "undo", aidError: "Too late" })).toMatchObject({
        undo: { busy: true },
        aidError: "Too late",
      });
    });
  });
});
