/** The study screen against the fake API: Testing Library + MSW. */
import { aCourse, setupFakeApi, someWords } from "@app/client/testing";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderScreen } from "@/test/render";
import { StudyScreen } from "./study-screen";

const course = aCourse({ title: "Spanish", targetLang: "es" });
const words = someWords();
const fake = setupFakeApi(() => ({ courses: [course], items: { [course.id]: words } }));

describe("StudyScreen", () => {
  it("runs a learn session end to end: copy each word, answer, see the tally", async () => {
    const user = userEvent.setup();
    renderScreen(<StudyScreen courseId={course.id} mode="learn" />);

    for (const w of words) {
      expect((await screen.findByTestId("study-term")).textContent).toBe(w.term);
      await user.type(screen.getByRole("textbox"), `${w.term}{Enter}`);
    }
    const answers: Record<string, string> = {
      hello: "hola",
      library: "la biblioteka",
      song: "nope",
    };
    for (let i = 0; i < 3; i++) {
      const prompt = (await screen.findByTestId("study-prompt")).textContent ?? "";
      await user.type(screen.getByRole("textbox"), `${answers[prompt]}{Enter}`);
      await screen.findByRole("status");
      await user.click(screen.getByRole("button", { name: "Continue" }));
    }
    // "song" was wrong, so it comes back (up to two retries); get it right now.
    await user.type(await screen.findByRole("textbox"), "la canción{Enter}");
    expect((await screen.findByRole("status")).dataset.verdict).toBe("exact");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByTestId("session-summary");
    expect(screen.getByTestId("tally-exact").textContent).toBe("2");
    expect(screen.getByTestId("tally-typo").textContent).toBe("1");
    expect(screen.getByTestId("tally-wrong").textContent).toBe("1");
    expect(fake.current.state.courses[0]?.learnedCount).toBe(3);
  });

  it("shows the empty state when there is nothing to review", async () => {
    renderScreen(<StudyScreen courseId={course.id} mode="review" />);
    expect(await screen.findByText("Nothing due right now.")).toBeTruthy();
  });

  it("shows API errors", async () => {
    fake.current.failNext("GET", `/courses/${course.id}`, 404, "Course not found");
    renderScreen(<StudyScreen courseId={course.id} mode="learn" />);
    await waitFor(() => expect(screen.getByText("Course not found")).toBeTruthy());
  });
});
