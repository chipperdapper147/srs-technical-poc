import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderScreen } from "@/test/render";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("links to home, courses, the catalog and settings", () => {
    renderScreen(<AppShell>page</AppShell>);
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "SRS" }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: "Courses" }).getAttribute("href")).toBe("/courses");
    expect(nav.getByRole("link", { name: "Catalog" }).getAttribute("href")).toBe("/catalog");
    expect(nav.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("main").textContent).toBe("page");
  });
});
