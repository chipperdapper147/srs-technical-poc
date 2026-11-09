import type { ClientDeps } from "./ports.ts";
import type { Store } from "./store.ts";

/**
 * A screen's controller: state in a store, intents as methods. `start()`
 * begins loading and subscriptions and returns the function that stops
 * them; it may be called again after that (React StrictMode does).
 */
export interface Controller<S, A> {
  readonly store: Store<S>;
  readonly actions: A;
  start(): () => void;
}

export type ControllerFactory<P, S, A> = (deps: ClientDeps, params: P) => Controller<S, A>;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
