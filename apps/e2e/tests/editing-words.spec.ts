import { CAPITALS_COURSE, expect, test } from "../support/fixtures.ts";
import { WORDS_CSV } from "../support/words.ts";

test("an owner adds, edits and deletes words, and studying follows", async ({
  api,
  coursePage,
  wordsPage,
  studyPage,
  page,
}) => {
  const courseId = await api.createCourse({ csv: WORDS_CSV });
  await coursePage.goto(courseId);
  await expect(coursePage.wordsLink).toHaveText("Search and edit words");
  await coursePage.wordsLink.click();
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/words$`));
  await wordsPage.heading.waitFor();
  await expect(wordsPage.terms).toHaveText(["la biblioteca", "gracias", "adiós"]);

  await wordsPage.add("Basics", {
    term: "el tren",
    definition: "train",
    alternatives: ["tren"],
    notes: "Masculine",
  });
  await expect(wordsPage.notice).toHaveText("Added “el tren” to Basics.");
  await expect(wordsPage.word("el tren")).toContainText("Also accepted: tren");

  await wordsPage.edit("gracias", { definition: "thanks" });
  await expect(wordsPage.word("gracias")).toContainText("thanks");

  await wordsPage.delete("adiós");
  await expect(wordsPage.notice).toHaveText("Deleted “adiós”.");
  await expect(wordsPage.terms).toHaveText(["la biblioteca", "gracias", "el tren"]);

  await coursePage.goto(courseId);
  await expect(coursePage.learnLink).toHaveText("Learn new words (3)");
  await coursePage.learnLink.click();
  const answers: Record<string, string> = {
    library: "la biblioteca",
    thanks: "gracias",
    train: "tren",
  };
  const { presented, verdicts } = await studyPage.completeSession((prompt) => {
    const answer = answers[prompt];
    if (!answer) throw new Error(`Unexpected prompt "${prompt}"`);
    return answer;
  });
  expect(presented.map((w) => w.definition)).toEqual(["library", "thanks", "train"]);
  expect(verdicts.map((v) => v.verdict)).toEqual(["exact", "exact", "exact"]);
});

test("search narrows the word list as you type", async ({ api, wordsPage }) => {
  await wordsPage.goto(await api.createCourse({ csv: WORDS_CSV }));
  await expect(wordsPage.summary).toHaveText("3 words");
  await wordsPage.search.pressSequentially("ADIO");
  await expect(wordsPage.terms).toHaveText(["adiós"]);
  await expect(wordsPage.summary).toHaveText("1 of 3 words match “ADIO”");
  await wordsPage.search.fill("thank");
  await expect(wordsPage.terms).toHaveText(["gracias"]);
  await wordsPage.search.fill("nothing like it");
  await expect(wordsPage.emptyMessage).toHaveText("No words match “nothing like it”.");
  await wordsPage.search.fill("");
  await expect(wordsPage.words).toHaveCount(3);
});

test("a prebuilt course can be searched but not edited", async ({ api, coursePage, wordsPage }) => {
  const courseId = await api.courseIdByTitle(CAPITALS_COURSE);
  await coursePage.goto(courseId);
  await expect(coursePage.wordsLink).toHaveText("Search words");
  await wordsPage.goto(courseId);
  await expect(wordsPage.readOnlyNotice).toBeVisible();
  await expect(wordsPage.words).toHaveCount(20);
  await expect(wordsPage.editControls).toHaveCount(0);
  await wordsPage.search.fill("brasilia");
  await expect(wordsPage.terms).toHaveText(["Brasília"]);
});
