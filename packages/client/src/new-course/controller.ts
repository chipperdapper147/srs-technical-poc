/** New course form: create, refresh the list, go to the new course. */
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { createStore } from "../core/store.ts";

export interface NewCourseForm {
  title: string;
  description: string;
  targetLang: string;
  sourceLang: string;
}

export interface NewCourseState {
  form: NewCourseForm;
  submitting: boolean;
  error: string | null;
}

export interface NewCourseActions {
  setField(field: keyof NewCourseForm, value: string): void;
  submit(): void;
}

export function createNewCourseController({
  api,
  queryClient,
  navigator,
}: ClientDeps): Controller<NewCourseState, NewCourseActions> {
  const store = createStore<NewCourseState>({
    form: { title: "", description: "", targetLang: "", sourceLang: "en" },
    submitting: false,
    error: null,
  });
  let active = false;
  return {
    store,
    actions: {
      setField: (field, value) => store.set((s) => ({ ...s, form: { ...s.form, [field]: value } })),
      async submit() {
        const { form, submitting } = store.get();
        if (submitting) return;
        store.set((s) => ({ ...s, submitting: true, error: null }));
        try {
          const course = await api.createCourse(form);
          await queryClient.invalidateQueries({ queryKey: queryKeys.courses });
          if (active) navigator.navigate({ to: "course", courseId: course.id });
        } catch (error) {
          store.set((s) => ({ ...s, submitting: false, error: errorMessage(error) }));
        }
      },
    },
    start() {
      active = true;
      return () => {
        active = false;
      };
    },
  };
}
