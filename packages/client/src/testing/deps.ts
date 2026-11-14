import type { QueryClient } from "@tanstack/query-core";
import { createApiClient } from "../api/client.ts";
import { createAccessGate, memoryKeyStorage } from "../core/access.ts";
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

/**
 * Real API client and query client, a recording navigator, a manual clock,
 * and an access gate holding `accessKey` (none by default).
 */
export function createTestDeps(
  baseUrl = FAKE_API_URL,
  { accessKey = null }: { accessKey?: string | null } = {},
): TestDeps {
  let now = 0;
  const routes: Route[] = [];
  const access = createAccessGate(memoryKeyStorage(accessKey));
  return {
    api: createApiClient({ baseUrl, access }),
    access,
    queryClient: createQueryClient({ defaultOptions: { queries: { retry: false } } }),
    navigator: { navigate: (route) => routes.push(route) },
    clock: { now: () => now },
    routes,
    tick: (ms) => {
      now += ms;
    },
  };
}
