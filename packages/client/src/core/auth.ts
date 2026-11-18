/**
 * The auth port: who is signed in, the access token every API request
 * carries, and signing in and out. The logic lives here, platform-free; a
 * platform supplies an `AuthSession`, a thin adapter over its SDK
 * (`@auth0/auth0-spa-js` on the web, later react-native-auth0 on mobile).
 * Without Auth0 (local dev, tests, e2e) the dev session stands in: signed
 * in from the start, no token, and the API in dev mode picks the user.
 */
import { createStore, type Store } from "./store.ts";

/** The two ways in. Both go through Auth0 Universal Login (a redirect). */
export type LoginMethod = "google" | "email";

export interface AuthUser {
  /** What the shell shows: the profile name, else the email. */
  name: string;
}

export type AuthState =
  /** Restoring the session (or finishing a sign-in redirect). */
  | { status: "loading" }
  | { status: "signedIn"; user: AuthUser }
  /** `error`: why the last sign-in failed or the session ended, if it did. */
  | { status: "signedOut"; error: string | null };

/** What a platform's auth SDK provides. */
export interface AuthSession {
  /**
   * Finish a sign-in redirect if this start is one, then say who is signed
   * in (null: nobody). Throws with a readable message when sign-in failed.
   */
  restore(): Promise<AuthUser | null>;
  /**
   * The access token for the API, renewed silently when it is about to
   * expire (rotating refresh tokens). Null when the API needs none (dev).
   * Throws when the session can't be renewed.
   */
  getAccessToken(): Promise<string | null>;
  /** Start signing in. Auth0 leaves the app; the dev session signs in at once. */
  login(method: LoginMethod): Promise<AuthUser | null>;
  /** Sign out. Auth0 leaves the app (and its session); the dev session just forgets. */
  logout(): Promise<void>;
}

export interface AuthPort {
  readonly store: Store<AuthState>;
  /** Restore the session, once; later calls return the same promise. */
  start(): Promise<void>;
  /** The `Authorization` header value for the next request, if any. */
  authorization(): Promise<string | undefined>;
  /** The API answered 401: the session is gone, so sign in again. */
  unauthorized(): void;
  login(method: LoginMethod): Promise<void>;
  logout(): Promise<void>;
}

export const SESSION_ENDED = "Your session has ended. Sign in again.";

export function createAuth(
  session: AuthSession,
  { initial = { status: "loading" } }: { initial?: AuthState } = {},
): AuthPort {
  const store = createStore<AuthState>(initial);
  let started: Promise<void> | null = null;
  const signedOut = (error: string | null) => store.set({ status: "signedOut", error });

  const port: AuthPort = {
    store,
    start() {
      started ??= session.restore().then(
        (user) =>
          store.set(user ? { status: "signedIn", user } : { status: "signedOut", error: null }),
        (error: unknown) => signedOut(error instanceof Error ? error.message : String(error)),
      );
      return started;
    },
    async authorization() {
      await port.start();
      if (store.get().status !== "signedIn") return undefined;
      try {
        const token = await session.getAccessToken();
        return token ? `Bearer ${token}` : undefined;
      } catch {
        signedOut(SESSION_ENDED);
        return undefined;
      }
    },
    unauthorized() {
      if (store.get().status === "signedIn") signedOut(SESSION_ENDED);
    },
    async login(method) {
      try {
        const user = await session.login(method);
        if (user) store.set({ status: "signedIn", user });
      } catch (error) {
        signedOut(error instanceof Error ? error.message : String(error));
      }
    },
    async logout() {
      await session.logout();
      signedOut(null);
    },
  };
  return port;
}

export const DEV_USER: AuthUser = { name: "Local learner" };

/**
 * No Auth0: signed in from the start as the API's dev user, no token. Sign
 * out and in again work in memory (a reload signs in again), so the
 * signed-out screen can be tried without a tenant.
 */
export function createDevSession(user: AuthUser = DEV_USER): AuthSession {
  let signedIn = true;
  return {
    restore: async () => (signedIn ? user : null),
    getAccessToken: async () => null,
    login: async () => {
      signedIn = true;
      return user;
    },
    logout: async () => {
      signedIn = false;
    },
  };
}

/** The dev auth port: already signed in, so screens render on the first pass. */
export function createDevAuth(user: AuthUser = DEV_USER): AuthPort {
  return createAuth(createDevSession(user), { initial: { status: "signedIn", user } });
}
