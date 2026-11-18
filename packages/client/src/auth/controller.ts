/**
 * Signing in and out, for the shell and its sign-in screen. State comes from
 * the auth port (core/auth.ts); this adds what is under way, and drops the
 * cached data whenever the session ends, so the next account never sees it.
 */
import type { AuthState, LoginMethod } from "../core/auth.ts";
import type { Controller } from "../core/controller.ts";
import type { ClientDeps } from "../core/ports.ts";
import { createStore } from "../core/store.ts";

export interface AuthScreenState {
  auth: AuthState;
  /** Sign-in or sign-out is under way (with Auth0, the page is about to leave). */
  pending: boolean;
}

export interface AuthActions {
  signIn(method: LoginMethod): void;
  signOut(): void;
}

export function createAuthController({
  auth,
  queryClient,
}: ClientDeps): Controller<AuthScreenState, AuthActions> {
  const store = createStore<AuthScreenState>({ auth: auth.store.get(), pending: false });
  const patch = (p: Partial<AuthScreenState>) => store.set((s) => ({ ...s, ...p }));

  async function run(task: () => Promise<void>) {
    if (store.get().pending) return;
    patch({ pending: true });
    try {
      await task();
    } finally {
      patch({ pending: false });
    }
  }

  return {
    store,
    actions: {
      signIn: (method) => void run(() => auth.login(method)),
      signOut: () => void run(() => auth.logout()),
    },
    start() {
      const sync = () => {
        const next = auth.store.get();
        if (store.get().auth.status === "signedIn" && next.status !== "signedIn") {
          queryClient.clear();
        }
        patch({ auth: next });
      };
      sync();
      const unsubscribe = auth.store.subscribe(sync);
      void auth.start();
      return unsubscribe;
    },
  };
}
