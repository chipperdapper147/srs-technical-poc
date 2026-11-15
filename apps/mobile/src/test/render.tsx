/**
 * Render a view or screen the way the app does: inside ClientProvider, with
 * the real API client pointed at the fake API (see @app/client/testing) and a
 * navigator that records routes (`deps.routes`).
 */
import { ClientProvider } from "@app/client/react";
import { createTestDeps, type TestDeps } from "@app/client/testing";
import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";

/**
 * Test deps whose queries are never garbage-collected: a gc timer (5 minutes
 * by default) would keep Jest's worker alive after the tests. Vitest, which
 * the web uses, ends its workers regardless.
 */
export function mobileTestDeps(): TestDeps {
  const deps = createTestDeps();
  const queries = deps.queryClient.getDefaultOptions().queries;
  deps.queryClient.setDefaultOptions({ queries: { ...queries, gcTime: Number.POSITIVE_INFINITY } });
  return deps;
}

export async function renderWithDeps(ui: ReactElement, deps: TestDeps = mobileTestDeps()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ClientProvider deps={deps}>{children}</ClientProvider>
  );
  return { deps, ...(await render(ui, { wrapper })) };
}
