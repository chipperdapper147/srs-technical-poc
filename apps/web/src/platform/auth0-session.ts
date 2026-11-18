/**
 * The web's `AuthSession` (see @app/client's core/auth.ts) over
 * `@auth0/auth0-spa-js`: Universal Login by redirect, access tokens for the
 * API's audience, renewed with rotating refresh tokens. The SDK is loaded
 * only in the browser, on first use, so server rendering never touches it.
 */
import type { AuthSession, AuthUser, LoginMethod } from "@app/client";
import type { Auth0Client } from "@auth0/auth0-spa-js";

export interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
}

/**
 * The tenant, from the build's `NEXT_PUBLIC_AUTH0_*` variables. Null when
 * any is missing (local dev, e2e): the app then uses the dev auth port.
 */
export function auth0Config(): Auth0Config | null {
  // Spelled out in full: Next inlines only literal `process.env.NEXT_PUBLIC_*` reads.
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
  return domain && clientId && audience ? { domain, clientId, audience } : null;
}

/** Auth0's connection per sign-in button; none shows every way in (email and password first). */
const CONNECTIONS: Record<LoginMethod, string | undefined> = {
  google: "google-oauth2",
  email: undefined,
};

interface AppState {
  /** Where the learner was when they signed in. */
  returnTo?: string;
}

function isRedirectCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("state") && (params.has("code") || params.has("error"));
}

export function createAuth0Session(
  config: Auth0Config,
  {
    replace,
  }: {
    /** Replace the current URL without a reload (drops the callback's code and state). */
    replace: (href: string) => void;
  },
): AuthSession {
  let client: Promise<Auth0Client> | null = null;
  const auth0 = () => {
    client ??= import("@auth0/auth0-spa-js").then(({ createAuth0Client }) =>
      createAuth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: {
          audience: config.audience,
          redirect_uri: window.location.origin,
        },
        // Refresh tokens rotate on every use. Kept in localStorage so a reload
        // stays signed in without third-party cookies (decisions log, 2026-11-18).
        useRefreshTokens: true,
        cacheLocation: "localstorage",
      }),
    );
    return client;
  };

  return {
    async restore(): Promise<AuthUser | null> {
      const sdk = await auth0();
      if (isRedirectCallback()) {
        try {
          const { appState } = await sdk.handleRedirectCallback<AppState>();
          replace(appState?.returnTo ?? "/");
        } catch (error) {
          replace(window.location.pathname);
          throw new Error(
            `Couldn't sign in: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const user = await sdk.getUser();
      if (!user) return null;
      return { name: user.name || user.email || "Learner" };
    },
    async getAccessToken() {
      return (await (await auth0()).getTokenSilently()) ?? null;
    },
    async login(method) {
      await (await auth0()).loginWithRedirect<AppState>({
        appState: { returnTo: `${window.location.pathname}${window.location.search}` },
        authorizationParams: { connection: CONNECTIONS[method] },
      });
      // The page is leaving for Auth0; it comes back through `restore`.
      return null;
    },
    async logout() {
      await (await auth0()).logout({ logoutParams: { returnTo: window.location.origin } });
    },
  };
}
