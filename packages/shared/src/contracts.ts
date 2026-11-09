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
