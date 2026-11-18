import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth0Config, createAuth0Session } from "./auth0-session";

const sdk = {
  handleRedirectCallback: vi.fn(),
  getUser: vi.fn(),
  getTokenSilently: vi.fn(),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
};
const createAuth0Client = vi.fn(async (_options: unknown) => sdk);
vi.mock("@auth0/auth0-spa-js", () => ({ createAuth0Client }));

const config = { domain: "tenant.test", clientId: "client", audience: "https://api.test" };

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.unstubAllEnvs());

describe("auth0Config", () => {
  it("needs all three NEXT_PUBLIC_AUTH0_* variables", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH0_DOMAIN", "tenant.test");
    vi.stubEnv("NEXT_PUBLIC_AUTH0_CLIENT_ID", "client");
    expect(auth0Config()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_AUTH0_AUDIENCE", "https://api.test");
    expect(auth0Config()).toEqual(config);
  });
});

describe("createAuth0Session", () => {
  it("asks for the API's audience with rotating refresh tokens, only when first used", async () => {
    const session = createAuth0Session(config, { replace: vi.fn() });
    expect(createAuth0Client).not.toHaveBeenCalled();
    sdk.getUser.mockResolvedValue(undefined);
    expect(await session.restore()).toBeNull();
    expect(createAuth0Client).toHaveBeenCalledWith({
      domain: "tenant.test",
      clientId: "client",
      authorizationParams: { audience: "https://api.test", redirect_uri: window.location.origin },
      useRefreshTokens: true,
      cacheLocation: "localstorage",
    });
    expect(sdk.handleRedirectCallback).not.toHaveBeenCalled();
  });

  it("finishes a sign-in redirect and goes back where the learner was", async () => {
    window.history.replaceState(null, "", "/?code=abc&state=xyz");
    sdk.handleRedirectCallback.mockResolvedValue({ appState: { returnTo: "/stats" } });
    sdk.getUser.mockResolvedValue({ name: "Ada", email: "ada@example.com" });
    const replace = vi.fn();
    expect(await createAuth0Session(config, { replace }).restore()).toEqual({ name: "Ada" });
    expect(replace).toHaveBeenCalledWith("/stats");
  });

  it("reports a refused sign-in, such as an account not on the invite list", async () => {
    window.history.replaceState(null, "", "/?error=access_denied&state=xyz");
    sdk.handleRedirectCallback.mockRejectedValue(new Error("Not invited."));
    const replace = vi.fn();
    await expect(createAuth0Session(config, { replace }).restore()).rejects.toThrow(
      "Couldn't sign in: Not invited.",
    );
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("names the user from the profile, else the email", async () => {
    sdk.getUser.mockResolvedValue({ email: "ada@example.com" });
    expect(await createAuth0Session(config, { replace: vi.fn() }).restore()).toEqual({
      name: "ada@example.com",
    });
  });

  it("signs in with Google directly, or on Auth0's page for email and password", async () => {
    window.history.replaceState(null, "", "/courses?x=1");
    const session = createAuth0Session(config, { replace: vi.fn() });
    expect(await session.login("google")).toBeNull();
    expect(sdk.loginWithRedirect).toHaveBeenLastCalledWith({
      appState: { returnTo: "/courses?x=1" },
      authorizationParams: { connection: "google-oauth2" },
    });
    await session.login("email");
    expect(sdk.loginWithRedirect).toHaveBeenLastCalledWith({
      appState: { returnTo: "/courses?x=1" },
      authorizationParams: { connection: undefined },
    });
  });

  it("gets tokens silently and signs out back to the app", async () => {
    sdk.getTokenSilently.mockResolvedValue("access-token");
    const session = createAuth0Session(config, { replace: vi.fn() });
    expect(await session.getAccessToken()).toBe("access-token");
    await session.logout();
    expect(sdk.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });
});
