/** Display name for a BCP 47 language tag, e.g. "es" -> "Spanish". */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** "Spanish for English speakers". */
export function languagePair(targetLang: string, sourceLang: string): string {
  return `${languageName(targetLang)} for ${languageName(sourceLang)} speakers`;
}

/** Share of `part` in `whole` as 0–100, 0 when `whole` is 0. */
export function percent(part: number, whole: number): number {
  return whole ? (part / whole) * 100 : 0;
}
