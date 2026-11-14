import { describe, expect, it } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { renderWithDeps } from "@/test/render";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("links home, to courses and to settings around the screen", async () => {
    const { deps } = await renderWithDeps(
      <AppShell>
        <Text>page</Text>
      </AppShell>,
    );
    expect(screen.getByText("page")).toBeOnTheScreen();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    const user = userEvent.setup();
    for (const name of ["SRS", "Home", "Courses", "Settings"]) {
      await user.press(screen.getByRole("link", { name }));
    }
    expect(deps.routes.map((r) => r.to)).toEqual(["home", "home", "courses", "settings"]);
  });
});
