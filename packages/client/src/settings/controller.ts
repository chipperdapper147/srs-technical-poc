/** Learner settings: observed `me`, each change saved immediately. */
import type { GradingMode, Me, UpdateMe } from "@app/shared";
import { queryKeys } from "../api/query-keys.ts";
import { type Controller, errorMessage } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { LOADING, observeQuery, type Remote } from "../core/remote.ts";
import { createStore } from "../core/store.ts";

export const NEW_ITEMS_MIN = 1;
export const NEW_ITEMS_MAX = 50;

export interface SettingsState {
  me: Remote<Me>;
  /** What is typed in "new words per session", until it is saved; null shows the saved value. */
  newItemsDraft: string | null;
  error: string | null;
}

export interface SettingsActions {
  setGradingMode(mode: GradingMode): void;
  setAccentSensitive(on: boolean): void;
  setNewItemsDraft(text: string): void;
  /** Save the draft if it is a valid, changed number (on blur). */
  commitNewItems(): void;
}

export function createSettingsController({
  api,
  queryClient,
}: ClientDeps): Controller<SettingsState, SettingsActions> {
  const store = createStore<SettingsState>({ me: LOADING, newItemsDraft: null, error: null });
  const patch = (p: Partial<SettingsState>) => store.set((s) => ({ ...s, ...p }));

  async function save(body: UpdateMe) {
    patch({ error: null });
    try {
      queryClient.setQueryData(queryKeys.me, await api.updateMe(body));
      return true;
    } catch (error) {
      patch({ error: errorMessage(error) });
      return false;
    }
  }

  return {
    store,
    actions: {
      setGradingMode: (gradingMode) => void save({ gradingMode }),
      setAccentSensitive: (accentSensitive) => void save({ accentSensitive }),
      setNewItemsDraft: (text) => patch({ newItemsDraft: text }),
      async commitNewItems() {
        const { me, newItemsDraft } = store.get();
        if (me.status !== "ready" || newItemsDraft === null) return;
        const n = Number(newItemsDraft);
        const valid = Number.isInteger(n) && n >= NEW_ITEMS_MIN && n <= NEW_ITEMS_MAX;
        if (!valid || n === me.data.newItemsPerSession) return;
        if (await save({ newItemsPerSession: n })) patch({ newItemsDraft: null });
      },
    },
    start: () =>
      observeQuery(queryClient, { queryKey: queryKeys.me, queryFn: () => api.me() }, (me) =>
        patch({ me }),
      ),
  };
}
