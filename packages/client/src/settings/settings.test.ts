import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aMe } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createSettingsController, type SettingsState } from "./controller.ts";
import { settingsViewModel } from "./view-model.ts";

const fake = setupFakeApi(() => ({
  me: aMe({ gradingMode: "lenient", accentSensitive: false, newItemsPerSession: 10 }),
}));

async function open() {
  const c = createSettingsController(createTestDeps());
  c.start();
  await waitForState(c.store, (s) => s.me.status === "ready");
  return c;
}
const ready = (s: SettingsState) => {
  const vm = settingsViewModel(s);
  if (vm.kind !== "ready") throw new Error(vm.kind);
  return vm;
};

describe("settings", () => {
  it("shows the saved settings", async () => {
    const vm = ready((await open()).store.get());
    expect(vm).toMatchObject({
      grading: { value: "lenient", label: "Answer grading" },
      accents: { checked: false, label: "Require accents" },
      newItems: { value: "10", min: 1, max: 50 },
      error: null,
    });
  });

  it("saves grading and accents immediately", async () => {
    const c = await open();
    c.actions.setGradingMode("strict");
    await waitForState(c.store, (s) => ready(s).grading.value === "strict");
    c.actions.setAccentSensitive(true);
    await waitForState(c.store, (s) => ready(s).accents.checked);
    expect(fake.current.state.me).toMatchObject({ gradingMode: "strict", accentSensitive: true });
  });

  it("saves new words per session on commit, only when valid and changed", async () => {
    const c = await open();
    const patches = () => fake.current.requests.filter((r) => r.method === "PATCH").length;
    c.actions.setNewItemsDraft("10");
    c.actions.commitNewItems();
    c.actions.setNewItemsDraft("99");
    c.actions.commitNewItems();
    c.actions.setNewItemsDraft("2.5");
    c.actions.commitNewItems();
    expect(ready(c.store.get()).newItems.value).toBe("2.5");
    expect(patches()).toBe(0);
    c.actions.setNewItemsDraft("5");
    c.actions.commitNewItems();
    const s = await waitForState(c.store, (x) => x.newItemsDraft === null);
    expect(ready(s).newItems.value).toBe("5");
    expect(patches()).toBe(1);
  });

  it("shows save errors", async () => {
    const c = await open();
    fake.current.failNext("PATCH", "/me", 500, "Save failed");
    c.actions.setGradingMode("strict");
    const s = await waitForState(c.store, (x) => x.error !== null);
    expect(ready(s)).toMatchObject({ error: "Save failed", grading: { value: "lenient" } });
  });
});
