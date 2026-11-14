import { a11yViolations } from "../support/a11y.ts";
import { expect, SAMPLE_COURSE, test } from "../support/fixtures.ts";
import { termFor, typoFor, WORDS_CSV } from "../support/words.ts";

/**
 * Every screen and study state, scanned by axe in the browser at desktop and
 * phone width. Contrast only shows up here: the jsdom scans can't see it.
 */
for (const viewport of [
  { name: "desktop", size: { width: 1280, height: 800 } },
  { name: "phone", size: { width: 390, height: 844 } },
]) {
  test.describe(`accessibility (${viewport.name})`, () => {
    test.use({ viewport: viewport.size });
    // Firefox's content process crashes inside axe.run on the settings screen
    // (a browser crash, not a violation; investigated on PR #10). The suite's
    // functional specs still run on Firefox nightly. TODO.md tracks re-enabling.
    test.skip(({ browserName }) => browserName === "firefox", "axe crashes Firefox (PR #10)");

    test("courses, course, new course and settings", async ({
      api,
      coursesPage,
      coursePage,
      newCoursePage,
      settingsPage,
      page,
    }) => {
      await coursesPage.goto();
      await expect(coursesPage.heading).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await coursePage.goto(await api.courseIdByTitle(SAMPLE_COURSE));
      await expect(coursePage.readOnlyNotice).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await coursePage.goto(await api.createCourse({ csv: WORDS_CSV }));
      await expect(coursePage.importButton).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await newCoursePage.goto();
      await expect(newCoursePage.createButton).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await settingsPage.goto();
      await expect(settingsPage.gradingSelect).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);
    });

    test("study: new word, feedback, summary and nothing due", async ({ api, studyPage, page }) => {
      const courseId = await api.createCourse({ csv: WORDS_CSV });
      await studyPage.goto(courseId, "learn");
      expect(await studyPage.nextStep()).toBe("present");
      expect.soft(await a11yViolations(page)).toEqual([]);

      // Feedback for each verdict: wrong, then a typo, then exact.
      const answers = [() => "no idea", typoFor, termFor];
      while (answers.length > 0) {
        const step = await studyPage.nextStep();
        if (step === "present") {
          await studyPage.copyWord();
          continue;
        }
        expect(step).toBe("quiz");
        const respond = answers.shift() ?? termFor;
        await studyPage.answer(respond((await studyPage.prompt.textContent()) ?? ""));
        expect.soft(await a11yViolations(page)).toEqual([]);
        await studyPage.continue();
      }

      await studyPage.completeSession(termFor);
      await expect(studyPage.summary).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await studyPage.goto(courseId, "review");
      await expect(studyPage.emptyState).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);
    });
  });
}
