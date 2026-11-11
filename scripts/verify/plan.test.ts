import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { END, injectRules, START } from "./docs.ts";
import { classify, parseEvidence, parseWaivers, plan, remoteDatabases } from "./plan.ts";
import { CLASSES, E2E_MAP, EVIDENCE } from "./rules.ts";

const ids = (p: ReturnType<typeof plan>) => p.checks.map((c) => c.id);

describe("classify", () => {
  const cases: [string, string][] = [
    ["README.md", "docs"],
    ["apps/web/AGENTS.md", "docs"],
    ["docs/adr/0002-x.md", "docs"],
    ["scripts/verify/rules.ts", "verify-tooling"],
    ["pnpm-lock.yaml", "dependencies"],
    ["apps/api/package.json", "dependencies"],
    [".github/workflows/ci.yml", "tooling"],
    ["scripts/db-check.sh", "tooling"],
    [".squawk.toml", "tooling"],
    [".github/pull_request_template.md", "tooling"],
    ["db/schema.sql", "schema"],
    ["db/migrations/20261109065014_init.sql", "schema"],
    ["apps/api/src/db/types.ts", "schema"],
    ["db/seed/spanish-basics.csv", "seed"],
    ["db/rehearsal/seed.sql", "schema-rehearsal"],
    ["db/rehearsal/invariants/card_status_matches_state.sql", "schema-rehearsal"],
    ["db/migrations/20261201000000_contract_drop_alternatives.sql", "schema-contract"],
    ["apps/api/openapi.json", "api-spec"],
    ["apps/api/src/openapi.ts", "api-spec"],
    ["apps/api/test/api.test.ts", "api-tests"],
    ["apps/api/src/routes/study.ts", "api-route"],
    ["apps/api/src/plugins/auth.ts", "api-route"],
    ["apps/api/src/srs.ts", "api-domain"],
    ["packages/shared/src/contracts.ts", "contract"],
    ["packages/shared/src/grading.test.ts", "shared-tests"],
    ["packages/shared/src/grading.ts", "shared-logic"],
    ["packages/client/src/study/controller.test.ts", "client-tests"],
    ["packages/client/src/testing/fake-api.ts", "client-testing"],
    ["packages/client/src/react/use-screen.ts", "client-binding"],
    ["packages/client/src/study/controller.ts", "client-logic"],
    ["packages/client/package.json", "dependencies"],
    ["apps/web/src/views/study/study-view.test.tsx", "web-tests"],
    ["apps/web/src/test/a11y.ts", "web-tests"],
    ["apps/web/src/lib/utils.ts", "web-logic"],
    ["apps/web/src/components/ui/button.tsx", "web-primitive"],
    ["apps/web/src/app/globals.css", "web-primitive"],
    ["apps/web/src/platform/providers.tsx", "web-platform"],
    ["apps/web/src/app/courses/[id]/study/page.tsx", "web-route"],
    ["apps/web/src/views/study/study-view.tsx", "web-view"],
    ["apps/web/src/components/native-select.tsx", "web-view"],
    ["apps/web/next.config.ts", "web-config"],
    ["apps/e2e/tests/study.spec.ts", "e2e-specs"],
    ["apps/e2e/pages/study-page.ts", "e2e-support"],
    ["packages/design/tokens.json", "design-tokens"],
    ["packages/design/src/generate.ts", "design-tokens"],
    ["apps/web/src/app/tokens.css", "design-tokens"],
    ["packages/design/system/components/Button/preview.html", "design-docs"],
    ["packages/design/system/README.md", "design-docs"],
    ["packages/design/README.md", "design-docs"],
    ["packages/design/vitest.config.ts", "design-tokens"],
    ["packages/design/package.json", "dependencies"],
    ["something/new.txt", "unclassified"],
  ];
  for (const [file, cls] of cases) {
    it(`${file} → ${cls}`, () => assert.equal(classify(file).id, cls));
  }

  it("puts every tracked file in a class", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
    const unclassified = files.filter((f) => f && classify(f).id === "unclassified");
    assert.deepEqual(unclassified, []);
  });

  it("has unique class ids", () => {
    assert.equal(new Set(CLASSES.map((c) => c.id)).size, CLASSES.length);
  });
});

