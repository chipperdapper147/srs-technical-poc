import type { DashboardReadyVM } from "@app/client";
import { aCourse, aForecast, setupFakeApi } from "@app/client/testing";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { DashboardScreen } from "./dashboard-screen";
import { DashboardView } from "./dashboard-view";

const fake = setupFakeApi(() => ({
  courses: [
    aCourse({ title: "Spanish", dueCount: 3 }),
    aCourse({ title: "German", targetLang: "de", dueCount: 0 }),
  ],
  forecast: aForecast([3, 1]),
}));

const ready = (over: Partial<DashboardReadyVM> = {}): DashboardReadyVM => ({
  kind: "ready",
  summary: { count: "0", unit: "reviews due", detail: "Nothing due right now." },
  reviewAll: { label: "Review all due", route: { to: "reviewAll" }, disabled: true },
  coursesTitle: "Due by course",
  courses: [],
  forecast: { title: "Next 7 days", description: "Reviews falling due each day.", days: [] },
  ...over,
});

describe("DashboardView", () => {
  it("renders loading, errors and the empty state under the heading", () => {
    const { rerender } = render(
      <DashboardView vm={{ heading: "Home", body: { kind: "loading" } }} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(
      <DashboardView vm={{ heading: "Home", body: { kind: "error", message: "Database down" } }} />,
    );
    expect(screen.getByText("Database down")).toBeTruthy();
    rerender(
      <DashboardView
        vm={{
          heading: "Home",
          body: {
            kind: "empty",
            message: "No courses yet. Create one to get started.",
            newCourse: { label: "New course", route: { to: "newCourse" } },
          },
        }}
      />,
    );
    expect(screen.getByText("No courses yet. Create one to get started.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New course" }).getAttribute("href")).toBe(
      "/courses/new",
    );
  });

  it("disables Review all due when nothing is due", () => {
    render(<DashboardView vm={{ heading: "Home", body: ready() }} />);
    const link = screen.getByRole("link", { name: "Review all due" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("due-summary").textContent).toBe(
      "0 reviews dueNothing due right now.",
    );
  });

  it("scales each forecast bar to its share and keeps the bars out of the accessible text", () => {
    render(
      <DashboardView
        vm={{
          heading: "Home",
          body: ready({
            forecast: {
              title: "Next 7 days",
              description: "Reviews falling due each day.",
              days: [
                {
                  date: "2026-11-14",
                  day: "Today",
                  dateLabel: "Nov 14",
                  count: 2,
                  countLabel: "2 reviews",
                  share: 50,
                },
                {
                  date: "2026-11-15",
                  day: "Tomorrow",
                  dateLabel: "Nov 15",
                  count: 4,
                  countLabel: "4 reviews",
                  share: 100,
                },
              ],
            },
          }),
        }}
      />,
    );
    const rows = within(screen.getByTestId("forecast")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Today Nov 142 reviews",
      "Tomorrow Nov 154 reviews",
    ]);
    const bar = rows[0]?.querySelector("[aria-hidden] > span") as HTMLElement;
    expect(bar.style.width).toBe("50%");
  });
});

describe("DashboardScreen", () => {
  it("shows the total, links to review all and to each course, and the forecast", async () => {
    const { container } = renderScreen(<DashboardScreen />);
    const review = await screen.findByRole("link", { name: "Review all due" });
    expect(review.getAttribute("href")).toBe("/review");
    expect(review.getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByTestId("due-summary").textContent).toBe("3 reviews duein Spanish");

    const courses = within(screen.getByRole("region", { name: "Due by course" }));
    const spanish = courses.getByRole("link", { name: /Spanish/ });
    expect(spanish.getAttribute("href")).toBe(`/courses/${fake.current.state.courses[0]?.id}`);
    expect(spanish.textContent).toContain("3 due");
    expect(courses.getByRole("link", { name: /German/ }).textContent).toContain("Nothing due");

    const forecast = within(screen.getByRole("region", { name: "Next 7 days" }));
    expect(forecast.getAllByRole("listitem")).toHaveLength(7);
    expect(forecast.getAllByRole("listitem")[0]?.textContent).toBe("Today Nov 143 reviews");
    await expectNoA11yViolations(container);
  });
});
