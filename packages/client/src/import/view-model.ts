import {
  type FieldSeparator,
  IMPORT_ROWS_MAX,
  ITEM_TEXT_MAX,
  type ParsedImport,
  type RejectReason,
} from "@app/shared";
import type { SelectVM, TextFieldVM } from "../core/fields.ts";
import type { Route } from "../core/ports.ts";
import {
  type FormatChoice,
  type ImportState,
  NEW_UNIT,
  targetUnitTitle,
  wordsToImport,
} from "./controller.ts";

/** Rows the preview and the skipped list show; the rest are counted. */
export const PREVIEW_MAX = 50;

export interface ImportPreviewVM {
  title: string;
  summary: string;
  columns: { line: string; term: string; definition: string };
  rows: { key: string; line: string; term: string; definition: string }[];
  /** "… and 12 more words.", or null when every row is shown. */
  more: string | null;
  rejectedTitle: string;
  rejected: { key: string; text: string }[];
  rejectedMore: string | null;
}

export interface ImportFormVM {
  help: string;
  file: { id: string; label: string; loaded: string | null };
  text: TextFieldVM;
  format: SelectVM<FormatChoice>;
  /** How the text was read, e.g. 'Read as a word list, with " - " between term and definition.' */
  detected: string | null;
  swap: { id: string; label: string; help: string; checked: boolean };
  unit: SelectVM<string>;
  /** The new unit's name, while "New unit" is chosen. */
  newUnit: TextFieldVM | null;
  preview: ImportPreviewVM | null;
  submit: { label: string; disabled: boolean };
  error: string | null;
  result: string | null;
}

export type ImportVM =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      title: string;
      back: { label: string; route: Route };
      /** Null for a shared (read-only) course. */
      form: ImportFormVM | null;
      readOnlyNotice: string | null;
    };

export const IMPORT_PLACEHOLDER = "hola - hello\ngracias - thank you\nel perro\tthe dog";

