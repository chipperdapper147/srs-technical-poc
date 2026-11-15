/**
 * Parsers for words people bring from elsewhere: a pasted list, a Quizlet
 * export and Anki's "Notes in Plain Text" export. Pure and platform-free:
 * the client previews with them, then sends the words to
 * `POST /courses/:id/import/rows`, which validates each row against the
 * same contract limits used here.
 *
 * Every parser keeps the line (or, for Quizlet's semicolon rows, the row)
 * each word came from, and rejects bad lines with a reason code rather
 * than text: the wording belongs to the view models.
 */
import { IMPORT_ROWS_MAX, ITEM_TEXT_MAX } from "./contracts.ts";

export const IMPORT_FORMATS = ["list", "quizlet", "anki"] as const;
/** `list`: a pasted word list. `quizlet`: a Quizlet export. `anki`: Anki's Notes in Plain Text. */
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/** What separates a term from its definition. */
export type FieldSeparator =
  | "tab"
  | "comma"
  | "dash"
  | "equals"
  | "semicolon"
  | "pipe"
  | "colon"
  | "space";

/** What separates one word from the next. */
export type RowSeparator = "newline" | "semicolon";

/** The text each separator stands for; `dash` also matches an en or em dash between spaces. */
export const SEPARATOR_TEXT: Record<FieldSeparator, string> = {
  tab: "\t",
  comma: ",",
  dash: " - ",
  equals: " = ",
  semicolon: ";",
  pipe: "|",
  colon: ":",
  space: " ",
};

/** The separators a pasted list may use, in the order ties are broken. */
export const LIST_SEPARATORS = ["tab", "equals", "dash", "comma"] as const;
export type ListSeparator = (typeof LIST_SEPARATORS)[number];

export type RejectReason =
  /** No separator between term and definition (or only one field). */
  | "no-separator"
  | "empty-term"
  | "empty-definition"
  /** Term or definition longer than ITEM_TEXT_MAX. */
  | "too-long"
  /** Beyond IMPORT_ROWS_MAX words in one import. */
  | "too-many"
  /** Anki: a quoted field that never closes. */
  | "unclosed-quote";

export interface ParsedWord {
  /** 1-based line (or Quizlet semicolon row) the word starts on. */
  line: number;
  term: string;
  definition: string;
}

export interface RejectedLine {
  line: number;
  /** The line as it was, for the learner to recognise. */
  text: string;
  reason: RejectReason;
}

export interface ParsedImport {
  format: ImportFormat;
  /** The separator used between term and definition; null if none was found. */
  separator: FieldSeparator | null;
  rowSeparator: RowSeparator;
  words: ParsedWord[];
  rejected: RejectedLine[];
}

// ---- Shared helpers ------------------------------------------------------

/** Postgres text can't hold NUL; other control characters are never meant. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Collapse whitespace, drop control characters, trim. */
export function cleanText(text: string): string {
  return text.replace(CONTROL, "").replace(/\s+/gu, " ").trim();
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitLines(text: string): string[] {
  return stripBom(text).split(/\r\n|\n|\r/);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Plain text from an HTML field: tags and comments dropped (line breaks and
 * blocks become spaces), entities decoded once, whitespace collapsed.
 */
export function stripHtml(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, name: string) => {
      if (name.startsWith("#")) {
        const code =
          name[1] === "x" || name[1] === "X"
            ? Number.parseInt(name.slice(2), 16)
            : Number(name.slice(1));
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    });
  return cleanText(text);
}

/** Anki media references (`[sound:x.mp3]`); media is out of scope, so they go. */
function stripMedia(text: string): string {
  return text.replace(/\[sound:[^\]]*\]/g, " ");
}

/** Check one candidate word against the contract's limits. */
function judge(
  line: number,
  text: string,
  term: string,
  definition: string,
): ParsedWord | RejectedLine {
  if (!term) return { line, text, reason: "empty-term" };
  if (!definition) return { line, text, reason: "empty-definition" };
  if (term.length > ITEM_TEXT_MAX || definition.length > ITEM_TEXT_MAX) {
    return { line, text, reason: "too-long" };
  }
  return { line, term, definition };
}

/** Sort candidates into words and rejects, rejecting words past IMPORT_ROWS_MAX. */
function collect(
  candidates: (ParsedWord | RejectedLine)[],
): Pick<ParsedImport, "words" | "rejected"> {
  const words: ParsedWord[] = [];
  const rejected: RejectedLine[] = [];
  for (const c of candidates) {
    if ("reason" in c) rejected.push(c);
    else if (words.length >= IMPORT_ROWS_MAX) {
      rejected.push({ line: c.line, text: `${c.term} ${c.definition}`, reason: "too-many" });
    } else words.push(c);
  }
  return { words, rejected };
}

// ---- Pasted word list ----------------------------------------------------

