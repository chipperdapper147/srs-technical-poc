/**
 * Typed client for the Fastify API. Responses are parsed with the same Zod
 * schemas the API serializes with, so drift fails loudly instead of silently.
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  type CourseDetail,
  CourseDetailSchema,
  CourseSummarySchema,
  type CreateCourse,
  type ImportResult,
  ImportResultSchema,
  type Me,
  MeSchema,
  type StudyMode,
  type StudySession,
  StudySessionSchema,
  type SubmitAnswer,
  type UpdateCourse,
  type UpdateMe,
} from "@app/shared";
import type { z } from "zod";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<z.infer<S>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data ? String(data.message) : res.statusText;
    throw new ApiError(res.status, message);
  }
  return schema.parse(data);
}

export const api = {
  me: (): Promise<Me> => request(MeSchema, "/me"),
  updateMe: (body: UpdateMe): Promise<Me> => request(MeSchema, "/me", { method: "PATCH", body }),
  courses: () => request(CourseSummarySchema.array(), "/courses"),
  course: (id: string): Promise<CourseDetail> => request(CourseDetailSchema, `/courses/${id}`),
  createCourse: (body: CreateCourse): Promise<CourseDetail> =>
    request(CourseDetailSchema, "/courses", { method: "POST", body }),
  updateCourse: (id: string, body: UpdateCourse): Promise<CourseDetail> =>
    request(CourseDetailSchema, `/courses/${id}`, { method: "PATCH", body }),
  importCsv: (id: string, csv: string): Promise<ImportResult> =>
    request(ImportResultSchema, `/courses/${id}/import`, { method: "POST", body: { csv } }),
  study: (id: string, mode: StudyMode): Promise<StudySession> =>
    request(StudySessionSchema, `/courses/${id}/study?mode=${mode}`),
  answer: (body: SubmitAnswer): Promise<AnswerResult> =>
    request(AnswerResultSchema, "/study/answers", { method: "POST", body }),
};

export const queryKeys = {
  me: ["me"] as const,
  courses: ["courses"] as const,
  course: (id: string) => ["courses", id] as const,
  // Not under "courses": invalidating course data must not refetch a session in progress.
  study: (id: string, mode: StudyMode) => ["study", id, mode] as const,
};
