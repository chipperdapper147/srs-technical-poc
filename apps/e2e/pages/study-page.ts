import { expect, type Locator, type Page } from "@playwright/test";
import { open } from "./navigation.ts";

export type Verdict = "exact" | "typo" | "wrong";

/**
 * `/courses/:id/study?mode=learn|review`.
 * A step is either "present" (new word shown, type it to copy) or "quiz"
 * (prompt shown, type the answer, get feedback, continue).
 */
export class StudyPage {
  readonly term: Locator;
  readonly definition: Locator;
  readonly copyInput: Locator;
  readonly copyMiss: Locator;
  readonly prompt: Locator;
  readonly answerInput: Locator;
  readonly feedback: Locator;
  readonly continueButton: Locator;
  readonly summary: Locator;
  readonly emptyState: Locator;
  private readonly session: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.session = page.getByTestId("study-session");
    this.term = page.getByTestId("study-term");
    this.definition = page.getByTestId("study-definition");
    this.copyInput = page.getByPlaceholder("Type it to continue");
    this.copyMiss = page.getByText("Type the word as shown above.");
    this.prompt = page.getByTestId("study-prompt");
    this.answerInput = page.getByPlaceholder("Type the answer");
    this.feedback = page.getByRole("status");
    this.continueButton = page.getByRole("button", { name: "Continue" });
    this.summary = page.getByTestId("session-summary");
    this.emptyState = page.getByText(/No new words left|Nothing due right now/);
  }

  async goto(courseId: string, mode: "learn" | "review") {
    await open(this.page, `/courses/${courseId}/study?mode=${mode}`);
  }

  private async stepIndex(): Promise<number> {
    return Number(await this.session.getAttribute("data-step"));
  }

  /** Run an action that completes the current step, then wait for the next one. */
  private async advance(action: () => Promise<void>) {
    const before = await this.stepIndex();
    await action();
    await expect(this.session).toHaveAttribute("data-step", String(before + 1));
  }

  /** Waits for the next step and reports which kind it is. */
  async nextStep(): Promise<"present" | "quiz" | "done"> {
    await expect(this.term.or(this.prompt).or(this.summary).first()).toBeVisible();
    if (await this.summary.isVisible()) return "done";
    return (await this.term.isVisible()) ? "present" : "quiz";
  }

  /** Present step: read the new word, then type it to move on. */
  async copyWord(): Promise<{ term: string; definition: string }> {
    const term = (await this.term.textContent()) ?? "";
    const definition = (await this.definition.textContent()) ?? "";
    await this.copyInput.fill(term);
    await this.advance(() => this.copyInput.press("Enter"));
    return { term, definition };
  }

  /** Quiz step: answer, wait for grading, return the verdict (stays on feedback). */
  async answer(text: string): Promise<Verdict> {
    await this.answerInput.fill(text);
    await this.answerInput.press("Enter");
    await expect(this.feedback).toBeVisible();
    return (await this.feedback.getAttribute("data-verdict")) as Verdict;
  }

  async continue() {
    await this.advance(() => this.continueButton.press("Enter"));
  }

  async tally(): Promise<Record<Verdict, number>> {
    const n = async (id: string) => Number(await this.page.getByTestId(id).textContent());
    return {
      exact: await n("tally-exact"),
      typo: await n("tally-typo"),
      wrong: await n("tally-wrong"),
    };
  }

  /**
   * Drive a whole session. `respond` gets each quiz prompt (the definition)
   * and the attempt number for that prompt, and returns the text to type.
   * Returns the words presented (learn mode) and every verdict in order.
   */
  async completeSession(respond: (prompt: string, attempt: number) => string) {
    const presented: { term: string; definition: string }[] = [];
    const verdicts: { prompt: string; verdict: Verdict }[] = [];
    const attempts = new Map<string, number>();
    for (let guard = 0; guard < 200; guard++) {
      const step = await this.nextStep();
      if (step === "done") return { presented, verdicts };
      if (step === "present") {
        presented.push(await this.copyWord());
        continue;
      }
      const prompt = (await this.prompt.textContent()) ?? "";
      const attempt = (attempts.get(prompt) ?? 0) + 1;
      attempts.set(prompt, attempt);
      verdicts.push({ prompt, verdict: await this.answer(respond(prompt, attempt)) });
      await this.continue();
    }
    throw new Error("Study session did not finish within 200 steps");
  }
}
