import type { ProgressVM, RichText, SelectVM } from "../core/fields.ts";
import { languagePair, percent } from "../core/format.ts";
import type { Route } from "../core/ports.ts";
import type { AccentChoice, CourseState, GradingChoice } from "./controller.ts";

export interface StudyLinkVM {
  label: string;
  route: Route;
  disabled: boolean;
}

export interface CourseGradingVM {
  title: string;
  description: string;
  mode: SelectVM<GradingChoice>;
  accents: SelectVM<AccentChoice>;
  error: string | null;
}

export interface CourseImportVM {
  title: string;
  help: RichText;
  fileLabel: string;
  pasteLabel: string;
  csv: string;
  placeholder: string;
  submitLabel: string;
  canSubmit: boolean;
  error: string | null;
  result: string | null;
}

export type CourseVM =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      title: string;
      languages: string;
      description: string | null;
      learn: StudyLinkVM;
      review: StudyLinkVM;
      unitsTitle: string;
      unitsEmpty: string | null;
      units: { id: string; label: string; count: string; progress: ProgressVM }[];
      /** Null for a shared (read-only) course. */
      editing: { grading: CourseGradingVM; import: CourseImportVM } | null;
      readOnlyNotice: string | null;
    };

export const CSV_EXAMPLE = `unit,term,definition,alternatives,notes
Greetings,hola,hello,,
Food,el ordenador,computer,la computadora|computadora,"Spain vs Latin America"`;

export function courseViewModel(state: CourseState): CourseVM {
  const { course } = state;
  if (course.status === "loading") return { kind: "loading" };
  if (course.status === "error") return { kind: "error", message: course.message };
  const c = course.data;
  const unlearned = c.itemCount - c.learnedCount;
  return {
    kind: "ready",
    title: c.title,
    languages: languagePair(c.targetLang, c.sourceLang),
    description: c.description || null,
    learn: {
      label: `Learn new words (${unlearned})`,
      route: { to: "study", courseId: c.id, mode: "learn" },
      disabled: unlearned === 0,
    },
    review: {
      label: `Review (${c.dueCount} due)`,
      route: { to: "study", courseId: c.id, mode: "review" },
      disabled: c.dueCount === 0,
    },
    unitsTitle: "Units",
    unitsEmpty: c.units.length === 0 ? "No words yet. Import a CSV below." : null,
    units: c.units.map((u) => ({
      id: u.id,
      label: `${u.position}. ${u.title}`,
      count: `${u.learnedCount} / ${u.itemCount}`,
      progress: { value: percent(u.learnedCount, u.itemCount), label: `${u.title} progress` },
    })),
    editing: c.editable
      ? {
          grading: {
            title: "Grading for this course",
            description: "Overrides your defaults in Settings.",
            mode: {
              id: "course-grading-mode",
              label: "Answer grading",
              value: c.gradingMode ?? "inherit",
              options: [
                { value: "inherit", label: "Use my setting" },
                { value: "lenient", label: "Lenient" },
                { value: "strict", label: "Strict" },
              ],
            },
            accents: {
              id: "course-accents",
              label: "Accents",
              value: c.accentSensitive === null ? "inherit" : c.accentSensitive ? "true" : "false",
              options: [
                { value: "inherit", label: "Use my setting" },
                { value: "true", label: "Required" },
                { value: "false", label: "Ignored" },
              ],
            },
            error: state.gradingError,
          },
          import: {
            title: "Import words",
            help: [
              "CSV with a header row: ",
              { code: "unit,term,definition,alternatives,notes" },
              ". Separate alternative answers with ",
              { code: "|" },
              ". Rows join existing units with the same name.",
            ],
            fileLabel: "File",
            pasteLabel: "Or paste",
            csv: state.csv,
            placeholder: CSV_EXAMPLE,
            submitLabel: state.importing ? "Importing…" : "Import",
            canSubmit: state.csv.trim() !== "" && !state.importing,
            error: state.importError,
            result: state.importResult
              ? `Imported ${state.importResult.itemsCreated} words (${state.importResult.unitsCreated} new units).`
              : null,
          },
        }
      : null,
    readOnlyNotice: c.editable
      ? null
      : "This is a shared course, so it is read-only. Create your own course to import words.",
  };
}
