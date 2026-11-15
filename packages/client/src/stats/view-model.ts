/**
 * Progress stats view model: the course picker, headline numbers as tiles,
 * the review heatmap as cells with intensity steps, and the hardest words,
 * all as display data.
 */
import type { CourseSummary, HardWord, HeatmapDay, Stats } from "@app/shared";
import type { SelectVM } from "../core/fields.ts";
import type { Route } from "../core/ports.ts";
import type { Remote } from "../core/remote.ts";
import { ALL_COURSES, type StatsState } from "./controller.ts";

export interface StatTileVM {
  /** Stable key. */
  id: "learned" | "reviews" | "retention" | "streak";
  label: string;
  /** The number as shown: "1,204", "87%", "5 days". */
  value: string;
  detail: string;
}

/** 0 is no reviews; 1–4 are quarters of the busiest day. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export const HEAT_LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4];

export interface HeatmapCellVM {
  /** YYYY-MM-DD, a stable key. */
  date: string;
  /** "Mon, Nov 10: 3 reviews". */
  label: string;
  level: HeatLevel;
}

export interface HardWordVM {
  id: string;
  term: string;
  definition: string;
  course: string;
  route: Route;
  /** "2 lapses · 3 of 5 wrong". */
  detail: string;
}

export interface StatsReadyVM {
  kind: "ready";
  tiles: StatTileVM[];
  heatmap: {
    title: string;
    /** "57 reviews on 9 days". */
    description: string;
    /** "Aug 24 – Nov 15". */
    range: string;
    /**
     * Empty cells before the first day, so that the cells, laid out in
     * columns of seven, put Mondays in the first row.
     */
    leadingBlanks: number;
    /** Oldest first. */
    cells: HeatmapCellVM[];
    legend: { less: string; more: string };
  };
  hardest: {
    title: string;
    description: string;
    words: HardWordVM[];
    /** Shown instead of the list when it is empty. */
    emptyMessage: string;
  };
}

export interface StatsVM {
  heading: string;
  /** The course picker; null until the course list loads. */
  filter: SelectVM<string> | null;
  body:
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "empty"; message: string; action: { label: string; route: Route } | null }
    | StatsReadyVM;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const count = (n: number) => n.toLocaleString("en");
const days = (n: number) => `${count(n)} ${plural(n, "day", "days")}`;

/** "Mon, Nov 10"; the date names a day, so it is read in UTC. */
function dayLabel(date: string, withWeekday: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    ...(withWeekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function streakDetail({ current, longest, reviewedToday }: Stats["streak"]): string {
  const best = `Longest: ${days(longest)}.`;
  if (current === 0) return `Review today to start a new one. ${best}`;
  if (!reviewedToday) return `Review today to keep it going. ${best}`;
  return `Reviewed today. ${best}`;
}

function tiles({ totals, retention, streak }: Stats): StatTileVM[] {
  const window = `in the last ${retention.days} days`;
  return [
    {
      id: "learned",
      label: "Words learned",
      value: count(totals.wordsLearned),
      detail: "Answered at least once.",
    },
    {
      id: "reviews",
      label: "Reviews done",
      value: count(totals.reviewCount),
      detail: "Every answer, all time.",
    },
    {
      id: "retention",
      label: "Retention",
      value:
        retention.reviewCount === 0
          ? "No data"
          : `${Math.round((retention.correctCount / retention.reviewCount) * 100)}%`,
      detail:
        retention.reviewCount === 0
          ? `No reviews of learned words ${window}.`
          : `${count(retention.correctCount)} of ${count(retention.reviewCount)} learned-word ${plural(retention.reviewCount, "review", "reviews")} correct ${window}.`,
    },
    {
      id: "streak",
      label: "Current streak",
      value: days(streak.current),
      detail: streakDetail(streak),
    },
  ];
}

export function heatLevel(reviews: number, busiest: number): HeatLevel {
  if (reviews <= 0 || busiest <= 0) return 0;
  return Math.min(4, Math.ceil((reviews / busiest) * 4)) as HeatLevel;
}

function heatmap(days: HeatmapDay[]): StatsReadyVM["heatmap"] {
  const busiest = Math.max(0, ...days.map((d) => d.reviewCount));
  const total = days.reduce((sum, d) => sum + d.reviewCount, 0);
  const active = days.filter((d) => d.reviewCount > 0).length;
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  return {
    title: `Last ${Math.round(days.length / 7)} weeks`,
    description: `${count(total)} ${plural(total, "review", "reviews")} on ${count(active)} ${plural(active, "day", "days")}`,
    range: first && last ? `${dayLabel(first, false)} – ${dayLabel(last, false)}` : "",
    // getUTCDay counts from Sunday; shift so Monday is 0.
    leadingBlanks: first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0,
    cells: days.map((d) => ({
      date: d.date,
      label: `${dayLabel(d.date, true)}: ${d.reviewCount === 0 ? "No reviews" : `${count(d.reviewCount)} ${plural(d.reviewCount, "review", "reviews")}`}`,
      level: heatLevel(d.reviewCount, busiest),
    })),
    legend: { less: "Less", more: "More" },
  };
}

function hardWord(w: HardWord): HardWordVM {
  const lapses =
    w.lapses === 0 ? "No lapses" : `${w.lapses} ${plural(w.lapses, "lapse", "lapses")}`;
  return {
    id: w.itemId,
    term: w.term,
    definition: w.definition,
    course: w.courseTitle,
    route: { to: "course", courseId: w.courseId },
    detail: `${lapses} · ${count(w.wrongCount)} of ${count(w.reviewCount)} wrong`,
  };
}

function filter(courseId: string | null, courses: Remote<CourseSummary[]>): StatsVM["filter"] {
  if (courses.status !== "ready") return null;
  return {
    id: "stats-course",
    label: "Course",
    value: courseId ?? ALL_COURSES,
    options: [
      { value: ALL_COURSES, label: "All courses" },
      ...courses.data.map((c) => ({ value: c.id, label: c.title })),
    ],
  };
}

export function statsViewModel({ courseId, courses, stats }: StatsState): StatsVM {
  const heading = "Stats";
  const picker = filter(courseId, courses);
  if (stats.status === "loading") return { heading, filter: picker, body: { kind: "loading" } };
  if (stats.status === "error") {
    return { heading, filter: picker, body: { kind: "error", message: stats.message } };
  }
  const s = stats.data;
  if (s.totals.reviewCount === 0) {
    return {
      heading,
      filter: picker,
      body:
        s.courseId === null
          ? {
              kind: "empty",
              message: "No reviews yet. Learn some words and progress shows up here.",
              action: { label: "Go to courses", route: { to: "courses" } },
            }
          : { kind: "empty", message: "No reviews in this course yet.", action: null },
    };
  }
  return {
    heading,
    filter: picker,
    body: {
      kind: "ready",
      tiles: tiles(s),
      heatmap: heatmap(s.heatmap),
      hardest: {
        title: "Hardest words",
        description: "Most lapses first, then the most wrong answers.",
        words: s.hardestWords.map(hardWord),
        emptyMessage: "Nothing forgotten or answered wrong yet.",
      },
    },
  };
}
