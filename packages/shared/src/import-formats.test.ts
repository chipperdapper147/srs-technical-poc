import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMPORT_ROWS_MAX, ITEM_TEXT_MAX } from "./contracts.ts";
import {
  detectFormat,
  detectListSeparator,
  parseAnki,
  parseAnkiHeader,
  parseImport,
  parseQuizlet,
  parseWordList,
  stripHtml,
} from "./import-formats.ts";

/** Fixtures shaped like real exports: Anki 2.1.55+ "Notes in Plain Text", Quizlet's export box. */
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const pairs = (r: { words: { term: string; definition: string }[] }) =>
  r.words.map((w) => [w.term, w.definition]);

describe("pasted word lists", () => {
  it.each([
    ["tab", "hola\thello\ngracias\tthank you"],
    ["comma", "hola,hello\ngracias,thank you"],
    ["dash", "hola - hello\ngracias - thank you"],
    ["equals", "hola = hello\ngracias = thank you"],
  ])("detects a %s separator", (separator, text) => {
    const r = parseImport(text);
    expect(r).toMatchObject({ format: "list", separator, rejected: [] });
    expect(pairs(r)).toEqual([
      ["hola", "hello"],
      ["gracias", "thank you"],
    ]);
  });

  it("prefers the separator on the most lines, so commas in definitions don't win", () => {
    const text = "el banco - bank, bench\nla casa - house\nel pan, bread";
    expect(detectListSeparator(text)).toBe("dash");
    const r = parseWordList(text);
    expect(pairs(r)).toEqual([
      ["el banco", "bank, bench"],
      ["la casa", "house"],
    ]);
    expect(r.rejected).toEqual([{ line: 3, text: "el pan, bread", reason: "no-separator" }]);
  });

  it("accepts en and em dashes, keeps hyphenated words, splits at the first separator", () => {
    expect(pairs(parseWordList("el e-mail – email\nbien — well - fine", "dash"))).toEqual([
      ["el e-mail", "email"],
      ["bien", "well - fine"],
    ]);
  });

  it("takes the first two tab columns", () => {
    expect(pairs(parseWordList("hola\thello\tgreeting\n"))).toEqual([["hola", "hello"]]);
  });

  it("reports bad lines with their line numbers and skips blank ones", () => {
    const r = parseWordList("hola - hello\n\njunk\n - nothing\nsolo - \n\r\nadiós - bye\n");
    expect(pairs(r)).toEqual([
      ["hola", "hello"],
      ["adiós", "bye"],
    ]);
    expect(r.words.map((w) => w.line)).toEqual([1, 7]);
    expect(r.rejected).toEqual([
      { line: 3, text: "junk", reason: "no-separator" },
      { line: 4, text: " - nothing", reason: "empty-term" },
      { line: 5, text: "solo - ", reason: "empty-definition" },
    ]);
  });

  it("rejects text over the contract's limits", () => {
    const long = "a".repeat(ITEM_TEXT_MAX + 1);
    expect(parseWordList(`${long} - x`).rejected[0]?.reason).toBe("too-long");
    const many = Array.from({ length: IMPORT_ROWS_MAX + 2 }, (_, i) => `w${i} - d${i}`).join("\n");
    const r = parseWordList(many);
    expect(r.words).toHaveLength(IMPORT_ROWS_MAX);
    expect(r.rejected.map((x) => [x.line, x.reason])).toEqual([
      [IMPORT_ROWS_MAX + 1, "too-many"],
      [IMPORT_ROWS_MAX + 2, "too-many"],
    ]);
  });

  it("drops a byte order mark, NUL and other control characters", () => {
    expect(pairs(parseWordList("﻿ho\u0000la - hel\u0007lo"))).toEqual([["hola", "hello"]]);
  });

  it("rejects every line when there is no separator at all", () => {
    expect(parseWordList("hola\nadiós")).toMatchObject({
      separator: null,
      words: [],
      rejected: [
        { line: 1, reason: "no-separator" },
        { line: 2, reason: "no-separator" },
      ],
    });
  });
});

