import type { Locator, Page } from "@playwright/test";
import { open } from "./navigation.ts";

export interface WordFields {
  term?: string;
  definition?: string;
  /** One per line in the form. */
  alternatives?: string[];
  notes?: string;
}

/** `/courses/:id/words`: search a course's words; add, edit and delete them on your own course. */
export class WordsPage {
  readonly heading: Locator;
  readonly search: Locator;
  readonly summary: Locator;
  readonly notice: Locator;
  readonly readOnlyNotice: Locator;
  readonly emptyMessage: Locator;
  /** One list item per word shown. */
  readonly words: Locator;
  /** The terms shown, in order (assert with `toHaveText([...])`). */
  readonly terms: Locator;
  /** Every edit, delete and add button: none on a read-only course. */
  readonly editControls: Locator;
  readonly confirmDeleteButton: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "Words" });
    this.search = page.getByLabel("Search words");
    this.summary = page.getByText(/^\d+ (of \d+ )?words?( match .*)?$/);
    this.notice = page.getByRole("status");
    this.readOnlyNotice = page.getByText("This is a shared course");
    this.emptyMessage = page.getByText(/^No words match/);
    this.words = page.getByRole("listitem");
    // Term text has no role of its own to find it by.
    this.terms = page.getByTestId("word-term");
    this.editControls = page.getByRole("button", { name: /^(Edit|Delete|Add word to) / });
    this.confirmDeleteButton = page.getByRole("button", { name: "Delete word" });
  }

  async goto(courseId: string) {
    await open(this.page, `/courses/${courseId}/words`);
    await this.heading.waitFor();
  }

  /** The list item showing this term. */
  word(term: string): Locator {
    return this.words.filter({ has: this.page.getByText(term, { exact: true }) });
  }

  private async fill(form: Locator, fields: WordFields) {
    if (fields.term !== undefined) await form.getByLabel("Term").fill(fields.term);
    if (fields.definition !== undefined) {
      await form.getByLabel("Definition").fill(fields.definition);
    }
    if (fields.alternatives !== undefined) {
      await form.getByLabel("Other accepted answers").fill(fields.alternatives.join("\n"));
    }
    if (fields.notes !== undefined) await form.getByLabel("Notes").fill(fields.notes);
  }

  async add(unitTitle: string, fields: WordFields) {
    await this.page.getByRole("button", { name: `Add word to ${unitTitle}` }).click();
    const form = this.page.getByRole("form", { name: `Add a word to ${unitTitle}` });
    await this.fill(form, fields);
    await form.getByRole("button", { name: "Add word" }).click();
    await this.notice.filter({ hasText: "Added" }).waitFor();
  }

  /** Opens a word's edit form and returns it. */
  async startEdit(term: string): Promise<Locator> {
    await this.page.getByRole("button", { name: `Edit ${term}`, exact: true }).click();
    const form = this.page.getByRole("form", { name: `Edit “${term}”` });
    await form.waitFor();
    return form;
  }

  async edit(term: string, fields: WordFields) {
    const form = await this.startEdit(term);
    await this.fill(form, fields);
    await form.getByRole("button", { name: "Save" }).click();
    await this.notice.filter({ hasText: "Saved" }).waitFor();
  }

  /** Asks to delete a word; its confirmation is then showing. */
  async askDelete(term: string) {
    await this.page.getByRole("button", { name: `Delete ${term}`, exact: true }).click();
    await this.confirmDeleteButton.waitFor();
  }

  async delete(term: string) {
    await this.askDelete(term);
    await this.confirmDeleteButton.click();
    await this.notice.filter({ hasText: "Deleted" }).waitFor();
  }
}
