/**
 * Learning steps: the short, fixed waits a word goes through before FSRS
 * schedules it. This is the one place to change them; the scheduler
 * (`srs.ts`) only reads this shape, and tests pass their own to
 * `createScheduler`.
 *
 * Durations are ts-fsrs step units: minutes, hours or days (`"10m"`, `"4h"`,
 * `"1d"`). A step of a day or more graduates the word to FSRS, so only the
 * last step may be that long.
 *
 * With the values below a new word answered correctly is due again after 10
 * minutes, then after 1 day, then whenever FSRS says. A wrong answer during
 * the steps brings the word back after 10 minutes and starts the steps over.
 */
import type { StepUnit } from "ts-fsrs";

export type LearningSteps = {
  /**
   * Wait after each consecutive correct answer to a new word. After the last
   * one FSRS takes over. Empty: FSRS schedules the word from its first
   * correct answer.
   */
  readonly learning: readonly StepUnit[];
  /**
   * The same for a word answered wrong in review (a lapse). Empty: its next
   * correct answer goes straight back to FSRS.
   */
  readonly relearning: readonly StepUnit[];
  /**
   * Wait after a wrong answer during the steps, and after a lapse. The steps
   * then start over from the first. A typo keeps the word on its step and
   * brings it back after a wait between this and the first learning step.
   */
  readonly retry: StepUnit;
};

export const LEARNING_STEPS: LearningSteps = {
  learning: ["10m", "1d"],
  relearning: [],
  retry: "10m",
};