const SEPARATOR_NAME: Record<FieldSeparator, string> = {
  tab: "tab",
  comma: "comma",
  dash: '" - "',
  equals: '" = "',
  semicolon: "semicolon",
  pipe: '"|"',
  colon: '":"',
  space: "space",
};
/** 'a tab', but '" - "'. */
const withArticle = (s: FieldSeparator) => {
  const name = SEPARATOR_NAME[s];
  return name.startsWith('"') ? name : `a ${name}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describeParse(parsed: ParsedImport): string {
  const between = parsed.separator
    ? `${withArticle(parsed.separator)} between term and definition`
    : "no separator found";
  if (parsed.format === "anki") return `Read as Anki notes, with ${between}.`;
  if (parsed.format === "quizlet") {
    const rows = parsed.rowSeparator === "semicolon" ? "semicolons" : "line breaks";
    return `Read as a Quizlet export, with ${between} and ${rows} between words.`;
  }
  return `Read as a word list, with ${between}.`;
}

function reasonText(reason: RejectReason, separator: FieldSeparator | null): string {
  switch (reason) {
    case "no-separator":
      return separator
        ? `no ${SEPARATOR_NAME[separator]} between term and definition`
        : 'no tab, comma, " - " or " = " between term and definition';
    case "empty-term":
      return "the term is empty";
    case "empty-definition":
      return "the definition is empty";
    case "too-long":
      return `longer than ${ITEM_TEXT_MAX} characters`;
    case "too-many":
      return `over the limit of ${IMPORT_ROWS_MAX} words per import`;
    case "unclosed-quote":
      return "a quoted field never closes";
  }
}

const quote = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 40 ? `“${t.slice(0, 39)}…”` : `“${t}”`;
};

function preview(state: ImportState, parsed: ParsedImport): ImportPreviewVM {
  const words = wordsToImport(state);
  const lineWord = parsed.rowSeparator === "semicolon" ? "Row" : "Line";
  const skipped = parsed.rejected.length;
  const what = lineWord.toLowerCase();
  return {
    title: "Preview",
    summary:
      `${plural(words.length, "word")} ready to import` +
      (skipped ? `, ${plural(skipped, `${what}`)} skipped.` : "."),
    columns: { line: lineWord, term: "Term (typed)", definition: "Definition (prompt)" },
    rows: words.slice(0, PREVIEW_MAX).map((w) => ({
      key: String(w.line),
      line: String(w.line),
      term: w.term,
      definition: w.definition,
    })),
    more:
      words.length > PREVIEW_MAX
        ? `… and ${plural(words.length - PREVIEW_MAX, "more word", "more words")}.`
        : null,
    rejectedTitle: `Skipped ${what}s`,
    rejected: parsed.rejected.slice(0, PREVIEW_MAX).map((r) => ({
      key: String(r.line),
      text: `${lineWord} ${r.line}: ${reasonText(r.reason, parsed.separator)} (${quote(r.text)})`,
    })),
    rejectedMore:
      skipped > PREVIEW_MAX ? `… and ${plural(skipped - PREVIEW_MAX, `more ${what}`)}.` : null,
  };
}

export function importViewModel(state: ImportState): ImportVM {
  const { course } = state;
  if (course.status === "loading") return { kind: "loading" };
  if (course.status === "error") return { kind: "error", message: course.message };
  const c = course.data;
  const back = { label: `← ${c.title}`, route: { to: "course", courseId: c.id } } as const;
  if (!c.editable) {
    return {
      kind: "ready",
      title: "Import words",
      back,
      form: null,
      readOnlyNotice:
        "This is a shared course, so it is read-only. Create your own course to import words.",
    };
  }
  const count = wordsToImport(state).length;
  const unitTitle = targetUnitTitle(state);
  return {
    kind: "ready",
    title: "Import words",
    back,
    readOnlyNotice: null,
    form: {
      help: 'One word per line: the word, then a tab, a comma, " - " or " = ", then its meaning. Quizlet exports and Anki\'s "Notes in Plain Text" (.txt) work too.',
      file: {
        id: "import-file",
        label: "File (.txt or .csv)",
        loaded: state.fileName ? `Loaded ${state.fileName}.` : null,
      },
      text: {
        id: "import-text",
        label: "Or paste",
        value: state.text,
        placeholder: IMPORT_PLACEHOLDER,
      },
      format: {
        id: "import-format",
        label: "Format",
        value: state.format,
        options: [
          { value: "auto", label: "Detect automatically" },
          { value: "list", label: "Word list" },
          { value: "quizlet", label: "Quizlet export" },
          { value: "anki", label: "Anki: Notes in Plain Text" },
        ],
      },
      detected: state.parsed ? describeParse(state.parsed) : null,
      swap: {
        id: "import-swap",
        label: "Swap term and definition",
        help: "The term is what gets typed; the definition is the prompt.",
        checked: state.swap,
      },
      unit: {
        id: "import-unit",
        label: "Add to unit",
        value: state.unit,
        options: [
          ...c.units.map((u) => ({ value: u.id, label: u.title })),
          { value: NEW_UNIT, label: "New unit" },
        ],
      },
      newUnit:
        state.unit === NEW_UNIT
          ? {
              id: "import-new-unit",
              label: "New unit name",
              value: state.newUnitTitle,
              placeholder: "e.g. Animals",
              required: true,
            }
          : null,
      preview: state.parsed ? preview(state, state.parsed) : null,
      submit: {
        label: state.importing
          ? "Importing…"
          : count > 0
            ? `Import ${plural(count, "word")}`
            : "Import",
        disabled: state.importing || count === 0 || unitTitle === "",
      },
      error: state.error,
      result: state.result
        ? `Imported ${plural(state.result.itemsCreated, "word")} into ${state.result.unit}.`
        : null,
    },
  };
}
