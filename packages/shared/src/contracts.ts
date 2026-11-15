/**
 * API contracts shared by the Fastify API (request validation + OpenAPI) and
 * the Next.js client (typed fetches). Change a shape here and both sides
 * fail to typecheck until they agree.
 */
import { z } from "zod";

const langCode = z
  .string()
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Expected a BCP 47 language tag, e.g. 'es'");

export const GradingModeSchema = z.enum(["lenient", "strict"]);
export const VerdictSchema = z.enum(["exact", "typo", "wrong"]);
export const StudyModeSchema = z.enum(["learn", "review"]);
export type StudyMode = z.infer<typeof StudyModeSchema>;

export const GradingOptionsSchema = z.object({
  mode: GradingModeSchema,
  accentSensitive: z.boolean(),
});

export const ErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

export const IdParamsSchema = z.object({ id: z.uuid() });

// ---- Me ------------------------------------------------------------------

export const MeSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  gradingMode: GradingModeSchema,
  accentSensitive: z.boolean(),
  newItemsPerSession: z.number().int(),
});
export type Me = z.infer<typeof MeSchema>;

export const UpdateMeSchema = z
  .object({
    displayName: z.string().min(1).max(100),
    gradingMode: GradingModeSchema,
    accentSensitive: z.boolean(),
    newItemsPerSession: z.number().int().min(1).max(50),
  })
  .partial();
export type UpdateMe = z.infer<typeof UpdateMeSchema>;

// ---- Courses -------------------------------------------------------------

export const CourseSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  itemCount: z.number().int(),
  learnedCount: z.number().int(),
  dueCount: z.number().int(),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const UnitSummarySchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  itemCount: z.number().int(),
  learnedCount: z.number().int(),
});
export type UnitSummary = z.infer<typeof UnitSummarySchema>;

export const CourseDetailSchema = CourseSummarySchema.extend({
  /** Course-level override; null means "use the learner's setting". */
  gradingMode: GradingModeSchema.nullable(),
  accentSensitive: z.boolean().nullable(),
  /** True when the caller owns the course (shared courses are read-only). */
  editable: z.boolean(),
  units: z.array(UnitSummarySchema),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

const CourseFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  sourceLang: langCode,
  targetLang: langCode,
  gradingMode: GradingModeSchema.nullable(),
  accentSensitive: z.boolean().nullable(),
});

export const CreateCourseSchema = CourseFieldsSchema.extend({
  description: CourseFieldsSchema.shape.description.default(""),
  gradingMode: CourseFieldsSchema.shape.gradingMode.default(null),
  accentSensitive: CourseFieldsSchema.shape.accentSensitive.default(null),
});
export type CreateCourse = z.input<typeof CreateCourseSchema>;

/**
 * Only the named fields change. Built from the fields without defaults: a
 * partial of CreateCourseSchema would fill in its defaults, so a PATCH of one
 * field would also reset the description and grading overrides.
 */
export const UpdateCourseSchema = CourseFieldsSchema.partial();
export type UpdateCourse = z.input<typeof UpdateCourseSchema>;

// ---- CSV import ----------------------------------------------------------

/**
 * CSV with a header row. Columns: unit, term, definition, alternatives, notes.
 * `alternatives` is a `|`-separated list of other accepted answers.
 * Rows are appended to existing units with the same title, else new units.
 */
export const ImportCsvSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
});
export type ImportCsv = z.infer<typeof ImportCsvSchema>;