describe("Quizlet exports", () => {
  it("reads the default export: tab between term and definition, a row per line", () => {
    const text = fixture("quizlet-tab-newline.txt");
    expect(detectFormat(text)).toBe("list");
    const r = parseQuizlet(text);
    expect(r).toMatchObject({ separator: "tab", rowSeparator: "newline", rejected: [] });
    expect(pairs(r)).toEqual([
      ["hola", "hello"],
      ["adiós", "goodbye"],
      ["gracias", "thank you, thanks"],
      ["por favor", "please"],
    ]);
  });

  it("reads a comma and semicolon export, numbering rows", () => {
    const text = fixture("quizlet-comma-semicolon.txt");
    expect(detectFormat(text)).toBe("quizlet");
    const r = parseImport(text);
    expect(r).toMatchObject({ format: "quizlet", separator: "comma", rowSeparator: "semicolon" });
    expect(pairs(r)).toEqual([
      ["el perro", "the dog"],
      ["el gato", "the cat"],
      ["la vaca", "the cow"],
      ["el caballo", "the horse"],
    ]);
    expect(r.words.map((w) => w.line)).toEqual([1, 2, 3, 4]);
  });

  it("keeps semicolons inside definitions of a newline export", () => {
    const text = "banco\tbank; bench\nsilla\tchair; seat\n";
    expect(parseQuizlet(text).rowSeparator).toBe("newline");
    expect(pairs(parseQuizlet(text))).toEqual([
      ["banco", "bank; bench"],
      ["silla", "chair; seat"],
    ]);
  });

  it("reports a row without a separator", () => {
    expect(parseQuizlet("uno,one;dos;tres,three").rejected).toEqual([
      { line: 2, text: "dos", reason: "no-separator" },
    ]);
  });
});

describe("Anki Notes in Plain Text", () => {
  it("reads the header", () => {
    expect(parseAnkiHeader(fixture("anki-notes-with-meta.txt"))).toEqual({
      separator: "tab",
      html: true,
      metaColumns: [1, 2, 3, 6],
      lines: 6,
    });
    expect(parseAnkiHeader("#separator:Semicolon\n#html:false\n").separator).toBe("semicolon");
    expect(parseAnkiHeader("#separator:|\n").separator).toBe("pipe");
  });

  it("reads an export with tags: HTML and media dropped, quoted multi-line fields kept", () => {
    const text = fixture("anki-notes-plain-text.txt");
    expect(detectFormat(text)).toBe("anki");
    const r = parseImport(text);
    expect(r).toMatchObject({ format: "anki", separator: "tab", rejected: [] });
    expect(pairs(r)).toEqual([
      ["el perro", "the dog"],
      ["el gato", "the cat"],
      ["la casa", "the house (home)"],
      ["el pan", "bread loaf"],
      ['la "tienda"', "the shop, the store"],
    ]);
    expect(r.words.map((w) => w.line)).toEqual([4, 5, 6, 7, 8]);
  });

  it("skips guid, notetype and deck columns and reports a field left empty", () => {
    const r = parseAnki(fixture("anki-notes-with-meta.txt"));
    expect(pairs(r)).toEqual([
      ["la manzana", "the apple"],
      ["el agua", "water & drink"],
    ]);
    expect(r.rejected).toMatchObject([{ line: 9, reason: "empty-term" }]);
  });

  it("keeps markup as text with #html:false", () => {
    expect(pairs(parseAnki("#separator:comma\n#html:false\na <b>,x &amp; y\n"))).toEqual([
      ["a <b>", "x &amp; y"],
    ]);
  });

  it("reports an unclosed quote and a note with one field", () => {
    const r = parseAnki('#separator:tab\nsolo\n"open\tnever closed\n');
    expect(r.rejected.map((x) => [x.line, x.reason])).toEqual([
      [2, "no-separator"],
      [3, "unclosed-quote"],
    ]);
  });
});

describe("stripHtml", () => {
  it("drops tags, comments and scripts, decodes entities once", () => {
    expect(stripHtml("<div>a<br/>b</div><!-- c --><style>p{}</style>&lt;i&gt; &#233;&#xE9;")).toBe(
      "a b <i> éé",
    );
  });

  it("leaves a lone < and unknown entities alone", () => {
    expect(stripHtml("1 < 2 &bogus; &#0;")).toBe("1 < 2 &bogus; &#0;");
  });
});
