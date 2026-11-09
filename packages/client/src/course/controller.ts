/**
 * Course detail: the course (observed, so imports and grading changes show
 * up), its grading override, and CSV import.
 */
import type { CourseDetail, ImportResult, UpdateCourse } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export interface CourseParams {
  courseId: string;
}

/** A select value: a concrete setting, or "inherit" to use the learner's default. */
export type GradingChoice = "inherit" | "lenient" | "strict";
export type AccentChoice = "inherit" | "true" | "false";

export interface CourseState {
  courseId: string;
  course: Remote<CourseDetail>;
  gradingError: string | null;
  csv: string;
  importing: boolean;
  importError: string | null;
  importResult: ImportResult | null;
}

export interface CourseActions {
  setGradingMode(choice: GradingChoice): void;
  setAccents(choice: AccentChoice): void;
  setCsv(text: string): void;
  importCsv(): void;
}

export function createCourseController(
  { api, queryClient }: ClientDeps,
  { courseId }: CourseParams,
): Controller<CourseState, CourseActions> {
  const store = createStore<CourseState>({
    courseId,
    course: LOADING,
    gradingError: null,
    csv: "",
    importing: false,
    importError: null,
    importResult: null,
  });
  const patch = (p: Partial<CourseState>) => store.set((s) => ({ ...s, ...p }));

  async function updateGrading(body: UpdateCourse) {
    patch({ gradingError: null });
    try {
      queryClient.setQueryData(queryKeys.course(courseId), await api.updateCourse(courseId, body));
    } catch (error) {
      patch({ gradingError: errorMessage(error) });
    }
  }

  return {
    store,
    actions: {
      setGradingMode: (choice) =>
        void updateGrading({ gradingMode: choice === "inherit" ? null : choice }),
      setAccents: (choice) =>
        void updateGrading({ accentSensitive: choice === "inherit" ? null : choice === "true" }),
      setCsv: (csv) => patch({ csv }),
      async importCsv() {
        const { csv, importing } = store.get();
        if (!csv.trim() || importing) return;
        patch({ importing: true, importError: null });
        try {
          const importResult = await api.importCsv(courseId, csv);
          patch({ importing: false, importResult, csv: "" });
          // Counts changed: refetch the list and this course (its key is under "courses").
          await queryClient.invalidateQueries({ queryKey: queryKeys.courses });
        } catch (error) {
          patch({ importing: false, importError: errorMessage(error) });
        }
      },
    },
    start: () =>
      observeQuery(
        queryClient,
        { queryKey: queryKeys.course(courseId), queryFn: () => api.course(courseId) },
        (course) => patch({ course }),
      ),
  };
}
