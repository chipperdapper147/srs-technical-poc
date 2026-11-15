import { expect, test } from "../support/fixtures.ts";
import { WORDS_CSV } from "../support/words.ts";

const PASTED =
  "el perro - the dog\nthis line has no separator\nel gato - the cat\nla vaca - the cow\n";

/** Anki's "Notes in Plain Text" export, with tags and HTML. */
const ANKI_EXPORT = `#separator:tab
#html:true
#tags column:3
el pan\t<b>bread</b>\tfood
"el ""queso"""\tcheese&nbsp;\tfood
`;

test("paste words, preview them, import into a new unit and study them", async ({
  api,
  coursePage,
  importPage,
  studyPage,
}) => {
  const courseId = await api.createCourse();
  await coursePage.goto(courseId);
  await coursePage.pasteLink.click();
  await expect(importPage.heading).toBeVisible();

  await importPage.paste(PASTED);
  await expect(importPage.detected).toHaveText(
    'Read as a word list, with " - " between term and definition.',
  );
  await expect(importPage.previewSummary).toHaveText("3 words ready to import, 1 line skipped.");
  expect(await importPage.previewWords()).toEqual([
    ["el perro", "the dog"],
    ["el gato", "the cat"],
    ["la vaca", "the cow"],
  ]);
  await expect(importPage.skippedLines).toHaveText([
    'Line 2: no " - " between term and definition (“this line has no separator”)',
  ]);

  // Nothing is imported until the learner confirms.
  await expect(importPage.importButton).toBeDisabled();
  await importPage.intoNewUnit("Animals");
  await importPage.importButton.click();
  await expect(importPage.result).toHaveText("Imported 3 words into Animals.");
  await expect(importPage.textarea).toHaveValue("");

  await importPage.backLink.click();
  await expect(coursePage.unitProgress("Animals")).toHaveText("0 / 3");
  await expect(coursePage.learnLink).toHaveText("Learn new words (3)");

  await studyPage.goto(courseId, "learn");
  expect(await studyPage.nextStep()).toBe("present");
  await expect(studyPage.term).toHaveText("el perro");
  await expect(studyPage.definition).toHaveText("the dog");
});

test("an Anki export from a file joins an existing unit, HTML dropped", async ({
  api,
  coursePage,
  importPage,
}) => {
  const courseId = await api.createCourse({ csv: WORDS_CSV });
  await importPage.goto(courseId);
  await importPage.chooseFile("Spanish food.txt", ANKI_EXPORT);
  await expect(importPage.detected).toHaveText(
    "Read as Anki notes, with a tab between term and definition.",
  );
  expect(await importPage.previewWords()).toEqual([
    ["el pan", "bread"],
    ['el "queso"', "cheese"],
  ]);
  await expect(importPage.newUnitInput).toHaveValue("Spanish food");

  await importPage.intoUnit("Basics");
  await importPage.importButton.click();
  await expect(importPage.result).toHaveText("Imported 2 words into Basics.");

  await coursePage.goto(courseId);
  await expect(coursePage.unitProgress("Basics")).toHaveText("0 / 5");
});

test("a Quizlet export with semicolon rows, swapped", async ({ api, coursePage, importPage }) => {
  const courseId = await api.createCourse();
  await importPage.goto(courseId);
  await importPage.paste("the dog,el perro;the cat,el gato;");
  await expect(importPage.detected).toContainText("Read as a Quizlet export");
  await importPage.swapSwitch.click();
  expect(await importPage.previewWords()).toEqual([
    ["el perro", "the dog"],
    ["el gato", "the cat"],
  ]);
  await importPage.intoNewUnit("Pets");
  await importPage.importButton.click();
  await expect(importPage.result).toHaveText("Imported 2 words into Pets.");
  await coursePage.goto(courseId);
  await expect(coursePage.unitProgress("Pets")).toHaveText("0 / 2");
});
