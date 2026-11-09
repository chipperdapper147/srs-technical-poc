import { expect, test } from "../support/fixtures.ts";
import { WORDS_CSV } from "../support/words.ts";

test("create a course and import words from CSV", async ({ newCoursePage, coursePage, page }) => {
  await newCoursePage.goto();
  await newCoursePage.create({ title: "My Spanish", targetLang: "es" });

  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
  await expect(coursePage.title).toHaveText("My Spanish");
  await expect(coursePage.learnLink).toHaveText("Learn new words (0)");

  await coursePage.importCsv(WORDS_CSV);
  await expect(coursePage.importResult).toHaveText("Imported 3 words (1 new units).");
  await expect(coursePage.learnLink).toHaveText("Learn new words (3)");
  await expect(coursePage.unitProgress("Basics")).toHaveText("0 / 3");
});

test("an invalid language code is rejected", async ({ newCoursePage, page }) => {
  await newCoursePage.goto();
  await newCoursePage.create({ title: "Bad", targetLang: "spanish" });
  await expect(newCoursePage.error).toBeVisible();
  await expect(page).toHaveURL(/\/courses\/new$/);
});

test("a CSV without the required columns is rejected", async ({ api, coursePage }) => {
  const courseId = await api.createCourse();
  await coursePage.goto(courseId);
  await coursePage.importCsv("word,meaning\nhola,hello\n");
  await expect(coursePage.importError).toContainText('missing the "unit" column');
});
