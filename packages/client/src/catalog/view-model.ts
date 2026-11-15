import type { SelectVM, TextFieldVM } from "../core/fields.ts";
import { languageName, languagePair } from "../core/format.ts";
import type { Route } from "../core/ports.ts";
import type { CatalogState } from "./controller.ts";

export interface CatalogCardVM {
  id: string;
  title: string;
  description: string | null;
  languages: string;
  /** "20 words". */
  words: string;
  /** The shared course's page, to look before copying. */
  route: Route;
  copy: { label: string; disabled: boolean; error: string | null };
}

export interface CatalogVM {
  heading: string;
  intro: string;
  search: { field: TextFieldVM; submitLabel: string };
  language: SelectVM;
  body:
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "empty"; message: string }
    | { kind: "list"; count: string; courses: CatalogCardVM[] };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function catalogViewModel(state: CatalogState): CatalogVM {
  const { catalog, copying, copyError } = state;
  const langs = catalog.status === "ready" ? catalog.data.targetLangs : [];
  const options = [...new Set([...langs, ...(state.targetLang ? [state.targetLang] : [])])]
    .map((tag) => ({ value: tag, label: languageName(tag) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const filtered = state.search.trim() !== "" || state.targetLang !== "";
  return {
    heading: "Course catalog",
    intro: "Shared courses anyone can study. Copy one to get your own version to change.",
    search: {
      field: {
        id: "catalog-search",
        label: "Search",
        value: state.query,
        placeholder: "Title or description",
      },
      submitLabel: "Search",
    },
    language: {
      id: "catalog-language",
      label: "Language",
      value: state.targetLang,
      options: [{ value: "", label: "All languages" }, ...options],
    },
    body:
      catalog.status === "loading"
        ? { kind: "loading" }
        : catalog.status === "error"
          ? { kind: "error", message: catalog.message }
          : catalog.data.courses.length === 0
            ? {
                kind: "empty",
                message: filtered
                  ? "No courses match. Try another search or language."
                  : "No shared courses yet.",
              }
            : {
                kind: "list",
                count: plural(catalog.data.courses.length, "course", "courses"),
                courses: catalog.data.courses.map((c) => ({
                  id: c.id,
                  title: c.title,
                  description: c.description || null,
                  languages: languagePair(c.targetLang, c.sourceLang),
                  words: plural(c.itemCount, "word", "words"),
                  route: { to: "course", courseId: c.id },
                  copy: {
                    label: copying === c.id ? "Copying…" : "Copy to my courses",
                    disabled: copying !== null,
                    error: copyError?.courseId === c.id ? copyError.message : null,
                  },
                })),
              },
  };
}
