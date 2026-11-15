import { describe, expect, it } from "vitest";
import {
  editDistance,
  gradeAnswer,
  hintText,
  maxHints,
  normalizeAnswer,
  ratingForAnswer,
  ratingForVerdict,
} from "./grading.ts";

describe("normalizeAnswer", () => {
  it("folds case, punctuation and whitespace", () => {
    expect(normalizeAnswer("  ¡Hola,   Mundo! ", true)).toBe("hola mundo");
  });

  it("strips accents unless accent-sensitive", () => {
    expect(normalizeAnswer("Café", false)).toBe("cafe");
    expect(normalizeAnswer("Café", true)).toBe("café");
  });

  it("treats composed and decomposed forms alike", () => {
    expect(normalizeAnswer("café", true)).toBe(normalizeAnswer("café", true));
  });

  it("keeps non-Latin scripts intact", () => {
    expect(normalizeAnswer("ありがとう。", true)).toBe("ありがとう");
  });
});

describe("editDistance", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(editDistance("😀a", "😀b")).toBe(1);
  });
  it("handles empty strings", () => {
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("gradeAnswer", () => {
  const lenient = { mode: "lenient", accentSensitive: false } as const;
  const strict = { mode: "strict", accentSensitive: false } as const;

  it("accepts an exact answer", () => {
    expect(gradeAnswer("el gato", ["el gato"], lenient).verdict).toBe("exact");
  });

  it("accepts alternatives", () => {
    const r = gradeAnswer("la computadora", ["el ordenador", "la computadora"], lenient);
    expect(r).toMatchObject({ verdict: "exact", matched: "la computadora" });
  });

  it("treats a small typo as 'typo' in lenient mode", () => {
    expect(gradeAnswer("biblioteka", ["biblioteca"], lenient).verdict).toBe("typo");
  });

  it("rejects the same typo in strict mode", () => {
    expect(gradeAnswer("biblioteka", ["biblioteca"], strict).verdict).toBe("wrong");
  });

  it("allows no typos in very short words", () => {
    expect(gradeAnswer("sol", ["sal"], lenient).verdict).toBe("wrong");
  });

  it("ignores accents by default but not when accent-sensitive", () => {
    expect(gradeAnswer("cancion", ["canción"], lenient).verdict).toBe("exact");
    expect(gradeAnswer("cancion", ["canción"], { ...lenient, accentSensitive: true }).verdict).toBe(
      "typo",
    );
  });

  it("does not depend on the order of equally close alternatives", () => {
    // 1 edit from both; only the 4-letter one allows a typo.
    expect(gradeAnswer("abcx", ["abc", "abcd"]).verdict).toBe("typo");
    expect(gradeAnswer("abcx", ["abcd", "abc"]).verdict).toBe("typo");
  });

  it("marks empty input wrong", () => {
    expect(gradeAnswer("   ", ["agua"], lenient).verdict).toBe("wrong");
  });
});

describe("ratingForVerdict", () => {
  it("maps verdicts to FSRS ratings", () => {
    expect([
      ratingForVerdict("exact"),
      ratingForVerdict("typo"),
      ratingForVerdict("wrong"),
    ]).toEqual([3, 2, 1]);
  });
});

describe("hints", () => {
  it("count the term's letters, not its spaces", () => {
    expect(maxHints("la biblioteca")).toBe(12);
    expect(maxHints("  sol ")).toBe(3);
    expect(maxHints(normalizeDecomposed("canción"))).toBe(7);
  });

  it("reveal the term one letter at a time, spaces included", () => {
    expect(hintText("la biblioteca", 0)).toBe("");
    expect(hintText("la biblioteca", 1)).toBe("l");
    expect(hintText("la biblioteca", 2)).toBe("la");
    expect(hintText("la biblioteca", 3)).toBe("la b");
    expect(hintText("la biblioteca", 12)).toBe("la biblioteca");
    expect(hintText("la biblioteca", 99)).toBe("la biblioteca");
  });

  it("cap the rating at Hard, and at Again once the whole term is shown", () => {
    expect(ratingForAnswer("exact", 0, "hola")).toBe(3);
    expect(ratingForAnswer("exact", 1, "hola")).toBe(2);
    expect(ratingForAnswer("typo", 2, "hola")).toBe(2);
    expect(ratingForAnswer("wrong", 1, "hola")).toBe(1);
    expect(ratingForAnswer("exact", 4, "hola")).toBe(1);
    expect(ratingForAnswer("exact", 9, "hola")).toBe(1);
  });
});

function normalizeDecomposed(s: string) {
  return s.normalize("NFD");
}
