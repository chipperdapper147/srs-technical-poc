/**
 * A fake of a platform's auth SDK (`AuthSession`), standing in for Auth0 in
 * tests. Signing in with Google or email succeeds at once (no redirect);
 * the access token is whatever `token` holds now, so a test can rotate it,
 * and `failRenewal` makes the next silent renewal fail, as an expired
 * refresh token does.
 */
import type { AuthSession, AuthUser, LoginMethod } from "../core/auth.ts";

export interface FakeAuthSession extends AuthSession {
  /** The token the next request gets; change it to model a silent refresh. */
  token: string;
  /** Sign-ins, in order. */
  logins: LoginMethod[];
  logouts: number;
  /** The next `getAccessToken` throws (the session can't be renewed). */
  failRenewal(): void;
}

export function createFakeAuthSession({
  user = null,
  token = "token-1",
  restoreError,
  loginUser = { name: "Ada Lovelace" },
}: {
  /** Signed in on start as this user; null starts signed out. */
  user?: AuthUser | null;
  token?: string;
  /** `restore` throws this, as a failed sign-in redirect does. */
  restoreError?: string;
  /** Who a sign-in signs in. */
  loginUser?: AuthUser;
} = {}): FakeAuthSession {
  let current = user;
  let renewalFails = false;
  const session: FakeAuthSession = {
    token,
    logins: [],
    logouts: 0,
    failRenewal() {
      renewalFails = true;
    },
    async restore() {
      if (restoreError) throw new Error(restoreError);
      return current;
    },
    async getAccessToken() {
      if (!current) throw new Error("Login required");
      if (renewalFails) {
        renewalFails = false;
        current = null;
        throw new Error("Unknown or invalid refresh token.");
      }
      return session.token;
    },
    async login(method) {
      session.logins.push(method);
      current = loginUser;
      return current;
    },
    async logout() {
      session.logouts += 1;
      current = null;
    },
  };
  return session;
}
