import type { StatsActions, StatsReadyVM, StatsVM } from "@app/client";
import { aCourse, aHardWord, aHeatmap, aStats, setupFakeApi } from "@app/client/testing";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { StatsScreen } from "./stats-screen";
import { StatsView } from "./stats-view";

const spanish = aCourse({ title: "Spanish" });
const german = aCourse({ title: "German", targetLang: "de" });

const fake = setupFakeApi(() => ({
  courses: [spanish, german],
  stats: aStats({
    totals: { wordsLearned: 8, reviewCount: 12 },
    retention: { days: 30, reviewCount: 4, correctCount: 3 },
    heatmap: aHeatmap([4, 0, 2, 6]),
    streak: { current: 2, longest: 5, reviewedToday: true },
    hardestWords: [
      aHardWord({ term: "la biblioteca", courseId: spanish.id, courseTitle: "Spanish" }),
    ],
  }),
}));

const noActions: StatsActions = { setCourse: () => {} };

const filter = {
  id: "stats-course",
  label: "Course",
  value: "all",
  options: [
    { value: "all", label: "All courses" },
    { value: "c1", label: "Spanish" },
  ],
};

const ready = (over: Partial<StatsReadyVM> = {}): StatsReadyVM => ({
  kind: "ready",
  tiles: [
    { id: "learned", label: "Words learned", value: "8", detail: "Answered at least once." },
    { id: "streak", label: "Current streak", value: "2 days", detail: "Reviewed today." },
  ],
  heatmap: {
    title: "Last 12 weeks",
    description: "6 reviews on 2 days",
    range: "Nov 13 – Nov 14",
    leadingBlanks: 4,
    cells: [
      { date: "2026-11-13", label: "Fri, Nov 13: No reviews", level: 0 },
      { date: "2026-11-14", label: "Sat, Nov 14: 6 reviews", level: 4 },
    ],
    legend: { less: "Less", more: "More" },
  },
  hardest: {
    title: "Hardest words",
    description: "Most lapses first, then the most wrong answers.",
    words: [],
    emptyMessage: "Nothing forgotten or answered wrong yet.",
  },
  ...over,
});

const view = (body: StatsVM["body"], actions = noActions, f: StatsVM["filter"] = filter) =>
  render(<StatsView vm={{ heading: "Stats", filter: f, body }} actions={actions} />);

describe("StatsView", () => {
  it("renders loading, errors and the empty state under the heading", () => {
    const { rerender } = view({ kind: "loading" }, noActions, null);
    expect(screen.getByRole("heading", { level: 1, name: "Stats" })).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByLabelText("Course")).toBeNull();
    rerender(
      <StatsView
        vm={{ heading: "Stats", filter, body: { kind: "error", message: "Database down" } }}
        actions={noActions}
      />,
    );
    expect(screen.getByText("Database down")).toBeTruthy();
    rerender(
      <StatsView
        vm={{
          heading: "Stats",
          filter,
          body: {
            kind: "empty",
            message: "No reviews yet.",
            action: { label: "Go to courses", route: { to: "courses" } },
          },
        }}
        actions={noActions}
      />,
    );
    expect(screen.getByText("No reviews yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to courses" }).getAttribute("href")).toBe(
      "/courses",
    );
  });

  it("sends the picked course to the controller", () => {
    const setCourse = vi.fn();
    view(ready(), { setCourse });
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "c1" } });
    expect(setCourse).toHaveBeenCalledWith("c1");
  });

  it("shows each tile, and heatmap cells by level with their day in words", () => {
    view(ready());
    const tiles = within(screen.getByTestId("stat-tiles")).getAllByRole("listitem");
    expect(tiles.map((t) => t.textContent)).toEqual([
      "Words learned8Answered at least once.",
      "Current streak2 daysReviewed today.",
    ]);
    const cells = within(screen.getByTestId("heatmap")).getAllByRole("listitem");
    expect(cells.map((c) => [c.textContent, c.dataset.level])).toEqual([
      ["Fri, Nov 13: No reviews", "0"],
      ["Sat, Nov 14: 6 reviews", "4"],
    ]);
    // The first day sits on its weekday's row: four blanks put Friday in row 5.
    expect(cells[0]?.className).toContain("row-start-5");
    expect(cells[1]?.className).not.toContain("row-start");
    expect(screen.getByText("Nothing forgotten or answered wrong yet.")).toBeTruthy();
  });

  it("links each hardest word to its course", () => {
    view(
      ready({
        hardest: {
          ...ready().hardest,
          words: [
            {
              id: "w1",
              term: "la biblioteca",
              definition: "library",
              course: "Spanish",
              route: { to: "course", courseId: "c1" },
              detail: "1 lapse · 2 of 4 wrong",
            },
          ],
        },
      }),
    );
    const link = within(screen.getByRole("region", { name: "Hardest words" })).getByRole("link");
    expect(link.getAttribute("href")).toBe("/courses/c1");
    expect(link.textContent).toBe("la bibliotecalibrary · 1 lapse · 2 of 4 wrongSpanish");
  });
});

describe("StatsScreen", () => {
  it("shows the learner's numbers, and one course's after picking it", async () => {
    const { container } = renderScreen(<StatsScreen />);
    const tiles = await screen.findByTestId("stat-tiles");
    expect(
      within(tiles)
        .getAllByRole("listitem")
        .map((t) => t.textContent?.slice(0, 20)),
    ).toEqual([
      "Words learned8Answer",
      "Reviews done12Every ",
      "Retention75%3 of 4 l",
      "Current streak2 days",
    ]);
    expect(within(screen.getByTestId("heatmap")).getAllByRole("listitem")).toHaveLength(84);
    const hardest = within(screen.getByRole("region", { name: "Hardest words" }));
    expect(hardest.getByRole("link").getAttribute("href")).toBe(`/courses/${spanish.id}`);
    await expectNoA11yViolations(container);

    fireEvent.change(screen.getByLabelText("Course"), { target: { value: german.id } });
    expect(await screen.findByText("No reviews in this course yet.")).toBeTruthy();
    expect(fake.current.requests.at(-1)?.search).toContain(`courseId=${german.id}`);
    expect((screen.getByLabelText("Course") as HTMLSelectElement).value).toBe(german.id);
  });
});
