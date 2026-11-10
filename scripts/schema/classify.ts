/**
 * Expand/contract classification of migration SQL (docs/verification.md,
 * "Database changes"). Pure, so the policy is unit-tested.
 *
 * Every statement that touches a table that existed before the migration is one of:
 *   expand    additive; safe for every deployed consumer version
 *   contract  removes or tightens something deployed versions may rely on;
 *             allowed only in a contract migration (file name contains "_contract_")
 *   never     can't be made safe in one step (rename, type change, new required
 *             column); do it as expand → backfill → contract instead
 * Statements on tables created in the same migration are always expand.
 */

export type Phase = "expand" | "contract" | "never";

export interface Classified {
  /** 1-based line of the statement's first line. */
  line: number;
  statement: string;
  phase: Phase;
  /** Why it isn't expand, and what to do instead. */
  reason?: string;
}

/** A statement can opt out with a comment on the line(s) above it: `-- expand-contract: allow <reason>`. */
export const ALLOW = /--\s*expand-contract:\s*allow\s+(\S.*)$/i;

const RULES: { phase: Exclude<Phase, "expand">; pattern: RegExp; reason: string }[] = [
  {
    phase: "never",
    pattern: /\bRENAME\s+(COLUMN\s+|CONSTRAINT\s+)?\S+\s+TO\b|\bRENAME\s+TO\b/i,
    reason:
      "a rename breaks every deployed version that uses the old name: add the new name, write both, backfill, switch readers, then drop the old one in a contract migration",
  },
  {
    phase: "never",
    pattern: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
    reason:
      "a type change can break deployed readers and writers: add a new column of the new type, backfill, switch, then drop the old one in a contract migration",
  },
  {
    phase: "never",
    pattern: /\bADD\s+COLUMN\b(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b/i,
    reason:
      "deployed versions don't write the new column, so their inserts fail: add it with a DEFAULT, or nullable, then backfill and SET NOT NULL in a contract migration",
  },
  {
    phase: "never",
    pattern: /\bALTER\s+TYPE\s+\S+\s+RENAME\s+VALUE\b/i,
    reason:
      "renaming an enum value breaks deployed versions that read or write it: add the new value, migrate the data, stop using the old one",
  },
  {
    phase: "contract",
    pattern: /\bDROP\s+(COLUMN|TABLE|TYPE|VIEW|FUNCTION)\b/i,
    reason: "removes something deployed versions may still read or write",
  },
  {
    phase: "contract",
    pattern: /\bSET\s+NOT\s+NULL\b/i,
    reason: "deployed versions that write NULL start failing",
  },
  {
    phase: "contract",
    pattern: /\bDROP\s+DEFAULT\b/i,
    reason: "deployed versions that rely on the default start failing",
  },
  {
    phase: "contract",
    pattern: /\bADD\s+(CONSTRAINT\s+\S+\s+)?(CHECK|UNIQUE|FOREIGN\s+KEY|EXCLUDE)\b/i,
    reason: "a new constraint can reject writes that deployed versions make",
  },
  {
    phase: "contract",
    pattern: /\bCREATE\s+UNIQUE\s+INDEX\b/i,
    reason: "a new unique index can reject writes that deployed versions make",
  },
];

/** Split SQL into statements with their starting line; comments kept with the statement after them. */
export function statements(sql: string): { line: number; text: string; comments: string[] }[] {
  const out: { line: number; text: string; comments: string[] }[] = [];
  let buffer: string[] = [];
  let comments: string[] = [];
  let start = 0;
  sql.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (buffer.length === 0) {
      if (line === "") return;
      if (line.startsWith("--")) {
        comments.push(line);
        return;
      }
      start = i + 1;
    }
    buffer.push(raw);
    if (line.endsWith(";")) {
      out.push({ line: start, text: buffer.join("\n").trim(), comments });
      buffer = [];
      comments = [];
    }
  });
  if (buffer.length > 0) out.push({ line: start, text: buffer.join("\n").trim(), comments });
  return out;
}

