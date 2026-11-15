import type { StudyMode } from "@app/shared";

export const queryKeys = {
  me: ["me"] as const,
  courses: ["courses"] as const,
  course: (id: string) => ["courses", id] as const,
  /** Under the course, so invalidating it (or "courses") refetches the words too. */
  courseItems: (id: string) => ["courses", id, "items"] as const,
  // Not under "courses": invalidating course data must not refetch a session in progress.
  study: (id: string, mode: StudyMode) => ["study", id, mode] as const,
  reviewAll: ["study", "all", "review"] as const,
  /** Invalidate with the prefix `["dashboard"]` (every time zone). */
  dashboard: (timeZone: string) => ["dashboard", timeZone] as const,
  dashboardAll: ["dashboard"] as const,
};
