import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

/** `/courses/:id/import`: paste words or pick a Quizlet or Anki export, preview, import. */
export class ImportPage {
  readonly heading: Locator;
  readonly backLink: Locator;
  readonly fileInput: Locator;
  readonly textarea: Locator;
  readonly formatSelect: Locator;
  /** How the text was read, e.g. 'Read as a word list, with " - " between …'. */
  readonly detected: Locator;
  readonly swapSwitch: Locator;
  readonly unitSelect: Locator;
  readonly newUnitInput: Locator;
  readonly importButton: Locator;
  readonly previewSummary: Locator;
  /** The preview table's body rows. */
  readonly previewRows: Locator;
  /** One item per skipped line: "Line 2: … (“junk”)". */
  readonly skippedLines: Locator;
  readonly result: Locator;
  readonly error: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "Import words" });
    this.backLink = page.getByRole("link", { name: /^← / });
    this.fileInput = page.getByLabel("File (.txt or .csv)");
    this.textarea = page.getByLabel("Or paste");
    this.formatSelect = page.getByLabel("Format");
    this.detected = page.getByText(/^Read as /);
    this.swapSwitch = page.getByRole("switch", { name: "Swap term and definition" });
    this.unitSelect = page.getByLabel("Add to unit");
    this.newUnitInput = page.getByLabel("New unit name");
    this.importButton = page.getByRole("button", { name: /^Import/ });
    this.previewSummary = page.getByText(/ready to import/);
    this.previewRows = page.getByRole("table").getByRole("rowgroup").nth(1).getByRole("row");
    this.skippedLines = page.getByRole("listitem").filter({ hasText: /^(Line|Row) \d+: / });
    this.result = page.getByRole("status").filter({ hasText: /^Imported / });
    this.error = page.locator('[data-slot="alert"]');
  }

  async goto(courseId: string) {
    await open(this.page, `/courses/${courseId}/import`);
    await this.heading.waitFor();
  }

  async paste(text: string) {
    await this.textarea.fill(text);
  }

  /** Pick a file, as the learner would from disk. */
  async chooseFile(name: string, content: string) {
    await this.fileInput.setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(content, "utf8"),
    });
  }

  async intoNewUnit(title: string) {
    await this.unitSelect.selectOption({ label: "New unit" });
    await this.newUnitInput.fill(title);
  }

  async intoUnit(title: string) {
    await this.unitSelect.selectOption({ label: title });
  }

  /** The previewed words, as [term, definition] pairs. */
  async previewWords(): Promise<[string, string][]> {
    const rows = await this.previewRows.all();
    return Promise.all(
      rows.map(async (row) => {
        const cells = await row.getByRole("cell").allTextContents();
        return [cells[1] ?? "", cells[2] ?? ""] as [string, string];
      }),
    );
  }
}
