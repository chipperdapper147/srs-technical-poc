import { describe, expect, it, jest } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";
import { createStackNavigator } from "./navigator";
import { NotYet } from "./not-yet";
import { NavigatorProvider } from "./providers";

describe("NotYet", () => {
  it("names the missing screen and goes back one route", async () => {
    const navigator = createStackNavigator();
    navigator.navigate({ to: "course", courseId: "c1" });
    navigator.navigate({ to: "stats" });
    await render(
      <NavigatorProvider navigator={navigator}>
        <NotYet route={{ to: "stats" }} />
      </NavigatorProvider>,
    );
    expect(screen.getByText("The “stats” screen is only on the web for now.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "← Back" }));
    expect(navigator.stack.get().map((r) => r.to)).toEqual(["home", "course"]);
  });

  it("fails loudly outside <Providers> instead of rendering a Back that does nothing", async () => {
    const silence = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<NotYet route={{ to: "stats" }} />)).rejects.toThrow(
      "useBack: wrap the app in <Providers>",
    );
    silence.mockRestore();
  });
});
