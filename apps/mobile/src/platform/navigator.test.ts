import { describe, expect, it } from "@jest/globals";
import { createStackNavigator } from "./navigator";

describe("createStackNavigator", () => {
  it("pushes routes, pops on back, and stops at the root", () => {
    const nav = createStackNavigator();
    nav.navigate({ to: "course", courseId: "c1" });
    nav.navigate({ to: "study", courseId: "c1", mode: "learn" });
    expect(nav.stack.get().map((r) => r.to)).toEqual(["courses", "course", "study"]);
    expect(nav.back()).toBe(true);
    expect(nav.back()).toBe(true);
    expect(nav.back()).toBe(false);
    expect(nav.stack.get()).toEqual([{ to: "courses" }]);
  });

  it("goes back to the root instead of stacking it", () => {
    const nav = createStackNavigator();
    nav.navigate({ to: "settings" });
    nav.navigate({ to: "courses" });
    expect(nav.stack.get()).toEqual([{ to: "courses" }]);
  });
});
