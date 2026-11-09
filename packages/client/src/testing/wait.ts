import type { Store } from "../core/store.ts";

/** Resolve with the first state matching `predicate` (now or after a change). */
export function waitForState<S, T extends S = S>(
  store: Store<S>,
  predicate: ((state: S) => state is T) | ((state: S) => boolean),
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const state = store.get();
      if (!predicate(state)) return false;
      unsubscribe();
      clearTimeout(timer);
      resolve(state as T);
      return true;
    };
    const unsubscribe = store.subscribe(check);
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`waitForState timed out; last state: ${JSON.stringify(store.get())}`));
    }, timeoutMs);
    check();
  });
}
