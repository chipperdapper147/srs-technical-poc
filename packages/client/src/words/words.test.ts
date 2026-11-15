import { describe, expect, it } from "vitest";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aStudyItem, aUnit } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createWordsController, draftToBody, type WordsState } from "./controller.ts";
import { wordsViewModel } from "./view-model.ts";

const basics = aUnit({ title: "Basics", position: 1, itemCount: 2, learnedCount: 1 });
const food = aUnit({ title: "Food", position: 2, itemCount: 1 });
const empty = aUnit({ title: "Travel", position: 3 });
const mine = aCourse({
  title: "My Spanish",
  itemCount: 3,
  learnedCount: 1,
  units: [basics, food, empty],
});
const hola = aStudyItem({ unitTitle: "Basics", term: "hola", definition: "hello", isNew: false });
const cancion = aStudyItem({
  unitTitle: "Basics",
  term: "la canción",
  definition: "song",
  alternatives: ["canción"],
  notes: "Feminine",
});
const agua = aStudyItem({ unitTitle: "Food", term: "el agua", definition: "water" });
const sharedUnit = aUnit({ title: "Capitals", itemCount: 1 });
const shared = aCourse({ title: "Capitals", editable: false, itemCount: 1, units: [sharedUnit] });
const tokyo = aStudyItem({ unitTitle: "Capitals", term: "Tokyo", definition: "Japan" });

const fake = setupFakeApi(() => ({
  courses: [mine, shared],
  items: { [mine.id]: [hola, cancion, agua], [shared.id]: [tokyo] },
}));

async function open(courseId = mine.id) {
  const deps = createTestDeps();
  const c = createWordsController(deps, { courseId });
  c.start();
  await waitForState(c.store, (s) => s.course.status !== "loading" && s.items.status !== "loading");
  return { c, deps };
}
const ready = (s: WordsState) => {
  const vm = wordsViewModel(s);
  if (vm.kind !== "ready") throw new Error(vm.kind);
  return vm;
};
const terms = (s: WordsState) => ready(s).units.flatMap((u) => u.words.map((w) => w.term));

describe("words: list and search", () => {
  it("lists words by unit with edit controls on the learner's own course", async () => {
    const { c } = await open();
    const vm = ready(c.store.get());
    expect(vm).toMatchObject({
      title: "Words",
      courseTitle: "My Spanish",
      back: { route: { to: "course", courseId: mine.id } },
      summary: "3 words",
      empty: null,
      readOnlyNotice: null,
      notice: null,
    });
    expect(vm.units.map((u) => [u.title, u.words.length, u.empty])).toEqual([
      ["1. Basics", 2, null],
      ["2. Food", 1, null],
      ["3. Travel", 0, "No words in this unit yet."],
    ]);
    expect(vm.units[0]?.words[1]).toMatchObject({
      term: "la canción",
      definition: "song",
      alternatives: "Also accepted: canción",
      notes: "Feminine",
      edit: { label: "Edit", accessibleLabel: "Edit la canción" },
      remove: { accessibleLabel: "Delete la canción" },
      form: null,
      confirmDelete: null,
    });
    expect(vm.units[0]?.words[0]).toMatchObject({ alternatives: null, notes: null });
    expect(vm.units[2]?.add).toEqual({
      label: "Add word",
      accessibleLabel: "Add word to Travel",
    });
  });

  it("narrows the list as you type, ignoring case and accents", async () => {
    const { c } = await open();
    c.actions.setQuery("CANCION");
    expect(terms(c.store.get())).toEqual(["la canción"]);
    expect(ready(c.store.get())).toMatchObject({ summary: "1 of 3 words match “CANCION”" });
    expect(ready(c.store.get()).units.map((u) => u.title)).toEqual(["1. Basics"]);

    c.actions.setQuery("water");
    expect(terms(c.store.get())).toEqual(["el agua"]);
    c.actions.setQuery("zzz");
    expect(ready(c.store.get())).toMatchObject({
      units: [],
      empty: "No words match “zzz”.",
      summary: "0 of 3 words match “zzz”",
    });
    c.actions.setQuery("");
    expect(terms(c.store.get())).toHaveLength(3);
    // Searching needs no request per keystroke.
    expect(fake.current.requests.filter((r) => r.path.endsWith("/items"))).toHaveLength(1);
  });

  it("is read-only on a shared course, which learners can still search", async () => {
    const { c } = await open(shared.id);
    const vm = ready(c.store.get());
    expect(vm.readOnlyNotice).toContain("shared course");
    expect(vm.units[0]).toMatchObject({ add: null, addForm: null });
    expect(vm.units[0]?.words[0]).toMatchObject({ term: "Tokyo", edit: null, remove: null });
    c.actions.setQuery("tok");
    expect(terms(c.store.get())).toEqual(["Tokyo"]);
  });

  it("explains an empty course", async () => {
    const bare = aCourse({ title: "Bare" });
    fake.current.state.courses.push(bare);
    const { c } = await open(bare.id);
    expect(ready(c.store.get())).toMatchObject({
      summary: "0 words",
      empty: expect.stringContaining("Import a CSV on the course page"),
      units: [],
    });
  });

  it("reports a missing course", async () => {
    const { c } = await open("00000000-0000-4000-8000-999999999999");
    expect(wordsViewModel(c.store.get())).toEqual({ kind: "error", message: "Course not found" });
  });
});

