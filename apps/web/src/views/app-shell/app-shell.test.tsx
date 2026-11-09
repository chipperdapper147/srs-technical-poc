import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("links to courses and settings", () => {
    render(<AppShell>page</AppShell>);
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Courses" }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("main").textContent).toBe("page");
  });
});
