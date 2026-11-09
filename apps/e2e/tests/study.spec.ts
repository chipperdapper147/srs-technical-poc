import { makeAllCardsDue } from "../support/db.ts";
import { expect, test } from "../support/fixtures.ts";
import { termFor, typoFor, WORDS, WORDS_CSV } from "../support/words.ts";

test.describe("learn mode", () => {
  test("presents each new word, quizzes it, and records progress", async ({
    api,
    studyPage,
    coursePage,
  }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");

    const { presented, verdicts } = await studyPage.completeSession((prompt) => termFor(prompt));

    expect(presented.map((w) => w.term)).toEqual(WORDS.map((w) => w.term));
    expect(verdicts.map((v) => v.verdict)).toEqual(["exact", "exact", "exact"]);
    expect(await studyPage.tally()).toEqual({ exact: 3, typo: 0, wrong: 0 });

    await coursePage.goto(courseId);
    await expect(coursePage.unitProgress("Basics")).toHaveText("3 / 3");
    await expect(coursePage.learnLink).toHaveAttribute("aria-disabled", "true");
  });

  test("grades typos as 'almost' and re-queues wrong answers", async ({ api, studyPage }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");

    const { verdicts } = await studyPage.completeSession((prompt, attempt) => {
      if (prompt === "library") return typoFor(prompt);
      if (prompt === "thank you" && attempt === 1) return "de nada";
      return termFor(prompt);
    });

    expect(verdicts).toEqual([
      { prompt: "library", verdict: "typo" },
      { prompt: "thank you", verdict: "wrong" },
      { prompt: "goodbye", verdict: "exact" },
      { prompt: "thank you", verdict: "exact" },
    ]);
    expect(await studyPage.tally()).toEqual({ exact: 2, typo: 1, wrong: 1 });
  });

  test("the copy step insists on the shown word", async ({ api, studyPage }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");
    await studyPage.copyInput.fill("something else");
    await studyPage.copyInput.press("Enter");
    await expect(studyPage.copyMiss).toBeVisible();
    await expect(studyPage.term).toHaveText(WORDS[0].term);
  });
});

test.describe("review mode", () => {
  test("reviews words once they fall due", async ({ api, learner, studyPage, coursePage }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");
    await studyPage.completeSession((prompt) => termFor(prompt));

    await coursePage.goto(courseId);
    await expect(coursePage.reviewLink).toHaveText("Review (0 due)");

    await makeAllCardsDue(learner);
    await coursePage.goto(courseId);
    await expect(coursePage.reviewLink).toHaveText("Review (3 due)");
    await coursePage.reviewLink.click();

    const { presented, verdicts } = await studyPage.completeSession((prompt) => termFor(prompt));
    expect(presented).toEqual([]);
    expect(verdicts).toHaveLength(3);

    await coursePage.goto(courseId);
    await expect(coursePage.reviewLink).toHaveText("Review (0 due)");
  });

  test("shows an empty state when nothing is due", async ({ api, studyPage }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "review");
    await expect(studyPage.emptyState).toHaveText("Nothing due right now.");
  });
});
