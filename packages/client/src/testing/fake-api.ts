/**
 * An in-memory fake of the Fastify API, served over MSW. Controllers and
 * screens under test use the real API client against it, so URL building,
 * JSON handling and schema parsing are exercised too.
 *
 * It keeps state (a created course shows up in the list, an answered word
 * counts as learned) and grades with the shared grader. It is a fake, not a
 * second implementation: scheduling is a fixed date, and CSV parsing is naive
 * (no quoted fields). Items are stored as study items; their unit is the
 * course's unit with the same title and their position their order in it.
 * Only `editable` courses accept edits, as only owned ones do. The dashboard's forecast is whatever the seed says
 * (zeros from FORECAST_START by default), and its due counts are the courses'.
 * The catalog is the seeded courses that aren't editable (the shared ones).
 * Stats are whatever the seed says too: `stats` for every course, and
 * `courseStats` per course id (no reviews when a course has none seeded).
 */
import {
  type AnswerResult,
  AnswerResultSchema,
  CATALOG_LIMIT,
  CatalogQuerySchema,
  CatalogSchema,
  type CourseDetail,
  CourseDetailSchema,
  type CourseItem,
  CourseSummarySchema,
  CreateCourseSchema,
  CreateItemSchema,
  DashboardQuerySchema,
  DashboardSchema,
  FORECAST_DAYS,
  type ForecastDay,
  type GradingMode,
  gradeAnswer,
  ImportCsvSchema,
  ImportRowsSchema,
  itemMatchesSearch,
  type Me,
  MeSchema,
  maxHints,
  ReviewSessionSchema,
  ratingForAnswer,
  type Stats,
  StatsQuerySchema,
  StatsSchema,
  type StudyItem,
  StudyModeSchema,
  SubmitAnswerSchema,
  UndoResultSchema,
  UpdateCourseSchema,
  UpdateItemSchema,
  UpdateMeSchema,
} from "@app/shared";
import { type HttpHandler, HttpResponse, http } from "msw";
import { aMe, aStats, aUnit, nextId } from "./fixtures.ts";

export const FAKE_API_URL = "http://api.test";
export const NEXT_DUE = "2026-11-14T09:00:00.000Z";
/** First day of the default forecast. */
export const FORECAST_START = "2026-11-14";

