import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/stats`: progress stats, for every course or the one picked. */
export class StatsPage {
  readonly heading: Locator;
  readonly courseSelect: Locator;
  readonly emptyState: Locator;
  /** One list item per day, oldest first; each says its day and count in words. */
  readonly heatmapDays: Locator;
  /** One link per hard word, to its course. */
  readonly hardestWords: Locator;
  private readonly tiles: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "Stats" });
    this.courseSelect = page.getByLabel("Course");
    this.emptyState = page.getByText(/^No reviews (yet|in this course)/);
    this.tiles = page.getByTestId("stat-tiles").getByRole("listitem");
    this.heatmapDays = page.getByTestId("heatmap").getByRole("listitem");
    this.hardestWords = page.getByRole("region", { name: "Hardest words" }).getByRole("link");
  }

  async goto() {
    await open(this.page, "/stats");
    await this.heading.waitFor();
  }

  /** A headline number by its label ("Reviews done"): label, value and detail. */
  tile(label: string): Locator {
    return this.tiles.filter({ hasText: label });
  }

  /** Pick a course by title, or "All courses". */
  async selectCourse(title: string) {
    await this.courseSelect.selectOption({ label: title });
  }
}
