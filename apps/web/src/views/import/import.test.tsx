import { type ImportActions, type ImportState, importViewModel, NEW_UNIT } from "@app/client";
import { aCourse, aUnit, setupFakeApi } from "@app/client/testing";
import { parseImport } from "@app/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { ImportScreen } from "./import-screen";
import { ImportView } from "./import-view";

const basics = aUnit({ title: "Basics", itemCount: 1 });
const mine = aCourse({ title: "My Spanish", itemCount: 1, units: [basics] });
const shared = aCourse({ title: "Sample", editable: false });

const state = (text: string, extra: Partial<ImportState> = {}): ImportState => ({
  courseId: mine.id,
  course: { status: "ready", data: mine },
  text,
  fileName: null,
  format: "auto",
  parsed: text ? parseImport(text) : null,
  swap: false,
  unit: NEW_UNIT,
  newUnitTitle: "",
  importing: false,
  error: null,
  result: null,
  ...extra,
});
const noActions = (): ImportActions => ({
  setText: vi.fn(),
  loadFile: vi.fn(),
  setFormat: vi.fn(),
  setSwap: vi.fn(),
  setUnit: vi.fn(),
  setNewUnitTitle: vi.fn(),
  confirm: vi.fn(),
});

describe("ImportView", () => {
  it("shows the preview table and the skipped lines", async () => {
    const vm = importViewModel(state("hola - hello\njunk\n", { newUnitTitle: "Greetings" }));
    const { container } = render(<ImportView vm={vm} actions={noActions()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Import words" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← My Spanish" }).getAttribute("href")).toBe(
      `/courses/${mine.id}`,
    );
    expect(screen.getByRole("heading", { name: "Preview" })).toBeTruthy();
    expect(screen.getByText("1 word ready to import, 1 line skipped.")).toBeTruthy();
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["1", "hola", "hello"]);
    expect(screen.getByRole("listitem").textContent).toBe(
      'Line 2: no " - " between term and definition (“junk”)',
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Import 1 word" }).disabled).toBe(
      false,
    );
    await expectNoA11yViolations(container);
  });

  it("turns controls into actions", async () => {
    const user = userEvent.setup();
    const actions = noActions();
    render(<ImportView vm={importViewModel(state(""))} actions={actions} />);
    await user.selectOptions(screen.getByLabelText("Format"), "anki");
    expect(actions.setFormat).toHaveBeenCalledWith("anki");
    await user.selectOptions(screen.getByLabelText("Add to unit"), basics.id);
    expect(actions.setUnit).toHaveBeenCalledWith(basics.id);
    await user.click(screen.getByRole("switch", { name: "Swap term and definition" }));
    expect(actions.setSwap).toHaveBeenCalledWith(true);
    await user.type(screen.getByLabelText("New unit name"), "A");
    expect(actions.setNewUnitTitle).toHaveBeenCalledWith("A");
    const file = new File(["uno,one;dos,two"], "quizlet.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("File (.txt or .csv)"), file);
    await waitFor(() =>
      expect(actions.loadFile).toHaveBeenCalledWith("quizlet.txt", "uno,one;dos,two"),
    );
  });

  it("shows errors in an alert and results as a status", () => {
    const { rerender } = render(
      <ImportView
        vm={importViewModel(state("a - b", { error: "Too many words" }))}
        actions={noActions()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Too many words");
    rerender(
      <ImportView
        vm={importViewModel(
          state("", { result: { itemsCreated: 2, unitsCreated: 1, unit: "Food" } }),
        )}
        actions={noActions()}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Imported 2 words into Food.");
  });

  it("is read-only for a shared course", () => {
    const vm = importViewModel({ ...state(""), course: { status: "ready", data: shared } });
    render(<ImportView vm={vm} actions={noActions()} />);
    expect(screen.getByText(/This is a shared course/)).toBeTruthy();
    expect(screen.queryByLabelText("Or paste")).toBeNull();
  });
});

describe("ImportScreen", () => {
  const fake = setupFakeApi(() => ({ courses: [mine] }));

  it("pastes, previews, imports into a new unit and reports it", async () => {
    const user = userEvent.setup();
    renderScreen(<ImportScreen courseId={mine.id} />);
    await user.click(await screen.findByLabelText("Or paste"));
    await user.paste("el perro\tthe dog\nel gato\tthe cat\n");
    expect(
      screen.getByText("Read as a word list, with a tab between term and definition."),
    ).toBeTruthy();
    expect(screen.getByText("2 words ready to import.")).toBeTruthy();
    expect(fake.current.requests.some((r) => r.path.endsWith("/import/rows"))).toBe(false);
    await user.type(screen.getByLabelText("New unit name"), "Animals");
    await user.click(screen.getByRole("button", { name: "Import 2 words" }));
    expect((await screen.findByRole("status")).textContent).toBe("Imported 2 words into Animals.");
    expect(fake.current.state.courses[0]?.units.map((u) => u.title)).toEqual(["Basics", "Animals"]);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Or paste").value).toBe("");
  });
});
