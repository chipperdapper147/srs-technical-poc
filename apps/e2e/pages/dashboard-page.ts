import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/`: the home dashboard. Reviews due now, review-all, per course, and the forecast. */
export class DashboardPage {
  readonly heading: Locator;
  /** "12 reviews due" and the line under it. */
  readonly summary: Locator;
  readonly reviewAllLink: Locator;
  readonly newCourseLink: Locator;
  readonly emptyState: Locator;
  /** One list item per forecast day, today first. */
  readonly forecastDays: Locator;
  private readonly courses: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "Home" });
    this.summary = page.getByTestId("due-summary");
    this.reviewAllLink = page.getByRole("link", { name: "Review all due" });
    this.newCourseLink = page.getByRole("link", { name: "New course" });
    this.emptyState = page.getByText(/^No courses yet/);
    this.courses = page.getByRole("region", { name: "Due by course" });
    this.forecastDays = page.getByRole("region", { name: /^Next \d+ days$/ }).getByRole("listitem");
  }

  async goto() {
    await open(this.page, "/");
    await this.heading.waitFor();
  }

  /** The row for a course, found by title: a link to the course with its due count. */
  course(title: string): Locator {
    return this.courses.getByRole("link").filter({ hasText: title });
  }
}
