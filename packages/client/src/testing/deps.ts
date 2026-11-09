import type { QueryClient } from "@tanstack/query-core";
import { createApiClient } from "../api/client.ts";
import type { ClientDeps, Route } from "../core/ports.ts";
import { createQueryClient } from "../core/query-client.ts";
import { FAKE_API_URL } from "./fake-api.ts";

export interface TestDeps extends ClientDeps {
  queryClient: QueryClient;
  /** Every route the controller navigated to, in order. */
  routes: Route[];
  /** Move the fake clock forward. */
  tick(ms: number): void;
}

/** Real API client and query client, a recording navigator, a manual clock. */
export function createTestDeps(baseUrl = FAKE_API_URL): TestDeps {
  let now = 0;
  const routes: Route[] = [];
  return {
    api: createApiClient({ baseUrl }),
    queryClient: createQueryClient({ defaultOptions: { queries: { retry: false } } }),
    navigator: { navigate: (route) => routes.push(route) },
    clock: { now: () => now },
    routes,
    tick: (ms) => {
      now += ms;
    },
  };
}
