/**
 * Typed client for the Fastify API. Responses are parsed with the same Zod
 * schemas the API serializes with, so drift fails loudly instead of silently.
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  type Catalog,
  type CatalogQuery,
  CatalogSchema,
  type CourseDetail,
  CourseDetailSchema,
  type CourseSummary,
  CourseSummarySchema,
  type CreateCourse,
  type Dashboard,
  DashboardSchema,
  type ImportResult,
  ImportResultSchema,
  type ImportRows,
  type Me,
  MeSchema,
  type ReviewSession,
  ReviewSessionSchema,
  type Stats,
  StatsSchema,
  type StudyMode,
  type StudySession,
  StudySessionSchema,
  type SubmitAnswer,
  type UpdateCourse,
  type UpdateMe,
} from "@app/shared";
import type { z } from "zod";
import type { AccessGate } from "../core/access.ts";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ApiClient {
  me(): Promise<Me>;
  updateMe(body: UpdateMe): Promise<Me>;
  courses(): Promise<CourseSummary[]>;
  course(id: string): Promise<CourseDetail>;
  createCourse(body: CreateCourse): Promise<CourseDetail>;
  updateCourse(id: string, body: UpdateCourse): Promise<CourseDetail>;
  importCsv(id: string, csv: string): Promise<ImportResult>;
  /** Words already parsed on the client (paste, Quizlet, Anki), into one unit. */
  importRows(id: string, body: ImportRows): Promise<ImportResult>;
  /** Shared courses matching the filters; empty filters are left out. */
  catalog(query: CatalogQuery): Promise<Catalog>;
  /** Copy a shared course into a new course the learner owns. */
  copyCourse(id: string): Promise<CourseDetail>;
  study(id: string, mode: StudyMode): Promise<StudySession>;
  /** Due items across every course, for one mixed review session. */
  reviewAll(): Promise<ReviewSession>;
  /** Home screen summary; `timeZone` sets the forecast's calendar days. */
  dashboard(timeZone: string): Promise<Dashboard>;
  /** Progress stats for every course, or `courseId`; days counted in `timeZone`. */
  stats(query: { timeZone: string; courseId: string | null }): Promise<Stats>;
  answer(body: SubmitAnswer): Promise<AnswerResult>;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Defaults to the global fetch (browser, React Native, Node). */
  fetch?: typeof fetch;
  /** Sends the access key and hears about 401s (see core/access.ts). */
  access?: Pick<AccessGate, "header" | "unauthorized">;
}

export function createApiClient({
  baseUrl,
  fetch: doFetch = fetch,
  access,
}: ApiClientOptions): ApiClient {
  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = {};
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    const authorization = access?.header();
    if (authorization) headers.authorization = authorization;
    const res = await doFetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.status === 401) access?.unauthorized();
    if (!res.ok) {
      const message =
        data && typeof data === "object" && "message" in data
          ? String(data.message)
          : res.statusText;
      throw new ApiError(res.status, message);
    }
    return schema.parse(data);
  }

  return {
    me: () => request(MeSchema, "/me"),
    updateMe: (body) => request(MeSchema, "/me", { method: "PATCH", body }),
    courses: () => request(CourseSummarySchema.array(), "/courses"),
    course: (id) => request(CourseDetailSchema, `/courses/${id}`),
    createCourse: (body) => request(CourseDetailSchema, "/courses", { method: "POST", body }),
    updateCourse: (id, body) =>
      request(CourseDetailSchema, `/courses/${id}`, { method: "PATCH", body }),
    importCsv: (id, csv) =>
      request(ImportResultSchema, `/courses/${id}/import`, { method: "POST", body: { csv } }),
    importRows: (id, body) =>
      request(ImportResultSchema, `/courses/${id}/import/rows`, { method: "POST", body }),
    catalog: (query) => {
      const params = new URLSearchParams();
      if (query.q?.trim()) params.set("q", query.q.trim());
      if (query.targetLang) params.set("targetLang", query.targetLang);
      const search = params.toString();
      return request(CatalogSchema, `/catalog${search ? `?${search}` : ""}`);
    },
    copyCourse: (id) => request(CourseDetailSchema, `/courses/${id}/copy`, { method: "POST" }),
    study: (id, mode) => request(StudySessionSchema, `/courses/${id}/study?mode=${mode}`),
    reviewAll: () => request(ReviewSessionSchema, "/study/review"),
    dashboard: (timeZone) =>
      request(DashboardSchema, `/dashboard?timeZone=${encodeURIComponent(timeZone)}`),
    stats: ({ timeZone, courseId }) => {
      const params = new URLSearchParams({ timeZone });
      if (courseId !== null) params.set("courseId", courseId);
      return request(StatsSchema, `/stats?${params}`);
    },
    answer: (body) => request(AnswerResultSchema, "/study/answers", { method: "POST", body }),
  };
}
