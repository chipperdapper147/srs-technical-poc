import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../api/query-keys.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aStudyItem, aUnit } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { type CatalogState, createCatalogController } from "./controller.ts";
import { catalogViewModel } from "./view-model.ts";

const capitals = aCourse({
  title: "World capitals",
  description: "Geography",
  targetLang: "en",
  itemCount: 2,
  editable: false,
  units: [aUnit({ title: "Top 10", itemCount: 2 })],
});
const spanish = aCourse({
  title: "Spanish basics",
  description: "First words",
  targetLang: "es",
  itemCount: 1,
  learnedCount: 1,
  editable: false,
});
const mine = aCourse({ title: "My own", editable: true });

const fake = setupFakeApi(() => ({
  courses: [spanish, capitals, mine],
  items: {
    [capitals.id]: [
      aStudyItem({ term: "Beijing", definition: "China", isNew: false }),
      aStudyItem({ term: "Tokyo", definition: "Japan", alternatives: ["Tokio"] }),
    ],
  },
}));

const ready = (s: CatalogState) => s.catalog.status === "ready";
const titles = (s: CatalogState) => {
  const { body } = catalogViewModel(s);
  return body.kind === "list" ? body.courses.map((c) => c.title) : body.kind;
};
const catalogRequests = () =>
  fake.current.requests.filter((r) => r.path === "/catalog").map((r) => r.search);

