import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/courses/new`. */
export class NewCoursePage {
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly targetLangInput: Locator;
  readonly sourceLangInput: Locator;
  readonly createButton: Locator;
  readonly error: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.getByLabel("Title");
    this.descriptionInput = page.getByLabel("Description");
    this.targetLangInput = page.getByLabel("Learning (language code)");
    this.sourceLangInput = page.getByLabel("From (language code)");
    this.createButton = page.getByRole("button", { name: "Create course" });
    this.error = page.locator('[data-slot="alert"]');
  }

  async goto() {
    await open(this.page, "/courses/new");
  }

  async create(course: { title: string; targetLang: string; sourceLang?: string }) {
    await this.titleInput.fill(course.title);
    await this.targetLangInput.fill(course.targetLang);
    if (course.sourceLang) await this.sourceLangInput.fill(course.sourceLang);
    await this.createButton.click();
  }
}