/** FORECAST_DAYS days from FORECAST_START with these counts (missing ones are 0). */
export function aForecast(counts: number[] = []): ForecastDay[] {
  return Array.from({ length: FORECAST_DAYS }, (_, i) => {
    const d = new Date(`${FORECAST_START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), dueCount: counts[i] ?? 0 };
  });
}

export interface FakeApiSeed {
  me?: Me;
  courses?: CourseDetail[];
  /** Study items per course id. */
  items?: Record<string, StudyItem[]>;
  /** Item ids due for review, per course id. */
  due?: Record<string, string[]>;
  /** The dashboard's forecast. */
  forecast?: ForecastDay[];
  /** Stats for every course; no reviews by default. */
  stats?: Stats;
  /** Stats per course id; a course without an entry has no reviews. */
  courseStats?: Record<string, Stats>;
  /**
   * Require `Authorization: Bearer <token>` with one of these tokens on every
   * request, as the API does in `jwt` mode; 401 otherwise. Unset: dev mode.
   */
  tokens?: string[];
}

export interface RecordedRequest {
  method: string;
  path: string;
  /** The query string, with its "?", or "". */
  search: string;
  body: unknown;
  /** The `Authorization` header sent, or null. */
  authorization: string | null;
}

export interface FakeApi {
  handlers: HttpHandler[];
  state: {
    me: Me;
    courses: CourseDetail[];
    items: Record<string, StudyItem[]>;
    due: Record<string, string[]>;
    forecast: ForecastDay[];
    stats: Stats;
    courseStats: Record<string, Stats>;
  };
  requests: RecordedRequest[];
  /** Make the next request matching method and path fail with this status and message. */
  failNext(method: string, path: string, status: number, message: string): void;
}

const error = (status: number, message: string) =>
  HttpResponse.json(
    {
      statusCode: status,
      error: status === 404 ? "Not Found" : status === 403 ? "Forbidden" : "Bad Request",
      message,
    },
    { status },
  );

export function createFakeApi(seed: FakeApiSeed = {}, baseUrl = FAKE_API_URL): FakeApi {
  const state = {
    me: seed.me ?? aMe(),
    courses: structuredClone(seed.courses ?? []),
    items: structuredClone(seed.items ?? {}),
    due: structuredClone(seed.due ?? {}),
    forecast: structuredClone(seed.forecast ?? aForecast()),
    stats: structuredClone(seed.stats ?? aStats()),
    courseStats: structuredClone(seed.courseStats ?? {}),
  };
  const requests: RecordedRequest[] = [];
  const failures: { method: string; path: string; status: number; message: string }[] = [];
  /** Every review id handed out, and the latest answer: the only one override and undo accept. */
  const reviewIds = new Set<string>();
  let latest: {
    reviewId: string;
    courseId: string;
    item: StudyItem;
    wasNew: boolean;
    result: AnswerResult;
    hints: number;
  } | null = null;
  /** 404 for an id never handed out, 409 for one that is no longer the latest answer. */
  const notLatest = (reviewId: string) =>
    reviewIds.has(reviewId)
      ? error(409, "Only your latest answer can be changed.")
      : error(404, "Answer not found");

  const url = (path: string) => `${baseUrl}${path}`;
  const findCourse = (id: string) => state.courses.find((c) => c.id === id);
  const setCourse = (course: CourseDetail) => {
    state.courses = state.courses.map((c) => (c.id === course.id ? course : c));
  };
  /** The fake's items as the API lists them, in course order. */
  const courseItems = (course: CourseDetail): CourseItem[] =>
    [...course.units]
      .sort((a, b) => a.position - b.position)
      .flatMap((unit) =>
        (state.items[course.id] ?? [])
          .filter((i) => i.unitTitle === unit.title)
          .map((i, index) => ({
            id: i.itemId,
            unitId: unit.id,
            position: index + 1,
            term: i.term,
            definition: i.definition,
            alternatives: i.alternatives,
            notes: i.notes,
          })),
      );
  /** An item in an editable course, with that course. */
  const findOwnedItem = (itemId: string) => {
    for (const course of state.courses) {
      const item = state.items[course.id]?.find((i) => i.itemId === itemId);
      if (item && course.editable) return { course, item };
    }
    return undefined;
  };
  /** Adjust a course's and a unit's counts by `by` items. */
  const count = (course: CourseDetail, unitTitle: string, by: number, learned: number) =>
    setCourse({
      ...course,
      itemCount: course.itemCount + by,
      learnedCount: course.learnedCount + learned,
      units: course.units.map((u) =>
        u.title === unitTitle
          ? { ...u, itemCount: u.itemCount + by, learnedCount: u.learnedCount + learned }
          : u,
      ),
    });
  const asCourseItem = (itemId: string) =>
    state.courses.flatMap(courseItems).find((i) => i.id === itemId);
  const grading = (course: CourseDetail) => ({
    mode: (course.gradingMode ?? state.me.gradingMode) as GradingMode,
    accentSensitive: course.accentSensitive ?? state.me.accentSensitive,
  });

  /** Records the request and returns an injected failure, if one matches. */
  async function record(request: Request): Promise<Response | undefined> {
    const { pathname, search } = new URL(request.url);
    const text = request.method === "GET" ? "" : await request.clone().text();
    requests.push({
      method: request.method,
      path: pathname,
      search,
      body: text ? JSON.parse(text) : null,
      authorization: request.headers.get("authorization"),
    });
    if (seed.tokens) {
      const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token || !seed.tokens.includes(token)) {
        return HttpResponse.json(
          { message: token ? "Invalid access token. Sign in again." : "Sign in required." },
          { status: 401 },
        );
      }
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

    http.get(url("/catalog"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const query = CatalogQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (!query.success) return error(400, query.error.issues[0]?.message ?? "Invalid query");
      const { q, targetLang } = query.data;
      const shared = state.courses.filter((c) => !c.editable);
      const courses = shared
        .filter(
          (c) =>
            !q ||
            c.title.toLowerCase().includes(q.toLowerCase()) ||
            c.description.toLowerCase().includes(q.toLowerCase()),
        )
        .filter((c) => !targetLang || c.targetLang.toLowerCase() === targetLang.toLowerCase())
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, CATALOG_LIMIT)
        .map(({ id, title, description, sourceLang, targetLang, itemCount }) => ({
          id,
          title,
          description,
          sourceLang,
          targetLang,
          itemCount,
        }));
      const targetLangs = [...new Set(shared.map((c) => c.targetLang))].sort();
      return HttpResponse.json(CatalogSchema.parse({ courses, targetLangs }));
    }),

    http.post(url("/courses/:id/copy"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const source = findCourse(String(params.id));
      if (!source) return error(404, "Course not found");
      if (source.editable) return error(403, "Only shared courses can be copied");
      const copy = CourseDetailSchema.parse({
        ...structuredClone(source),
        id: nextId(),
        editable: true,
        learnedCount: 0,
        dueCount: 0,
        units: source.units.map((u) => ({ ...u, id: nextId(), learnedCount: 0 })),
      });
      state.courses.push(copy);
      state.items[copy.id] = (state.items[source.id] ?? []).map((i) => ({
        ...structuredClone(i),
        itemId: nextId(),
        isNew: true,
      }));
      return HttpResponse.json(copy, { status: 201 });
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

    http.post(url("/courses/:id/import/rows"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      if (!course) return error(404, "Course not found");
      if (!course.editable) return error(403, "Shared courses are read-only");
      const body = ImportRowsSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid rows");
      const { unit: unitTitle, rows } = body.data;
      const units = course.units.map((u) => ({ ...u }));
      let unit = units.find((u) => u.title === unitTitle);
      if (!unit) {
        unit = aUnit({ title: unitTitle, position: units.length + 1 });
        units.push(unit);
      }
      unit.itemCount += rows.length;
      state.items[course.id] = [
        ...(state.items[course.id] ?? []),
        ...rows.map((r) => ({ itemId: nextId(), unitTitle, ...r, isNew: true })),
      ];
      setCourse({ ...course, units, itemCount: course.itemCount + rows.length });
      return HttpResponse.json({
        unitsCreated: units.length - course.units.length,
        itemsCreated: rows.length,
      });
    }),

    http.get(url("/courses/:id/items"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      if (!course) return error(404, "Course not found");
      const q = new URL(request.url).searchParams.get("q") ?? "";
      return HttpResponse.json({
        items: courseItems(course).filter((i) => itemMatchesSearch(i, q)),
      });
    }),

    http.post(url("/courses/:id/units/:unitId/items"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const course = findCourse(String(params.id));
      const unit = course?.units.find((u) => u.id === params.unitId);
      if (!course?.editable || !unit) return error(404, "Unit not found");
      const body = CreateItemSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid item");
      const itemId = nextId();
      state.items[course.id] = [
        ...(state.items[course.id] ?? []),
        { itemId, unitTitle: unit.title, isNew: true, ...body.data },
      ];
      count(course, unit.title, 1, 0);
      return HttpResponse.json(asCourseItem(itemId), { status: 201 });
    }),

    http.patch(url("/items/:id"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const found = findOwnedItem(String(params.id));
      if (!found) return error(404, "Item not found");
      const body = UpdateItemSchema.safeParse(await request.json());
      if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid item");
      Object.assign(found.item, body.data);
      return HttpResponse.json(asCourseItem(found.item.itemId));
    }),

    http.delete(url("/items/:id"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const found = findOwnedItem(String(params.id));
      if (!found) return error(404, "Item not found");
      const { course, item } = found;
      state.items[course.id] = (state.items[course.id] ?? []).filter((i) => i !== item);
      count(course, item.unitTitle, -1, item.isNew ? 0 : -1);
      return new HttpResponse(null, { status: 204 });
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

    http.get(url("/study/review"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const items = state.courses.flatMap((course) => {
        const due = new Set(state.due[course.id] ?? []);
        return (state.items[course.id] ?? [])
          .filter((i) => due.has(i.itemId))
          .map((i) => ({
            ...i,
            isNew: false,
            courseId: course.id,
            courseTitle: course.title,
            targetLang: course.targetLang,
            grading: grading(course),
          }));
      });
      return HttpResponse.json(ReviewSessionSchema.parse({ items }));
    }),

    http.get(url("/dashboard"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const query = DashboardQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (!query.success) return error(400, query.error.issues[0]?.message ?? "Invalid query");
      const courses = state.courses.map(({ id, title, sourceLang, targetLang, dueCount }) => ({
        id,
        title,
        sourceLang,
        targetLang,
        dueCount,
      }));
      return HttpResponse.json(
        DashboardSchema.parse({
          dueCount: courses.reduce((sum, c) => sum + c.dueCount, 0),
          courses,
          forecast: state.forecast,
        }),
      );
    }),

    http.get(url("/stats"), async ({ request }) => {
      const failed = await record(request);
      if (failed) return failed;
      const query = StatsQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (!query.success) return error(400, query.error.issues[0]?.message ?? "Invalid query");
      const { courseId } = query.data;
      if (courseId === undefined) return HttpResponse.json(StatsSchema.parse(state.stats));
      if (!findCourse(courseId)) return error(404, "Course not found");
      const stats = state.courseStats[courseId] ?? aStats({ today: state.stats.today });
      return HttpResponse.json(StatsSchema.parse({ ...stats, courseId }));
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
      const graded = gradeAnswer(body.answer, [item.term, ...item.alternatives], grading(course));
      const hints = Math.min(body.hints ?? 0, maxHints(item.term));
      const wasNew = item.isNew;
      if (item.isNew) {
        item.isNew = false;
        setCourse({ ...course, learnedCount: course.learnedCount + 1 });
      }
      const result = AnswerResultSchema.parse({
        verdict: graded.verdict,
        matched: graded.matched,
        term: item.term,
        rating: ratingForAnswer(graded.verdict, hints, item.term),
        nextDue: NEXT_DUE,
        reviewId: nextId(),
        overridden: false,
      });
      reviewIds.add(result.reviewId ?? "");
      latest = {
        reviewId: result.reviewId ?? "",
        courseId: course.id,
        item,
        wasNew,
        result,
        hints,
      };
      return HttpResponse.json(result);
    }),

    http.post(url("/study/answers/:id/override"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const reviewId = String(params.id);
      if (latest?.reviewId !== reviewId) return notLatest(reviewId);
      const rating = ratingForAnswer("exact", latest.hints, latest.item.term);
      if (latest.result.verdict === "exact" || latest.result.overridden) {
        return error(409, "Only a wrong or misspelt answer can be overridden.");
      }
      if (rating <= latest.result.rating) {
        return error(409, "With those hints, overriding wouldn't change the rating.");
      }
      latest.result = { ...latest.result, rating, overridden: true };
      return HttpResponse.json(latest.result);
    }),

    http.post(url("/study/answers/:id/undo"), async ({ request, params }) => {
      const failed = await record(request);
      if (failed) return failed;
      const reviewId = String(params.id);
      if (latest?.reviewId !== reviewId) return notLatest(reviewId);
      const { courseId, item, wasNew } = latest;
      const course = findCourse(courseId);
      if (wasNew && course) {
        item.isNew = true;
        setCourse({ ...course, learnedCount: course.learnedCount - 1 });
      }
      latest = null;
      return HttpResponse.json(UndoResultSchema.parse({ itemId: item.itemId }));
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
