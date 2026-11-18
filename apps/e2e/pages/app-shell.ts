import type { Locator, Page } from "@playwright/test";

/** Header shared by every page: navigation, and who is signed in. */
export class AppShell {
  readonly navigation: Locator;
  readonly brandLink: Locator;
  readonly homeLink: Locator;
  readonly coursesLink: Locator;
  readonly catalogLink: Locator;
  readonly statsLink: Locator;
  readonly settingsLink: Locator;
  /** Every link in the navigation (only the brand while signed out). */
  readonly navLinks: Locator;
  readonly signOutButton: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    const nav = page.getByRole("navigation");
    this.navigation = nav;
    this.brandLink = nav.getByRole("link", { name: "SRS" });
    this.homeLink = nav.getByRole("link", { name: "Home" });
    this.coursesLink = nav.getByRole("link", { name: "Courses" });
    this.catalogLink = nav.getByRole("link", { name: "Catalog" });
    this.statsLink = nav.getByRole("link", { name: "Stats" });
    this.settingsLink = nav.getByRole("link", { name: "Settings" });
    this.navLinks = nav.getByRole("link");
    this.signOutButton = page.getByRole("banner").getByRole("button", { name: "Sign out" });
  }

  /** The signed-in account's name, shown beside Sign out. */
  account(name: string): Locator {
    return this.page.getByRole("banner").getByText(name, { exact: true });
  }
}
