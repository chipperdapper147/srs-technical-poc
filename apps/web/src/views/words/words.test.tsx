import type { WordFormVM, WordsActions, WordsVM, WordVM } from "@app/client";
import { aCourse, aStudyItem, aUnit, setupFakeApi } from "@app/client/testing";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderScreen } from "@/test/render";
import { WordsScreen } from "./words-screen";
import { WordsView } from "./words-view";

const actions = (): WordsActions => ({
  setQuery: vi.fn(),
  startAdd: vi.fn(),
  startEdit: vi.fn(),
  cancelEdit: vi.fn(),
  setDraft: vi.fn(),
  save: vi.fn(),
  askDelete: vi.fn(),
  cancelDelete: vi.fn(),
  confirmDelete: vi.fn(),
});
const word = (over: Partial<WordVM> = {}): WordVM => ({
  id: "w1",
  term: "la canción",
  definition: "song",
  alternatives: "Also accepted: canción",
  notes: "Feminine",
  edit: { label: "Edit", accessibleLabel: "Edit la canción" },
  remove: { label: "Delete", accessibleLabel: "Delete la canción" },
  form: null,
  confirmDelete: null,
  ...over,
});
const form = (over: Partial<WordFormVM> = {}): WordFormVM => ({
  title: "Add a word to Basics",
  term: { id: "word-term", label: "Term (what you type)", value: "", required: true },
  definition: {
    id: "word-definition",
    label: "Definition (the prompt)",
    value: "",
    required: true,
  },
  alternatives: {
    id: "word-alternatives",
    label: "Other accepted answers",
    value: "",
    help: "One per line.",
  },
  notes: { id: "word-notes", label: "Notes", value: "" },
  submitLabel: "Add word",
  cancelLabel: "Cancel",
  canSubmit: false,
  error: null,
  ...over,
});
const ready = (over: Partial<Extract<WordsVM, { kind: "ready" }>> = {}): WordsVM => ({
  kind: "ready",
  title: "Words",
  courseTitle: "My Spanish",
  back: { label: "Back to course", route: { to: "course", courseId: "c1" } },
  search: {
    id: "word-search",
    label: "Search words",
    value: "",
    placeholder: "Term, definition or alternative",
  },
  summary: "1 word",
  empty: null,
  units: [
    {
      id: "u1",
      title: "1. Basics",
      words: [word()],
      empty: null,
      add: { label: "Add word", accessibleLabel: "Add word to Basics" },
      addForm: null,
    },
  ],
  notice: null,
  readOnlyNotice: null,
  ...over,
});

