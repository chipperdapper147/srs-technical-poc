/**
 * Study screen view model: what to show, as plain data. Text the learner
 * reads lives here so web and mobile say the same thing; styling does not.
 */
import type { Verdict } from "@app/shared";
import type { Route } from "../core/ports.ts";
import type { StudyState } from "./controller.ts";
import { currentStep, progress } from "./session.ts";

export interface FeedbackVM {
  verdict: Verdict;
  title: string;
  /** The answer to learn from, or null when the learner got it exactly. */
  answer: string | null;
  nextReview: string;
}

export type StudyStepVM =
  | {
      kind: "present";
      badge: string;
      unitTitle: string;
      term: string;
      definition: string;
      alsoAccepted: string | null;
      notes: string | null;
      input: string;
      placeholder: string;
      miss: string | null;
    }
  | {
      kind: "quiz";
      unitTitle: string;
      prompt: string;
      input: string;
      placeholder: string;
      /** Feedback is showing: the answer can't be edited, Enter continues. */
      locked: boolean;
      canCheck: boolean;
      checkLabel: string;
      continueLabel: string;
      feedback: FeedbackVM | null;
      error: string | null;
    }
  | {
      kind: "summary";
      title: string;
      tally: { label: string; verdict: Verdict; count: number }[];
      backLabel: string;
      back: Route;
    };

export type StudyVM =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string; backLabel: string; back: Route }
  | {
      kind: "session";
      /** The screen's level-one heading, for assistive tech: it names the course being studied. */
      heading: string;
      courseTitle: string;
      back: Route;
      /** 0–100. */
      progress: number;
      progressLabel: string;
      /** Changes whenever the step does (the e2e page objects wait on it). */
      stepIndex: number;
      /** BCP 47 tag of the language being typed. */
      lang: string;
      step: StudyStepVM;
    };

export const FEEDBACK_TITLES: Record<Verdict, string> = {
  exact: "Correct",
  typo: "Almost: watch the spelling",
  wrong: "Not quite",
};

const defaultFormat = (iso: string) => new Date(iso).toLocaleString();

export function studyViewModel(
  state: StudyState,
  formatDateTime: (iso: string) => string = defaultFormat,
): StudyVM {
  const back: Route = { to: "course", courseId: state.courseId };
  switch (state.status) {
    case "loading":
      return { kind: "loading" };
    case "error":
      return { kind: "error", message: state.message };
    case "empty":
      return {
        kind: "empty",
        message:
          state.mode === "learn" ? "No new words left in this course." : "Nothing due right now.",
        backLabel: "Back to course",
        back,
      };
    case "active": {
      const { session } = state;
      const step = currentStep(session);
      return {
        kind: "session",
        heading: `Study: ${state.course.title}`,
        courseTitle: state.course.title,
        back,
        progress: progress(session) * 100,
        progressLabel: "Session progress",
        stepIndex: session.index,
        lang: state.course.targetLang,
        step: !step
          ? {
              kind: "summary",
              title: "Session complete",
              tally: [
                { label: "Correct", verdict: "exact", count: session.tally.exact },
                { label: "Almost (typo)", verdict: "typo", count: session.tally.typo },
                { label: "Wrong", verdict: "wrong", count: session.tally.wrong },
              ],
              backLabel: "Back to course",
              back,
            }
          : step.kind === "present"
            ? {
                kind: "present",
                badge: "New word",
                unitTitle: step.item.unitTitle,
                term: step.item.term,
                definition: step.item.definition,
                alsoAccepted:
                  step.item.alternatives.length > 0
                    ? `Also: ${step.item.alternatives.join(", ")}`
                    : null,
                notes: step.item.notes || null,
                input: state.input,
                placeholder: "Type it to continue",
                miss: state.copyMiss ? "Type the word as shown above." : null,
              }
            : {
                kind: "quiz",
                unitTitle: step.item.unitTitle,
                prompt: step.item.definition,
                input: state.input,
                placeholder: "Type the answer",
                locked: session.feedback !== null,
                canCheck: state.input.trim() !== "" && !state.submitting,
                checkLabel: "Check",
                continueLabel: "Continue",
                feedback: session.feedback && {
                  verdict: session.feedback.verdict,
                  title: FEEDBACK_TITLES[session.feedback.verdict],
                  answer:
                    session.feedback.verdict === "exact"
                      ? null
                      : session.feedback.verdict === "typo"
                        ? session.feedback.matched
                        : session.feedback.term,
                  nextReview: `Next review ${formatDateTime(session.feedback.nextDue)}`,
                },
                error: state.answerError,
              },
      };
    }
  }
}
