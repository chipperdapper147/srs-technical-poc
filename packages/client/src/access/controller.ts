/**
 * The access-key screen (a stopgap until Auth0). It shows when the API
 * answers 401; saving a key refetches everything that failed.
 */
import type { AccessState } from "../core/access.ts";
import type { Controller } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { createStore } from "../core/store.ts";

export interface AccessScreenState extends AccessState {
  draft: string;
}

export interface AccessActions {
  setDraft(text: string): void;
  submit(): void;
  forget(): void;
}

export function createAccessController({
  access,
  queryClient,
}: ClientDeps): Controller<AccessScreenState, AccessActions> {
  const store = createStore<AccessScreenState>({ ...access.store.get(), draft: "" });
  const patch = (p: Partial<AccessScreenState>) => store.set((s) => ({ ...s, ...p }));
  // A refetch asked for while the rejected request is still in flight would
  // be merged into it (a query without data dedupes), so cancel first.
  async function refetchAll() {
    await queryClient.cancelQueries();
    await queryClient.invalidateQueries();
  }
  return {
    store,
    actions: {
      setDraft: (draft) => patch({ draft }),
      submit() {
        const key = store.get().draft.trim();
        if (!key) return;
        access.save(key);
        patch({ draft: "" });
        void refetchAll();
      },
      forget() {
        access.forget();
        // Drop data fetched with the key; the refetch then asks for a key again.
        void queryClient.resetQueries();
      },
    },
    start() {
      patch(access.store.get());
      return access.store.subscribe(() => patch(access.store.get()));
    },
  };
}
