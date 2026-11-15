/**
 * Import words: paste a list or bring a Quizlet or Anki export, preview what
 * was read (and what wasn't, by line), pick the unit, then confirm. Nothing
 * is sent before `confirm()`. The platform reads files; this gets their text.
 */
import {
  type CourseDetail,
  type ImportFormat,
  type ImportResult,
  type ParsedImport,
  parseImport,
} from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export interface ImportParams {
  courseId: string;
}

/** The format select: detect it, or read the text as this format. */
export type FormatChoice = "auto" | ImportFormat;

/** The unit select's value for "a new unit". Other values are unit ids. */
export const NEW_UNIT = "new";

export interface ImportState {
  courseId: string;
  course: Remote<CourseDetail>;
  text: string;
  /** Name of the file the text came from, if it came from one. */
  fileName: string | null;
  format: FormatChoice;
  /** What `text` reads as in `format`; null while the text is blank. */
  parsed: ParsedImport | null;
  /** Use the second field as the term (the typed answer) and the first as the prompt. */
  swap: boolean;
  /** A unit id, or NEW_UNIT. */
  unit: string;
  newUnitTitle: string;
  importing: boolean;
  error: string | null;
  result: (ImportResult & { unit: string }) | null;
}

export interface ImportActions {
  setText(text: string): void;
  /** A file the learner picked: its name and its text. */
  loadFile(name: string, text: string): void;
  setFormat(format: FormatChoice): void;
  setSwap(swap: boolean): void;
  setUnit(unit: string): void;
  setNewUnitTitle(title: string): void;
  /** Import the previewed words into the chosen unit. */
  confirm(): void;
}

const parse = (text: string, format: FormatChoice) =>
  text.trim() === "" ? null : parseImport(text, format);

/** The words as they will be imported, after the swap. */
export function wordsToImport({ parsed, swap }: Pick<ImportState, "parsed" | "swap">) {
  return (parsed?.words ?? []).map((w) =>
    swap
      ? { line: w.line, term: w.definition, definition: w.term }
      : { line: w.line, term: w.term, definition: w.definition },
  );
}

/** The title the words go to: the chosen unit's, or the new unit's (trimmed); "" if none. */
export function targetUnitTitle(state: Pick<ImportState, "course" | "unit" | "newUnitTitle">) {
  if (state.unit === NEW_UNIT) return state.newUnitTitle.trim();
  if (state.course.status !== "ready") return "";
  return state.course.data.units.find((u) => u.id === state.unit)?.title ?? "";
}

/** A file name without its extension, as a default unit name. */
const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim();

export function createImportController(
  { api, queryClient }: ClientDeps,
  { courseId }: ImportParams,
): Controller<ImportState, ImportActions> {
  const store = createStore<ImportState>({
    courseId,
    course: LOADING,
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
  });
  const patch = (p: Partial<ImportState>) => store.set((s) => ({ ...s, ...p }));

  return {
    store,
    actions: {
      setText: (text) =>
        patch({ text, parsed: parse(text, store.get().format), error: null, result: null }),
      loadFile(name, text) {
        const { format, newUnitTitle, unit } = store.get();
        patch({
          text,
          fileName: name,
          parsed: parse(text, format),
          newUnitTitle: unit === NEW_UNIT && !newUnitTitle.trim() ? baseName(name) : newUnitTitle,
          error: null,
          result: null,
        });
      },
      setFormat: (format) => patch({ format, parsed: parse(store.get().text, format) }),
      setSwap: (swap) => patch({ swap }),
      setUnit: (unit) => patch({ unit }),
      setNewUnitTitle: (newUnitTitle) => patch({ newUnitTitle }),
      async confirm() {
        const state = store.get();
        const rows = wordsToImport(state).map(({ term, definition }) => ({ term, definition }));
        const unit = targetUnitTitle(state);
        if (state.importing || rows.length === 0 || !unit) return;
        if (state.course.status !== "ready" || !state.course.data.editable) return;
        patch({ importing: true, error: null, result: null });
        try {
          const result = await api.importRows(courseId, { unit, rows });
          patch({
            importing: false,
            result: { ...result, unit },
            text: "",
            fileName: null,
            parsed: null,
            unit: NEW_UNIT,
            newUnitTitle: "",
          });
          // Counts changed: the course (under "courses") and the dashboard.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAll }),
          ]);
        } catch (error) {
          patch({ importing: false, error: errorMessage(error) });
        }
      },
    },
    start: () =>
      observeQuery(
        queryClient,
        { queryKey: queryKeys.course(courseId), queryFn: () => api.course(courseId) },
        (course) => patch({ course }),
      ),
  };
}
