/**
 * Home dashboard view model: the total due, the one "Review all due"
 * action, due counts per course and the forecast, as display data.
 */
import type { ForecastDay } from "@app/shared";
import { languagePair, percent } from "../core/format.ts";
import type { Route } from "../core/ports.ts";
import { noCoursesMessage } from "../courses/view-model.ts";
import type { DashboardState } from "./controller.ts";

export interface DashboardCourseVM {
  id: string;
  title: string;
  languages: string;
  /** "3 due", or "Nothing due". */
  due: string;
  hasDue: boolean;
  route: Route;
}

export interface ForecastDayVM {
  /** YYYY-MM-DD, a stable key. */
  date: string;
  /** "Today", "Tomorrow", then the weekday: "Mon". */
  day: string;
  /** "Nov 16". */
  dateLabel: string;
  count: number;
  /** "3 reviews", "1 review", "None". */
  countLabel: string;
  /** Bar length, 0–100, relative to the busiest day. */
  share: number;
}

export interface DashboardReadyVM {
  kind: "ready";
  summary: {
    /** The total due now, as shown: "12". */
    count: string;
    /** "reviews due" or "review due". */
    unit: string;
    /** "across 2 courses", "in Spanish basics", or "Nothing due right now." */
    detail: string;
  };
  reviewAll: { label: string; route: Route; disabled: boolean };
  coursesTitle: string;
  courses: DashboardCourseVM[];
  forecast: {
    title: string;
    description: string;
    days: ForecastDayVM[];
  };
}

export interface DashboardVM {
  heading: string;
  body:
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "empty"; message: string; newCourse: { label: string; route: Route } }
    | DashboardReadyVM;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Calendar labels for a YYYY-MM-DD day; the date names a day, so it is read in UTC. */
function dayLabels(date: string, index: number): { day: string; dateLabel: string } {
  const at = new Date(`${date}T00:00:00Z`);
  const day =
    index === 0
      ? "Today"
      : index === 1
        ? "Tomorrow"
        : at.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });
  const dateLabel = at.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return { day, dateLabel };
}

function forecastDays(forecast: ForecastDay[]): ForecastDayVM[] {
  const busiest = Math.max(0, ...forecast.map((d) => d.dueCount));
  return forecast.map((d, i) => ({
    date: d.date,
    ...dayLabels(d.date, i),
    count: d.dueCount,
    countLabel:
      d.dueCount === 0 ? "None" : `${d.dueCount} ${plural(d.dueCount, "review", "reviews")}`,
    share: percent(d.dueCount, busiest),
  }));
}

export function dashboardViewModel({ dashboard, environment }: DashboardState): DashboardVM {
  const heading = "Home";
  if (dashboard.status === "loading") return { heading, body: { kind: "loading" } };
  if (dashboard.status === "error") {
    return { heading, body: { kind: "error", message: dashboard.message } };
  }
  const d = dashboard.data;
  if (d.courses.length === 0) {
    return {
      heading,
      body: {
        kind: "empty",
        message: noCoursesMessage(environment),
        newCourse: { label: "New course", route: { to: "newCourse" } },
      },
    };
  }
  const withDue = d.courses.filter((c) => c.dueCount > 0);
  return {
    heading,
    body: {
      kind: "ready",
      summary: {
        count: String(d.dueCount),
        unit: plural(d.dueCount, "review due", "reviews due"),
        detail:
          withDue.length === 0
            ? "Nothing due right now."
            : withDue.length === 1
              ? `in ${withDue[0]?.title}`
              : `across ${withDue.length} courses`,
      },
      reviewAll: {
        label: "Review all due",
        route: { to: "reviewAll" },
        disabled: d.dueCount === 0,
      },
      coursesTitle: "Due by course",
      courses: d.courses.map((c) => ({
        id: c.id,
        title: c.title,
        languages: languagePair(c.targetLang, c.sourceLang),
        due: c.dueCount > 0 ? `${c.dueCount} due` : "Nothing due",
        hasDue: c.dueCount > 0,
        route: { to: "course", courseId: c.id },
      })),
      forecast: {
        title: `Next ${d.forecast.length} days`,
        description: "Reviews falling due each day. Today includes any overdue.",
        days: forecastDays(d.forecast),
      },
    },
  };
}
