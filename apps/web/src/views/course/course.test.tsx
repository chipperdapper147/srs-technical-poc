import { aCourse, aUnit, setupFakeApi } from "@app/client/testing";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { CourseScreen } from "./course-screen";

const mine = aCourse({
  title: "My Spanish",
  itemCount: 2,
  learnedCount: 0,
  units: [aUnit({ title: "Basics", itemCount: 2 })],
});
const shared = aCourse({ title: "Sample", editable: false });
const fake = setupFakeApi(() => ({ courses: [mine, shared] }));

describe("CourseScreen", () => {
  it("shows the course with study links; review is disabled with nothing due", async () => {
    const { container } = renderScreen(<CourseScreen courseId={mine.id} />);
    expect(await screen.findByRole("heading", { level: 1, name: "My Spanish" })).toBeTruthy();
    const learn = screen.getByRole("link", { name: "Learn new words (2)" });
    expect(learn.getAttribute("href")).toBe(`/courses/${mine.id}/study?mode=learn`);
    expect(screen.getByRole("link", { name: "Review (0 due)" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByText("1. Basics")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("saves a grading override from the select", async () => {
    const user = userEvent.setup();
    renderScreen(<CourseScreen courseId={mine.id} />);
    await user.selectOptions(await screen.findByLabelText("Answer grading"), "strict");
    await waitFor(() => expect(fake.current.state.courses[0]?.gradingMode).toBe("strict"));
    expect(screen.getByLabelText<HTMLSelectElement>("Answer grading").value).toBe("strict");
  });

  it("imports pasted CSV and reports the result", async () => {
    const user = userEvent.setup();
    renderScreen(<CourseScreen courseId={mine.id} />);
    const textarea = await screen.findByLabelText<HTMLTextAreaElement>("Or paste");
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Import" });
    expect(button.disabled).toBe(true);
    await user.click(textarea);
    await user.paste("unit,term,definition\nFood,el pan,bread\n");
    await user.click(button);
    expect(await screen.findByText("Imported 1 words (1 new units).")).toBeTruthy();
    expect(textarea.value).toBe("");
    expect(await screen.findByText("2. Food")).toBeTruthy();
  });

  it("shows import errors in an alert", async () => {
    const user = userEvent.setup();
    renderScreen(<CourseScreen courseId={mine.id} />);
    await user.click(await screen.findByLabelText("Or paste"));
    await user.paste("word,meaning\nhola,hello\n");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect((await screen.findByRole("alert")).textContent).toContain('missing the "unit" column');
  });

  it("is read-only for shared courses", async () => {
    renderScreen(<CourseScreen courseId={shared.id} />);
    expect(await screen.findByText(/This is a shared course/)).toBeTruthy();
    expect(screen.queryByLabelText("Or paste")).toBeNull();
  });
});
