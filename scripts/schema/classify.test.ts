import assert from "node:assert/strict";
import { matchesGlob } from "node:path";
import { describe, it } from "node:test";
import { checkPolicy, classify, isContractFile, statements } from "./classify.ts";

const phase = (sql: string) => classify(sql).map((c) => c.phase);
const matches = (p: string, globs: readonly string[]) => globs.some((g) => matchesGlob(p, g));

describe("statements", () => {
  it("splits on semicolons, keeping preceding comments and start lines", () => {
    const s = statements(
      '-- Modify "items" table\nALTER TABLE "items"\n  ADD COLUMN "x" text NULL;\n\nCREATE INDEX "i" ON "items" ("x");\n',
    );
    assert.deepEqual(
      s.map((x) => [x.line, x.comments]),
      [
        [2, ['-- Modify "items" table']],
        [5, []],
      ],
    );
  });
});

describe("classify (Atlas-generated SQL)", () => {
  it("treats additive changes as expand", () => {
    assert.deepEqual(
      phase(`ALTER TABLE "items" ADD COLUMN "audio_url" text NULL;
ALTER TABLE "items" ADD COLUMN "level" integer NOT NULL DEFAULT 0;
CREATE INDEX "items_level_idx" ON "items" ("level");
ALTER TABLE "users" ALTER COLUMN "display_name" DROP NOT NULL;
ALTER TYPE "grading_mode" ADD VALUE 'fuzzy';`),
      ["expand", "expand", "expand", "expand", "expand"],
    );
  });

  it("treats everything on a table created in the same migration as expand", () => {
    assert.deepEqual(
      phase(`CREATE TABLE "item_answers" ("id" uuid NOT NULL, "item_id" uuid NOT NULL, PRIMARY KEY ("id"));
ALTER TABLE "item_answers" ADD CONSTRAINT "item_answers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id");
CREATE UNIQUE INDEX "item_answers_key" ON "item_answers" ("item_id", "id");`),
      ["expand", "expand", "expand"],
    );
  });

  it("marks removals and tightening as contract", () => {
    assert.deepEqual(
      phase(`ALTER TABLE "items" DROP COLUMN "alternatives";
DROP TABLE "review_logs";
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
ALTER TABLE "items" ALTER COLUMN "notes" DROP DEFAULT;
ALTER TABLE "items" ADD CONSTRAINT "items_term_key" UNIQUE ("unit_id", "term");
ALTER TABLE "cards" ADD CONSTRAINT "cards_reps_check" CHECK (reps >= 0);
CREATE UNIQUE INDEX "items_term_idx" ON "items" ("unit_id", "term");`),
      ["contract", "contract", "contract", "contract", "contract", "contract", "contract"],
    );
  });

  it("marks one-step breaking changes as never", () => {
    assert.deepEqual(
      phase(`ALTER TABLE "courses" RENAME COLUMN "title" TO "name";
ALTER TABLE "courses" RENAME TO "decks";
ALTER TABLE "cards" ALTER COLUMN "reps" TYPE bigint;
ALTER TABLE "items" ADD COLUMN "audio_url" text NOT NULL;
ALTER TYPE "grading_mode" RENAME VALUE 'strict' TO 'exact';`),
      ["never", "never", "never", "never", "never"],
    );
  });

  it("honours an explicit allow comment, and keeps its reason", () => {
    const [c] = classify(`-- expand-contract: allow table is empty in every environment
ALTER TABLE "items" ADD COLUMN "x" text NOT NULL;`);
    assert.equal(c?.phase, "expand");
    assert.equal(c?.reason, "allowed: table is empty in every environment");
  });
});

describe("checkPolicy", () => {
  const drop = {
    path: "db/migrations/20261201000000_contract_drop_alternatives.sql",
    sql: 'ALTER TABLE "items" DROP COLUMN "alternatives";',
  };
  const add = {
    path: "db/migrations/20261201000000_add_audio.sql",
    sql: 'ALTER TABLE "items" ADD COLUMN "audio_url" text NULL;',
  };

  it("recognises contract files by name", () => {
    assert.ok(isContractFile(drop.path));
    assert.ok(!isContractFile(add.path));
  });

  it("passes an expand change with code", () => {
    const r = checkPolicy({
      added: [add],
      modified: [],
      changed: [add.path, "apps/api/src/routes/courses.ts"],
      matches,
    });
    assert.deepEqual(r.errors, []);
    assert.equal(r.contract, false);
  });

  it("rejects contract statements in an expand migration", () => {
    const r = checkPolicy({
      added: [{ ...drop, path: add.path }],
      modified: [],
      changed: [add.path],
      matches,
    });
    assert.match(r.errors[0] ?? "", /contract change in an expand migration/);
  });

  it("passes a contract change that touches only schema files", () => {
    const changed = [
      drop.path,
      "db/schema.sql",
      "db/migrations/atlas.sum",
      "apps/api/src/db/types.ts",
      "docs/decisions.md",
    ];
    const r = checkPolicy({ added: [drop], modified: [], changed, matches });
    assert.deepEqual(r.errors, []);
    assert.equal(r.contract, true);
  });

  it("rejects a contract change that also changes code or adds other migrations", () => {
    const r = checkPolicy({
      added: [drop, add],
      modified: [],
      changed: [drop.path, add.path, "apps/api/src/import.ts"],
      matches,
    });
    assert.equal(r.errors.length, 2);
    assert.match(r.errors.join("\n"), /ships alone/);
    assert.match(r.errors.join("\n"), /apps\/api\/src\/import\.ts/);
  });

  it("rejects expand statements inside a contract migration", () => {
    const r = checkPolicy({
      added: [{ ...drop, sql: `${drop.sql}\n${add.sql}` }],
      modified: [],
      changed: [drop.path],
      matches,
    });
    assert.match(r.errors[0] ?? "", /holds only contract statements/);
  });

  it("rejects edits to applied migrations", () => {
    const r = checkPolicy({
      added: [],
      modified: ["db/migrations/20261109065014_init.sql"],
      changed: [],
      matches,
    });
    assert.match(r.errors[0] ?? "", /immutable/);
  });
});
