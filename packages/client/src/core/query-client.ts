import { QueryClient, type QueryClientConfig } from "@tanstack/query-core";

/** The app's query defaults, shared by every platform. */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { staleTime: 10_000, retry: 1, ...config.defaultOptions?.queries },
    },
  });
}
