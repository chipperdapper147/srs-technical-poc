import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "./grading.ts";
import { itemMatchesSearch, normalizeSearch } from "./search.ts";

const item = {
  term: "la canción",
  definition: "Song",
  alternatives: ["canción", "Washington, D.C."],
};

describe("itemMatchesSearch", () => {
  it("matches term, definition and alternatives by substring", () => {
    expect(itemMatchesSearch(item, "canc")).toBe(true);
    expect(itemMatchesSearch(item, "son")).toBe(true);
    expect(itemMatchesSearch(item, "washington")).toBe(true);
    expect(itemMatchesSearch(item, "library")).toBe(false);
  });

  it("ignores case, accents and punctuation, as lenient grading does", () => {
    expect(itemMatchesSearch(item, "CANCION")).toBe(true);
    expect(itemMatchesSearch(item, "song!")).toBe(true);
    expect(itemMatchesSearch(item, "d.c.")).toBe(true);
    expect(itemMatchesSearch(item, "  la   cancion ")).toBe(true);
  });

  it("matches everything on an empty or punctuation-only query", () => {
    expect(itemMatchesSearch(item, "")).toBe(true);
    expect(itemMatchesSearch(item, " ?! ")).toBe(true);
  });

  it("does not search notes", () => {
    expect(itemMatchesSearch({ ...item, notes: "spain" } as typeof item, "spain")).toBe(false);
  });
});

describe("normalizeSearch", () => {
  it("is grading's accent-insensitive normalisation", () => {
    for (const text of ["Café", "¡Hola, Mundo!", "Ha Nội", "ありがとう。"]) {
      expect(normalizeSearch(text)).toBe(normalizeAnswer(text, false));
    }
  });
});
