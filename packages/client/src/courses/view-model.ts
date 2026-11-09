import type { ProgressVM } from "../core/fields.ts";
import { languagePair, percent } from "../core/format.ts";
import type { Route } from "../core/ports.ts";
import type { CoursesState } from "./controller.ts";

export interface CourseCardVM {
  id: string;
  title: string;
  languages: string;
  /** "3 due", or null when nothing is due. */
  due: string | null;
  progress: ProgressVM;
  learned: string;
  route: Route;
}

export interface CoursesVM {
  heading: string;
  newCourse: { label: string; route: Route };
  body:
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "empty"; message: string }
    | { kind: "list"; courses: CourseCardVM[] };
}

export function coursesViewModel({ courses }: CoursesState): CoursesVM {
  return {
    heading: "Courses",
    newCourse: { label: "New course", route: { to: "newCourse" } },
    body:
      courses.status === "loading"
        ? { kind: "loading" }
        : courses.status === "error"
          ? { kind: "error", message: courses.message }
          : courses.data.length === 0
            ? { kind: "empty", message: "No courses yet. Create one or run `pnpm db:seed`." }
            : {
                kind: "list",
                courses: courses.data.map((c) => ({
                  id: c.id,
                  title: c.title,
                  languages: languagePair(c.targetLang, c.sourceLang),
                  due: c.dueCount > 0 ? `${c.dueCount} due` : null,
                  progress: {
                    value: percent(c.learnedCount, c.itemCount),
                    label: `${c.title} progress`,
                  },
                  learned: `${c.learnedCount} / ${c.itemCount} words learned`,
                  route: { to: "course", courseId: c.id },
                })),
              },
  };
}
