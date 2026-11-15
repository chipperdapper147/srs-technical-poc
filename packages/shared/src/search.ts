/**
 * Word search within a course. It compares text the way lenient grading
 * does (`normalizeAnswer` without accents), so "cancion" finds "canción" and
 * "D.C." finds "Washington, D.C.". Pure, so the API's `?q=` and the client's
 * as-you-type filter agree.
 */
import { normalizeAnswer } from "./grading.ts";

export interface SearchableItem {
  term: string;
  definition: string;
  alternatives: readonly string[];
}

/** Search text in comparable form: case, accents, punctuation and extra spaces ignored. */
export function normalizeSearch(text: string): string {
  return normalizeAnswer(text, false);
}

/** True when the term, definition or an alternative contains the query. An empty query matches. */
export function itemMatchesSearch(item: SearchableItem, query: string): boolean {
  const q = normalizeSearch(query);
  if (q === "") return true;
  return [item.term, item.definition, ...item.alternatives].some((field) =>
    normalizeSearch(field).includes(q),
  );
}
