import { CAPITALS_COURSE, expect, test } from "../support/fixtures.ts";

test("a learner finds the prebuilt capitals course and studies it", async ({
  api,
  coursesPage,
  coursePage,
  studyPage,
}) => {
  await api.updateMe({ newItemsPerSession: 10 });

  await coursesPage.goto();
  await expect(coursesPage.course(CAPITALS_COURSE)).toContainText("0 / 20 words learned");
  await coursesPage.open(CAPITALS_COURSE);
  await expect(coursePage.title).toHaveText(CAPITALS_COURSE);
  await expect(coursePage.readOnlyNotice).toBeVisible();
  await expect(coursePage.learnLink).toHaveText("Learn new words (20)");
  await coursePage.learnLink.click();

  // Other accepted names, and no accent needed by default.
  const answers: Record<string, string> = { "United States": "Washington", Brazil: "Brasilia" };
  const { presented, verdicts } = await studyPage.completeSession(
    (prompt, _attempt, seen) =>
      answers[prompt] ?? seen.find((w) => w.definition === prompt)?.term ?? "",
  );

  expect(presented.slice(0, 3)).toEqual([
    { term: "New Delhi", definition: "India" },
    { term: "Beijing", definition: "China" },
    { term: "Washington, D.C.", definition: "United States" },
  ]);
  expect(presented).toHaveLength(10);
  expect(verdicts).toHaveLength(10);
  expect(verdicts.filter((v) => v.verdict !== "exact")).toEqual([]);

  await coursePage.goto(await api.courseIdByTitle(CAPITALS_COURSE));
  await expect(coursePage.unitProgress("Top 10")).toHaveText("10 / 10");
  await expect(coursePage.unitProgress("Ranks 11–20")).toHaveText("0 / 10");
  await expect(coursePage.learnLink).toHaveText("Learn new words (10)");
});
