/**
 * FSRS scheduling via ts-fsrs v6 (FSRS-7 model, library defaults).
 * Maps between `cards` rows and ts-fsrs card objects.
 */

import type { Selectable } from "kysely";
import { DefaultScheduler, type Grade } from "ts-fsrs";
import type { Cards } from "./db/types.ts";

const scheduler = await DefaultScheduler({ enableFuzz: true });

type Scheduler = typeof scheduler;
export type FsrsCard = ReturnType<Scheduler["newCard"]>;
export type CardRow = Omit<Selectable<Cards>, "createdAt">;

export function newCard(userId: string, itemId: string, now: Date): CardRow {
  return toRow(userId, itemId, scheduler.newCard({ now, cardId: itemId }));
}

export function review(row: CardRow, grade: Grade, now: Date) {
  const { card, revlog } = scheduler.review({ card: fromRow(row), grade, now });
  return { row: toRow(row.userId, row.itemId, card), revlog };
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
