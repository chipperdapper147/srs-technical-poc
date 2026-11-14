/**
 * An in-memory fake of the Fastify API, served over MSW. Controllers and
 * screens under test use the real API client against it, so URL building,
 * JSON handling and schema parsing are exercised too.
 *
 * It keeps state (a created course shows up in the list, an answered word
 * counts as learned) and grades with the shared grader. It is a fake, not a
 * second implementation: scheduling is a fixed date, and CSV parsing is naive
 * (no quoted fields).
 */
import {
  type CourseDetail,
  CourseDetailSchema,
  CourseSummarySchema,
  CreateCourseSchema,
  type GradingMode,
  gradeAnswer,
  ImportCsvSchema,
  type Me,
  MeSchema,
  ratingForVerdict,
  type StudyItem,
  StudyModeSchema,
  SubmitAnswerSchema,
  UpdateCourseSchema,
  UpdateMeSchema,
} from "@app/shared";
import { type HttpHandler, HttpResponse, http } from "msw";
import { aMe, aUnit, nextId } from "./fixtures.ts";

export const FAKE_API_URL = "http://api.test";
export const NEXT_DUE = "2026-11-14T09:00:00.000Z";

export interface FakeApiSeed {
  me?: Me;
  courses?: CourseDetail[];
  /** Study items per course id. */
  items?: Record<string, StudyItem[]>;
  /** Item ids due for review, per course id. */
  due?: Record<string, string[]>;
  /** Require `Authorization: Bearer <accessKey>` on every request, as the API does with API_ACCESS_KEY. */
  accessKey?: string;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeApi {
  handlers: HttpHandler[];
  state: {
    me: Me;
    courses: CourseDetail[];
    items: Record<string, StudyItem[]>;
    due: Record<string, string[]>;
  };
  requests: RecordedRequest[];
  /** Make the next request matching method and path fail with this status and message. */
  failNext(method: string, path: string, status: number, message: string): void;
}

const error = (status: number, message: string) =>
  HttpResponse.json(
    { statusCode: status, error: status === 404 ? "Not Found" : "Bad Request", message },
    { status },
  );

export function createFakeApi(seed: FakeApiSeed = {}, baseUrl = FAKE_API_URL): FakeApi {
  const state = {
    me: seed.me ?? aMe(),
    courses: structuredClone(seed.courses ?? []),
    items: structuredClone(seed.items ?? {}),
    due: structuredClone(seed.due ?? {}),
  };
  const requests: RecordedRequest[] = [];
  const failures: { method: string; path: string; status: number; message: string }[] = [];

  const url = (path: string) => `${baseUrl}${path}`;
  const findCourse = (id: string) => state.courses.find((c) => c.id === id);
  const setCourse = (course: CourseDetail) => {
    state.courses = state.courses.map((c) => (c.id === course.id ? course : c));
  };
  const grading = (course: CourseDetail) => ({
    mode: (course.gradingMode ?? state.me.gradingMode) as GradingMode,
    accentSensitive: course.accentSensitive ?? state.me.accentSensitive,
  });

  /** Records the request and returns an injected failure, if one matches. */
  async function record(request: Request): Promise<Response | undefined> {
    const { pathname } = new URL(request.url);
    const text = request.method === "GET" ? "" : await request.clone().text();
    requests.push({ method: request.method, path: pathname, body: text ? JSON.parse(text) : null });
    if (seed.accessKey && request.headers.get("authorization") !== `Bearer ${seed.accessKey}`) {
      return HttpResponse.json({ message: "Access key required" }, { status: 401 });
    }
    const i = failures.findIndex((f) => f.method === request.method && f.path === pathname);
    if (i === -1) return undefined;
    const [failure] = failures.splice(i, 1);
    return failure ? error(failure.status, failure.message) : undefined;
  }

  const handlers: HttpHandler[] = [
    http.get(url("/me"), async ({ request }) => {
      return (await record(request)) ?? HttpResponse.json(state.me);
    }),

    http.patch(url("/me"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const body = UpdateMeSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.message);
      state.me = MeSchema.parse({ ...state.me, ...body.data });
      return HttpResponse.json(state.me);
    }),

    http.get(url("/courses"), async ({ request }) => {
      return (
        (await record(request)) ??
        HttpResponse.json(state.courses.map((c) => CourseSummarySchema.parse(c)))
      );
    }),

    http.post(url("/courses"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const body = CreateCourseSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid course");
      const course = CourseDetailSchema.parse({
        ...body.data,
        id: nextId(),
        itemCount: 0,
        learnedCount: 0,
        dueCount: 0,
        editable: true,
        units: [],
      });
      state.courses.push(course);
      return HttpResponse.json(course, { status: 201 });
    }),

    http.get(url("/courses/:id"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      return course ? HttpResponse.json(course) : error(404, "Course not found");
    }),

    http.patch(url("/courses/:id"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      if (!course) return error(404, "Course not found");
      const body = UpdateCourseSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.message);
      const updated = CourseDetailSchema.parse({ ...course, ...body.data });
      setCourse(updated);
      return HttpResponse.json(updated);
    }),

