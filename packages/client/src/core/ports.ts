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
  | { to: "home" }
  | { to: "courses" }
  | { to: "newCourse" }
  | { to: "course"; courseId: string }
  /** Paste words or bring a Quizlet or Anki export into a course. */
  | { to: "importWords"; courseId: string }
  | { to: "study"; courseId: string; mode: StudyMode }
  /** One review session across every course. */
  | { to: "reviewAll" }
  | { to: "settings" }
  /** Progress stats, for every course or the one picked on the screen. */
  | { to: "stats" };

export interface Navigator {
  navigate(route: Route): void;
}

export interface Clock {
  /** Milliseconds, monotonic within a session (performance.now on the web). */
  now(): number;
  /** The learner's IANA time zone, e.g. "Europe/Madrid", for anything counted in calendar days. */
  timeZone(): string;
}

/**
 * How the app was built. Development builds may show hints meant for the
 * people working on the app (such as running the seed), never learners.
 */
export type Environment = "development" | "production";

export interface ClientDeps {
  api: ApiClient;
  queryClient: QueryClient;
  navigator: Navigator;
  clock: Clock;
  access: AccessGate;
  environment: Environment;
}
