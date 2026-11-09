/**
 * Property-based tests: invariants the grader must keep for every input, not
 * just the examples in grading.test.ts. A failure prints the smallest input
 * fast-check could shrink it to; add that input to grading.test.ts as well.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  editDistance,
  type GradingOptions,
  gradeAnswer,
  normalizeAnswer,
  typoAllowance,
  type Verdict,
} from "./grading.ts";

const options: fc.Arbitrary<GradingOptions> = fc.record({
  mode: fc.constantFrom("lenient", "strict"),
  accentSensitive: fc.boolean(),
});
/** Realistic answers: letters (with accents), spaces, apostrophes, hyphens. */
const answer = fc.stringMatching(/^[a-zA-ZáéíóúüñçàèßøåæœÁÉÍÓÚÑ' -]{1,24}$/);
const lowerWord = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-z]{${min},${max}}$`));
/** Two-letter alphabet: equally close alternatives (ties) come up often. */
const tiny = fc.stringMatching(/^[ab]{2,5}$/);
const rank: Record<Verdict, number> = { wrong: 0, typo: 1, exact: 2 };

describe("normalizeAnswer", () => {
  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (s, accents) => {
        const once = normalizeAnswer(s, accents);
        expect(normalizeAnswer(once, accents)).toBe(once);
      }),
    );
  });

  it("never leaves leading, trailing or repeated whitespace", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (s, accents) => {
        expect(normalizeAnswer(s, accents)).not.toMatch(/^\s|\s$|\s\s/u);
      }),
    );
  });
});

describe("editDistance", () => {
  it("is a metric: zero only for equal strings, symmetric, triangle inequality", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
        expect(editDistance(a, b) === 0).toBe(a === b);
        expect(editDistance(a, b)).toBe(editDistance(b, a));
        expect(editDistance(a, c)).toBeLessThanOrEqual(editDistance(a, b) + editDistance(b, c));
      }),
    );
  });

  it("is bounded by the longer string's length in code points", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), fc.string({ unit: "grapheme" }), (a, b) => {
        expect(editDistance(a, b)).toBeLessThanOrEqual(Math.max([...a].length, [...b].length));
      }),
    );
  });
});

describe("gradeAnswer", () => {
  it("grades every answer exact against itself, in every mode", () => {
    fc.assert(
      fc.property(answer, options, (a, opts) => {
        fc.pre(normalizeAnswer(a, opts.accentSensitive) !== "");
        expect(gradeAnswer(a, [a], opts).verdict).toBe("exact");
      }),
    );
  });

  it("ignores case, surrounding whitespace and punctuation", () => {
    fc.assert(
      fc.property(lowerWord(1, 20), options, (w, opts) => {
        expect(gradeAnswer(`  ${w.toUpperCase()}!? `, [w], opts).verdict).toBe("exact");
      }),
    );
  });

  it("ignores accents unless accent-sensitive", () => {
    fc.assert(
      fc.property(lowerWord(1, 20), (w) => {
        const accented = [...w].map((ch) => `${ch}́`).join(""); // combining acute
        expect(gradeAnswer(accented, [w]).verdict).toBe("exact");
        const strict = { mode: "strict", accentSensitive: true } as const;
        expect(gradeAnswer(accented, [w], strict).verdict).toBe("wrong");
      }),
    );
  });

  it("never grades a typo in strict mode", () => {
    fc.assert(
      fc.property(answer, fc.array(answer, { minLength: 1, maxLength: 3 }), (input, accepted) => {
        const strict = { mode: "strict", accentSensitive: false } as const;
        expect(gradeAnswer(input, accepted, strict).verdict).not.toBe("typo");
      }),
    );
  });

  it("accepts one wrong letter as a typo in words of four letters or more (lenient)", () => {
    fc.assert(
      fc.property(
        lowerWord(4, 20),
        fc.nat(),
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
        (w, i, ch) => {
          const at = i % w.length;
          fc.pre(w[at] !== ch);
          const typo = w.slice(0, at) + ch + w.slice(at + 1);
          expect(gradeAnswer(typo, [w]).verdict).toBe("typo");
        },
      ),
    );
  });

  it("only calls it a typo within the length-based allowance", () => {
    fc.assert(
      fc.property(answer, answer, (input, target) => {
        const r = gradeAnswer(input, [target]);
        if (r.verdict === "typo") {
          const len = [...normalizeAnswer(target, false)].length;
          expect(r.distance).toBeGreaterThan(0);
          expect(r.distance).toBeLessThanOrEqual(typoAllowance(len));
        }
      }),
    );
  });

  it("never grades worse when more alternatives are accepted", () => {
    fc.assert(
      fc.property(
        answer,
        answer,
        fc.array(answer, { maxLength: 3 }),
        options,
        (input, a, more, opts) => {
          const one = gradeAnswer(input, [a], opts).verdict;
          const many = gradeAnswer(input, [a, ...more], opts).verdict;
          expect(rank[many]).toBeGreaterThanOrEqual(rank[one]);
        },
      ),
    );
  });

  it("does not depend on the order of alternatives", () => {
    fc.assert(
      fc.property(
        tiny,
        fc.array(tiny, { minLength: 1, maxLength: 4 }),
        options,
        (input, acc, opts) => {
          const forward = gradeAnswer(input, acc, opts).verdict;
          const reversed = gradeAnswer(input, [...acc].reverse(), opts).verdict;
          expect(reversed).toBe(forward);
        },
      ),
      { numRuns: 2000 }, // ties are rare; this finds the known one reliably
    );
  });
});
