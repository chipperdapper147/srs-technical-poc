/**
 * FSRS scheduling via ts-fsrs v6 (FSRS-7 model), after the explicit learning
 * steps in `learning-steps.ts`. Maps between `cards` rows and ts-fsrs cards.
 */

import type { Selectable } from "kysely";
import { ConvertStepUnitToMinutes, DefaultScheduler, type Grade, type StepUnit } from "ts-fsrs";
import type { Cards } from "./db/types.ts";
import { LEARNING_STEPS, type LearningSteps } from "./learning-steps.ts";

type Fsrs = Awaited<ReturnType<typeof createFsrs>>;
export type FsrsCard = ReturnType<Fsrs["newCard"]>;
export type CardRow = Omit<Selectable<Cards>, "createdAt">;
export type Scheduler = Awaited<ReturnType<typeof createScheduler>>;

const MINUTES_PER_DAY = 24 * 60;

export async function createScheduler(steps: LearningSteps = LEARNING_STEPS) {
  const fsrs = await createFsrs(steps);
  return {
    newCard(userId: string, itemId: string, now: Date): CardRow {
      return toRow(userId, itemId, fsrs.newCard({ now, cardId: itemId }));
    },
    review(row: CardRow, grade: Grade, now: Date) {
      const { card, revlog } = fsrs.review({ card: fromRow(row), grade, now });
      return { row: toRow(row.userId, row.itemId, card), revlog };
    },
  };
}

function createFsrs(steps: LearningSteps) {
  return DefaultScheduler({
    enableFuzz: true,
    enableShortTerm: true,
    // Keep words on their steps even where FSRS-7 would schedule further out.
    allowModelOverride: false,
    ...toFsrsSteps(steps),
  });
}

/**
 * ts-fsrs uses Anki's step semantics: Again waits the first step, and Good
 * on a new card jumps to the second. Putting `retry` first makes our lists
 * read as "the wait after each correct answer".
 */
function toFsrsSteps({ learning, relearning, retry }: LearningSteps) {
  for (const list of [learning, relearning]) {
    if (list.slice(0, -1).some((step) => ConvertStepUnitToMinutes(step) >= MINUTES_PER_DAY)) {
      throw new Error(`Only the last learning step may be a day or longer: ${list.join(", ")}`);
    }
  }
  const withRetry = (list: readonly StepUnit[]) => [retry, ...list];
  return { learningSteps: withRetry(learning), relearningSteps: withRetry(relearning) };
}

function fromRow(row: CardRow): FsrsCard {
  return {
    cardId: row.itemId,
    dueAt: row.dueAt,
    lastReviewAt: row.lastReviewAt,
    stability: row.stability,
    stabilityFast: row.stabilityFast,
    difficulty: row.difficulty,
    scheduledDays: row.scheduledDays,
    learningStep: row.learningStep,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    scheduleStatus: row.scheduleStatus,
  } as FsrsCard;
}

function toRow(userId: string, itemId: string, card: FsrsCard): CardRow {
  return {
    userId,
    itemId,
    dueAt: card.dueAt,
    lastReviewAt: card.lastReviewAt ?? null,
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    scheduleStatus: card.scheduleStatus,
  };
}
