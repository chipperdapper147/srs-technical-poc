/**
 * Typed client for the Fastify API. Responses are parsed with the same Zod
 * schemas the API serializes with, so drift fails loudly instead of silently.
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  type CourseDetail,
  CourseDetailSchema,
  type CourseItem,
  CourseItemSchema,
  type CourseItems,
  CourseItemsSchema,
  type CourseSummary,
  CourseSummarySchema,
  type CreateCourse,
  type CreateItem,
  type Dashboard,
  DashboardSchema,
  type ImportResult,
  ImportResultSchema,
  type Me,
  MeSchema,
  type ReviewSession,
  ReviewSessionSchema,
  type StudyMode,
  type StudySession,
  StudySessionSchema,
  type SubmitAnswer,
  type UpdateCourse,
  type UpdateItem,
  type UpdateMe,
} from "@app/shared";
import { z } from "zod";
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
  study(id: string, mode: StudyMode): Promise<StudySession>;
  /** Due items across every course, for one mixed review session. */
  reviewAll(): Promise<ReviewSession>;
  /** Home screen summary; `timeZone` sets the forecast's calendar days. */
  dashboard(timeZone: string): Promise<Dashboard>;
  answer(body: SubmitAnswer): Promise<AnswerResult>;
  /** A course's words in course order; `q` narrows them (see `itemMatchesSearch`). */
  courseItems(courseId: string, q?: string): Promise<CourseItems>;
  createItem(courseId: string, unitId: string, body: CreateItem): Promise<CourseItem>;
  updateItem(itemId: string, body: UpdateItem): Promise<CourseItem>;
  /** Deletes the word with every learner's cards and review history for it. */
  deleteItem(itemId: string): Promise<void>;
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
    study: (id, mode) => request(StudySessionSchema, `/courses/${id}/study?mode=${mode}`),
    reviewAll: () => request(ReviewSessionSchema, "/study/review"),
    dashboard: (timeZone) =>
      request(DashboardSchema, `/dashboard?timeZone=${encodeURIComponent(timeZone)}`),
    answer: (body) => request(AnswerResultSchema, "/study/answers", { method: "POST", body }),
    courseItems: (courseId, q) =>
      request(
        CourseItemsSchema,
        `/courses/${courseId}/items${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ),
    createItem: (courseId, unitId, body) =>
      request(CourseItemSchema, `/courses/${courseId}/units/${unitId}/items`, {
        method: "POST",
        body,
      }),
    updateItem: (itemId, body) =>
      request(CourseItemSchema, `/items/${itemId}`, { method: "PATCH", body }),
    // 204, no body: the response parses as null.
    deleteItem: async (itemId) => {
      await request(z.null(), `/items/${itemId}`, { method: "DELETE" });
    },
  };
}
