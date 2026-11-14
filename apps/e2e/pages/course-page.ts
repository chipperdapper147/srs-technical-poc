import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/courses/:id`: overview, study entry points, grading and import. */
export class CoursePage {
  readonly title: Locator;
  readonly learnLink: Locator;
  readonly reviewLink: Locator;
  readonly readOnlyNotice: Locator;
  readonly gradingSelect: Locator;
  readonly accentsSelect: Locator;
  readonly csvTextarea: Locator;
  readonly importButton: Locator;
  readonly importResult: Locator;
  readonly importError: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole("heading", { level: 1 });
    this.learnLink = page.getByRole("link", { name: /Learn new words/ });
    this.reviewLink = page.getByRole("link", { name: /Review \(/ });
    this.readOnlyNotice = page.getByText("This is a shared course");
    this.gradingSelect = page.getByLabel("Answer grading");
    this.accentsSelect = page.getByLabel("Accents");
    this.csvTextarea = page.getByLabel("Or paste");
    this.importButton = page.getByRole("button", { name: "Import", exact: true });
    this.importResult = page.getByText(/^Imported \d+ words/);
    this.importError = page.locator('[data-slot="alert"]');
  }

  async goto(courseId: string) {
    await open(this.page, `/courses/${courseId}`);
    await this.title.waitFor();
  }

  /** "learned / total" for a unit, e.g. "5 / 8". */
  unitProgress(unitTitle: string): Locator {
    return this.page
      .locator("div")
      .filter({ has: this.page.getByText(new RegExp(`^\\d+\\. ${unitTitle}$`)) })
      .last()
      .getByText(/^\d+ \/ \d+$/);
  }

  async importCsv(csv: string) {
    await this.csvTextarea.fill(csv);
    await this.importButton.click();
  }

  async setGrading(mode: "inherit" | "lenient" | "strict") {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes("/courses/"),
    );
    await this.gradingSelect.selectOption(mode);
    await response;
  }
}
