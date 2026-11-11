import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newestMature } from "./upgrade.ts";

describe("newestMature", () => {
  const time = {
    created: "2020-01-01T00:00:00Z",
    modified: "2026-11-11T00:00:00Z",
    "1.9.0": "2026-10-01T00:00:00Z",
    "1.10.0": "2026-10-20T00:00:00Z",
    "1.11.0-beta.1": "2026-10-21T00:00:00Z",
    "1.11.0": "2026-11-09T00:00:00Z",
  };
  it("takes the newest stable release before the cutoff, comparing numerically", () => {
    assert.equal(newestMature(time, new Date("2026-10-28T00:00:00Z")), "1.10.0");
  });
  it("skips prereleases and the created/modified keys", () => {
    assert.equal(newestMature(time, new Date("2026-11-01T00:00:00Z")), "1.10.0");
    assert.equal(newestMature(time, new Date("2026-11-11T00:00:00Z")), "1.11.0");
  });
  it("returns null when nothing is old enough", () => {
    assert.equal(newestMature(time, new Date("2026-09-01T00:00:00Z")), null);
  });
});
