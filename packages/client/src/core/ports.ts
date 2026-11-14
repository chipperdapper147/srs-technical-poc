/**
 * What a controller may touch outside itself. Each platform (web, mobile)
 * provides these once; tests provide fakes.
 */
import type { StudyMode } from "@app/shared";
import type { QueryClient } from "@tanstack/query-core";
import type { ApiClient } from "../api/client.ts";
import type { AccessGate } from "./access.ts";

/** A destination, independent of how a platform spells it (URL, screen name). */
export type Route =
  | { to: "courses" }
  | { to: "newCourse" }
  | { to: "course"; courseId: string }
  | { to: "study"; courseId: string; mode: StudyMode }
  | { to: "settings" };

export interface Navigator {
  navigate(route: Route): void;
}

export interface Clock {
  /** Milliseconds, monotonic within a session (performance.now on the web). */
  now(): number;
}

export interface ClientDeps {
  api: ApiClient;
  queryClient: QueryClient;
  navigator: Navigator;
  clock: Clock;
  access: AccessGate;
}
