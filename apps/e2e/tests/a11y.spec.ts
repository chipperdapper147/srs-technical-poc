import { a11yViolations } from "../support/a11y.ts";
import { makeAllCardsDue } from "../support/db.ts";
import { expect, SAMPLE_COURSE, test } from "../support/fixtures.ts";
import { termFor, typoFor, WORDS, WORDS_CSV } from "../support/words.ts";

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

    test("home, courses, course, import, words, new course, settings and stats", async ({
      api,
      dashboardPage,
      coursesPage,
      coursePage,
      importPage,
      newCoursePage,
      settingsPage,
      statsPage,
      wordsPage,
      page,
    }) => {
      await dashboardPage.goto();
      await expect(dashboardPage.forecastDays.first()).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await coursesPage.goto();
      await expect(coursesPage.heading).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await coursePage.goto(await api.courseIdByTitle(SAMPLE_COURSE));
      await expect(coursePage.readOnlyNotice).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      const courseId = await api.createCourse({ csv: WORDS_CSV });
      await coursePage.goto(courseId);
      await expect(coursePage.importButton).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await importPage.goto(courseId);
      await importPage.paste("hola - hello\nno separator\n");
      await expect(importPage.skippedLines).toHaveCount(1);
      expect.soft(await a11yViolations(page)).toEqual([]);

      await wordsPage.goto(courseId);
      await wordsPage.startEdit(WORDS[0].term);
      expect.soft(await a11yViolations(page)).toEqual([]);
      await wordsPage.askDelete(WORDS[1].term);
      expect.soft(await a11yViolations(page)).toEqual([]);

      await newCoursePage.goto();
      await expect(newCoursePage.createButton).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await settingsPage.goto();
      await expect(settingsPage.gradingSelect).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await statsPage.goto();
      await expect(statsPage.emptyState).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);

      await api.learnAll(await api.createCourse({ csv: WORDS_CSV }));
      await statsPage.goto();
      await expect(statsPage.heatmapDays.last()).toHaveText(/: 3 reviews$/);
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

    test("home with reviews due, and a review of all courses", async ({
      api,
      learner,
      dashboardPage,
      studyPage,
      page,
    }) => {
      await api.learnAll(await api.createCourse({ csv: WORDS_CSV }));
      await makeAllCardsDue(learner);
      await dashboardPage.goto();
      await expect(dashboardPage.reviewAllLink).toHaveAttribute("aria-disabled", "false");
      expect.soft(await a11yViolations(page)).toEqual([]);

      await studyPage.gotoReviewAll();
      await expect(studyPage.courseBadge).toBeVisible();
      expect.soft(await a11yViolations(page)).toEqual([]);
    });
  });
}