describe("words: editing", () => {
  it("adds a word to a unit and refreshes the list and counts", async () => {
    const { c, deps } = await open();
    c.actions.startAdd(empty.id);
    let travel = ready(c.store.get()).units[2];
    expect(travel?.add).toBeNull();
    expect(travel?.addForm).toMatchObject({
      title: "Add a word to Travel",
      submitLabel: "Add word",
      canSubmit: false,
      term: { value: "" },
    });
    c.actions.setDraft("term", " el tren ");
    expect(ready(c.store.get()).units[2]?.addForm?.canSubmit).toBe(false);
    c.actions.setDraft("definition", "train");
    c.actions.setDraft("alternatives", "tren\n\n  ferrocarril \n");
    expect(ready(c.store.get()).units[2]?.addForm?.canSubmit).toBe(true);
    c.actions.save();
    expect(ready(c.store.get()).units[2]?.addForm).toMatchObject({
      submitLabel: "Saving…",
      canSubmit: false,
    });

    const done = await waitForState(c.store, (s) => s.notice !== null);
    travel = ready(done).units[2];
    expect(travel?.addForm).toBeNull();
    expect(travel?.words).toMatchObject([
      { term: "el tren", alternatives: "Also accepted: tren, ferrocarril" },
    ]);
    expect(ready(done).notice).toBe("Added “el tren” to Travel.");
    expect(ready(done).summary).toBe("4 words");
    expect(fake.current.requests.find((r) => r.method === "POST")).toMatchObject({
      path: `/courses/${mine.id}/units/${empty.id}/items`,
      body: { term: "el tren", definition: "train", alternatives: ["tren", "ferrocarril"] },
    });
    // The course page's counts come from the refetched course.
    const course = deps.queryClient.getQueryData<{ itemCount: number }>(["courses", mine.id]);
    expect(course?.itemCount).toBe(4);
  });

  it("edits a word in place", async () => {
    const { c } = await open();
    c.actions.startEdit(cancion.itemId);
    const word = () => ready(c.store.get()).units[0]?.words[1];
    expect(word()?.form).toMatchObject({
      title: "Edit “la canción”",
      submitLabel: "Save",
      term: { value: "la canción" },
      alternatives: { value: "canción" },
      notes: { value: "Feminine" },
      canSubmit: true,
    });
    c.actions.setDraft("notes", "");
    c.actions.setDraft("alternatives", "canción\ncancion");
    c.actions.save();
    const done = await waitForState(c.store, (s) => s.notice !== null);
    expect(ready(done).notice).toBe("Saved “la canción”.");
    expect(ready(done).units[0]?.words[1]).toMatchObject({
      form: null,
      notes: null,
      alternatives: "Also accepted: canción, cancion",
    });
    expect(fake.current.requests.find((r) => r.method === "PATCH")).toMatchObject({
      path: `/items/${cancion.itemId}`,
      body: {
        term: "la canción",
        definition: "song",
        notes: "",
        alternatives: ["canción", "cancion"],
      },
    });
  });

  it("keeps one form open at a time, and cancel discards the draft", async () => {
    const { c } = await open();
    c.actions.startEdit(hola.itemId);
    c.actions.setDraft("term", "changed");
    c.actions.startAdd(food.id);
    const vm = ready(c.store.get());
    expect(vm.units[0]?.words[0]?.form).toBeNull();
    expect(vm.units[1]?.addForm?.term.value).toBe("");
    c.actions.cancelEdit();
    expect(ready(c.store.get()).units[1]?.addForm).toBeNull();
    expect(c.store.get().draft.term).toBe("");
  });

  it("shows a save error and keeps the form", async () => {
    const { c } = await open();
    c.actions.startEdit(hola.itemId);
    fake.current.failNext("PATCH", `/items/${hola.itemId}`, 500, "Save failed");
    c.actions.setDraft("term", "buenas");
    c.actions.save();
    const s = await waitForState(c.store, (x) => x.saveError !== null);
    expect(ready(s).units[0]?.words[0]?.form).toMatchObject({
      error: "Save failed",
      term: { value: "buenas" },
      submitLabel: "Save",
    });
  });

  it("deletes a word after confirmation", async () => {
    const { c } = await open();
    c.actions.askDelete(hola.itemId);
    const confirm = () => ready(c.store.get()).units[0]?.words[0]?.confirmDelete;
    expect(confirm()).toMatchObject({
      message: expect.stringContaining("Delete “hola”? Every learner's progress"),
      confirmLabel: "Delete word",
      cancelLabel: "Keep it",
      canConfirm: true,
    });
    c.actions.cancelDelete();
    expect(confirm()).toBeNull();

    c.actions.askDelete(hola.itemId);
    c.actions.confirmDelete();
    expect(confirm()).toMatchObject({ confirmLabel: "Deleting…", canConfirm: false });
    const done = await waitForState(c.store, (s) => s.notice !== null);
    expect(ready(done).notice).toBe("Deleted “hola”.");
    expect(terms(done)).toEqual(["la canción", "el agua"]);
    expect(fake.current.state.courses[0]).toMatchObject({ itemCount: 2, learnedCount: 0 });
  });

  it("shows a delete error", async () => {
    const { c } = await open();
    fake.current.failNext("DELETE", `/items/${agua.itemId}`, 404, "Item not found");
    c.actions.askDelete(agua.itemId);
    c.actions.confirmDelete();
    const s = await waitForState(c.store, (x) => x.deleteError !== null);
    expect(ready(s).units[1]?.words[0]?.confirmDelete).toMatchObject({
      error: "Item not found",
      canConfirm: true,
    });
  });

  it("turns a draft into a request body", () => {
    expect(
      draftToBody({ term: " a ", definition: " b ", alternatives: " c \n\nd", notes: " n " }),
    ).toEqual({ term: "a", definition: "b", alternatives: ["c", "d"], notes: "n" });
  });
});