    http.post(url("/courses/:id/import"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      if (!course) return error(404, "Course not found");
      const { csv } = ImportCsvSchema.parse(await request.json());
      const [header = "", ...rows] = csv.trim().split("\n");
      const columns = header.split(",").map((c) => c.trim());
      for (const required of ["unit", "term", "definition"]) {
        if (!columns.includes(required)) {
          return error(400, `CSV is missing the "${required}" column`);
        }
      }
      const col = (row: string[], name: string) => row[columns.indexOf(name)]?.trim() ?? "";
      const units = [...course.units];
      const items = state.items[course.id] ?? [];
      let unitsCreated = 0;
      for (const line of rows.filter((r) => r.trim())) {
        const row = line.split(",");
        const unitTitle = col(row, "unit");
        let unit = units.find((u) => u.title === unitTitle);
        if (!unit) {
          unit = aUnit({ title: unitTitle, position: units.length + 1 });
          units.push(unit);
          unitsCreated += 1;
        }
        unit.itemCount += 1;
        items.push({
          itemId: nextId(),
          unitTitle,
          term: col(row, "term"),
          definition: col(row, "definition"),
          alternatives: col(row, "alternatives").split("|").filter(Boolean),
          notes: col(row, "notes"),
          isNew: true,
        });
      }
      const itemsCreated = rows.filter((r) => r.trim()).length;
      state.items[course.id] = items;
      setCourse({ ...course, units, itemCount: course.itemCount + itemsCreated });
      return HttpResponse.json({ unitsCreated, itemsCreated });
    }),

    http.get(url("/courses/:id/study"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      if (!course) return error(404, "Course not found");
      const mode = StudyModeSchema.parse(new URL(request.url).searchParams.get("mode"));
      const all = state.items[course.id] ?? [];
      const due = new Set(state.due[course.id] ?? []);
      const items =
        mode === "learn"
          ? all.filter((i) => i.isNew).slice(0, state.me.newItemsPerSession)
          : all.filter((i) => due.has(i.itemId));
      return HttpResponse.json({ mode, grading: grading(course), items });
    }),

    http.post(url("/study/answers"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const body = SubmitAnswerSchema.parse(await request.json());
      const course = state.courses.find((c) =>
        (state.items[c.id] ?? []).some((i) => i.itemId === body.itemId),
      );
      const item = course && state.items[course.id]?.find((i) => i.itemId === body.itemId);
      if (!course || !item) return error(404, "Item not found");
      const result = gradeAnswer(body.answer, [item.term, ...item.alternatives], grading(course));
      if (item.isNew) {
        item.isNew = false;
        setCourse({ ...course, learnedCount: course.learnedCount + 1 });
      }
      return HttpResponse.json({
        verdict: result.verdict,
        matched: result.matched,
        term: item.term,
        rating: ratingForVerdict(result.verdict),
        nextDue: NEXT_DUE,
      });
    }),
  ];

  return {
    handlers,
    state,
    requests,
    failNext: (method, path, status, message) =>
      failures.push({ method: method.toUpperCase(), path, status, message }),
  };
}
