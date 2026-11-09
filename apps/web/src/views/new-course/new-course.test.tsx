import { setupFakeApi } from "@app/client/testing";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { NewCourseScreen } from "./new-course-screen";

const fake = setupFakeApi();

describe("NewCourseScreen", () => {
  it("creates a course and navigates to it", async () => {
    const user = userEvent.setup();
    const { deps, container } = renderScreen(<NewCourseScreen />);
    await expectNoA11yViolations(container);
    await user.type(screen.getByLabelText("Title"), "My French");
    await user.type(screen.getByLabelText("Learning (language code)"), "fr");
    expect(screen.getByLabelText<HTMLInputElement>("From (language code)").value).toBe("en");
    await user.click(screen.getByRole("button", { name: "Create course" }));
    await waitFor(() => expect(deps.routes).toHaveLength(1));
    expect(deps.routes[0]).toEqual({ to: "course", courseId: fake.current.state.courses[0]?.id });
  });

  it("shows the API's validation error", async () => {
    const user = userEvent.setup();
    renderScreen(<NewCourseScreen />);
    await user.type(screen.getByLabelText("Title"), "Bad");
    await user.type(screen.getByLabelText("Learning (language code)"), "not a code");
    await user.click(screen.getByRole("button", { name: "Create course" }));
    expect((await screen.findByRole("alert")).textContent).toContain("BCP 47");
  });
});
