import type { QueryClient } from "@tanstack/query-core";
import { createApiClient } from "../api/client.ts";
import { createAccessGate, memoryKeyStorage } from "../core/access.ts";
import type { ClientDeps, Environment, Route } from "../core/ports.ts";
import { createQueryClient } from "../core/query-client.ts";
import { FAKE_API_URL } from "./fake-api.ts";

export interface TestDeps extends ClientDeps {
  queryClient: QueryClient;
  /** Every route the controller navigated to, in order. */
  routes: Route[];
  /** Move the fake clock forward. */
  tick(ms: number): void;
}

/** The fake clock's time zone, unless a test passes another. */
export const TEST_TIME_ZONE = "Europe/Madrid";

/**
 * Real API client and query client, a recording navigator, a manual clock
 * in `timeZone`, an access gate holding `accessKey` (none by default), and
 * a production build unless `environment` says otherwise.
 */
export function createTestDeps(
  baseUrl = FAKE_API_URL,
  {
    accessKey = null,
    timeZone = TEST_TIME_ZONE,
    environment = "production",
  }: { accessKey?: string | null; timeZone?: string; environment?: Environment } = {},
): TestDeps {
  let now = 0;
  const routes: Route[] = [];
  const access = createAccessGate(memoryKeyStorage(accessKey));
  return {
    api: createApiClient({ baseUrl, access }),
    access,
    queryClient: createQueryClient({ defaultOptions: { queries: { retry: false } } }),
    navigator: { navigate: (route) => routes.push(route) },
    clock: { now: () => now, timeZone: () => timeZone },
    environment,
    routes,
    tick: (ms) => {
      now += ms;
    },
  };
}