describe("WordsView", () => {
  it("renders loading and errors", () => {
    const { rerender } = render(<WordsView vm={{ kind: "loading" }} actions={actions()} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(<WordsView vm={{ kind: "error", message: "Course not found" }} actions={actions()} />);
    expect(screen.getByText("Course not found")).toBeTruthy();
  });

  it("renders words with their controls and turns events into actions", async () => {
    const user = userEvent.setup();
    const a = actions();
    const { container } = render(<WordsView vm={ready()} actions={a} />);
    expect(screen.getByRole("heading", { level: 1, name: "Words" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Back to course" }).getAttribute("href")).toBe(
      "/courses/c1",
    );
    expect(screen.getByText("Also accepted: canción")).toBeTruthy();
    await user.type(screen.getByLabelText("Search words"), "c");
    expect(a.setQuery).toHaveBeenCalledWith("c");
    await user.click(screen.getByRole("button", { name: "Edit la canción" }));
    expect(a.startEdit).toHaveBeenCalledWith("w1");
    await user.click(screen.getByRole("button", { name: "Delete la canción" }));
    expect(a.askDelete).toHaveBeenCalledWith("w1");
    await user.click(screen.getByRole("button", { name: "Add word to Basics" }));
    expect(a.startAdd).toHaveBeenCalledWith("u1");
    await expectNoA11yViolations(container);
  });

  it("renders the add form and its error", async () => {
    const user = userEvent.setup();
    const a = actions();
    const vm = ready({
      units: [
        {
          id: "u1",
          title: "1. Basics",
          words: [],
          empty: "No words in this unit yet.",
          add: null,
          addForm: form({
            term: { id: "word-term", label: "Term (what you type)", value: "x", required: true },
            definition: { id: "word-definition", label: "Definition (the prompt)", value: "y" },
            canSubmit: true,
            error: "Unit not found",
          }),
        },
      ],
    });
    const { container } = render(<WordsView vm={vm} actions={a} />);
    const add = screen.getByRole("form", { name: "Add a word to Basics" });
    await user.type(within(add).getByLabelText("Term (what you type)"), "x");
    expect(a.setDraft).toHaveBeenCalledWith("term", "xx");
    await user.type(within(add).getByLabelText("Other accepted answers"), "y");
    expect(a.setDraft).toHaveBeenCalledWith("alternatives", "y");
    await user.click(within(add).getByRole("button", { name: "Add word" }));
    expect(a.save).toHaveBeenCalled();
    await user.click(within(add).getByRole("button", { name: "Cancel" }));
    expect(a.cancelEdit).toHaveBeenCalled();
    expect(within(add).getByRole("alert").textContent).toBe("Unit not found");
    await expectNoA11yViolations(container);
  });

  it("shows a word's edit form in its place", () => {
    const vm = ready({
      units: [
        {
          id: "u1",
          title: "1. Basics",
          words: [word({ form: form({ title: "Edit “la canción”", submitLabel: "Save" }) })],
          empty: null,
          add: null,
          addForm: null,
        },
      ],
    });
    render(<WordsView vm={vm} actions={actions()} />);
    expect(screen.getByRole("form", { name: "Edit “la canción”" })).toBeTruthy();
    expect(screen.queryByText("Also accepted: canción")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup();
    const a = actions();
    const confirmDelete = {
      message: "Delete “la canción”? Every learner's progress …",
      confirmLabel: "Delete word",
      cancelLabel: "Keep it",
      canConfirm: true,
      error: null,
    };
    render(
      <WordsView
        vm={ready({
          units: [
            {
              id: "u1",
              title: "1. Basics",
              words: [word({ confirmDelete })],
              empty: null,
              add: null,
              addForm: null,
            },
          ],
        })}
        actions={a}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete word" }));
    expect(a.confirmDelete).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(a.cancelDelete).toHaveBeenCalled();
  });

  it("has no edit controls on a read-only course", async () => {
    const vm = ready({
      readOnlyNotice: "This is a shared course, so its words are read-only.",
      units: [
        {
          id: "u1",
          title: "1. Basics",
          words: [word({ edit: null, remove: null })],
          empty: null,
          add: null,
          addForm: null,
        },
      ],
    });
    const { container } = render(<WordsView vm={vm} actions={actions()} />);
    expect(screen.getByText(/shared course/)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
    await expectNoA11yViolations(container);
  });
});

const basics = aUnit({ title: "Basics", itemCount: 2 });
const mine = aCourse({ title: "My Spanish", itemCount: 2, units: [basics] });
const fake = setupFakeApi(() => ({
  courses: [mine],
  items: {
    [mine.id]: [
      aStudyItem({ unitTitle: "Basics", term: "hola", definition: "hello" }),
      aStudyItem({ unitTitle: "Basics", term: "la canción", definition: "song" }),
    ],
  },
}));

describe("WordsScreen", () => {
  it("searches, adds and deletes words through the API", async () => {
    const user = userEvent.setup();
    renderScreen(<WordsScreen courseId={mine.id} />);
    await user.type(await screen.findByLabelText("Search words"), "cancion");
    expect(screen.queryByText("hola")).toBeNull();
    expect(screen.getByText("1 of 2 words match “cancion”")).toBeTruthy();
    await user.clear(screen.getByLabelText("Search words"));

    await user.click(screen.getByRole("button", { name: "Add word to Basics" }));
    await user.type(screen.getByLabelText("Term (what you type)"), "adiós");
    await user.type(screen.getByLabelText("Definition (the prompt)"), "goodbye");
    await user.click(screen.getByRole("button", { name: "Add word" }));
    expect(await screen.findByText("Added “adiós” to Basics.")).toBeTruthy();
    expect(screen.getByText("goodbye")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete hola" }));
    await user.click(screen.getByRole("button", { name: "Delete word" }));
    expect(await screen.findByText("Deleted “hola”.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("hello")).toBeNull());
    expect(fake.current.state.courses[0]?.itemCount).toBe(2);
  });
});
