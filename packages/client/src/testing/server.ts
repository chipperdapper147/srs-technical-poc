/**
 * Vitest helper: serve a fresh fake API for each test. Unhandled requests
 * fail the test, so a screen can't silently call an endpoint the fake lacks.
 *
 *   const api = setupFakeApi(() => ({ courses: [aCourse()] }));
 *   it("…", () => { api.current.state.courses … });
 */
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { createFakeApi, type FakeApi, type FakeApiSeed } from "./fake-api.ts";

export function setupFakeApi(seed: () => FakeApiSeed = () => ({})): { current: FakeApi } {
  const server = setupServer();
  const ref = { current: createFakeApi() };
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  beforeEach(() => {
    ref.current = createFakeApi(seed());
    server.resetHandlers(...ref.current.handlers);
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return ref;
}
