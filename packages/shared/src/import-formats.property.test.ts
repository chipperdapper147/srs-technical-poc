/**
 * Property-based tests for the import parsers: what they must do for every
 * input, not just the examples and fixtures in import-formats.test.ts. A
 * failure prints the smallest input fast-check could shrink it to; add that
 * input to import-formats.test.ts as well.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ImportRowSchema } from "./contracts.ts";
import {
  cleanText,
  LIST_SEPARATORS,
  parseAnki,
  parseImport,
  parseQuizlet,
  parseWordList,
  SEPARATOR_TEXT,
  stripHtml,
} from "./import-formats.ts";

/** Words and phrases with no separator in them: letters (with accents) and single spaces. */
const phrase = fc.stringMatching(/^[a-zA-Záéíóúüñçß]{1,10}( [a-zA-Záéíóúüñçß]{1,10}){0,2}$/);
const word = fc.record({ term: phrase, definition: phrase });
const words = fc.array(word, { minLength: 1, maxLength: 30 });
const pairs = (r: { words: { term: string; definition: string }[] }) =>
  r.words.map(({ term, definition }) => ({ term, definition }));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A field as Anki's exporter writes it: quoted when it holds a tab, quote or line break. */
const ankiField = (s: string) => (/[\t"\r\n]|^#/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

describe("parseWordList", () => {
  it("reads back any list written with any separator, and detects the separator", () => {
    fc.assert(
      fc.property(words, fc.constantFrom(...LIST_SEPARATORS), (ws, sep) => {
        const text = ws.map((w) => `${w.term}${SEPARATOR_TEXT[sep]}${w.definition}`).join("\n");
        const r = parseImport(text);
        expect(r).toMatchObject({ format: "list", separator: sep, rejected: [] });
        expect(pairs(r)).toEqual(ws);
        expect(r.words.map((w) => w.line)).toEqual(ws.map((_, i) => i + 1));
      }),
    );
  });

  it("reports exactly the lines without a separator, by line number", () => {
    fc.assert(
      fc.property(
        words,
        fc.array(fc.tuple(fc.nat(), fc.stringMatching(/^[a-z]{1,12}$/)), { maxLength: 5 }),
        (ws, junk) => {
          const lines = ws.map((w) => `${w.term} - ${w.definition}`);
          for (const [at, text] of junk) lines.splice(at % (lines.length + 1), 0, text);
          const r = parseWordList(lines.join("\n"), "dash");
          expect(pairs(r)).toEqual(ws);
          const bad = lines.flatMap((l, i) => (l.includes(" - ") ? [] : [i + 1]));
          expect(r.rejected.map((x) => x.line)).toEqual(bad);
          expect(r.rejected.every((x) => x.reason === "no-separator")).toBe(true);
          for (const w of r.words) expect(lines[w.line - 1]).toContain(w.term);
        },
      ),
    );
  });

  it("never throws, accounts for every non-blank line once, and only yields valid rows", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        for (const r of [parseImport(text, "list"), parseImport(text, "quizlet")]) {
          const lines = [...r.words.map((w) => w.line), ...r.rejected.map((x) => x.line)];
          expect(new Set(lines).size).toBe(lines.length);
          for (const w of r.words) {
            expect(ImportRowSchema.parse(w)).toMatchObject({
              term: w.term,
              definition: w.definition,
            });
            expect(w.term).toBe(cleanText(w.term));
          }
        }
        const list = parseImport(text, "list");
        const nonBlank = text
          .replace(/^﻿/, "")
          .split(/\r\n|\n|\r/)
          .filter((l) => l.trim() !== "").length;
        expect(list.words.length + list.rejected.length).toBe(nonBlank);
      }),
    );
  });
});

describe("parseQuizlet", () => {
  it("reads back any export, in every combination of separators", () => {
    fc.assert(
      fc.property(
        words,
        fc.constantFrom("tab", "comma") as fc.Arbitrary<"tab" | "comma">,
        fc.constantFrom("newline", "semicolon") as fc.Arbitrary<"newline" | "semicolon">,
        (ws, field, rows) => {
          const text = ws
            .map((w) => `${w.term}${SEPARATOR_TEXT[field]}${w.definition}`)
            .join(rows === "newline" ? "\n" : ";");
          const r = parseQuizlet(text);
          expect(r.separator).toBe(field);
          if (ws.length > 1) expect(r.rowSeparator).toBe(rows);
          expect(pairs(r)).toEqual(ws);
          expect(r.rejected).toEqual([]);
        },
      ),
    );
  });

  it("is detected by semicolon rows", () => {
    fc.assert(
      fc.property(fc.array(word, { minLength: 2, maxLength: 20 }), (ws) => {
        const text = ws.map((w) => `${w.term},${w.definition}`).join(";");
        expect(parseImport(text).format).toBe("quizlet");
      }),
    );
  });
});

describe("parseAnki", () => {
  /** Any field text Anki could hold, minus media references (dropped by design). */
  const field = fc.string({ maxLength: 30 }).filter((s) => !s.includes("[sound:"));

  it("reads back any export: quoting, HTML escaping and a tags column", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ term: field, definition: field, tags: phrase }), {
          minLength: 1,
          maxLength: 15,
        }),
        fc.boolean(),
        (notes, withTags) => {
          const header = `#separator:tab\n#html:true\n${withTags ? "#tags column:3\n" : ""}`;
          const body = notes
            .map((n) =>
              [n.term, n.definition, ...(withTags ? [n.tags] : [])]
                .map((f) => ankiField(escapeHtml(f)))
                .join("\t"),
            )
            .join("\n");
          const r = parseAnki(`${header}${body}\n`);
          const expected = notes
            .map((n) => ({ term: cleanText(n.term), definition: cleanText(n.definition) }))
            .filter((n) => n.term && n.definition);
          expect(pairs(r)).toEqual(expected);
          expect(r.rejected.every((x) => x.reason.startsWith("empty-"))).toBe(true);
          expect(r.words.length + r.rejected.length).toBeLessThanOrEqual(notes.length);
        },
      ),
    );
  });

  it("is detected by its header", () => {
    fc.assert(
      fc.property(words, (ws) => {
        const text = `#separator:tab\n#html:true\n${ws.map((w) => `${w.term}\t${w.definition}`).join("\n")}`;
        const r = parseImport(text);
        expect(r.format).toBe("anki");
        expect(pairs(r)).toEqual(ws);
        expect(r.words[0]?.line).toBe(3);
      }),
    );
  });
});

describe("stripHtml", () => {
  it("returns the text of any escaped string, wrapped in any tags", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom("b", "i", "div", "span", "p"), (text, tag) => {
        expect(stripHtml(escapeHtml(text))).toBe(cleanText(text));
        expect(stripHtml(`<${tag} class="x">${escapeHtml(text)}</${tag}>`)).toBe(cleanText(text));
      }),
    );
  });

  it("never leaves a tag behind", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), fc.constantFrom("<b>", "</div>", "<br/>", "<img src=x>")), {
          maxLength: 10,
        }),
        (parts) => {
          expect(stripHtml(parts.join(""))).not.toMatch(/<\/?(b|div|br|img)\b[^>]*>/);
        },
      ),
    );
  });
});
