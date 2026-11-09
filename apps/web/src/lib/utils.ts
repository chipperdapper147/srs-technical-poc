export { cn } from "cn";

/** Display name for a BCP 47 language tag, e.g. "es" -> "Spanish". */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
