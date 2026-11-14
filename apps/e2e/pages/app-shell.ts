import type { Locator, Page } from "@playwright/test";

/** Header navigation shared by every page. */
export class AppShell {
  readonly brandLink: Locator;
  readonly homeLink: Locator;
  readonly coursesLink: Locator;
  readonly settingsLink: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    const nav = page.getByRole("navigation");
    this.brandLink = nav.getByRole("link", { name: "SRS" });
    this.homeLink = nav.getByRole("link", { name: "Home" });
    this.coursesLink = nav.getByRole("link", { name: "Courses" });
    this.settingsLink = nav.getByRole("link", { name: "Settings" });
  }
}
