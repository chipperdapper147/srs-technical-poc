import { makeAllCardsDue } from "../support/db.ts";
import { expect, test } from "../support/fixtures.ts";
import {
  anyTermFor,
  GERMAN_CSV,
  GERMAN_WORDS,
  termFor,
  WORDS,
  WORDS_CSV,
} from "../support/words.ts";

test.describe("study aids", () => {
  test("a hint reveals the word letter by letter and caps the rating", async ({
    api,
    studyPage,
  }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");
    for (const _ of WORDS) await studyPage.copyWord();

    await expect(studyPage.prompt).toHaveText("library");
    await studyPage.takeHints(1);
    await expect(studyPage.hint).toContainText("l…");
    await studyPage.takeHints(2);
    await expect(studyPage.hint).toContainText("la b…");
    await expect(studyPage.hint).toContainText("With a hint, a correct answer counts as hard.");

    expect(await studyPage.answer("la biblioteca")).toBe("exact");
    await expect(studyPage.feedback).toContainText("Rated hard because you used a hint.");
    await expect(studyPage.overrideButton).toBeHidden();
    await studyPage.continue();
    // The next word starts without hints.
    await expect(studyPage.hint).toBeHidden();
  });

  test('"I was right" counts a wrong answer as correct and keeps it out of the retry queue', async ({
    api,
    studyPage,
  }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");
    for (const _ of WORDS) await studyPage.copyWord();

    expect(await studyPage.answer("la bibliotheque")).toBe("wrong");
    await studyPage.overrideVerdict();
    await expect(studyPage.feedback).toContainText("Counted as correct");
    await studyPage.continue();

    const { verdicts } = await studyPage.completeSession((prompt) => termFor(prompt));
    // "library" is not asked again: the override made it correct.
    expect(verdicts.map((v) => v.prompt)).toEqual(["thank you", "goodbye"]);
    expect(await studyPage.tally()).toEqual({ exact: 3, typo: 0, wrong: 0 });
  });

  test("undo takes back the last answer, even after moving on", async ({
    api,
    studyPage,
    coursePage,
  }) => {
    const courseId = await api.createCourse({ csv: WORDS_CSV });
    await studyPage.goto(courseId, "learn");
    for (const _ of WORDS) await studyPage.copyWord();

    expect(await studyPage.answer("la biblioteca")).toBe("exact");
    await studyPage.continue();
    await expect(studyPage.prompt).toHaveText("thank you");
    await studyPage.undoLastAnswer();
    await expect(studyPage.prompt).toHaveText("library");

    // The server undid it too: the word is new again.
    await coursePage.goto(courseId);
    await expect(coursePage.unitProgress("Basics")).toHaveText("0 / 3");
  });

  test("works in a review of all courses", async ({ api, learner, studyPage }) => {
    const spanish = await api.createCourse({ csv: WORDS_CSV });
    const german = await api.createCourse({ csv: GERMAN_CSV, targetLang: "de" });
    await api.learnAll(spanish);
    await api.learnAll(german);
    await makeAllCardsDue(learner);
    await studyPage.gotoReviewAll();

    const prompt = (await studyPage.prompt.textContent()) ?? "";
    expect(await studyPage.answer("nein")).toBe("wrong");
    await studyPage.undoLastAnswer();
    await expect(studyPage.prompt).toHaveText(prompt);
    expect(await studyPage.answer("nein")).toBe("wrong");
    await studyPage.overrideVerdict();
    await studyPage.continue();

    const due = WORDS.length + GERMAN_WORDS.length;
    const { verdicts } = await studyPage.completeSession((p) => anyTermFor(p));
    expect(verdicts).toHaveLength(due - 1);
    // The undone answer left no trace; the overridden one counts as correct.
    expect(await studyPage.tally()).toEqual({ exact: due, typo: 0, wrong: 0 });
  });
});
