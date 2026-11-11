import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SAMPLE_COURSE, test } from "../support/fixtures.ts";

// Throwaway: under what conditions does axe crash Firefox on the settings screen?
const scan = async (p: Page, label: string) => {
  try {
    const r = await new AxeBuilder({ page: p }).analyze();
    console.log(`PROBE ${label}: ok (${r.violations.length} violations)`);
  } catch (e) {
    console.log(`PROBE ${label}: CRASH ${String(e).split("\n")[0]}`);
  }
};

test("A: full scan, fresh settings page", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("combobox").first().waitFor();
  await scan(page, "A settings");
});

test("B: the spec's sequence with a scan per screen", async ({ api, page }) => {
  await page.goto("/");
  await page.getByRole("heading").first().waitFor();
  await scan(page, "B courses");
  await page.goto(`/courses/${await api.courseIdByTitle(SAMPLE_COURSE)}`);
  await page.waitForLoadState("networkidle");
  await scan(page, "B sample course");
  await page.goto(
    `/courses/${await api.createCourse({ csv: "unit,term,definition\nBasics,a,b\n" })}`,
  );
  await page.waitForLoadState("networkidle");
  await scan(page, "B own course");
  await page.goto("/courses/new");
  await page.waitForLoadState("networkidle");
  await scan(page, "B new course");
  await page.goto("/settings");
  await page.getByRole("combobox").first().waitFor();
  await scan(page, "B settings");
  await scan(page, "B settings again");
});

test("C: the same sequence, scanning only settings", async ({ api, page }) => {
  await page.goto("/");
  await page.goto(`/courses/${await api.courseIdByTitle(SAMPLE_COURSE)}`);
  await page.goto("/courses/new");
  await page.goto("/settings");
  await page.getByRole("combobox").first().waitFor();
  await scan(page, "C settings");
});

test("D: client-side navigation to settings, then scan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Settings" }).click();
  await page.getByRole("combobox").first().waitFor();
  await scan(page, "D settings");
});
