/** Course list: one observed query. */
import type { CourseSummary } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import type { Controller } from "../core/controller.ts";
import type { ClientDeps, Environment } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export type CoursesState = {
  courses: Remote<CourseSummary[]>;
  /** Decides whether the empty state may mention developer tooling. */
  environment: Environment;
};
export type CoursesActions = Record<string, never>;

export function createCoursesController({
  api,
  queryClient,
  environment,
}: ClientDeps): Controller<CoursesState, CoursesActions> {
  const store = createStore<CoursesState>({ courses: LOADING, environment });
  return {
    store,
    actions: {},
    start: () =>
      observeQuery(
        queryClient,
        { queryKey: queryKeys.courses, queryFn: () => api.courses() },
        (courses) => store.set((s) => ({ ...s, courses })),
      ),
  };
}
