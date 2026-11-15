/**
 * Study screen view model: what to show, as plain data. Text the learner
 * reads lives here so web and mobile say the same thing; styling does not.
 */
import {
  type AnswerResult,
  hintText,
  maxHints,
  ratingForAnswer,
  ratingForVerdict,
  type Verdict,
} from "@app/shared";
import type { Route } from "../core/ports.ts";
import type { StudyState } from "./controller.ts";
import { countedVerdict, currentStep, progress } from "./session.ts";

export interface FeedbackVM {
  /** How the answer counts: an overridden one shows as exact. */
  verdict: Verdict;
  title: string;
  /** The answer to learn from, or null when the learner got it exactly. */
  answer: string | null;
  /** Why the rating is lower than the verdict alone gives (hints), else null. */
  note: string | null;
  nextReview: string;
  /** "I was right", offered while it would raise the rating; null otherwise. */
  override: { label: string; busy: boolean } | null;
}

export interface HintVM {
  label: string;
  /** False once every letter shows, and while the answer is being checked. */
  canHint: boolean;
  /** The revealed start of the word, or null before the first hint. */
  text: string | null;
  /** What the hints do to the rating, or null before the first hint. */
  note: string | null;
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
      /** The item's course, named only when the session mixes courses. */
      courseTitle: string | null;
      unitTitle: string;
      prompt: string;
      input: string;
      placeholder: string;
      /** Feedback is showing: the answer can't be edited, Enter continues. */
      locked: boolean;
      canCheck: boolean;
      checkLabel: string;
      continueLabel: string;
      /** Hint controls; null once the answer is graded. */
      hint: HintVM | null;
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
      /** The screen's level-one heading, for assistive tech: it names what is being studied. */
      heading: string;
      /** Text of the back link: the course, or "Home" for a review of all courses. */
      backLabel: string;
      back: Route;
      /** 0–100. */
      progress: number;
      progressLabel: string;
      /** Changes whenever the step does (the e2e page objects wait on it). */
      stepIndex: number;
      /** Changes whenever a step starts afresh, including one undo went back to. */
      stepKey: string;
      /** Undo the latest answer, offered from anywhere in the session; null when there is none. */
      undo: { label: string; busy: boolean } | null;
      /** Why the last override or undo failed. */
      aidError: string | null;
      /** BCP 47 tag of the language being typed in the current step. */
      lang: string;
      step: StudyStepVM;
    };

export const FEEDBACK_TITLES: Record<Verdict, string> = {
  exact: "Correct",
  typo: "Almost: watch the spelling",
  wrong: "Not quite",
};

export const OVERRIDDEN_TITLE = "Counted as correct";

const defaultFormat = (iso: string) => new Date(iso).toLocaleString();

/** Why `result` is rated below its verdict: hints were used. */
function ratingNote(result: AnswerResult): string | null {
  if (result.rating >= ratingForVerdict(countedVerdict(result))) return null;
  return result.rating === 1
    ? "The whole word was shown, so it counts as not known yet."
    : "Rated hard because you used a hint.";
}

function hintVM(term: string, hints: number, submitting: boolean): HintVM {
  const all = maxHints(term);
  const text = hintText(term, hints);
  return {
    label: "Hint",
    canHint: hints < all && !submitting,
    text: hints === 0 ? null : hints >= all ? text : `${text}…`,
    note:
      hints === 0
        ? null
        : hints >= all
          ? "The whole word is shown: this answer will count as not known yet."
          : "With a hint, a correct answer counts as hard.",
  };
}

export function studyViewModel(
  state: StudyState,
  formatDateTime: (iso: string) => string = defaultFormat,
): StudyVM {
  const back: Route =
    state.courseId === null ? { to: "home" } : { to: "course", courseId: state.courseId };
  const backLabel = state.courseId === null ? "Back to home" : "Back to course";
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
        backLabel,
        back,
      };
    case "active": {
      const { session } = state;
      const step = currentStep(session);
      const context = state.context[(step ?? session.queue[0])?.item.itemId ?? ""];
      const mixed = state.courseTitle === null;
      return {
        kind: "session",
        heading: mixed ? "Review: all courses" : `Study: ${state.courseTitle}`,
        backLabel: state.courseTitle ?? "Home",
        back,
        progress: progress(session) * 100,
        progressLabel: "Session progress",
        stepIndex: session.index,
        stepKey: `${session.index}.${state.attempt}`,
        undo: session.last
          ? { label: "Undo last answer", busy: state.aidPending === "undo" }
          : null,
        aidError: state.aidError,
        lang: context?.lang ?? "und",
        step: !step
          ? {
              kind: "summary",
              title: "Session complete",
              tally: [
                { label: "Correct", verdict: "exact", count: session.tally.exact },
                { label: "Almost (typo)", verdict: "typo", count: session.tally.typo },
                { label: "Wrong", verdict: "wrong", count: session.tally.wrong },
              ],
              backLabel,
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
                courseTitle: mixed ? (context?.courseTitle ?? null) : null,
                unitTitle: step.item.unitTitle,
                prompt: step.item.definition,
                input: state.input,
                placeholder: "Type the answer",
                locked: session.feedback !== null,
                canCheck: state.input.trim() !== "" && !state.submitting,
                checkLabel: "Check",
                continueLabel: "Continue",
                hint: session.feedback
                  ? null
                  : hintVM(step.item.term, state.hints, state.submitting),
                feedback: session.feedback && {
                  verdict: countedVerdict(session.feedback),
                  title: session.feedback.overridden
                    ? OVERRIDDEN_TITLE
                    : FEEDBACK_TITLES[session.feedback.verdict],
                  answer:
                    session.feedback.verdict === "exact"
                      ? null
                      : session.feedback.verdict === "typo"
                        ? session.feedback.matched
                        : session.feedback.term,
                  note: ratingNote(session.feedback),
                  nextReview: `Next review ${formatDateTime(session.feedback.nextDue)}`,
                  override:
                    session.feedback.verdict !== "exact" &&
                    !session.feedback.overridden &&
                    session.feedback.reviewId !== undefined &&
                    session.last?.reviewId === session.feedback.reviewId &&
                    ratingForAnswer("exact", state.hints, step.item.term) > session.feedback.rating
                      ? { label: "I was right", busy: state.aidPending === "override" }
                      : null,
                },
                error: state.answerError,
              },
      };
    }
  }
}
