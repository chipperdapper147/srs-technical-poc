/**
 * Fixture factories. Every value is parsed through the contract schema, so a
 * fixture can never hold a shape the real API couldn't send.
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  type CourseDetail,
  CourseDetailSchema,
  type HardWord,
  HardWordSchema,
  HEATMAP_DAYS,
  type HeatmapDay,
  HeatmapDaySchema,
  type Me,
  MeSchema,
  RETENTION_DAYS,
  type Stats,
  StatsSchema,
  type StudyItem,
  StudyItemSchema,
  type StudySession,
  StudySessionSchema,
  type UnitSummary,
  UnitSummarySchema,
} from "@app/shared";

let counter = 0;
/** Deterministic, valid v4-shaped UUIDs: 00000000-0000-4000-8000-000000000001, … */
export function nextId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export const aMe = (overrides: Partial<Me> = {}): Me =>
  MeSchema.parse({
    id: nextId(),
    displayName: "Test learner",
    gradingMode: "lenient",
    accentSensitive: false,
    newItemsPerSession: 5, // the database default
    ...overrides,
  });

export const aUnit = (overrides: Partial<UnitSummary> = {}): UnitSummary =>
  UnitSummarySchema.parse({
    id: nextId(),
    position: 1,
    title: "Basics",
    itemCount: 0,
    learnedCount: 0,
    ...overrides,
  });

export const aCourse = (overrides: Partial<CourseDetail> = {}): CourseDetail =>
  CourseDetailSchema.parse({
    id: nextId(),
    title: "Test Spanish",
    description: "",
    sourceLang: "en",
    targetLang: "es",
    itemCount: 0,
    learnedCount: 0,
    dueCount: 0,
    gradingMode: null,
    accentSensitive: null,
    editable: true,
    units: [],
    ...overrides,
  });

export const aStudyItem = (overrides: Partial<StudyItem> = {}): StudyItem =>
  StudyItemSchema.parse({
    itemId: nextId(),
    unitTitle: "Basics",
    term: "hola",
    definition: "hello",
    alternatives: [],
    notes: "",
    isNew: true,
    ...overrides,
  });

export const aStudySession = (overrides: Partial<StudySession> = {}): StudySession =>
  StudySessionSchema.parse({
    mode: "learn",
    grading: { mode: "lenient", accentSensitive: false },
    items: [],
    ...overrides,
  });

export const anAnswerResult = (overrides: Partial<AnswerResult> = {}): AnswerResult =>
  AnswerResultSchema.parse({
    verdict: "exact",
    matched: "hola",
    term: "hola",
    rating: 3,
    nextDue: "2026-11-14T09:00:00.000Z",
    reviewId: nextId(),
    overridden: false,
    ...overrides,
  });

/** Three words with distinct prompts, for flows. */
export function someWords(): StudyItem[] {
  return [
    aStudyItem({ term: "hola", definition: "hello" }),
    aStudyItem({ term: "la biblioteca", definition: "library", alternatives: ["biblioteca"] }),
    aStudyItem({ term: "la canción", definition: "song", alternatives: ["canción"] }),
  ];
}

/** Today in the default stats fixture: a Sunday, so its heatmap starts on a Monday. */
export const STATS_TODAY = "2026-11-15";

/**
 * HEATMAP_DAYS days ending `today`, oldest first. `recent` are the reviews
 * of the last days, today last; earlier days have none.
 */
export function aHeatmap(recent: number[] = [], today = STATS_TODAY): HeatmapDay[] {
  return Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const daysAgo = HEATMAP_DAYS - 1 - i;
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return HeatmapDaySchema.parse({
      date: d.toISOString().slice(0, 10),
      reviewCount: recent[recent.length - 1 - daysAgo] ?? 0,
    });
  });
}

/** Stats with no reviews at all, unless overridden. */
export const aStats = (overrides: Partial<Stats> = {}): Stats =>
  StatsSchema.parse({
    courseId: null,
    today: STATS_TODAY,
    totals: { wordsLearned: 0, reviewCount: 0 },
    retention: { days: RETENTION_DAYS, reviewCount: 0, correctCount: 0 },
    heatmap: aHeatmap(),
    streak: { current: 0, longest: 0, reviewedToday: false },
    hardestWords: [],
    ...overrides,
  });

export const aHardWord = (overrides: Partial<HardWord> = {}): HardWord =>
  HardWordSchema.parse({
    itemId: nextId(),
    term: "la biblioteca",
    definition: "library",
    courseId: nextId(),
    courseTitle: "Test Spanish",
    lapses: 1,
    reviewCount: 4,
    wrongCount: 2,
    ...overrides,
  });