describe("catalog", () => {
  it("lists shared courses by title, with languages and word counts", async () => {
    const c = createCatalogController(createTestDeps());
    c.start();
    const vm = catalogViewModel(await waitForState(c.store, ready));
    expect(vm.heading).toBe("Course catalog");
    expect(vm.body).toEqual({
      kind: "list",
      count: "2 courses",
      courses: [
        {
          id: spanish.id,
          title: "Spanish basics",
          description: "First words",
          languages: "Spanish for English speakers",
          words: "1 word",
          route: { to: "course", courseId: spanish.id },
          copy: { label: "Copy to my courses", disabled: false, error: null },
        },
        expect.objectContaining({ title: "World capitals", words: "2 words" }),
      ],
    });
    expect(vm.language.options).toEqual([
      { value: "", label: "All languages" },
      { value: "en", label: "English" },
      { value: "es", label: "Spanish" },
    ]);
    expect(catalogRequests()).toEqual([""]);
  });

  it("searches when submitted, not while typing", async () => {
    const c = createCatalogController(createTestDeps());
    c.start();
    await waitForState(c.store, ready);
    c.actions.setQuery("geo");
    expect(catalogViewModel(c.store.get()).search.field.value).toBe("geo");
    expect(catalogRequests()).toEqual([""]);
    c.actions.search();
    const s = await waitForState(c.store, (x) => titles(x).length === 1);
    expect(titles(s)).toEqual(["World capitals"]);
    expect(catalogRequests()).toEqual(["", "?q=geo"]);
  });

  it("filters by language, keeps every language on offer, and explains an empty result", async () => {
    const c = createCatalogController(createTestDeps());
    c.start();
    await waitForState(c.store, ready);
    c.actions.setTargetLang("es");
    let s = await waitForState(c.store, (x) => titles(x).length === 1);
    expect(titles(s)).toEqual(["Spanish basics"]);
    expect(catalogViewModel(s).language).toMatchObject({ value: "es" });
    expect(catalogViewModel(s).language.options).toHaveLength(3);

    // The language filter applies what's in the search box too.
    c.actions.setQuery("capitals");
    c.actions.setTargetLang("es");
    s = await waitForState(c.store, (x) => catalogViewModel(x).body.kind === "empty");
    expect(catalogViewModel(s).body).toEqual({
      kind: "empty",
      message: "No courses match. Try another search or language.",
    });
    expect(catalogRequests()).toEqual(["", "?targetLang=es", "?q=capitals&targetLang=es"]);
  });

  it("keeps the previous results on screen while the next ones load", async () => {
    const c = createCatalogController(createTestDeps());
    c.start();
    await waitForState(c.store, ready);
    c.actions.setTargetLang("en");
    expect(titles(c.store.get())).toEqual(["Spanish basics", "World capitals"]);
    await waitForState(c.store, (x) => titles(x).length === 1);
  });

  it("says when there is nothing shared, and shows errors", async () => {
    fake.current.state.courses = [mine];
    const c = createCatalogController(createTestDeps());
    c.start();
    expect(catalogViewModel(await waitForState(c.store, ready)).body).toEqual({
      kind: "empty",
      message: "No shared courses yet.",
    });

    fake.current.failNext("GET", "/catalog", 500, "Database down");
    const d = createCatalogController(createTestDeps());
    d.start();
    const s = await waitForState(d.store, (x) => x.catalog.status === "error");
    expect(catalogViewModel(s).body).toEqual({ kind: "error", message: "Database down" });
  });

  it("copies a course, refreshes the list and dashboard, and opens the copy", async () => {
    const deps = createTestDeps();
    deps.queryClient.setQueryData(queryKeys.courses, []);
    const c = createCatalogController(deps);
    c.start();
    await waitForState(c.store, ready);
    c.actions.copy(capitals.id);
    const copying = catalogViewModel(c.store.get());
    expect(copying.body).toMatchObject({
      courses: [
        { copy: { label: "Copy to my courses", disabled: true } },
        { copy: { label: "Copying…", disabled: true } },
      ],
    });
    c.actions.copy(spanish.id); // ignored while a copy runs
    await vi.waitFor(() => expect(deps.routes).toHaveLength(1));

    const copies = fake.current.state.courses.filter((x) => x.title === "World capitals");
    expect(copies).toHaveLength(2);
    const copy = copies.find((x) => x.id !== capitals.id);
    expect(copy).toMatchObject({ editable: true, itemCount: 2, learnedCount: 0 });
    expect(deps.routes).toEqual([{ to: "course", courseId: copy?.id }]);
    expect(fake.current.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(fake.current.state.items[copy?.id ?? ""]?.map((i) => [i.term, i.isNew])).toEqual([
      ["Beijing", true],
      ["Tokyo", true],
    ]);
    expect(deps.queryClient.getQueryState(queryKeys.courses)?.isInvalidated).toBe(true);
    expect(deps.queryClient.getQueryData(queryKeys.course(copy?.id ?? ""))).toEqual(copy);
    expect(catalogViewModel(c.store.get()).body).toMatchObject({
      courses: [{ copy: { disabled: false } }, { copy: { label: "Copy to my courses" } }],
    });
  });

  it("shows a failed copy on its course and lets the learner retry", async () => {
    const deps = createTestDeps();
    const c = createCatalogController(deps);
    c.start();
    await waitForState(c.store, ready);
    fake.current.failNext("POST", `/courses/${spanish.id}/copy`, 403, "Only shared courses");
    c.actions.copy(spanish.id);
    const s = await waitForState(c.store, (x) => x.copyError !== null);
    expect(catalogViewModel(s).body).toMatchObject({
      courses: [
        { copy: { label: "Copy to my courses", disabled: false, error: "Only shared courses" } },
        { copy: { error: null } },
      ],
    });
    expect(deps.routes).toEqual([]);
    c.actions.copy(spanish.id);
    await vi.waitFor(() => expect(deps.routes).toHaveLength(1));
    expect(c.store.get().copyError).toBeNull();
  });

  it("doesn't navigate after the screen is gone", async () => {
    const deps = createTestDeps();
    const c = createCatalogController(deps);
    const stop = c.start();
    await waitForState(c.store, ready);
    c.actions.copy(spanish.id);
    stop();
    await vi.waitFor(() => expect(c.store.get().copying).toBeNull());
    expect(deps.routes).toEqual([]);
  });

  it("offers the selected language even before the catalog has loaded", () => {
    const vm = catalogViewModel({
      query: "",
      search: "",
      targetLang: "pt-BR",
      catalog: { status: "loading" },
      copying: null,
      copyError: null,
    });
    expect(vm.body).toEqual({ kind: "loading" });
    expect(vm.language.options).toEqual([
      { value: "", label: "All languages" },
      { value: "pt-BR", label: "Brazilian Portuguese" },
    ]);
  });
});
