/**
 * Progress stats: the API's numbers for every course or the one picked,
 * counted in the learner's time zone, and the course list for the picker.
 */
import type { CourseSummary, Stats } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import type { Controller } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

/** The picker's value for every course; anything else is a course id. */
export const ALL_COURSES = "all";

export interface StatsState {
  /** The course picked; null for every course. */
  courseId: string | null;
  courses: Remote<CourseSummary[]>;
  stats: Remote<Stats>;
}

export interface StatsActions {
  /** A picker value: ALL_COURSES or a course id. */
  setCourse(choice: string): void;
}

export function createStatsController({
  api,
  queryClient,
  clock,
}: ClientDeps): Controller<StatsState, StatsActions> {
  const store = createStore<StatsState>({ courseId: null, courses: LOADING, stats: LOADING });
  const timeZone = clock.timeZone();
  /** Stops observing the current course's stats; null while stopped. */
  let stopStats: (() => void) | null = null;

  function observeStats() {
    stopStats?.();
    const { courseId } = store.get();
    stopStats = observeQuery(
      queryClient,
      {
        queryKey: queryKeys.stats(timeZone, courseId),
        queryFn: () => api.stats({ timeZone, courseId }),
      },
      (stats) => store.set((s) => ({ ...s, stats })),
    );
  }

  return {
    store,
    actions: {
      setCourse(choice) {
        const courseId = choice === ALL_COURSES ? null : choice;
        if (courseId === store.get().courseId) return;
        store.set((s) => ({ ...s, courseId }));
        if (stopStats) observeStats();
      },
    },
    start() {
      const stopCourses = observeQuery(
        queryClient,
        { queryKey: queryKeys.courses, queryFn: () => api.courses() },
        (courses) => store.set((s) => ({ ...s, courses })),
      );
      observeStats();
      return () => {
        stopCourses();
        stopStats?.();
        stopStats = null;
      };
    },
  };
}
