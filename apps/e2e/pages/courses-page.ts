import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/courses`: list of courses (header nav "Courses"). */
export class CoursesPage {
  readonly heading: Locator;
  readonly newCourseLink: Locator;
  readonly catalogLink: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Courses" });
    this.newCourseLink = page.getByRole("link", { name: "New course" });
    this.catalogLink = page.getByRole("link", { name: "Browse the catalog" });
  }

  async goto() {
    await open(this.page, "/courses");
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
