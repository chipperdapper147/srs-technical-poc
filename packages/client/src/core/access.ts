/**
 * The API's access key (a stopgap until Auth0): kept by the platform, sent
 * with every request, and dropped when the API rejects it, which locks the
 * app until a key is entered again.
 */
import { createStore, type Store } from "./store.ts";

/** Where a platform keeps the key (localStorage on the web). */
export interface KeyStorage {
  read(): string | null;
  write(key: string | null): void;
}

export interface AccessState {
  /** The API rejected the request: show the access screen. */
  locked: boolean;
  /** The key we sent was rejected (not merely missing). */
  rejected: boolean;
  /** A key is stored. */
  hasKey: boolean;
}

export interface AccessGate {
  readonly store: Store<AccessState>;
  /** The `Authorization` header value, if a key is stored. */
  header(): string | undefined;
  /** The API answered 401. */
  unauthorized(): void;
  save(key: string): void;
  forget(): void;
}

export function createAccessGate(storage: KeyStorage): AccessGate {
  let key = storage.read();
  const store = createStore<AccessState>({ locked: false, rejected: false, hasKey: !!key });
  return {
    store,
    header: () => (key ? `Bearer ${key}` : undefined),
    unauthorized() {
      store.set({ locked: true, rejected: !!key, hasKey: false });
      key = null;
      storage.write(null);
    },
    save(next) {
      key = next.trim();
      storage.write(key);
      store.set({ locked: false, rejected: false, hasKey: true });
    },
    forget() {
      key = null;
      storage.write(null);
      store.set({ locked: false, rejected: false, hasKey: false });
    },
  };
}

/** For tests and platforms without storage. */
export function memoryKeyStorage(initial: string | null = null): KeyStorage {
  let value = initial;
  return {
    read: () => value,
    write(next) {
      value = next;
    },
  };
}
