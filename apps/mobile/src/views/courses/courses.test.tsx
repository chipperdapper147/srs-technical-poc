import type { CoursesVM } from "@app/client";
import { aCourse, setupFakeApi } from "@app/client/testing";
import { describe, expect, it } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { renderWithDeps } from "@/test/render";
import { CoursesScreen } from "./courses-screen";
import { CoursesView } from "./courses-view";

const fake = setupFakeApi(() => ({
  courses: [aCourse({ title: "Spanish", itemCount: 4, learnedCount: 1, dueCount: 2 })],
}));
const header: Omit<CoursesVM, "body"> = {
  heading: "Courses",
  newCourse: { label: "New course", route: { to: "newCourse" } },
};

describe("CoursesView", () => {
  it("renders loading, error and empty bodies under the header", async () => {
    const { rerender, deps } = await renderWithDeps(
      <CoursesView vm={{ ...header, body: { kind: "loading" } }} />,
    );
    expect(screen.getByRole("header", { name: "Courses" })).toBeOnTheScreen();
    expect(screen.getByText("Loading…")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("link", { name: "New course" }));
    expect(deps.routes).toEqual([{ to: "newCourse" }]);

    await rerender(
      <CoursesView vm={{ ...header, body: { kind: "error", message: "Database down" } }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Database down/);
    await rerender(
      <CoursesView vm={{ ...header, body: { kind: "empty", message: "No courses yet." } }} />,
    );
    expect(screen.getByText("No courses yet.")).toBeOnTheScreen();
  });
});

describe("CoursesScreen", () => {
  it("lists courses from the API as links, with due badges and progress", async () => {
    const { deps } = await renderWithDeps(<CoursesScreen />);
    const link = await screen.findByRole("link", { name: /Spanish/ });
    expect(link).toHaveTextContent(/2 due/);
    expect(link).toHaveTextContent(/1 \/ 4 words learned/);
    expect(screen.getByRole("progressbar", { name: "Spanish progress" })).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 25,
    });
    await userEvent.setup().press(link);
    const id = fake.current.state.courses[0]?.id;
    expect(deps.routes).toEqual([{ to: "course", courseId: id }]);
  });
});
