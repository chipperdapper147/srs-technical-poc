import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.ts";
import { bearerMatches } from "../src/plugins/access-key.ts";
import { setupTestApp } from "./helpers.ts";

const KEY = "k".repeat(40);
const base = { DATABASE_URL: "postgres://u:p@localhost:5432/srs" };

describe("API_ACCESS_KEY in the environment", () => {
  it("is optional off Vercel", () => {
    expect(loadEnv(base).API_ACCESS_KEY).toBeUndefined();
  });

  it("is required on every Vercel deploy", () => {
    for (const VERCEL_ENV of ["production", "preview", "development"]) {
      expect(() => loadEnv({ ...base, VERCEL_ENV })).toThrow(/API_ACCESS_KEY is required/);
    }
    expect(loadEnv({ ...base, VERCEL_ENV: "production", API_ACCESS_KEY: KEY }).API_ACCESS_KEY).toBe(
      KEY,
    );
  });

  it("rejects a short key", () => {
    expect(() => loadEnv({ ...base, API_ACCESS_KEY: "short" })).toThrow();
  });
});

describe("bearerMatches", () => {
  it("accepts only the exact key as a bearer token", () => {
    expect(bearerMatches(`Bearer ${KEY}`, KEY)).toBe(true);
    expect(bearerMatches(`Bearer ${KEY}x`, KEY)).toBe(false);
    expect(bearerMatches(KEY, KEY)).toBe(false);
    expect(bearerMatches("Bearer ", KEY)).toBe(false);
    expect(bearerMatches(undefined, KEY)).toBe(false);
  });
});

describe("with an access key", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp({ accessKey: KEY });
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  it("rejects requests without the key, before any user is created", async () => {
    const res = await ctx.app.inject("/me");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: "Access key required" });
    const wrong = await ctx.app.inject({ url: "/me", headers: { authorization: "Bearer nope" } });
    expect(wrong.statusCode).toBe(401);
    expect(await ctx.db.selectFrom("users").select("id").execute()).toEqual([]);
  });

  it("serves requests with the key", async () => {
    const res = await ctx.app.inject({ url: "/me", headers: { authorization: `Bearer ${KEY}` } });
    expect(res.statusCode).toBe(200);
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
});

describe("on Vercel", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  beforeAll(async () => {
    ctx = await setupTestApp({ accessKey: KEY, vercelEnv: "production" });
  });
  afterAll(() => ctx.close());

  it("serves the OpenAPI document without Swagger UI", async () => {
    const json = await ctx.app.inject("/docs/json");
    expect(json.statusCode).toBe(200);
    expect(Object.keys(json.json().paths)).toContain("/study/answers");
    expect((await ctx.app.inject("/docs")).statusCode).toBe(404);
  });
});