describe("plan", () => {
  it("needs nothing beyond lint for docs", () => {
    const p = plan(["README.md"]);
    assert.deepEqual(ids(p), ["lint", "rules-drift"]);
    assert.equal(p.e2e, null);
    assert.deepEqual(p.obligations, []);
  });

  it("maps a study view change to the study and grading specs, with a view test owed", () => {
    const p = plan(["apps/web/src/views/study/study-view.tsx"]);
    assert.deepEqual(p.e2e, ["grading", "study"]);
    assert.deepEqual(ids(p), ["lint", "typecheck", "test:web", "build:web", "e2e"]);
    assert.deepEqual(
      p.obligations.map((o) => [o.id, o.status]),
      [["web-view-test", "missing"]],
    );
    assert.deepEqual(
      p.evidence.map((e) => e.evidence.id),
      ["visual-check"],
    );
  });

  it("requires a controller test for client logic, met by a client test", () => {
    const missing = plan(["packages/client/src/settings/controller.ts"]);
    assert.deepEqual(ids(missing), [
      "lint",
      "typecheck",
      "test:client",
      "test:web",
      "build:web",
      "e2e",
    ]);
    assert.deepEqual(missing.e2e, ["courses", "grading"]);
    assert.equal(missing.obligations[0]?.status, "missing");
    const met = plan([
      "packages/client/src/settings/controller.ts",
      "packages/client/src/settings/settings.test.ts",
    ]);
    assert.equal(met.obligations[0]?.status, "met");
  });

  it("requires an e2e spec for a route change", () => {
    const p = plan(["apps/web/src/app/courses/[id]/study/page.tsx"]);
    assert.deepEqual(p.e2e, ["grading", "study"]);
    assert.equal(p.obligations[0]?.id, "e2e-spec");
  });

  it("runs the whole suite for an unmapped route", () => {
    assert.deepEqual(plan(["apps/web/src/app/layout.tsx"]).e2e, []);
  });

  it("runs only changed specs for spec-only changes", () => {
    const p = plan(["apps/e2e/tests/courses.spec.ts"]);
    assert.deepEqual(p.e2e, ["courses"]);
    assert.deepEqual(ids(p), ["lint", "typecheck", "e2e"]);
  });

  it("requires an API test for a route change, met by the same change", () => {
    const missing = plan(["apps/api/src/routes/me.ts"]);
    assert.equal(missing.obligations[0]?.status, "missing");
    const met = plan(["apps/api/src/routes/me.ts", "apps/api/test/api.test.ts"]);
    assert.equal(met.obligations[0]?.status, "met");
    assert.ok(ids(met).includes("openapi-drift"));
  });

  it("never counts a deleted test as meeting an obligation", () => {
    const changed = ["apps/api/src/srs.ts", "apps/api/test/api.test.ts"];
    const p = plan(changed, new Map(), { deleted: new Set(["apps/api/test/api.test.ts"]) });
    assert.equal(p.obligations[0]?.status, "missing");
    assert.ok(p.files.includes("apps/api/test/api.test.ts"), "still classified and checked");
  });

  it("accepts a waiver for a missing obligation", () => {
    const p = plan(["apps/api/src/srs.ts"], new Map([["api-test", "rename only"]]));
    assert.equal(p.obligations[0]?.status, "waived");
    assert.deepEqual(p.obligations[0]?.detail, ["rename only"]);
  });

  it("runs everything for dependency, tooling and unclassified changes", () => {
    for (const file of ["pnpm-lock.yaml", ".github/workflows/ci.yml", "weird.file"]) {
      const p = plan([file]);
      assert.ok(ids(p).includes("e2e"), file);
      assert.ok(ids(p).includes("db:check"), file);
      assert.deepEqual(p.e2e, [], file);
    }
  });

  it("runs everything with --all, even with no changes", () => {
    const p = plan([], new Map(), { all: true });
    assert.ok(ids(p).includes("test:api"));
    assert.deepEqual(p.e2e, []);
  });

  it("unions checks across classes", () => {
    const p = plan(["packages/shared/src/grading.ts", "apps/web/src/components/ui/button.tsx"]);
    assert.deepEqual(p.e2e, []);
    assert.ok(ids(p).includes("test:api"));
    assert.ok(ids(p).includes("build:web"));
    assert.equal(p.obligations[0]?.id, "shared-test");
  });

  it("maps only to specs that exist", () => {
    const specs = execFileSync("git", ["ls-files", "apps/e2e/tests"], { encoding: "utf8" });
    for (const s of E2E_MAP.flatMap((m) => m.specs)) {
      assert.ok(specs.includes(`apps/e2e/tests/${s}.spec.ts`), s);
    }
  });
});

