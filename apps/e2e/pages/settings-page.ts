import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/settings`: learner defaults. */
export class SettingsPage {
  readonly gradingSelect: Locator;
  readonly accentSwitch: Locator;
  readonly newItemsInput: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.gradingSelect = page.getByLabel("Answer grading");
    this.accentSwitch = page.getByRole("switch", { name: "Require accents" });
    this.newItemsInput = page.getByLabel("New words per learn session");
  }

  async goto() {
    await open(this.page, "/settings");
    await this.gradingSelect.waitFor();
  }

  async setGrading(mode: "lenient" | "strict") {
    const saved = this.page.waitForResponse((r) => r.request().method() === "PATCH");
    await this.gradingSelect.selectOption(mode);
    await saved;
  }
}
