import type { AuthActions, ShellVM, SignInVM } from "@app/client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { AppShellScreen } from "./app-shell-screen";
import { AppShellView } from "./app-shell-view";

const actions = (): AuthActions => ({ signIn: vi.fn(), signOut: vi.fn() });
const brand: ShellVM["brand"] = { label: "SRS", route: { to: "home" } };
const signIn: SignInVM = {
  title: "Sign in",
  description: "Invite-only.",
  google: { label: "Continue with Google", disabled: false },
  email: { label: "Continue with email and password", disabled: false },
  error: null,
};
const signedIn: ShellVM = {
  brand,
  nav: [
    { label: "Home", route: { to: "home" } },
    { label: "Courses", route: { to: "courses" } },
    { label: "Catalog", route: { to: "catalog" } },
    { label: "Stats", route: { to: "stats" } },
    { label: "Settings", route: { to: "settings" } },
  ],
  account: { name: "Ada Lovelace", signOut: { label: "Sign out", disabled: false } },
  content: { kind: "screen" },
};

describe("AppShellView", () => {
  it("links to home, courses, the catalog, stats and settings around the page", () => {
    render(
      <AppShellView vm={signedIn} actions={actions()}>
        page
      </AppShellView>,
    );
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "SRS" }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: "Courses" }).getAttribute("href")).toBe("/courses");
    expect(nav.getByRole("link", { name: "Catalog" }).getAttribute("href")).toBe("/catalog");
    expect(nav.getByRole("link", { name: "Stats" }).getAttribute("href")).toBe("/stats");
    expect(nav.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("main").textContent).toBe("page");
  });

  it("shows who is signed in, with Sign out", async () => {
    const a = actions();
    const { container } = render(
      <AppShellView vm={signedIn} actions={a}>
        page
      </AppShellView>,
    );
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(a.signOut).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("shows the sign-in screen instead of the page when signed out", () => {
    render(
      <AppShellView
        vm={{ brand, nav: [], account: null, content: { kind: "signIn", signIn } }}
        actions={actions()}
      >
        page
      </AppShellView>,
    );
    expect(screen.queryByText("page")).toBeNull();
    expect(within(screen.getByRole("navigation")).getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
  });

  it("shows only that it is loading while the session is restored", () => {
    render(
      <AppShellView
        vm={{ brand, nav: [], account: null, content: { kind: "loading", label: "Loading…" } }}
        actions={actions()}
      >
        page
      </AppShellView>,
    );
    expect(screen.getByRole("main").textContent).toBe("Loading…");
  });
});

describe("AppShellScreen", () => {
  it("with the dev auth port: signed in at once, out and in again without Auth0", async () => {
    renderScreen(<AppShellScreen>page</AppShellScreen>);
    expect(screen.getByRole("main").textContent).toBe("page");
    expect(screen.getByText("Local learner")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue with email and password" }));
    expect(await screen.findByText("page")).toBeTruthy();
  });
});
