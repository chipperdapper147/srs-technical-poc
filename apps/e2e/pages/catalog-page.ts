import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/catalog`: shared courses, search, language filter and "Copy to my courses". */
export class CatalogPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly languageSelect: Locator;
  readonly courses: Locator;
  readonly emptyState: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "Course catalog" });
    this.searchInput = page.getByLabel("Search", { exact: true });
    this.searchButton = page.getByRole("button", { name: "Search", exact: true });
    this.languageSelect = page.getByLabel("Language", { exact: true });
    this.courses = page.getByRole("listitem");
    this.emptyState = page.getByText("No courses match");
  }

  async goto() {
    await open(this.page, "/catalog");
    await this.heading.waitFor();
  }

  /** A course's card, found by its exact title. */
  course(title: string): Locator {
    return this.courses.filter({
      has: this.page.getByRole("heading", { name: title, exact: true }),
    });
  }

  /** The course titles listed, in order. */
  async titles(): Promise<string[]> {
    return this.courses.getByRole("heading").allTextContents();
  }

  async search(text: string) {
    await this.searchInput.fill(text);
    await this.searchButton.click();
  }

  /** Filter by a language's display name, e.g. "Spanish" or "All languages". */
  async filterLanguage(label: string) {
    await this.languageSelect.selectOption({ label });
  }

  /** Copy a course; the app then opens the copy. */
  async copy(title: string) {
    await this.course(title)
      .getByRole("button", { name: /^Copy to my courses/ })
      .click();
  }
}
