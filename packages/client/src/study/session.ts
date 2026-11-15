/**
 * Client-side study session state machine (pure, unit-tested).
 *
 * learn:  every new item is first *presented* (term shown; the learner types
 *         it once to copy it, which is not graded), then *quizzed* (prompt
 *         only; graded by the API and scheduled by FSRS).
 * review: due items are quizzed.
 * In both modes an answer rated Again (wrong, or given with the whole word
 * hinted) re-queues the item at the end of the session, up to MAX_RETRIES
 * times, so the session ends on a successful recall.
 *
 * Study aids: "I was right" replaces the feedback with the overridden result,
 * as if the answer had been correct. Undo goes back to just before the latest
 * answer, wherever the session is now; only that one answer.
 */
import type { AnswerResult, StudyItem, StudyMode, Verdict } from "@app/shared";

export const MAX_RETRIES = 2;

export type Step = { kind: "present" | "quiz"; item: StudyItem };

export interface SessionState {
  queue: Step[];
  index: number;
  /** Set while showing the result of the current quiz step. */
  feedback: AnswerResult | null;
  retries: Record<string, number>;
  tally: Record<Verdict, number>;
  /** The latest answer and the session just before it, for undo. Null: nothing to undo. */
  last: { reviewId: string; before: SessionState } | null;
}

export type SessionAction =
  | { type: "presented" }
  | { type: "graded"; result: AnswerResult }
  /** The API overrode the answer being shown ("I was right"). */
  | { type: "overridden"; result: AnswerResult }
  /** The API undid the latest answer. */
  | { type: "undone" }
  | { type: "next" };

export function initSession(mode: StudyMode, items: StudyItem[]): SessionState {
  const quiz = items.map((item): Step => ({ kind: "quiz", item }));
  const queue =
    mode === "learn" ? [...items.map((item): Step => ({ kind: "present", item })), ...quiz] : quiz;
  return {
    queue,
    index: 0,
    feedback: null,
    retries: {},
    tally: { exact: 0, typo: 0, wrong: 0 },
    last: null,
  };
}

export function currentStep(state: SessionState): Step | undefined {
  return state.queue[state.index];
}

export function isFinished(state: SessionState): boolean {
  return state.index >= state.queue.length;
}

/** The verdict an answer counts as in the session: an overridden one counts as exact. */
export function countedVerdict(result: AnswerResult): Verdict {
  return result.overridden ? "exact" : result.verdict;
}

/** Show `result` for the current quiz step: tally it, and re-queue the item if rated Again. */
function grade(state: SessionState, step: Step, result: AnswerResult): SessionState {
  const verdict = countedVerdict(result);
  const tally = { ...state.tally, [verdict]: state.tally[verdict] + 1 };
  const used = state.retries[step.item.itemId] ?? 0;
  if (result.rating === 1 && used < MAX_RETRIES) {
    return {
      ...state,
      feedback: result,
      tally,
      queue: [...state.queue, { kind: "quiz", item: step.item }],
      retries: { ...state.retries, [step.item.itemId]: used + 1 },
    };
  }
  return { ...state, feedback: result, tally };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === "undone") {
    // Wherever the session is now, even finished.
    return state.last ? state.last.before : state;
  }
  const step = currentStep(state);
  if (!step) return state;

  switch (action.type) {
    case "presented":
      if (step.kind !== "present") return state;
      return { ...state, index: state.index + 1 };

    case "graded": {
      if (step.kind !== "quiz" || state.feedback) return state;
      const { reviewId } = action.result;
      // Only one answer can be undone, so the state it goes back to keeps none.
      const last = reviewId ? { reviewId, before: { ...state, last: null } } : null;
      return { ...grade(state, step, action.result), last };
    }

    case "overridden": {
      // Only the answer being shown, regraded from the session before it.
      const { last } = state;
      if (!state.feedback || !last || last.reviewId !== action.result.reviewId) return state;
      return { ...grade(last.before, step, action.result), last };
    }

    case "next":
      if (!state.feedback) return state;
      return { ...state, index: state.index + 1, feedback: null };
  }
}

/** Progress through the session in [0, 1]. */
export function progress(state: SessionState): number {
  return state.queue.length === 0 ? 1 : Math.min(1, state.index / state.queue.length);
}
