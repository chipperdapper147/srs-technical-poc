import { randomUUID } from "node:crypto";
import { expect, test } from "../support/fixtures.ts";
import { termFor, WORDS_CSV } from "../support/words.ts";

test("reviews show up in the stats: totals, streak, today's cell and the hardest word", async ({
  api,
  shell,
  dashboardPage,
  studyPage,
  statsPage,
}) => {
  const title = `Spanish ${randomUUID().slice(0, 8)}`;
  const courseId = await api.createCourse({ title, csv: WORDS_CSV });

  await dashboardPage.goto();
  await shell.statsLink.click();
  await expect(statsPage.heading).toBeVisible();
  await expect(statsPage.emptyState).toHaveText(
    "No reviews yet. Learn some words and progress shows up here.",
  );

  // Learn the three words, getting "thank you" wrong once: four answers.
  await studyPage.goto(courseId, "learn");
  const { verdicts } = await studyPage.completeSession((prompt, attempt) =>
    prompt === "thank you" && attempt === 1 ? "de nada" : termFor(prompt),
  );
  expect(verdicts.map((v) => v.verdict)).toEqual(["exact", "wrong", "exact", "exact"]);

  await statsPage.goto();
  await expect(statsPage.tile("Words learned")).toContainText("3");
  await expect(statsPage.tile("Reviews done")).toContainText("4");
  await expect(statsPage.tile("Current streak")).toContainText("1 day");
  await expect(statsPage.tile("Current streak")).toContainText("Reviewed today.");
  // Learn-mode answers aren't on learned words yet, so retention has no data.
  await expect(statsPage.tile("Retention")).toContainText("No data");
  await expect(statsPage.heatmapDays).toHaveCount(84);
  await expect(statsPage.heatmapDays.last()).toHaveText(/: 4 reviews$/);

  await expect(statsPage.hardestWords).toHaveCount(1);
  await expect(statsPage.hardestWords.first()).toContainText("gracias");
  await expect(statsPage.hardestWords.first()).toContainText("1 of 2 wrong");
  await expect(statsPage.hardestWords.first()).toContainText(title);
  await expect(statsPage.hardestWords.first()).toHaveAttribute("href", `/courses/${courseId}`);
});

test("the course picker narrows the stats to one course", async ({ api, statsPage }) => {
  const tag = randomUUID().slice(0, 8);
  const reviewed = `Spanish ${tag}`;
  const untouched = `French ${tag}`;
  await api.learnAll(await api.createCourse({ title: reviewed, csv: WORDS_CSV }));
  await api.createCourse({ title: untouched, targetLang: "fr" });

  await statsPage.goto();
  await expect(statsPage.tile("Reviews done")).toContainText("3");

  await statsPage.selectCourse(untouched);
  await expect(statsPage.emptyState).toHaveText("No reviews in this course yet.");

  await statsPage.selectCourse(reviewed);
  await expect(statsPage.tile("Reviews done")).toContainText("3");
  await expect(statsPage.tile("Words learned")).toContainText("3");

  await statsPage.selectCourse("All courses");
  await expect(statsPage.tile("Reviews done")).toContainText("3");
});
