import { randomUUID } from "node:crypto";
import { makeAllCardsDue } from "../support/db.ts";
import { type Api, expect, SAMPLE_COURSE, test } from "../support/fixtures.ts";
import { anyTermFor, GERMAN_CSV, GERMAN_WORDS, WORDS, WORDS_CSV } from "../support/words.ts";

/** Two courses of this learner's, every word learned (3 Spanish, 2 German). */
async function twoLearnedCourses(api: Api) {
  const tag = randomUUID().slice(0, 8);
  const spanish = `Spanish ${tag}`;
  const german = `German ${tag}`;
  const es = await api.createCourse({ title: spanish, csv: WORDS_CSV });
  const de = await api.createCourse({ title: german, targetLang: "de", csv: GERMAN_CSV });
  await api.learnAll(es);
  await api.learnAll(de);
  return { spanish, german };
}

test("the home page shows reviews due per course, the total and the forecast", async ({
  api,
  learner,
  dashboardPage,
}) => {
  const { spanish, german } = await twoLearnedCourses(api);

  await dashboardPage.goto();
  await expect(dashboardPage.summary).toContainText("0 reviews due");
  await expect(dashboardPage.reviewAllLink).toHaveAttribute("aria-disabled", "true");

  await makeAllCardsDue(learner);
  await dashboardPage.goto();
  await expect(dashboardPage.summary).toContainText("5 reviews due");
  await expect(dashboardPage.summary).toContainText("across 2 courses");
  await expect(dashboardPage.reviewAllLink).toHaveAttribute("aria-disabled", "false");
  await expect(dashboardPage.course(spanish)).toContainText("3 due");
  await expect(dashboardPage.course(german)).toContainText("2 due");
  await expect(dashboardPage.course(SAMPLE_COURSE)).toContainText("Nothing due");

  await expect(dashboardPage.forecastDays).toHaveCount(7);
  await expect(dashboardPage.forecastDays.first()).toContainText("Today");
  await expect(dashboardPage.forecastDays.first()).toContainText("5 reviews");
  await expect(dashboardPage.forecastDays.nth(1)).toContainText("Tomorrow");
});

test("Review all due runs one session across courses", async ({
  api,
  learner,
  dashboardPage,
  studyPage,
}) => {
  await twoLearnedCourses(api);
  await makeAllCardsDue(learner);

  await dashboardPage.goto();
  await dashboardPage.reviewAllLink.click();
  await expect(studyPage.courseBadge).toBeVisible();

  const { presented, verdicts } = await studyPage.completeSession(anyTermFor);
  expect(presented).toEqual([]);
  expect(verdicts.map((v) => v.prompt).sort()).toEqual(
    [...WORDS, ...GERMAN_WORDS].map((w) => w.definition).sort(),
  );
  expect(verdicts.every((v) => v.verdict === "exact")).toBe(true);
  expect(await studyPage.tally()).toEqual({ exact: 5, typo: 0, wrong: 0 });

  await studyPage.backToHomeLink.click();
  await expect(dashboardPage.heading).toBeVisible();
  await expect(dashboardPage.summary).toContainText("0 reviews due");
});

test("Review all due with nothing due shows the empty state", async ({ studyPage }) => {
  await studyPage.gotoReviewAll();
  await expect(studyPage.emptyState).toHaveText("Nothing due right now.");
  await expect(studyPage.backToHomeLink).toHaveAttribute("href", "/");
});