const createdTable = (text: string) =>
  /^\s*CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i.exec(text)?.[2]?.replaceAll('"', "");
const targetTable = (text: string) =>
  /\b(?:ALTER\s+TABLE(?:\s+ONLY)?(?:\s+IF\s+EXISTS)?|ON|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+("?[\w.]+"?)/i
    .exec(text)?.[1]
    ?.replaceAll('"', "");

/** Classify every statement of one migration file. */
export function classify(sql: string): Classified[] {
  const stmts = statements(sql);
  const created = new Set(stmts.map((s) => createdTable(s.text)).filter((t): t is string => !!t));
  return stmts.map((s) => {
    const table = targetTable(s.text);
    const rule =
      table && created.has(table) ? undefined : RULES.find((r) => r.pattern.test(s.text));
    const allowed = s.comments.map((c) => ALLOW.exec(c)?.[1]).find(Boolean);
    if (!rule || allowed) {
      return {
        line: s.line,
        statement: s.text,
        phase: "expand",
        ...(allowed && { reason: `allowed: ${allowed}` }),
      };
    }
    return { line: s.line, statement: s.text, phase: rule.phase, reason: rule.reason };
  });
}

export const isContractFile = (path: string) => /_contract_/.test(path.split("/").pop() ?? "");

/** Paths a contract change may touch besides migrations: code changes must ship before it. */
export const CONTRACT_ALLOWED_PATHS = [
  "db/**",
  // Tests aren't deployed; a contract may update tests of what it removes.
  "apps/api/test/**",
  "apps/api/src/db/types.ts",
  "apps/api/openapi.json",
  "**/*.md",
  "docs/**",
];

export interface PolicyInput {
  /** Migration files added by the change, with their SQL. */
  added: { path: string; sql: string }[];
  /** Migration files that existed at the base and were modified or deleted. */
  modified: string[];
  /** Every path the change touches. */
  changed: string[];
  matches: (path: string, globs: readonly string[]) => boolean;
}

export interface PolicyResult {
  errors: string[];
  notes: string[];
  contract: boolean;
}

/** The expand/contract policy over one change (a branch's diff against its base). */
export function checkPolicy({ added, modified, changed, matches }: PolicyInput): PolicyResult {
  const errors: string[] = [];
  const notes: string[] = [];
  for (const path of modified) {
    errors.push(`${path}: applied migrations are immutable; add a new migration instead`);
  }
  const contracts = added.filter((m) => isContractFile(m.path));
  for (const { path, sql } of added) {
    const contractFile = isContractFile(path);
    for (const c of classify(sql)) {
      const where = `${path}:${c.line}`;
      const first = c.statement.split("\n")[0];
      if (c.phase === "never")
        errors.push(`${where}: ${first}\n    never in one step: ${c.reason}`);
      else if (c.phase === "contract" && !contractFile) {
        errors.push(
          `${where}: ${first}\n    contract change in an expand migration: ${c.reason}. Put it in its own contract migration (pnpm db:diff contract_<name>) once no consumer version in the compatibility window uses it`,
        );
      } else if (c.phase === "expand" && contractFile && !/^\s*$/.test(c.statement)) {
        errors.push(
          `${where}: ${first}\n    a contract migration holds only contract statements; put expand changes in their own migration`,
        );
      }
      if (c.reason?.startsWith("allowed:"))
        notes.push(`${where}: expand/contract check ${c.reason}`);
    }
  }
  if (contracts.length > 0) {
    if (added.length > contracts.length) {
      errors.push(
        "a contract migration ships alone: move the other migrations to their own change",
      );
    }
    const code = changed.filter((p) => !matches(p, CONTRACT_ALLOWED_PATHS));
    if (code.length > 0) {
      errors.push(
        `a contract change touches only the schema and its generated files; code changes must have shipped (and been deployed) before it:\n    ${code.join("\n    ")}`,
      );
    }
  }
  return { errors, notes, contract: contracts.length > 0 };
}
