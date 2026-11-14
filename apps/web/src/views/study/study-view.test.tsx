import type { StudyActions, StudyStepVM, StudyVM } from "@app/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { StudyView } from "./study-view";

const actions = (): StudyActions => ({ setInput: vi.fn(), submit: vi.fn(), next: vi.fn() });
const session = (step: StudyStepVM): StudyVM => ({
  kind: "session",
  heading: "Study: Spanish",
  courseTitle: "Spanish",
  back: { to: "course", courseId: "c1" },
  progress: 40,
  progressLabel: "Session progress",
  stepIndex: 2,
  lang: "es",
  step,
});
const present: StudyStepVM = {
  kind: "present",
  badge: "New word",
  unitTitle: "Basics",
  term: "la biblioteca",
  definition: "library",
  alsoAccepted: "Also: biblioteca",
  notes: "False friend",
  input: "",
  placeholder: "Type it to continue",
  miss: null,
};
/** The one level-one heading on the screen (axe's `page-has-heading-one`). */
const h1 = () => {
  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  return headings[0]?.textContent;
};
const quiz = (over: Partial<Extract<StudyStepVM, { kind: "quiz" }>> = {}): StudyStepVM => ({
  kind: "quiz",
  unitTitle: "Basics",
  prompt: "library",
  input: "biblioteka",
  placeholder: "Type the answer",
  locked: false,
  canCheck: true,
  checkLabel: "Check",
  continueLabel: "Continue",
  feedback: null,
  error: null,
  ...over,
});

describe("StudyView", () => {
  it("renders loading, errors and the empty state", () => {
    const { rerender } = render(<StudyView vm={{ kind: "loading" }} actions={actions()} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(<StudyView vm={{ kind: "error", message: "Database down" }} actions={actions()} />);
    expect(screen.getByText("Database down")).toBeTruthy();
    rerender(
      <StudyView
        vm={{
          kind: "empty",
          message: "Nothing due right now.",
          backLabel: "Back to course",
          back: { to: "course", courseId: "c1" },
        }}
        actions={actions()}
      />,
    );
    expect(h1()).toBe("Nothing due right now.");
    expect(screen.getByRole("link", { name: "Back to course" }).getAttribute("href")).toBe(
      "/courses/c1",
    );
  });

  it("presents a new word and forwards typing and Enter", async () => {
    const a = actions();
    const { container } = render(<StudyView vm={session(present)} actions={a} />);
    expect(screen.getByTestId("study-session").dataset.step).toBe("2");
    expect(h1()).toBe("Study: Spanish");
    expect(screen.getByTestId("study-term").textContent).toBe("la biblioteca");
    expect(screen.getByText("Also: biblioteca")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Type it to continue" });
    expect(document.activeElement).toBe(input);
    await userEvent.type(input, "x{Enter}");
    expect(a.setInput).toHaveBeenCalledWith("x");
    expect(a.submit).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it("shows the copy hint when the copy missed", () => {
    render(
      <StudyView
        vm={session({ ...present, miss: "Type the word as shown above." })}
        actions={actions()}
      />,
    );
    expect(screen.getByText("Type the word as shown above.")).toBeTruthy();
  });

  it("disables Check when it can't check", () => {
    render(<StudyView vm={session(quiz({ canCheck: false }))} actions={actions()} />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Check" }).disabled).toBe(true);
  });

  it("shows feedback, locks the answer and offers Continue", async () => {
    const a = actions();
    const { container } = render(
      <StudyView
        vm={session(
          quiz({
            locked: true,
            feedback: {
              verdict: "typo",
              title: "Almost: watch the spelling",
              answer: "biblioteca",
              nextReview: "Next review soon",
            },
          }),
        )}
        actions={a}
      />,
    );
    expect(h1()).toBe("Study: Spanish");
    const status = screen.getByRole("status");
    expect(status.dataset.verdict).toBe("typo");
    // Tinted with the verdict token (packages/design/tokens.json), never a palette literal.
    expect(status.className).toContain("border-verdict-typo/40");
    expect(status.className).toContain("bg-verdict-typo/10");
    expect(status.textContent).toContain("Answer: biblioteca");
    expect(screen.getByRole<HTMLInputElement>("textbox").readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(a.submit).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it("shows a grading error", () => {
    render(<StudyView vm={session(quiz({ error: "Grading failed" }))} actions={actions()} />);
    expect(screen.getByText("Grading failed")).toBeTruthy();
  });

  it("summarises the session", async () => {
    const { container } = render(
      <StudyView
        vm={session({
          kind: "summary",
          title: "Session complete",
          tally: [
            { label: "Correct", verdict: "exact", count: 2 },
            { label: "Almost (typo)", verdict: "typo", count: 1 },
            { label: "Wrong", verdict: "wrong", count: 0 },
          ],
          backLabel: "Back to course",
          back: { to: "course", courseId: "c1" },
        })}
        actions={actions()}
      />,
    );
    expect(h1()).toBe("Study: Spanish");
    expect(screen.getByRole("heading", { level: 2, name: "Session complete" })).toBeTruthy();
    expect(screen.getByTestId("tally-exact").textContent).toBe("2");
    expect(screen.getByTestId("tally-typo").textContent).toBe("1");
    await expectNoA11yViolations(container);
  });
});
