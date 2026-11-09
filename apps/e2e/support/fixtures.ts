/**
 * Test fixtures. Every test runs as its own fresh learner (dev auth stub
 * `x-dev-user` header), so tests are isolated and safe to run in parallel
 * against one database. Page objects and an API client come pre-built.
 */
import { randomUUID } from "node:crypto";
import { type APIRequestContext, test as base, expect } from "@playwright/test";
import { AppShell } from "../pages/app-shell.ts";
import { CoursePage } from "../pages/course-page.ts";
import { CoursesPage } from "../pages/courses-page.ts";
import { NewCoursePage } from "../pages/new-course-page.ts";
import { SettingsPage } from "../pages/settings-page.ts";
import { StudyPage } from "../pages/study-page.ts";
import { closeDb } from "./db.ts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const SAMPLE_COURSE = "Spanish basics (sample)";

/** Thin API client for arranging test state faster than through the UI. */
export class Api {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  private async json<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
    expect(res.ok(), `${res.url()} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return res.json() as Promise<T>;
  }

  async courseIdByTitle(title: string): Promise<string> {
    const courses = await this.json<{ id: string; title: string }[]>(
      await this.request.get("/courses"),
    );
    const course = courses.find((c) => c.title === title);
    if (!course) throw new Error(`Course "${title}" not found. Did you run pnpm db:seed?`);
    return course.id;
  }

  /** Create a course owned by the current learner, optionally with words. */
  async createCourse(opts: { title?: string; targetLang?: string; csv?: string } = {}) {
    const course = await this.json<{ id: string }>(
      await this.request.post("/courses", {
        data: {
          title: opts.title ?? `E2E ${randomUUID().slice(0, 8)}`,
          sourceLang: "en",
          targetLang: opts.targetLang ?? "es",
        },
      }),
    );
    if (opts.csv) {
      await this.json(
        await this.request.post(`/courses/${course.id}/import`, { data: { csv: opts.csv } }),
      );
    }
    return course.id;
  }

  async updateMe(body: Record<string, unknown>) {
    return this.json(await this.request.patch("/me", { data: body }));
  }
}

interface Fixtures {
  /** auth_sub of this test's learner. */
  learner: string;
  api: Api;
  shell: AppShell;
  coursesPage: CoursesPage;
  coursePage: CoursePage;
  newCoursePage: NewCoursePage;
  studyPage: StudyPage;
  settingsPage: SettingsPage;
}

export const test = base.extend<Fixtures, { dbCleanup: void }>({
  learner: async ({}, use) => use(`e2e|${randomUUID()}`),
  extraHTTPHeaders: async ({ learner }, use) => use({ "x-dev-user": learner }),
  api: async ({ playwright, extraHTTPHeaders }, use) => {
    const request = await playwright.request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: extraHTTPHeaders ?? {},
    });
    await use(new Api(request));
    await request.dispose();
  },
  shell: async ({ page }, use) => use(new AppShell(page)),
  coursesPage: async ({ page }, use) => use(new CoursesPage(page)),
  coursePage: async ({ page }, use) => use(new CoursePage(page)),
  newCoursePage: async ({ page }, use) => use(new NewCoursePage(page)),
  studyPage: async ({ page }, use) => use(new StudyPage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
  dbCleanup: [
    async ({}, use) => {
      await use();
      await closeDb();
    },
    { scope: "worker", auto: true },
  ],
});

export { expect };
