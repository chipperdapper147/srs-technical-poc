/**
 * Auth: `jwt` mode verifies Auth0 access tokens, `dev` mode is the stub.
 * Tokens are signed here with a generated RS256 key and checked against an
 * in-process key set, so no test touches the network or the real tenant.
 */
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.ts";
import { CLAIM_NAMESPACE, DEV_USER_SUB } from "../src/plugins/auth.ts";
import { setupTestApp } from "./helpers.ts";

const DOMAIN = "tenant.test.auth0.com";
const ISSUER = `https://${DOMAIN}/`;
const AUDIENCE = "https://api.test";
const OWNER_EMAIL = "owner@example.com";

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let signingKey: Key;
let otherKey: Key;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

interface TokenOptions {
  sub?: string;
  name?: string;
  email?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  key?: Key;
  claims?: JWTPayload;
}

async function token({
  sub = "google-oauth2|123",
  name,
  email,
  issuer = ISSUER,
  audience = AUDIENCE,
  expiresIn = "5m",
  key,
  claims = {},
}: TokenOptions = {}) {
  const payload: JWTPayload = { ...claims };
  if (name !== undefined) payload[`${CLAIM_NAMESPACE}name`] = name;
  if (email !== undefined) payload[`${CLAIM_NAMESPACE}email`] = email;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key ?? signingKey);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("the environment", () => {
  const base = { DATABASE_URL: "postgres://u:p@localhost:5432/srs" };

  it("defaults to dev mode off Vercel", () => {
    expect(loadEnv(base).AUTH_MODE).toBe("dev");
  });

  it("needs the tenant and audience in jwt mode", () => {
    expect(() => loadEnv({ ...base, AUTH_MODE: "jwt" })).toThrow(/AUTH0_DOMAIN and AUTH0_AUDIENCE/);
    expect(() => loadEnv({ ...base, AUTH_MODE: "jwt", AUTH0_DOMAIN: DOMAIN })).toThrow(
      /AUTH0_DOMAIN and AUTH0_AUDIENCE/,
    );
    const env = loadEnv({
      ...base,
      AUTH_MODE: "jwt",
      AUTH0_DOMAIN: DOMAIN,
      AUTH0_AUDIENCE: AUDIENCE,
    });
    expect(env).toMatchObject({ AUTH_MODE: "jwt", AUTH0_DOMAIN: DOMAIN, AUTH0_AUDIENCE: AUDIENCE });
  });

  it("takes the domain as a host name only", () => {
    expect(() =>
      loadEnv({ ...base, AUTH_MODE: "jwt", AUTH0_DOMAIN: ISSUER, AUTH0_AUDIENCE: AUDIENCE }),
    ).toThrow(/host name/);
  });

  it("refuses dev mode on every Vercel deploy", () => {
    for (const VERCEL_ENV of ["production", "preview", "development"]) {
      expect(() => loadEnv({ ...base, VERCEL_ENV })).toThrow(/AUTH_MODE=jwt is required on Vercel/);
    }
    const jwt = { AUTH_MODE: "jwt", AUTH0_DOMAIN: DOMAIN, AUTH0_AUDIENCE: AUDIENCE };
    expect(loadEnv({ ...base, ...jwt, VERCEL_ENV: "production" }).AUTH_MODE).toBe("jwt");
  });

  it("takes an optional legacy owner email", () => {
    expect(loadEnv(base).AUTH_LEGACY_OWNER_EMAIL).toBeUndefined();
    expect(() => loadEnv({ ...base, AUTH_LEGACY_OWNER_EMAIL: "not an email" })).toThrow();
  });
});

