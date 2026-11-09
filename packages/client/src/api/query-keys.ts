import type { StudyMode } from "@app/shared";

export const queryKeys = {
  me: ["me"] as const,
  courses: ["courses"] as const,
  course: (id: string) => ["courses", id] as const,
  // Not under "courses": invalidating course data must not refetch a session in progress.
  study: (id: string, mode: StudyMode) => ["study", id, mode] as const,
};
