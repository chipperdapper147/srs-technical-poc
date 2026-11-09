import type { Locator, Page } from "@playwright/test";

/** `/`: list of courses. */
export class CoursesPage {
  readonly heading: Locator;
  readonly newCourseLink: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Courses" });
    this.newCourseLink = page.getByRole("link", { name: "New course" });
  }

  async goto() {
    await this.page.goto("/");
    await this.heading.waitFor();
  }

  /** The card for a course, found by title. */
  course(title: string): Locator {
    return this.page.getByRole("link").filter({ hasText: title });
  }

  async open(title: string) {
    await this.course(title).click();
  }
}