describe("jwt mode", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp({ jwt: { domain: DOMAIN, audience: AUDIENCE, keys } });
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const users = () =>
    ctx.db.selectFrom("users").select(["authSub", "displayName"]).orderBy("authSub").execute();

  it("resolves the user from a valid token", async () => {
    const t = await token({ sub: "auth0|alice", name: "Alice" });
    const res = await ctx.app.inject({ url: "/me", headers: bearer(t) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ displayName: "Alice" });
    const again = await ctx.app.inject({ url: "/me", headers: bearer(t) });
    expect(again.json().id).toBe(res.json().id);
  });

  it("creates the user on first sign-in, named from the claim, then the email, then Learner", async () => {
    await ctx.app.inject({ url: "/me", headers: bearer(await token({ sub: "a", name: "Ana" })) });
    await ctx.app.inject({
      url: "/me",
      headers: bearer(await token({ sub: "b", email: "bo@example.com" })),
    });
    await ctx.app.inject({ url: "/me", headers: bearer(await token({ sub: "c", name: "  " })) });
    expect(await users()).toEqual([
      { authSub: "a", displayName: "Ana" },
      { authSub: "b", displayName: "bo@example.com" },
      { authSub: "c", displayName: "Learner" },
    ]);
  });

  it("keeps a user's own display name on later sign-ins", async () => {
    const first = await token({ sub: "auth0|alice", name: "Alice" });
    await ctx.app.inject({
      method: "PATCH",
      url: "/me",
      headers: bearer(first),
      payload: { displayName: "Ali" },
    });
    const later = await token({ sub: "auth0|alice", name: "Alice Example" });
    expect((await ctx.app.inject({ url: "/me", headers: bearer(later) })).json()).toMatchObject({
      displayName: "Ali",
    });
  });

  it("answers 401 without creating a user when the token is missing or invalid", async () => {
    const cases: [string, Record<string, string>, RegExp][] = [
      ["missing", {}, /no access token/],
      ["not a bearer", { authorization: "Basic abc" }, /no access token/],
      ["malformed", bearer("not-a-jwt"), /Invalid access token/],
      ["wrong audience", bearer(await token({ audience: "https://other" })), /Invalid/],
      ["wrong issuer", bearer(await token({ issuer: "https://evil.example/" })), /Invalid/],
      [
        "expired",
        bearer(await token({ expiresIn: Math.floor(Date.now() / 1000) - 60 })),
        /expired/,
      ],
      ["bad signature", bearer(await token({ key: otherKey })), /Invalid/],
      ["dev header only", { "x-dev-user": DEV_USER_SUB }, /no access token/],
    ];
    for (const [name, headers, message] of cases) {
      const res = await ctx.app.inject({ url: "/me", headers });
      expect(res.statusCode, name).toBe(401);
      expect(res.json().message, name).toMatch(message);
    }
    expect(await users()).toEqual([]);
  });

  it("rejects a token signed with another algorithm", async () => {
    const hs = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: "test-key" })
      .setSubject("x")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("a shared secret anyone could guess"));
    expect((await ctx.app.inject({ url: "/me", headers: bearer(hs) })).statusCode).toBe(401);
  });

  it("keeps /health, /docs and CORS preflights open", async () => {
    expect((await ctx.app.inject("/health")).statusCode).toBe(200);
    expect((await ctx.app.inject("/docs/json")).statusCode).toBe(200);
    const preflight = await ctx.app.inject({
      method: "OPTIONS",
      url: "/me",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-headers"]).toMatch(/authorization/i);
  });

  it("documents the bearer scheme in the OpenAPI document", async () => {
    const doc = (await ctx.app.inject("/docs/json")).json();
    expect(doc.components.securitySchemes.auth0).toMatchObject({ type: "http", scheme: "bearer" });
    expect(doc.security).toEqual([{ auth0: [] }]);
  });
});

