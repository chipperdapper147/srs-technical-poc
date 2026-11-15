/**
 * A course's words: the list (observed), search as you type, and for the
 * course's owner adding, editing and deleting words. One form is open at a
 * time, either adding to a unit or editing a word.
 *
 * Search filters the loaded list here with the shared matcher, the same one
 * the API's `?q=` uses, so it is instant and needs no request per keystroke.
 */
import type { CourseDetail, CourseItem, CreateItem } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export interface WordsParams {
  courseId: string;
}

/** The form's text. Alternatives are one per line. */
export interface WordDraft {
  term: string;
  definition: string;
  alternatives: string;
  notes: string;
}

export type WordEditor = { kind: "add"; unitId: string } | { kind: "edit"; itemId: string };

export type WordNotice =
  | { kind: "added"; term: string; unitTitle: string }
  | { kind: "saved"; term: string }
  | { kind: "deleted"; term: string };

export interface WordsState {
  courseId: string;
  course: Remote<CourseDetail>;
  items: Remote<CourseItem[]>;
  query: string;
  editor: WordEditor | null;
  draft: WordDraft;
  saving: boolean;
  saveError: string | null;
  /** The word whose delete awaits confirmation. */
  confirmingDelete: string | null;
  deleting: boolean;
  deleteError: string | null;
  /** What the last change did, until the next one starts. */
  notice: WordNotice | null;
}

export interface WordsActions {
  setQuery(text: string): void;
  startAdd(unitId: string): void;
  startEdit(itemId: string): void;
  cancelEdit(): void;
  setDraft(field: keyof WordDraft, value: string): void;
  save(): void;
  askDelete(itemId: string): void;
  cancelDelete(): void;
  confirmDelete(): void;
}

export const EMPTY_DRAFT: WordDraft = { term: "", definition: "", alternatives: "", notes: "" };

/** The request body for a draft: trimmed, one alternative per non-empty line. */
export function draftToBody(draft: WordDraft): Required<CreateItem> {
  return {
    term: draft.term.trim(),
    definition: draft.definition.trim(),
    alternatives: draft.alternatives
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean),
    notes: draft.notes.trim(),
  };
}

export function canSaveDraft(draft: WordDraft): boolean {
  return draft.term.trim() !== "" && draft.definition.trim() !== "";
}

export function createWordsController(
  { api, queryClient }: ClientDeps,
  { courseId }: WordsParams,
): Controller<WordsState, WordsActions> {
  const store = createStore<WordsState>({
    courseId,
    course: LOADING,
    items: LOADING,
    query: "",
    editor: null,
    draft: EMPTY_DRAFT,
    saving: false,
    saveError: null,
    confirmingDelete: null,
    deleting: false,
    deleteError: null,
    notice: null,
  });
  const patch = (p: Partial<WordsState>) => store.set((s) => ({ ...s, ...p }));
  const loadedItems = () => {
    const { items } = store.get();
    return items.status === "ready" ? items.data : [];
  };
  const unitTitle = (unitId: string) => {
    const { course } = store.get();
    return course.status === "ready"
      ? (course.data.units.find((u) => u.id === unitId)?.title ?? "")
      : "";
  };

  /** Counts and words changed: refetch the course, its words, the list and the dashboard. */
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAll }),
    ]);
  }

  const closeForms = {
    editor: null,
    draft: EMPTY_DRAFT,
    saveError: null,
    confirmingDelete: null,
    deleteError: null,
  } satisfies Partial<WordsState>;

  return {
    store,
    actions: {
      setQuery: (query) => patch({ query }),
      startAdd: (unitId) => patch({ ...closeForms, editor: { kind: "add", unitId }, notice: null }),
      startEdit(itemId) {
        const item = loadedItems().find((i) => i.id === itemId);
        if (!item) return;
        patch({
          ...closeForms,
          editor: { kind: "edit", itemId },
          draft: {
            term: item.term,
            definition: item.definition,
            alternatives: item.alternatives.join("\n"),
            notes: item.notes,
          },
          notice: null,
        });
      },
      cancelEdit: () => patch(closeForms),
      setDraft: (field, value) => patch({ draft: { ...store.get().draft, [field]: value } }),
      async save() {
        const { editor, draft, saving } = store.get();
        if (!editor || saving || !canSaveDraft(draft)) return;
        patch({ saving: true, saveError: null });
        const body = draftToBody(draft);
        try {
          if (editor.kind === "add") {
            await api.createItem(courseId, editor.unitId, body);
          } else {
            await api.updateItem(editor.itemId, body);
          }
          await refresh();
          patch({
            ...closeForms,
            saving: false,
            notice:
              editor.kind === "add"
                ? { kind: "added", term: body.term, unitTitle: unitTitle(editor.unitId) }
                : { kind: "saved", term: body.term },
          });
        } catch (error) {
          patch({ saving: false, saveError: errorMessage(error) });
        }
      },
      askDelete: (itemId) => patch({ ...closeForms, confirmingDelete: itemId, notice: null }),
      cancelDelete: () => patch({ confirmingDelete: null, deleteError: null }),
      async confirmDelete() {
        const { confirmingDelete: itemId, deleting } = store.get();
        if (!itemId || deleting) return;
        const term = loadedItems().find((i) => i.id === itemId)?.term ?? "";
        patch({ deleting: true, deleteError: null });
        try {
          await api.deleteItem(itemId);
          await refresh();
          patch({ deleting: false, confirmingDelete: null, notice: { kind: "deleted", term } });
        } catch (error) {
          patch({ deleting: false, deleteError: errorMessage(error) });
        }
      },
    },
    start() {
      const stopCourse = observeQuery(
        queryClient,
        { queryKey: queryKeys.course(courseId), queryFn: () => api.course(courseId) },
        (course) => patch({ course }),
      );
      const stopItems = observeQuery(
        queryClient,
        {
          queryKey: queryKeys.courseItems(courseId),
          queryFn: async () => (await api.courseItems(courseId)).items,
        },
        (items) => patch({ items }),
      );
      return () => {
        stopCourse();
        stopItems();
      };
    },
  };
}
