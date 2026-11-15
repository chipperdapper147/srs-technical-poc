import { a11yViolations } from "../support/a11y.ts";
import { CAPITALS_COURSE, expect, SAMPLE_COURSE, test } from "../support/fixtures.ts";

test("a learner finds a course in the catalog, copies it and studies the copy", async ({
  api,
  shell,
  dashboardPage,
  catalogPage,
  coursePage,
  studyPage,
  page,
}) => {
  const sourceId = await api.catalogCourseId(CAPITALS_COURSE);
  await dashboardPage.goto();
  await shell.catalogLink.click();
  await expect(catalogPage.heading).toBeVisible();
  await expect(catalogPage.course(CAPITALS_COURSE)).toContainText("20 words");
  await expect(catalogPage.course(SAMPLE_COURSE)).toBeVisible();

  // Search matches the description too; the language filter narrows by what is taught.
  await catalogPage.search("population prospects");
  await expect.poll(() => catalogPage.titles()).toEqual([CAPITALS_COURSE]);
  await catalogPage.search("");
  await catalogPage.filterLanguage("Spanish");
  await expect(catalogPage.course(CAPITALS_COURSE)).toHaveCount(0);
  await expect(catalogPage.course(SAMPLE_COURSE)).toBeVisible();
  await catalogPage.search("capitals");
  await expect(catalogPage.emptyState).toBeVisible();
  await catalogPage.filterLanguage("English");
  await expect.poll(() => catalogPage.titles()).toEqual([CAPITALS_COURSE]);

  await catalogPage.copy(CAPITALS_COURSE);
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
  const copyId = page.url().split("/").pop() as string;
  expect(copyId).not.toBe(sourceId);
  await expect(coursePage.title).toHaveText(CAPITALS_COURSE);
  // The learner's own: editable, same words, no progress.
  await expect(coursePage.readOnlyNotice).toHaveCount(0);
  await expect(coursePage.csvTextarea).toBeVisible();
  await expect(coursePage.unitProgress("Top 10")).toHaveText("0 / 10");
  await expect(coursePage.unitProgress("Ranks 11–20")).toHaveText("0 / 10");
  await expect(coursePage.learnLink).toHaveText("Learn new words (20)");

  await coursePage.learnLink.click();
  const { presented, verdicts } = await studyPage.completeSession(
    (prompt, _attempt, seen) => seen.find((w) => w.definition === prompt)?.term ?? "",
  );
  expect(presented[0]).toEqual({ term: "New Delhi", definition: "India" });
  expect(verdicts.length).toBeGreaterThan(0);
  const learned = presented.length;

  await coursePage.goto(copyId);
  await expect(coursePage.learnLink).toHaveText(`Learn new words (${20 - learned})`);
  // Studying the copy leaves the shared course's progress alone.
  await coursePage.goto(sourceId);
  await expect(coursePage.readOnlyNotice).toBeVisible();
  await expect(coursePage.learnLink).toHaveText("Learn new words (20)");
});

test("the course list links to the catalog", async ({ coursesPage, catalogPage, page }) => {
  await coursesPage.goto();
  await coursesPage.catalogLink.click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(catalogPage.heading).toBeVisible();
});

test("the catalog has no accessibility violations", async ({ catalogPage, page, browserName }) => {
  test.skip(browserName === "firefox", "axe crashes Firefox (PR #10)");
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await catalogPage.goto();
    await expect(catalogPage.course(CAPITALS_COURSE)).toBeVisible();
    expect.soft(await a11yViolations(page)).toEqual([]);
  }
});
