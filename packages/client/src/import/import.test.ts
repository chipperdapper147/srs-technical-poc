import { IMPORT_ROWS_MAX, parseImport } from "@app/shared";
import { describe, expect, it } from "vitest";
import { LOADING } from "../core/remote.ts";
import { createTestDeps } from "../testing/deps.ts";
import { aCourse, aUnit } from "../testing/fixtures.ts";
import { setupFakeApi } from "../testing/server.ts";
import { waitForState } from "../testing/wait.ts";
import { createImportController, type ImportState, NEW_UNIT } from "./controller.ts";
import { type ImportFormVM, importViewModel, PREVIEW_MAX } from "./view-model.ts";

const basics = aUnit({ title: "Basics", itemCount: 2 });
const mine = aCourse({ title: "My Spanish", itemCount: 2, units: [basics] });
const shared = aCourse({ title: "Sample", editable: false });
const fake = setupFakeApi(() => ({ courses: [mine, shared] }));

async function open(courseId = mine.id) {
  const deps = createTestDeps();
  const c = createImportController(deps, { courseId });
  c.start();
  await waitForState(c.store, (s) => s.course.status !== "loading");
  return c;
}
const form = (s: ImportState): ImportFormVM => {
  const vm = importViewModel(s);
  if (vm.kind !== "ready" || !vm.form) throw new Error("no form");
  return vm.form;
};
const rowsSent = () => fake.current.requests.filter((r) => r.path.endsWith("/import/rows"));

describe("import controller", () => {
  it("previews pasted words and rejected lines, sending nothing", async () => {
    const c = await open();
    c.actions.setText("hola - hello\njunk\ngracias - thank you\n");
    const f = form(c.store.get());
    expect(f.detected).toBe('Read as a word list, with " - " between term and definition.');
    expect(f.preview).toMatchObject({
      summary: "2 words ready to import, 1 line skipped.",
      rows: [
        { line: "1", term: "hola", definition: "hello" },
        { line: "3", term: "gracias", definition: "thank you" },
      ],
      rejected: [{ text: 'Line 2: no " - " between term and definition (“junk”)' }],
    });
    // A new unit needs a name before the words can go in.
    expect(f.submit).toEqual({ label: "Import 2 words", disabled: true });
    expect(rowsSent()).toEqual([]);
  });

  it("imports into a new unit on confirm, then resets and refreshes the course", async () => {
    const c = await open();
    c.actions.setText("el perro\tthe dog\nel gato\tthe cat");
    c.actions.setNewUnitTitle(" Animals ");
    expect(form(c.store.get()).submit.disabled).toBe(false);
    c.actions.confirm();
    expect(form(c.store.get()).submit).toEqual({ label: "Importing…", disabled: true });
    const done = await waitForState(
      c.store,
      (s) => s.course.status === "ready" && s.course.data.units.length === 2,
    );
    expect(rowsSent().map((r) => r.body)).toEqual([
      {
        unit: "Animals",
        rows: [
          { term: "el perro", definition: "the dog" },
          { term: "el gato", definition: "the cat" },
        ],
      },
    ]);
    expect(form(done)).toMatchObject({
      result: "Imported 2 words into Animals.",
      text: { value: "" },
      preview: null,
      unit: { value: NEW_UNIT },
      newUnit: { value: "" },
    });
    expect(form(done).unit.options.map((o) => o.label)).toEqual(["Basics", "Animals", "New unit"]);
  });

  it("imports into an existing unit, swapped", async () => {
    const c = await open();
    c.actions.setText("hello,hola");
    c.actions.setSwap(true);
    c.actions.setUnit(basics.id);
    expect(form(c.store.get()).newUnit).toBeNull();
    expect(form(c.store.get()).preview?.rows).toMatchObject([
      { term: "hola", definition: "hello" },
    ]);
    c.actions.confirm();
    await waitForState(c.store, (s) => s.result !== null);
    expect(rowsSent()[0]?.body).toEqual({
      unit: "Basics",
      rows: [{ term: "hola", definition: "hello" }],
    });
    expect(fake.current.state.courses[0]?.units[0]?.itemCount).toBe(3);
  });

  it("names a new unit after a loaded file and reads it as Anki", async () => {
    const c = await open();
    c.actions.loadFile(
      "Spanish animals.txt",
      "#separator:tab\n#html:true\nel perro\t<b>the dog</b>\n",
    );
    const f = form(c.store.get());
    expect(f.file.loaded).toBe("Loaded Spanish animals.txt.");
    expect(f.newUnit?.value).toBe("Spanish animals");
    expect(f.detected).toBe("Read as Anki notes, with a tab between term and definition.");
    expect(f.preview?.rows).toMatchObject([{ line: "3", term: "el perro", definition: "the dog" }]);
  });

  it("re-reads the text when the format changes", async () => {
    const c = await open();
    c.actions.setText("uno,one;dos,two");
    expect(form(c.store.get()).preview?.rows).toHaveLength(2);
    c.actions.setFormat("list");
    expect(form(c.store.get()).preview?.rows).toEqual([
      { key: "1", line: "1", term: "uno", definition: "one;dos,two" },
    ]);
  });

  it("shows an API error and keeps the text", async () => {
    const c = await open();
    fake.current.failNext("POST", `/courses/${mine.id}/import/rows`, 400, "Too many words");
    c.actions.setText("hola - hello");
    c.actions.setNewUnitTitle("U");
    c.actions.confirm();
    const s = await waitForState(c.store, (x) => x.error !== null);
    expect(form(s)).toMatchObject({ error: "Too many words", text: { value: "hola - hello" } });
  });

  it("does nothing on confirm without words", async () => {
    const c = await open();
    c.actions.setNewUnitTitle("U");
    c.actions.setText("no separators here");
    c.actions.confirm();
    expect(c.store.get().importing).toBe(false);
    expect(rowsSent()).toEqual([]);
  });

  it("is read-only for a shared course", async () => {
    const c = await open(shared.id);
    expect(importViewModel(c.store.get())).toMatchObject({
      kind: "ready",
      form: null,
      readOnlyNotice: expect.stringContaining("shared course"),
      back: { label: "← Sample", route: { to: "course", courseId: shared.id } },
    });
  });
});

