/**
 * Fixture factories. Every value is parsed through the contract schema, so a
 * fixture can never hold a shape the real API couldn't send.
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  type CourseDetail,
  CourseDetailSchema,
  type Me,
  MeSchema,
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