describe("the legacy owner claim", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp({
      jwt: { domain: DOMAIN, audience: AUDIENCE, keys, legacyOwnerEmail: OWNER_EMAIL },
    });
  });
  beforeEach(async () => {
    await ctx.reset();
    await ctx.db
      .insertInto("users")
      .values({ authSub: DEV_USER_SUB, displayName: "Local learner", newItemsPerSession: 12 })
      .execute();
  });
  afterAll(() => ctx.close());

  const devUser = () =>
    ctx.db.selectFrom("users").selectAll().where("authSub", "=", DEV_USER_SUB).executeTakeFirst();
  const userBySub = (sub: string) =>
    ctx.db.selectFrom("users").selectAll().where("authSub", "=", sub).executeTakeFirst();

  it("hands dev|local to the configured email's first sign-in, once", async () => {
    const before = await devUser();
    const owner = await token({
      sub: "google-oauth2|owner",
      name: "Owner",
      email: "Owner@Example.com",
    });
    const res = await ctx.app.inject({ url: "/me", headers: bearer(owner) });
    expect(res.json()).toMatchObject({
      id: before?.id,
      displayName: "Owner",
      newItemsPerSession: 12,
    });
    expect(await devUser()).toBeUndefined();
    expect((await userBySub("google-oauth2|owner"))?.id).toBe(before?.id);

    // A second account with the same email (say, email and password) gets its own user.
    const other = await token({ sub: "auth0|owner", email: OWNER_EMAIL });
    const second = await ctx.app.inject({ url: "/me", headers: bearer(other) });
    expect(second.json().id).not.toBe(before?.id);
  });

  it("leaves dev|local alone for any other email, or none", async () => {
    const before = await devUser();
    for (const t of [
      await token({ sub: "auth0|someone", email: "someone@example.com" }),
      await token({ sub: "auth0|anon" }),
    ]) {
      const res = await ctx.app.inject({ url: "/me", headers: bearer(t) });
      expect(res.json().id).not.toBe(before?.id);
    }
    expect((await devUser())?.id).toBe(before?.id);
  });

  it("creates a new user when there is no dev|local to claim", async () => {
    await ctx.db.deleteFrom("users").execute();
    const owner = await token({ sub: "google-oauth2|owner", name: "Owner", email: OWNER_EMAIL });
    expect((await ctx.app.inject({ url: "/me", headers: bearer(owner) })).statusCode).toBe(200);
    expect(await userBySub("google-oauth2|owner")).toMatchObject({ displayName: "Owner" });
  });

  it("does nothing when unset", async () => {
    const plain = await setupTestApp({ jwt: { domain: DOMAIN, audience: AUDIENCE, keys } });
    try {
      const owner = await token({ sub: "google-oauth2|owner", email: OWNER_EMAIL });
      await plain.app.inject({ url: "/me", headers: bearer(owner) });
      expect(await devUser()).toBeDefined();
    } finally {
      await plain.close();
    }
  });
});

describe("dev mode", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  it("acts as dev|local, or the x-dev-user header's user, without a token", async () => {
    const local = await ctx.app.inject("/me");
    expect(local.statusCode).toBe(200);
    expect(local.json()).toMatchObject({ displayName: "Local learner" });
    const other = await ctx.app.inject({ url: "/me", headers: { "x-dev-user": "e2e|someone" } });
    expect(other.json()).toMatchObject({ displayName: "e2e|someone" });
    expect(other.json().id).not.toBe(local.json().id);
  });

  it("ignores bearer tokens", async () => {
    const res = await ctx.app.inject({ url: "/me", headers: bearer("anything") });
    expect(res.json()).toMatchObject({ displayName: "Local learner" });
  });
});

describe("on Vercel", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp({
      jwt: { domain: DOMAIN, audience: AUDIENCE, keys },
      vercelEnv: "production",
    });
  });
  afterAll(() => ctx.close());

  it("serves the OpenAPI document without Swagger UI", async () => {
    const json = await ctx.app.inject("/docs/json");
    expect(json.statusCode).toBe(200);
    expect(Object.keys(json.json().paths)).toContain("/study/answers");
    expect((await ctx.app.inject("/docs")).statusCode).toBe(404);
  });
});
