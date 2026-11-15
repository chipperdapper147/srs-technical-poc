/**
 * Typed-answer grading. Pure and deterministic so the API (authoritative)
 * and the web client (instant feedback) can share it.
 */

export type GradingMode = "lenient" | "strict";

export interface GradingOptions {
  /** lenient: small typos are accepted as "typo"; strict: exact match only. */
  mode: GradingMode;
  /** When false, "é" and "e" are treated as equal. */
  accentSensitive: boolean;
}

export type Verdict = "exact" | "typo" | "wrong";

export interface GradeResult {
  verdict: Verdict;
  /** The accepted answer the input was closest to. */
  matched: string;
  distance: number;
}

export const DEFAULT_GRADING: GradingOptions = { mode: "lenient", accentSensitive: false };

/**
 * Normalize an answer for comparison: Unicode NFC, case-folded, punctuation
 * stripped, whitespace collapsed, and (optionally) diacritics removed.
 */
export function normalizeAnswer(input: string, accentSensitive: boolean): string {
  let s = input.normalize("NFC").toLocaleLowerCase();
  if (!accentSensitive) {
    s = s
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .normalize("NFC");
  }
  return s
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Levenshtein distance over Unicode code points. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const curr = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[y.length] ?? 0;
}

/** Typos allowed for an answer of this length in lenient mode. */
export function typoAllowance(answerLength: number): number {
  if (answerLength <= 3) return 0;
  if (answerLength <= 7) return 1;
  return 2;
}

/** Grade `input` against the expected answer and any alternatives. */
export function gradeAnswer(
  input: string,
  accepted: readonly string[],
  options: GradingOptions = DEFAULT_GRADING,
): GradeResult {
  const given = normalizeAnswer(input, options.accentSensitive);
  let best: GradeResult = { verdict: "wrong", matched: accepted[0] ?? "", distance: Infinity };
  if (given === "") return best;

  for (const candidate of accepted) {
    const target = normalizeAnswer(candidate, options.accentSensitive);
    if (target === "") continue;
    const distance = editDistance(given, target);
    if (distance === 0) return { verdict: "exact", matched: candidate, distance };
    const isTypo = options.mode === "lenient" && distance <= typoAllowance([...target].length);
    const verdict = isTypo ? "typo" : "wrong";
    // On a tie, a longer candidate may allow the typo a shorter one doesn't;
    // prefer it, so the verdict never depends on the order of alternatives.
    const tieButBetter = distance === best.distance && isTypo && best.verdict === "wrong";
    if (distance < best.distance || tieButBetter) {
      best = { verdict, matched: candidate, distance };
    }
  }
  return best;
}

/** FSRS rating (1 Again, 2 Hard, 3 Good, 4 Easy) for a verdict. */
export function ratingForVerdict(verdict: Verdict): 1 | 2 | 3 {
  switch (verdict) {
    case "exact":
      return 3;
    case "typo":
      return 2;
    case "wrong":
      return 1;
  }
}

// ---- Hints -------------------------------------------------------------------

/** The letters a hint can reveal: the term's characters other than whitespace. */
function hintLetters(term: string): string[] {
  return [...term.normalize("NFC").trim()].filter((ch) => !/\s/u.test(ch));
}

/** How many hints reveal the whole term (one letter each). */
export function maxHints(term: string): number {
  return hintLetters(term).length;
}

/**
 * What `hints` hints show of the term: its start, up to and including the
 * `hints`-th letter (whitespace between letters comes along). Empty for 0.
 */
export function hintText(term: string, hints: number): string {
  const chars = [...term.normalize("NFC").trim()];
  let letters = 0;
  for (let i = 0; i < chars.length; i++) {
    if (letters >= hints) return chars.slice(0, i).join("").trimEnd();
    if (!/\s/u.test(chars[i] ?? "")) letters += 1;
  }
  return chars.join("");
}

/**
 * FSRS rating for an answer given after `hints` hints at `term`. Any hint
 * caps it at Hard (2), even for an exact answer; revealing every letter makes
 * it Again (1). The API applies this; the client only previews it.
 */
export function ratingForAnswer(verdict: Verdict, hints: number, term: string): 1 | 2 | 3 {
  const rating = ratingForVerdict(verdict);
  if (hints <= 0) return rating;
  if (hints >= maxHints(term)) return 1;
  return rating === 3 ? 2 : rating;
}
