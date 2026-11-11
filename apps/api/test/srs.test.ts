import { type Grade, Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { LEARNING_STEPS, type LearningSteps } from "../src/learning-steps.ts";
import { type CardRow, createScheduler, type Scheduler } from "../src/srs.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const START = new Date("2026-11-11T09:00:00.000Z");

// Deliberately unlike the defaults, so the tests prove the steps are injected.
const STEPS: LearningSteps = { learning: ["5m", "2h", "1d"], relearning: ["30m"], retry: "1m" };

/** Answers a new word with each grade in turn, each time once it is due. */
function study(scheduler: Scheduler, grades: Grade[]) {
  let card: CardRow = scheduler.newCard("user", "item", START);
  let now = START;
  const waits: number[] = [];
  for (const grade of grades) {
    card = scheduler.review(card, grade, now).row;
    waits.push(card.dueAt.getTime() - now.getTime());
    now = card.dueAt;
  }
  return { card, waits };
}

describe("learning steps", () => {
  it("walks a new word through each step on correct answers, then hands it to FSRS", async () => {
    const scheduler = await createScheduler(STEPS);
    const { card, waits } = study(scheduler, [Rating.Good, Rating.Good, Rating.Good, Rating.Good]);
    expect(waits.slice(0, 3)).toEqual([5 * MINUTE, 2 * 60 * MINUTE, DAY]);
    expect(waits[3]).toBeGreaterThan(2 * DAY);
    expect(card.state).toBe(State.Review);
  });

  it("keeps the word in learning until the last step", async () => {
    const scheduler = await createScheduler(STEPS);
    const { card } = study(scheduler, [Rating.Good, Rating.Good]);
    expect(card).toMatchObject({ state: State.Learning, scheduleStatus: "learning" });
  });

  it("restarts the steps after a wrong answer", async () => {
    const scheduler = await createScheduler(STEPS);
    const { waits } = study(scheduler, [Rating.Good, Rating.Good, Rating.Again, Rating.Good]);
    expect(waits).toEqual([5 * MINUTE, 2 * 60 * MINUTE, MINUTE, 5 * MINUTE]);
  });

  it("keeps a word on its step after a typo", async () => {
    const scheduler = await createScheduler(STEPS);
    const { card, waits } = study(scheduler, [Rating.Good, Rating.Hard, Rating.Good]);
    expect(waits[1]).toBe(3 * MINUTE); // between retry (1m) and the first step (5m)
    expect(waits[2]).toBe(2 * 60 * MINUTE);
    expect(card.state).toBe(State.Learning);
  });

  it("sends a forgotten word through the relearning steps", async () => {
    const scheduler = await createScheduler(STEPS);
    const grades = [Rating.Good, Rating.Good, Rating.Good, Rating.Again, Rating.Good, Rating.Good];
    const { card, waits } = study(scheduler, grades);
    expect(waits.slice(3, 5)).toEqual([MINUTE, 30 * MINUTE]);
    expect(waits[5]).toBeGreaterThanOrEqual(DAY);
    expect(card).toMatchObject({ state: State.Review, lapses: 1 });
  });

  it("lets FSRS schedule from the first correct answer when there are no steps", async () => {
    const scheduler = await createScheduler({ learning: [], relearning: [], retry: "1m" });
    const { waits } = study(scheduler, [Rating.Good]);
    expect(waits[0]).toBeGreaterThan(2 * DAY);
  });

  it("defaults to 10 minutes, then a day, then FSRS", async () => {
    expect(LEARNING_STEPS).toEqual({ learning: ["10m", "1d"], relearning: [], retry: "10m" });
    const scheduler = await createScheduler();
    const { waits } = study(scheduler, [Rating.Good, Rating.Good, Rating.Good]);
    expect(waits.slice(0, 2)).toEqual([10 * MINUTE, DAY]);
    expect(waits[2]).toBeGreaterThan(2 * DAY);
  });

  it("rejects a step of a day or more before the last", async () => {
    await expect(createScheduler({ ...STEPS, learning: ["1d", "10m"] })).rejects.toThrow(
      "Only the last learning step may be a day or longer",
    );
  });
});
