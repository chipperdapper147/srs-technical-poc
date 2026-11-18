import type { ShellVM } from "@app/client";
import { describe, expect, it } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { renderWithDeps } from "@/test/render";
import { AppShellScreen } from "./app-shell-screen";
import { AppShellView } from "./app-shell-view";

const brand: ShellVM["brand"] = { label: "SRS", route: { to: "home" } };

describe("AppShellScreen", () => {
  it("is signed in on the dev auth port: links home, to courses, the catalog, stats and settings around the screen", async () => {
    const { deps } = await renderWithDeps(
      <AppShellScreen>
        <Text>page</Text>
      </AppShellScreen>,
    );
    expect(screen.getByText("page")).toBeOnTheScreen();
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeOnTheScreen();
    const user = userEvent.setup();
    for (const name of ["SRS", "Home", "Courses", "Catalog", "Stats", "Settings"]) {
      await user.press(screen.getByRole("link", { name }));
    }
    expect(deps.routes.map((r) => r.to)).toEqual([
      "home",
      "home",
      "courses",
      "catalog",
      "stats",
      "settings",
    ]);
  });
});

describe("AppShellView", () => {
  it("when signed out, hides the screen and the links and says why", async () => {
    await renderWithDeps(
      <AppShellView
        vm={{
          brand,
          nav: [],
          account: null,
          content: {
            kind: "signIn",
            signIn: {
              title: "Sign in",
              description: "Invite-only.",
              google: { label: "Continue with Google", disabled: false },
              email: { label: "Continue with email and password", disabled: false },
              error: "Your session has ended. Sign in again.",
            },
          },
        }}
      >
        <Text>page</Text>
      </AppShellView>,
    );
    expect(screen.queryByText("page")).not.toBeOnTheScreen();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("header", { name: "Sign in" })).toBeOnTheScreen();
    expect(screen.getByText("Your session has ended. Sign in again.")).toBeOnTheScreen();
  });

  it("shows only that it is loading while the session is restored", async () => {
    await renderWithDeps(
      <AppShellView
        vm={{ brand, nav: [], account: null, content: { kind: "loading", label: "Loading…" } }}
      >
        <Text>page</Text>
      </AppShellView>,
    );
    expect(screen.queryByText("page")).not.toBeOnTheScreen();
    expect(screen.getByText("Loading…")).toBeOnTheScreen();
  });
});
