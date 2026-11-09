/**
 * Render a screen the way the app does: inside ClientProvider, with the real
 * API client pointed at the fake API (see @app/client/testing).
 */
import { ClientProvider } from "@app/client/react";
import { createTestDeps, type TestDeps } from "@app/client/testing";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderScreen(ui: ReactElement, deps: TestDeps = createTestDeps()) {
  return { deps, ...render(<ClientProvider deps={deps}>{ui}</ClientProvider>) };
}
