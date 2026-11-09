/**
 * Client-side study session state machine (pure, unit-tested).
 *
 * learn:  every new item is first *presented* (term shown; the learner types
 *         it once to copy it, which is not graded), then *quizzed* (prompt
 *         only; graded by the API and scheduled by FSRS).
 * review: due items are quizzed.
 * In both modes a wrong answer re-queues the item at the end of the session,
 * up to MAX_RETRIES times, so the session ends on a successful recall.
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
}

export type SessionAction =
  | { type: "presented" }
  | { type: "graded"; result: AnswerResult }
  | { type: "next" };

export function initSession(mode: StudyMode, items: StudyItem[]): SessionState {
  const quiz = items.map((item): Step => ({ kind: "quiz", item }));
  const queue =
    mode === "learn" ? [...items.map((item): Step => ({ kind: "present", item })), ...quiz] : quiz;
  return { queue, index: 0, feedback: null, retries: {}, tally: { exact: 0, typo: 0, wrong: 0 } };
}

export function currentStep(state: SessionState): Step | undefined {
  return state.queue[state.index];
}

export function isFinished(state: SessionState): boolean {
  return state.index >= state.queue.length;
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const step = currentStep(state);
  if (!step) return state;

  switch (action.type) {
    case "presented":
      if (step.kind !== "present") return state;
      return { ...state, index: state.index + 1 };

    case "graded": {
      if (step.kind !== "quiz" || state.feedback) return state;
      const { verdict } = action.result;
      const tally = { ...state.tally, [verdict]: state.tally[verdict] + 1 };
      const used = state.retries[step.item.itemId] ?? 0;
      if (verdict === "wrong" && used < MAX_RETRIES) {
        return {
          ...state,
          feedback: action.result,
          tally,
          queue: [...state.queue, { kind: "quiz", item: step.item }],
          retries: { ...state.retries, [step.item.itemId]: used + 1 },
        };
      }
      return { ...state, feedback: action.result, tally };
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