export const ImportResultSchema = z.object({
  unitsCreated: z.number().int(),
  itemsCreated: z.number().int(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

// ---- Study ---------------------------------------------------------------

export const StudyQuerySchema = z.object({
  mode: StudyModeSchema,
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const StudyItemSchema = z.object({
  itemId: z.uuid(),
  unitTitle: z.string(),
  /** Target-language answer the learner types. */
  term: z.string(),
  /** Source-language prompt. */
  definition: z.string(),
  alternatives: z.array(z.string()),
  notes: z.string(),
  isNew: z.boolean(),
});
export type StudyItem = z.infer<typeof StudyItemSchema>;

export const StudySessionSchema = z.object({
  mode: StudyModeSchema,
  grading: GradingOptionsSchema,
  items: z.array(StudyItemSchema),
});
export type StudySession = z.infer<typeof StudySessionSchema>;

export const SubmitAnswerSchema = z.object({
  itemId: z.uuid(),
  answer: z.string().max(500),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
});
export type SubmitAnswer = z.infer<typeof SubmitAnswerSchema>;

export const AnswerResultSchema = z.object({
  verdict: VerdictSchema,
  /** The accepted answer the input matched or was closest to. */
  matched: z.string(),
  term: z.string(),
  rating: z.number().int().min(1).max(4),
  nextDue: z.iso.datetime(),
});
export type AnswerResult = z.infer<typeof AnswerResultSchema>;

/**
 * Review across every course the learner can see: due items, most overdue
 * first. Each item carries its course, so one session can mix courses.
 * Answers go to POST /study/answers as usual, graded with each item's own
 * course settings.
 */
export const ReviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const ReviewItemSchema = StudyItemSchema.extend({
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** BCP 47 tag of the language typed for this item. */
  targetLang: z.string(),
  /** The item's course grading: the course override, else the learner's setting. */
  grading: GradingOptionsSchema,
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const ReviewSessionSchema = z.object({
  items: z.array(ReviewItemSchema),
});
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;

// ---- Dashboard -----------------------------------------------------------

/** True for an IANA time zone name the runtime knows, e.g. "Europe/Madrid". */
function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Days in the dashboard's forecast, today included. */
export const FORECAST_DAYS = 7;

/** An IANA time zone query parameter; UTC when absent. */
const timeZoneParam = z
  .string()
  .max(64)
  .refine(isTimeZone, "Expected an IANA time zone, e.g. 'Europe/Madrid'")
  .default("UTC");

export const DashboardQuerySchema = z.object({
  /** IANA time zone the forecast's days are counted in. */
  timeZone: timeZoneParam,
});
export type DashboardQuery = z.input<typeof DashboardQuerySchema>;

export const DashboardCourseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  /** Reviews due now. */
  dueCount: z.number().int(),
});
export type DashboardCourse = z.infer<typeof DashboardCourseSchema>;

export const ForecastDaySchema = z.object({
  /** Calendar day in the requested time zone, YYYY-MM-DD. */
  date: z.iso.date(),
  /** Reviews falling due that day. Today also counts every overdue review. */
  dueCount: z.number().int(),
});
export type ForecastDay = z.infer<typeof ForecastDaySchema>;

export const DashboardSchema = z.object({
  /** Reviews due now, across all courses. */
  dueCount: z.number().int(),
  /** Every course the learner can see, in the course list's order. */
  courses: z.array(DashboardCourseSchema),
  /** Today, then the following days: FORECAST_DAYS in all. */
  forecast: z.array(ForecastDaySchema),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

// ---- Stats ---------------------------------------------------------------

/** Calendar days retention is measured over, today included. */
export const RETENTION_DAYS = 30;
/** Calendar days in the review heatmap, today included: 12 weeks. */
export const HEATMAP_DAYS = 84;
/** How many of the hardest words the stats list. */
export const HARDEST_WORDS_LIMIT = 10;

export const StatsQuerySchema = z.object({
  /** IANA time zone the days (heatmap, streak, retention window) are counted in. */
  timeZone: timeZoneParam,
  /** One course's numbers; every course when absent. */
  courseId: z.uuid().optional(),
});
export type StatsQuery = z.input<typeof StatsQuerySchema>;

export const HeatmapDaySchema = z.object({
  /** Calendar day in the requested time zone, YYYY-MM-DD. */
  date: z.iso.date(),
  reviewCount: z.number().int(),
});
export type HeatmapDay = z.infer<typeof HeatmapDaySchema>;

export const HardWordSchema = z.object({
  itemId: z.uuid(),
  term: z.string(),
  definition: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** Times the word was forgotten after it had been learned (FSRS lapses). */
  lapses: z.number().int(),
  /** Every graded answer to the word, and how many of them were wrong. */
  reviewCount: z.number().int(),
  wrongCount: z.number().int(),
});
export type HardWord = z.infer<typeof HardWordSchema>;

export const StatsSchema = z.object({
  /** The course these numbers are for; null for every course. */
  courseId: z.uuid().nullable(),
  /** Today in the requested time zone, YYYY-MM-DD. */
  today: z.iso.date(),
  totals: z.object({
    /** Words past New: answered at least once. */
    wordsLearned: z.number().int(),
    /** Every graded answer, ever. */
    reviewCount: z.number().int(),
  }),
  /**
   * Answers in the last `days` calendar days (RETENTION_DAYS, today
   * included) to words already past the learning steps (FSRS state Review
   * when answered), and how many of them were correct (exact or typo).
   */
  retention: z.object({
    days: z.number().int(),
    reviewCount: z.number().int(),
    correctCount: z.number().int(),
  }),
  /** Reviews per day: HEATMAP_DAYS days, oldest first, ending today. */
  heatmap: z.array(HeatmapDaySchema),
  /** Runs of consecutive calendar days with at least one review. */
  streak: z.object({
    /** The run ending today, or yesterday while nothing is reviewed yet today; else 0. */
    current: z.number().int(),
    longest: z.number().int(),
    reviewedToday: z.boolean(),
  }),
  /**
   * Up to HARDEST_WORDS_LIMIT words with at least one lapse or wrong
   * answer: most lapses first, then the highest share of wrong answers.
   */
  hardestWords: z.array(HardWordSchema),
});
export type Stats = z.infer<typeof StatsSchema>;
