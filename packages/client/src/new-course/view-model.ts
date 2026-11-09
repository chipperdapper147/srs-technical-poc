import type { RichText, TextFieldVM } from "../core/fields.ts";
import type { NewCourseForm, NewCourseState } from "./controller.ts";

export interface NewCourseVM {
  title: string;
  fields: Record<keyof NewCourseForm, TextFieldVM>;
  hint: RichText;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
}

export function newCourseViewModel({ form, submitting, error }: NewCourseState): NewCourseVM {
  return {
    title: "New course",
    fields: {
      title: { id: "title", label: "Title", value: form.title, required: true },
      description: { id: "description", label: "Description", value: form.description },
      targetLang: {
        id: "targetLang",
        label: "Learning (language code)",
        value: form.targetLang,
        placeholder: "es",
        required: true,
      },
      sourceLang: {
        id: "sourceLang",
        label: "From (language code)",
        value: form.sourceLang,
        placeholder: "en",
        required: true,
      },
    },
    hint: [
      "Use BCP 47 codes: ",
      { code: "es" },
      ", ",
      { code: "fr" },
      ", ",
      { code: "pt-BR" },
      ", ",
      { code: "ja" },
      "…",
    ],
    submitLabel: "Create course",
    submitting,
    error,
  };
}
