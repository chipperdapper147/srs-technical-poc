import type { GradingMode } from "@app/shared";
import type { SelectVM } from "../core/fields.ts";
import { NEW_ITEMS_MAX, NEW_ITEMS_MIN, type SettingsState } from "./controller.ts";

export type SettingsVM =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      title: string;
      description: string;
      grading: SelectVM<GradingMode>;
      accents: { id: string; label: string; help: string; checked: boolean };
      newItems: { id: string; label: string; value: string; min: number; max: number };
      error: string | null;
    };

export function settingsViewModel({ me, newItemsDraft, error }: SettingsState): SettingsVM {
  if (me.status === "loading") return { kind: "loading" };
  if (me.status === "error") return { kind: "error", message: me.message };
  const s = me.data;
  return {
    kind: "ready",
    title: "Settings",
    description: "Defaults for every course. A course can override grading on its own page.",
    grading: {
      id: "grading-mode",
      label: "Answer grading",
      value: s.gradingMode,
      options: [
        { value: "lenient", label: 'Lenient: small typos count as "almost" (rated Hard)' },
        { value: "strict", label: "Strict: exact match only" },
      ],
    },
    accents: {
      id: "accent-sensitive",
      label: "Require accents",
      help: 'When off, "cancion" is accepted for "canción".',
      checked: s.accentSensitive,
    },
    newItems: {
      id: "new-items",
      label: "New words per learn session",
      value: newItemsDraft ?? String(s.newItemsPerSession),
      min: NEW_ITEMS_MIN,
      max: NEW_ITEMS_MAX,
    },
    error,
  };
}
