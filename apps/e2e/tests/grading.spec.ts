import { expect, test } from "../support/fixtures.ts";
import { WORDS_CSV } from "../support/words.ts";

/** Learn the first word of a fresh course and return the verdict for `answer`. */
async function firstQuizVerdict(
  studyPage: import("../pages/study-page.ts").StudyPage,
  courseId: string,
  answer: string,
) {
  await studyPage.goto(courseId, "learn");
  while ((await studyPage.nextStep()) === "present") await studyPage.copyWord();
  return studyPage.answer(answer);
}

test("accents are ignored by default", async ({ api, studyPage }) => {
  const courseId = await api.createCourse({ csv: "unit,term,definition\nBasics,adiós,goodbye\n" });
  expect(await firstQuizVerdict(studyPage, courseId, "adios")).toBe("exact");
});

test("strict grading in settings turns a typo into a wrong answer", async ({
  api,
  settingsPage,
  studyPage,
}) => {
  await settingsPage.goto();
  await settingsPage.setGrading("strict");
  const courseId = await api.createCourse({ csv: WORDS_CSV });
  expect(await firstQuizVerdict(studyPage, courseId, "la biblioteka")).toBe("wrong");
});

test("a course can override the learner's grading", async ({ api, coursePage, studyPage }) => {
  const courseId = await api.createCourse({ csv: WORDS_CSV });
  await coursePage.goto(courseId);
  await coursePage.setGrading("strict");
  expect(await firstQuizVerdict(studyPage, courseId, "la biblioteka")).toBe("wrong");

  await api.updateMe({ gradingMode: "lenient" });
  await coursePage.goto(courseId);
  await coursePage.setGrading("inherit");
  const second = await api.createCourse({ csv: WORDS_CSV });
  expect(await firstQuizVerdict(studyPage, second, "la biblioteka")).toBe("typo");
});