describe("parseWaivers", () => {
  it("reads trailers and flags unknown ids", () => {
    const { waivers, unknown } = parseWaivers([
      "fix: rename",
      "",
      "Verify-Waive: api-test: pure rename, covered by existing tests",
      "verify-waive: e2e-spec = styling only",
      "Verify-Waive: e2e-specs: typo",
    ]);
    assert.equal(waivers.get("api-test"), "pure rename, covered by existing tests");
    assert.equal(waivers.get("e2e-spec"), "styling only");
    assert.deepEqual(unknown, ["e2e-specs"]);
  });
});

describe("parseEvidence", () => {
  it("reads ticked boxes only and flags unknown ids", () => {
    const { ticked, unknown } = parseEvidence([
      "- [x] `visual-check` desktop and mobile: fine\r",
      "* [X] `openapi-review`",
      "- [ ] `lockfile-review` the lockfile diff:",
      "  - [x] `visual-checks` typo",
      "[x] `contract-readiness` not a list item",
    ]);
    assert.deepEqual([...ticked].sort(), ["openapi-review", "visual-check"]);
    assert.deepEqual(unknown, ["visual-checks"]);
  });
});

describe("evidence in a PR", () => {
  const status = (p: ReturnType<typeof plan>) =>
    Object.fromEntries(p.evidence.map((e) => [e.evidence.id, e.status]));

  it("is only listed without a PR description", () => {
    assert.deepEqual(status(plan(["apps/web/src/views/study/study-view.tsx"])), {
      "visual-check": "listed",
    });
  });

  it("is owed until ticked; after-merge and CI evidence never are", () => {
    const files = ["packages/design/tokens.json", ".github/workflows/ci.yml"];
    assert.deepEqual(status(plan(files, new Map(), { ticked: new Set() })), {
      "visual-check": "owed",
      "design-publish": "after-merge",
      "ci-run": "ci",
    });
    const ticked = new Set(["visual-check", "design-publish"]);
    const p = plan(["packages/design/tokens.json"], new Map(), { ticked });
    assert.deepEqual(status(p), { "visual-check": "ticked", "design-publish": "ticked" });
  });

  it("has a box in the PR template for each item due before merge", () => {
    const template = readFileSync(".github/pull_request_template.md", "utf8");
    const boxes = [...template.matchAll(/^- \[ \] `([\w-]+)`/gm)].map((m) => m[1]);
    assert.deepEqual(
      boxes,
      EVIDENCE.filter((e) => e.due === "pr").map((e) => e.id),
    );
  });
});

describe("docs", () => {
  it("replaces only the marked block and is idempotent", () => {
    const doc = `intro\n${START}\nold\n${END}\noutro\n`;
    const once = injectRules(doc);
    assert.ok(once.startsWith("intro\n") && once.endsWith(`${END}\noutro\n`));
    assert.ok(!once.includes("\nold\n"));
    assert.equal(injectRules(once), once);
  });
});

describe("remoteDatabases", () => {
  it("accepts local databases and flags remote or malformed ones", () => {
    const local = "postgres://srs:srs@localhost:5432/srs?sslmode=disable";
    assert.deepEqual(remoteDatabases({ DATABASE_URL: local, TEST_DATABASE_URL: local }), []);
    assert.deepEqual(remoteDatabases({}), []);
    assert.deepEqual(
      remoteDatabases({
        DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb",
        TEST_DATABASE_URL: '"postgresql://u:p@host/db"',
      }),
      [
        "DATABASE_URL → ep-x-pooler.eu-central-1.aws.neon.tech",
        "TEST_DATABASE_URL (not a valid URL)",
      ],
    );
  });
});
