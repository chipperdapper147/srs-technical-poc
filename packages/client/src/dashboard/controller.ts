/**
 * Home dashboard: one observed query, the API's summary of what is due now
 * and over the coming days, counted in the learner's time zone.
 */
import type { Dashboard } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import type { Controller } from "../core/controller.ts";
import type { ClientDeps, Environment } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export type DashboardState = {
  dashboard: Remote<Dashboard>;
  /** Decides whether the empty state may mention developer tooling. */
  environment: Environment;
};
export type DashboardActions = Record<string, never>;

export function createDashboardController({
  api,
  queryClient,
  clock,
  environment,
}: ClientDeps): Controller<DashboardState, DashboardActions> {
  const store = createStore<DashboardState>({ dashboard: LOADING, environment });
  const timeZone = clock.timeZone();
  return {
    store,
    actions: {},
    start: () =>
      observeQuery(
        queryClient,
        { queryKey: queryKeys.dashboard(timeZone), queryFn: () => api.dashboard(timeZone) },
        (dashboard) => store.set((s) => ({ ...s, dashboard })),
      ),
  };
}
