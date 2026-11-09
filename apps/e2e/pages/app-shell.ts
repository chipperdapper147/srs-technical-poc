import type { Locator, Page } from "@playwright/test";

/** Header navigation shared by every page. */
export class AppShell {
  readonly coursesLink: Locator;
  readonly settingsLink: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    const nav = page.getByRole("navigation");
    this.coursesLink = nav.getByRole("link", { name: "Courses" });
    this.settingsLink = nav.getByRole("link", { name: "Settings" });
  }
}