describe("import view model", () => {
  const base: ImportState = {
    courseId: mine.id,
    course: { status: "ready", data: mine },
    text: "",
    fileName: null,
    format: "auto",
    parsed: null,
    swap: false,
    unit: NEW_UNIT,
    newUnitTitle: "",
    importing: false,
    error: null,
    result: null,
  };
  const withText = (text: string, extra: Partial<ImportState> = {}): ImportState => ({
    ...base,
    text,
    parsed: parseImport(text, extra.format ?? "auto"),
    ...extra,
  });

  it("passes loading and errors through", () => {
    expect(importViewModel({ ...base, course: LOADING })).toEqual({ kind: "loading" });
    expect(importViewModel({ ...base, course: { status: "error", message: "Nope" } })).toEqual({
      kind: "error",
      message: "Nope",
    });
  });

  it("has no preview or detection while the text is blank", () => {
    expect(form(base)).toMatchObject({
      detected: null,
      preview: null,
      submit: { label: "Import", disabled: true },
      newUnit: { id: "import-new-unit", required: true },
    });
  });

  it("calls semicolon rows rows", () => {
    const f = form(withText("uno,one;dos;tres,three"));
    expect(f.detected).toBe(
      "Read as a Quizlet export, with a comma between term and definition and semicolons between words.",
    );
    expect(f.preview).toMatchObject({
      columns: { line: "Row" },
      summary: "2 words ready to import, 1 row skipped.",
      rejectedTitle: "Skipped rows",
      rejected: [{ text: "Row 2: no comma between term and definition (“dos”)" }],
    });
  });

  it("explains each kind of rejected line", () => {
    const f = form(withText(`a - \n - b\n${"x".repeat(501)} - y\nnothing`));
    expect(f.preview?.rejected.map((r) => r.text)).toEqual([
      "Line 1: the definition is empty (“a -”)",
      "Line 2: the term is empty (“- b”)",
      `Line 3: longer than 500 characters (“${"x".repeat(39)}…”)`,
      'Line 4: no " - " between term and definition (“nothing”)',
    ]);
    expect(form(withText("nothing\nat all")).preview?.rejected[0]?.text).toBe(
      'Line 1: no tab, comma, " - " or " = " between term and definition (“nothing”)',
    );
    expect(form(withText('#separator:tab\n"open\tx')).preview?.rejected[0]?.text).toBe(
      'Line 2: a quoted field never closes (“"open x”)',
    );
  });

  it("caps the preview and counts the rest", () => {
    const text = Array.from({ length: IMPORT_ROWS_MAX + 3 }, (_, i) => `w${i} - d${i}`).join("\n");
    const f = form(withText(text, { newUnitTitle: "Big" }));
    expect(f.preview?.rows).toHaveLength(PREVIEW_MAX);
    expect(f.preview?.more).toBe(`… and ${IMPORT_ROWS_MAX - PREVIEW_MAX} more words.`);
    expect(f.preview?.rejected[0]?.text).toMatch(/over the limit of 5000 words per import/);
    expect(f.submit).toEqual({ label: `Import ${IMPORT_ROWS_MAX} words`, disabled: false });
  });

  it("says one word, not one words", () => {
    const f = form(withText("hola - hello", { newUnitTitle: "U" }));
    expect(f.preview?.summary).toBe("1 word ready to import.");
    expect(f.submit.label).toBe("Import 1 word");
    expect(form({ ...base, result: { itemsCreated: 1, unitsCreated: 0, unit: "U" } }).result).toBe(
      "Imported 1 word into U.",
    );
  });
});
