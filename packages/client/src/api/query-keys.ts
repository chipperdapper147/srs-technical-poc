import type { StudyMode } from "@app/shared";

export const queryKeys = {
  me: ["me"] as const,
  courses: ["courses"] as const,
  course: (id: string) => ["courses", id] as const,
  // Not under "courses": invalidating course data must not refetch a session in progress.
  study: (id: string, mode: StudyMode) => ["study", id, mode] as const,
  reviewAll: ["study", "all", "review"] as const,
  /** Invalidate with the prefix `["dashboard"]` (every time zone). */
  dashboard: (timeZone: string) => ["dashboard", timeZone] as const,
  dashboardAll: ["dashboard"] as const,
  /** Per time zone and course (null: every course); invalidate with `statsAll`. */
  stats: (timeZone: string, courseId: string | null) => ["stats", timeZone, courseId] as const,
  statsAll: ["stats"] as const,
};
