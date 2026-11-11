import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { windowFromTags } from "./window.ts";

describe("windowFromTags", () => {
  const tag = (stamp: string, sha: string) => ({ name: `release/${stamp}-${sha}`, sha });

  it("is production then rollback target, newest first", () => {
    const w = windowFromTags([
      tag("20261110-090000", "aaa"),
      tag("20261111-150000", "ccc"),
      tag("20261111-090000", "bbb"),
    ]);
    assert.deepEqual(
      w.map((v) => [v.role, v.sha]),
      [
        ["production", "ccc"],
        ["rollback target", "bbb"],
      ],
    );
  });

  it("skips a commit tagged twice and handles a single release", () => {
    assert.deepEqual(
      windowFromTags([tag("20261111-150000", "ccc"), tag("20261111-160000", "ccc")]).map(
        (v) => v.role,
      ),
      ["production"],
    );
    assert.deepEqual(windowFromTags([]), []);
  });
});
