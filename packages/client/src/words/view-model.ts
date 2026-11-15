import { type CourseItem, itemMatchesSearch } from "@app/shared";
import type { TextFieldVM } from "../core/fields.ts";
import type { Route } from "../core/ports.ts";
import { canSaveDraft, type WordNotice, type WordsState } from "./controller.ts";

/** A button whose visible label is short; `accessibleLabel` names its word or unit. */
export interface WordButtonVM {
  label: string;
  accessibleLabel: string;
}

export interface WordFormVM {
  title: string;
  term: TextFieldVM;
  definition: TextFieldVM;
  alternatives: TextFieldVM & { help: string };
  notes: TextFieldVM;
  submitLabel: string;
  cancelLabel: string;
  canSubmit: boolean;
  error: string | null;
}

export interface WordDeleteVM {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  canConfirm: boolean;
  error: string | null;
}

export interface WordVM {
  id: string;
  term: string;
  definition: string;
  /** "Also accepted: …", or null without alternatives. */
  alternatives: string | null;
  notes: string | null;
  /** Null on a read-only course. */
  edit: WordButtonVM | null;
  remove: WordButtonVM | null;
  /** The edit form, when this word is being edited (shown instead of the word). */
  form: WordFormVM | null;
  /** The delete confirmation, when it is pending. */
  confirmDelete: WordDeleteVM | null;
}

export interface WordsUnitVM {
  id: string;
  title: string;
  words: WordVM[];
  /** Shown for a unit with no words while not searching. */
  empty: string | null;
  /** Null on a read-only course or while this unit's add form is open. */
  add: WordButtonVM | null;
  addForm: WordFormVM | null;
}

export type WordsVM =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      title: string;
      courseTitle: string;
      back: { label: string; route: Route };
      search: TextFieldVM;
      /** "4 words", or "1 of 4 words match “bib”". */
      summary: string;
      /** Why the list is empty, if it is. */
      empty: string | null;
      units: WordsUnitVM[];
      notice: string | null;
      readOnlyNotice: string | null;
    };

const words = (n: number) => (n === 1 ? "1 word" : `${n} words`);
const quoted = (text: string) => `“${text}”`;

function noticeText(notice: WordNotice | null): string | null {
  if (!notice) return null;
  switch (notice.kind) {
    case "added":
      return `Added ${quoted(notice.term)} to ${notice.unitTitle}.`;
    case "saved":
      return `Saved ${quoted(notice.term)}.`;
    case "deleted":
      return `Deleted ${quoted(notice.term)}.`;
  }
}

function formViewModel(state: WordsState, title: string, submit: string): WordFormVM {
  const { draft, saving } = state;
  return {
    title,
    term: { id: "word-term", label: "Term (what you type)", value: draft.term, required: true },
    definition: {
      id: "word-definition",
      label: "Definition (the prompt)",
      value: draft.definition,
      required: true,
    },
    alternatives: {
      id: "word-alternatives",
      label: "Other accepted answers",
      value: draft.alternatives,
      help: "One per line.",
    },
    notes: { id: "word-notes", label: "Notes", value: draft.notes },
    submitLabel: saving ? "Saving…" : submit,
    cancelLabel: "Cancel",
    canSubmit: canSaveDraft(draft) && !saving,
    error: state.saveError,
  };
}

function wordViewModel(state: WordsState, item: CourseItem, editable: boolean): WordVM {
  const { editor, confirmingDelete } = state;
  const editing = editor?.kind === "edit" && editor.itemId === item.id;
  return {
    id: item.id,
    term: item.term,
    definition: item.definition,
    alternatives: item.alternatives.length
      ? `Also accepted: ${item.alternatives.join(", ")}`
      : null,
    notes: item.notes || null,
    edit: editable ? { label: "Edit", accessibleLabel: `Edit ${item.term}` } : null,
    remove: editable ? { label: "Delete", accessibleLabel: `Delete ${item.term}` } : null,
    form: editing ? formViewModel(state, `Edit ${quoted(item.term)}`, "Save") : null,
    confirmDelete:
      editable && confirmingDelete === item.id
        ? {
            message: `Delete ${quoted(item.term)}? Every learner's progress and review history for it is deleted too.`,
            confirmLabel: state.deleting ? "Deleting…" : "Delete word",
            cancelLabel: "Keep it",
            canConfirm: !state.deleting,
            error: state.deleteError,
          }
        : null,
  };
}

export function wordsViewModel(state: WordsState): WordsVM {
  const { course, items } = state;
  if (course.status === "loading" || items.status === "loading") return { kind: "loading" };
  if (course.status === "error") return { kind: "error", message: course.message };
  if (items.status === "error") return { kind: "error", message: items.message };
  const c = course.data;
  const all = items.data;
  const editable = c.editable;
  const searching = state.query.trim() !== "";
  const matches = all.filter((i) => itemMatchesSearch(i, state.query));
  const query = state.query.trim();

  const units = [...c.units]
    .sort((a, b) => a.position - b.position)
    .map((unit): WordsUnitVM => {
      const unitWords = matches.filter((i) => i.unitId === unit.id);
      const adding = state.editor?.kind === "add" && state.editor.unitId === unit.id;
      return {
        id: unit.id,
        title: `${unit.position}. ${unit.title}`,
        words: unitWords.map((i) => wordViewModel(state, i, editable)),
        empty: unitWords.length === 0 && !searching ? "No words in this unit yet." : null,
        add:
          editable && !adding
            ? { label: "Add word", accessibleLabel: `Add word to ${unit.title}` }
            : null,
        addForm: adding ? formViewModel(state, `Add a word to ${unit.title}`, "Add word") : null,
      };
    })
    // While searching, only units with a match (or an open add form) are shown.
    .filter((u) => !searching || u.words.length > 0 || u.addForm !== null);

  let empty: string | null = null;
  if (c.units.length === 0) {
    empty = editable
      ? "No words yet. Import a CSV on the course page to create units, then add words here."
      : "No words yet.";
  } else if (searching && matches.length === 0) {
    empty = `No words match ${quoted(query)}.`;
  }

  return {
    kind: "ready",
    title: "Words",
    courseTitle: c.title,
    back: { label: "Back to course", route: { to: "course", courseId: c.id } },
    search: {
      id: "word-search",
      label: "Search words",
      value: state.query,
      placeholder: "Term, definition or alternative",
    },
    summary: searching
      ? `${matches.length} of ${words(all.length)} match ${quoted(query)}`
      : words(all.length),
    empty,
    units,
    notice: noticeText(state.notice),
    readOnlyNotice: editable
      ? null
      : "This is a shared course, so its words are read-only. Create your own course to edit words.",
  };
}
