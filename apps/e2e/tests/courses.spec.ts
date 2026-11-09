import { expect, SAMPLE_COURSE, test } from "../support/fixtures.ts";

test("the seeded sample course is listed and read-only", async ({ coursesPage, coursePage }) => {
  await coursesPage.goto();
  await expect(coursesPage.course(SAMPLE_COURSE)).toContainText("0 / 24 words learned");

  await coursesPage.open(SAMPLE_COURSE);
  await expect(coursePage.title).toHaveText(SAMPLE_COURSE);
  await expect(coursePage.learnLink).toHaveText("Learn new words (24)");
  await expect(coursePage.reviewLink).toHaveAttribute("aria-disabled", "true");
  await expect(coursePage.readOnlyNotice).toBeVisible();
  await expect(coursePage.csvTextarea).toHaveCount(0);
});

test("header navigation reaches settings and back", async ({ coursesPage, shell, page }) => {
  await coursesPage.goto();
  await shell.settingsLink.click();
  await expect(page).toHaveURL(/\/settings$/);
  await shell.coursesLink.click();
  await expect(coursesPage.heading).toBeVisible();
});