/** Where `separator` first occurs in `line`: [start, end), or null. */
function findSeparator(line: string, separator: FieldSeparator): [number, number] | null {
  if (separator === "dash") {
    const m = /\s[-–—]\s/u.exec(line);
    return m ? [m.index, m.index + m[0].length] : null;
  }
  if (separator === "equals") {
    const i = line.indexOf("=");
    return i === -1 ? null : [i, i + 1];
  }
  const s = SEPARATOR_TEXT[separator];
  const i = line.indexOf(s);
  return i === -1 ? null : [i, i + s.length];
}

/**
 * The list separator found on the most lines; ties go to the earlier one in
 * LIST_SEPARATORS (a tab beats " = ", which beats " - ", which beats a comma,
 * since commas turn up inside definitions). Null when no line has any.
 */
export function detectListSeparator(text: string): ListSeparator | null {
  const lines = splitLines(text).filter((l) => l.trim() !== "");
  let best: ListSeparator | null = null;
  let bestCount = 0;
  for (const separator of LIST_SEPARATORS) {
    const count = lines.filter((l) => findSeparator(l, separator)).length;
    if (count > bestCount) {
      best = separator;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One word per line: term, separator, definition. A tab separates columns,
 * so only the first two count; any other separator splits at its first
 * occurrence and the rest is the definition ("el banco - bank - bench").
 */
export function parseWordList(text: string, separator?: ListSeparator | null): ParsedImport {
  const sep = separator === undefined ? detectListSeparator(text) : separator;
  const candidates = splitLines(text).flatMap((raw, i): (ParsedWord | RejectedLine)[] => {
    const line = i + 1;
    if (raw.trim() === "") return [];
    const at = sep ? findSeparator(raw, sep) : null;
    if (!at) return [{ line, text: raw, reason: "no-separator" }];
    const rest = raw.slice(at[1]);
    const definition = sep === "tab" ? (rest.split("\t")[0] ?? "") : rest;
    return [judge(line, raw, cleanText(raw.slice(0, at[0])), cleanText(definition))];
  });
  return { format: "list", separator: sep, rowSeparator: "newline", ...collect(candidates) };
}

// ---- Quizlet -------------------------------------------------------------

export interface QuizletOptions {
  fieldSeparator?: "tab" | "comma";
  rowSeparator?: RowSeparator;
}

/** Tab if the text has one (Quizlet's default), else comma. */
function quizletFieldSeparator(text: string): "tab" | "comma" {
  return text.includes("\t") ? "tab" : "comma";
}

/**
 * Semicolon rows when more `;`-separated pieces hold a term and definition
 * than there are lines; a newline export whose definitions contain ";" never
 * gets there, since each line adds at most one such piece.
 */
export function detectQuizletRows(
  text: string,
  fieldSeparator = quizletFieldSeparator(text),
): RowSeparator {
  const lines = splitLines(text).filter((l) => l.trim() !== "").length;
  const fieldText = SEPARATOR_TEXT[fieldSeparator];
  const pieces = stripBom(text)
    .split(";")
    .filter((p) => p.includes(fieldText)).length;
  return pieces > lines ? "semicolon" : "newline";
}

/**
 * Quizlet's export: term and definition separated by a tab or a comma, rows
 * by a newline or a semicolon. Quizlet doesn't quote, so a row splits at its
 * first field separator. Semicolon rows are numbered as rows.
 */
export function parseQuizlet(text: string, options: QuizletOptions = {}): ParsedImport {
  const fieldSeparator = options.fieldSeparator ?? quizletFieldSeparator(text);
  const rowSeparator = options.rowSeparator ?? detectQuizletRows(text, fieldSeparator);
  const rows = rowSeparator === "semicolon" ? stripBom(text).split(";") : splitLines(text);
  const fieldText = SEPARATOR_TEXT[fieldSeparator];
  const candidates = rows.flatMap((raw, i): (ParsedWord | RejectedLine)[] => {
    const line = i + 1;
    if (raw.trim() === "") return [];
    const at = raw.indexOf(fieldText);
    if (at === -1) return [{ line, text: raw.trim(), reason: "no-separator" }];
    const term = cleanText(raw.slice(0, at));
    return [judge(line, raw.trim(), term, cleanText(raw.slice(at + fieldText.length)))];
  });
  return { format: "quizlet", separator: fieldSeparator, rowSeparator, ...collect(candidates) };
}

// ---- Anki: Notes in Plain Text -------------------------------------------

/** `#separator:` values Anki writes (any case), plus the characters themselves. */
const ANKI_SEPARATORS: Record<string, FieldSeparator> = {
  tab: "tab",
  "\t": "tab",
  comma: "comma",
  ",": "comma",
  semicolon: "semicolon",
  ";": "semicolon",
  pipe: "pipe",
  "|": "pipe",
  colon: "colon",
  ":": "colon",
  space: "space",
  " ": "space",
};

export interface AnkiHeader {
  separator: FieldSeparator;
  html: boolean;
  /** 1-based columns that aren't note fields (guid, notetype, deck, tags). */
  metaColumns: number[];
  /** Lines the header takes. */
  lines: number;
}

/** Leading `#key:value` lines. Without any, Anki's defaults: tab-separated HTML. */
export function parseAnkiHeader(text: string): AnkiHeader {
  const header: AnkiHeader = { separator: "tab", html: true, metaColumns: [], lines: 0 };
  for (const line of splitLines(text)) {
    const m = /^#([a-z ]+):(.*)$/i.exec(line);
    if (!m) break;
    header.lines += 1;
    const key = (m[1] ?? "").trim().toLowerCase();
    const raw = m[2] ?? "";
    const value = raw.trim().toLowerCase();
    if (key === "separator") {
      header.separator = ANKI_SEPARATORS[value] ?? ANKI_SEPARATORS[raw] ?? header.separator;
    } else if (key === "html") {
      header.html = value !== "false";
    } else if (/^(guid|notetype|deck|tags) column$/.test(key)) {
      const column = Number(value);
      if (Number.isInteger(column) && column > 0) header.metaColumns.push(column);
    }
  }
  return header;
}

interface AnkiRecord {
  line: number;
  text: string;
  fields: string[];
  unclosed: boolean;
}

/**
 * Split into records, CSV-style: a field that starts with `"` runs to the
 * closing quote (`""` is a quote) and may span lines, as Anki writes fields
 * that hold the separator, a quote or a line break.
 */
function ankiRecords(body: string, separator: string, firstLine: number): AnkiRecord[] {
  const records: AnkiRecord[] = [];
  let i = 0;
  let line = firstLine;
  while (i < body.length) {
    const start = i;
    const startLine = line;
    const fields: string[] = [];
    let unclosed = false;
    let ended = false;
    while (!ended) {
      let field = "";
      if (body[i] === '"') {
        i += 1;
        let closed = false;
        while (i < body.length) {
          const ch = body[i];
          if (ch === '"') {
            if (body[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          if (ch === "\n") line += 1;
          field += ch;
          i += 1;
        }
        if (!closed) unclosed = true;
      }
      // Unquoted text (or what follows a closing quote) up to the separator or line end.
      while (i < body.length && body[i] !== "\n" && !body.startsWith(separator, i)) {
        field += body[i];
        i += 1;
      }
      fields.push(field);
      if (i >= body.length) ended = true;
      else if (body[i] === "\n") {
        i += 1;
        line += 1;
        ended = true;
      } else i += separator.length;
    }
    records.push({
      line: startLine,
      text: body.slice(start, i).replace(/\n$/, ""),
      fields,
      unclosed,
    });
  }
  return records;
}

/**
 * Anki's "Notes in Plain Text" export (`.txt`). The header's separator and
 * meta columns (guid, notetype, deck, tags) are honoured; the first two note
 * fields are term and definition, and further fields are ignored. HTML is
 * reduced to text unless the header says `#html:false`; media references go.
 */
export function parseAnki(text: string): ParsedImport {
  const header = parseAnkiHeader(text);
  const lines = splitLines(text);
  const body = lines.slice(header.lines).join("\n");
  const separatorText = SEPARATOR_TEXT[header.separator];
  const meta = new Set(header.metaColumns);
  const clean = (field: string) =>
    header.html ? stripHtml(stripMedia(field)) : cleanText(stripMedia(field));
  const candidates = ankiRecords(body, separatorText, header.lines + 1).flatMap(
    (record): (ParsedWord | RejectedLine)[] => {
      if (record.unclosed)
        return [{ line: record.line, text: record.text, reason: "unclosed-quote" }];
      if (record.fields.every((f) => f.trim() === "")) return [];
      const fields = record.fields.filter((_, i) => !meta.has(i + 1));
      if (fields.length < 2)
        return [{ line: record.line, text: record.text, reason: "no-separator" }];
      return [judge(record.line, record.text, clean(fields[0] ?? ""), clean(fields[1] ?? ""))];
    },
  );
  return {
    format: "anki",
    separator: header.separator,
    rowSeparator: "newline",
    ...collect(candidates),
  };
}

// ---- Detection -----------------------------------------------------------

/**
 * Anki when the text opens with Anki's `#separator:`/`#html:` style header,
 * Quizlet when its rows are separated by semicolons, otherwise a word list
 * (which also reads Quizlet's default tab-and-newline export, and Anki's
 * header-less exports without HTML).
 */
export function detectFormat(text: string): ImportFormat {
  if (parseAnkiHeader(text).lines > 0) return "anki";
  if (detectQuizletRows(text) === "semicolon") return "quizlet";
  return "list";
}

/** Parse as `format`, or as the detected format. */
export function parseImport(text: string, format: ImportFormat | "auto" = "auto"): ParsedImport {
  const chosen = format === "auto" ? detectFormat(text) : format;
  if (chosen === "anki") return parseAnki(text);
  if (chosen === "quizlet") return parseQuizlet(text);
  return parseWordList(text);
}
