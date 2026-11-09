import { aCourse, setupFakeApi } from "@app/client/testing";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { CoursesScreen } from "./courses-screen";
import { CoursesView } from "./courses-view";

const fake = setupFakeApi(() => ({
  courses: [aCourse({ title: "Spanish", itemCount: 4, learnedCount: 1, dueCount: 2 })],
}));
const header = {
  heading: "Courses",
  newCourse: { label: "New course", route: { to: "newCourse" as const } },
};

describe("CoursesView", () => {
  it("renders loading, error and empty bodies under the header", () => {
    const { rerender } = render(<CoursesView vm={{ ...header, body: { kind: "loading" } }} />);
    expect(screen.getByRole("heading", { name: "Courses" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "New course" }).getAttribute("href")).toBe(
      "/courses/new",
    );
    rerender(<CoursesView vm={{ ...header, body: { kind: "error", message: "Database down" } }} />);
    expect(screen.getByText("Database down")).toBeTruthy();
    rerender(
      <CoursesView vm={{ ...header, body: { kind: "empty", message: "No courses yet." } }} />,
    );
    expect(screen.getByText("No courses yet.")).toBeTruthy();
  });
});

describe("CoursesScreen", () => {
  it("lists courses from the API as links, with due badges and progress", async () => {
    const { container } = renderScreen(<CoursesScreen />);
    const link = await screen.findByRole("link", { name: /Spanish/ });
    const id = fake.current.state.courses[0]?.id;
    expect(link.getAttribute("href")).toBe(`/courses/${id}`);
    expect(link.textContent).toContain("2 due");
    expect(link.textContent).toContain("1 / 4 words learned");
    expect(screen.getByRole("progressbar", { name: "Spanish progress" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
