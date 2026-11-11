/**
 * Pure planning: changed paths in, required verification out. No I/O, so the
 * rules can be tested exhaustively (plan.test.ts).
 */
import { matchesGlob } from "node:path";
import {
  CHECKS,
  type ChangeClass,
  type CheckId,
  CLASSES,
  E2E_MAP,
  EVIDENCE,
  type Evidence,
  type EvidenceId,
  OBLIGATIONS,
  type ObligationId,
  UNCLASSIFIED,
} from "./rules.ts";

export const matches = (file: string, globs: readonly string[]) =>
  globs.some((g) => matchesGlob(file, g));

export function classify(file: string, classes: readonly ChangeClass[] = CLASSES): ChangeClass {
  return classes.find((c) => matches(file, c.paths)) ?? UNCLASSIFIED;
}

export interface ObligationResult {
  id: ObligationId;
  title: string;
  /** Changed files that created the obligation. */
  requiredBy: string[];
  status: "met" | "waived" | "missing";
  /** Matching test files, or the waiver reason. */
  detail: string[];
}

export interface Plan {
  files: string[];
  /** Class id → its files, in CLASSES order. */
  classes: { cls: ChangeClass; files: string[] }[];
  checks: { id: CheckId; why: string[] }[];
  /** null: no e2e. []: the whole suite. Otherwise spec basenames. */
  e2e: string[] | null;
  e2eWhy: string[];
  obligations: ObligationResult[];
  evidence: EvidenceResult[];
}

export interface EvidenceResult {
  evidence: Evidence;
  why: string[];
  /**
   * Only with a PR description (`opts.ticked`): `ticked`, `owed` (due before
   * merge and not ticked: fails), or the evidence's own `after-merge`/`ci`.
   * Without one: `listed`.
   */
  status: "listed" | "ticked" | "owed" | "after-merge" | "ci";
}

/** Specs for one file under `e2e: "mapped"`, or null for "whole suite". */
export function mappedSpecs(file: string): string[] | null {
  return E2E_MAP.find((m) => matches(file, m.paths))?.specs ?? null;
}

const specName = (file: string) =>
  file
    .split("/")
    .pop()
    ?.replace(/\.spec\.ts$/, "") ?? file;

export function plan(
  changed: readonly string[],
  waivers: ReadonlyMap<string, string> = new Map(),
  /** `deleted`: paths that no longer exist. They still need checks, but deleting a test never meets an obligation. */
  /** `ticked`: evidence ids ticked in the PR description (parseEvidence); omit outside a PR. */
  opts: { all?: boolean; deleted?: ReadonlySet<string>; ticked?: ReadonlySet<string> } = {},
): Plan {
  const files = [...new Set(changed)].sort();
  const byClass = new Map<string, { cls: ChangeClass; files: string[] }>();
  for (const file of files) {
    const cls = classify(file);
    const entry = byClass.get(cls.id) ?? { cls, files: [] };
    entry.files.push(file);
    byClass.set(cls.id, entry);
  }
  const order = [...CLASSES, UNCLASSIFIED].map((c) => c.id);
  const classes = [...byClass.values()].sort(
    (a, b) => order.indexOf(a.cls.id) - order.indexOf(b.cls.id),
  );
  if (opts.all) classes.unshift({ cls: { ...UNCLASSIFIED, id: "--all" }, files: [] });

  // Checks
  const why = new Map<CheckId, string[]>();
  for (const { cls } of classes) {
    const ids = cls.checks === "full" ? CHECKS.map((c) => c.id) : cls.checks;
    for (const id of ids) why.set(id, [...(why.get(id) ?? []), cls.id]);
  }

  // E2E scope
  let whole = false;
  const specs = new Set<string>();
  const e2eWhy = new Set<string>();
  for (const { cls, files: clsFiles } of classes) {
    if (cls.e2e === "none") continue;
    e2eWhy.add(cls.id);
    if (cls.e2e === "all") whole = true;
    for (const f of clsFiles) {
      if (cls.e2e === "self") specs.add(specName(f));
      if (cls.e2e === "mapped") {
        const mapped = mappedSpecs(f);
        if (mapped) for (const s of mapped) specs.add(s);
        else whole = true;
      }
    }
  }
  const e2e = whole ? [] : specs.size > 0 ? [...specs].sort() : null;
  if (e2e) why.set("e2e", [...e2eWhy]);
  else why.delete("e2e");

  const checks = CHECKS.filter((c) => why.has(c.id)).map((c) => ({
    id: c.id,
    why: why.get(c.id) ?? [],
  }));

  // Obligations
  const obligations: ObligationResult[] = [];
  for (const ob of OBLIGATIONS) {
    const requiredBy = classes.filter((c) => c.cls.obligations?.includes(ob.id));
    if (requiredBy.length === 0) continue;
    const metBy = files.filter((f) => !opts.deleted?.has(f) && matches(f, ob.metBy));
    const waiver = waivers.get(ob.id);
    obligations.push({
      id: ob.id,
      title: ob.title,
      requiredBy: requiredBy.flatMap((c) => c.files),
      status: metBy.length > 0 ? "met" : waiver ? "waived" : "missing",
      detail: metBy.length > 0 ? metBy : waiver ? [waiver] : [],
    });
  }

  // Manual evidence
  const evidenceWhy = new Map<EvidenceId, string[]>();
  for (const { cls } of classes) {
    for (const id of cls.evidence ?? []) {
      evidenceWhy.set(id, [...(evidenceWhy.get(id) ?? []), cls.id]);
    }
  }
  const { ticked } = opts;
  const evidence = EVIDENCE.filter((e) => evidenceWhy.has(e.id)).map(
    (e): EvidenceResult => ({
      evidence: e,
      why: evidenceWhy.get(e.id) ?? [],
      status: evidenceStatus(e, ticked),
    }),
  );

  return { files, classes, checks, e2e, e2eWhy: [...e2eWhy], obligations, evidence };
}

/**
 * Parse `Verify-Waive: <obligation-id>: <reason>` trailers out of commit
 * messages (or `id=reason` CLI flags). Unknown ids are returned separately so
 * a typo can't silently waive nothing.
 */
export function parseWaivers(lines: readonly string[]): {
  waivers: Map<string, string>;
  unknown: string[];
} {
  const known = new Set<string>(OBLIGATIONS.map((o) => o.id));
  const waivers = new Map<string, string>();
  const unknown: string[] = [];
  for (const line of lines) {
    const m = /^verify-waive:\s*([\w-]+)\s*[:=]\s*(.+)$/i.exec(line.trim());
    if (!m?.[1] || !m[2]) continue;
    if (known.has(m[1])) waivers.set(m[1], m[2].trim());
    else unknown.push(m[1]);
  }
  return { waivers, unknown };
}

function evidenceStatus(e: Evidence, ticked?: ReadonlySet<string>): EvidenceResult["status"] {
  if (!ticked) return "listed";
  if (ticked.has(e.id)) return "ticked";
  return e.due === "pr" ? "owed" : e.due;
}

/**
 * Ticked evidence boxes in a PR description: `- [x] \`visual-check\` …`.
 * Unknown ids are flagged, so a typo can't supply nothing.
 */
export function parseEvidence(lines: readonly string[]): {
  ticked: Set<string>;
  unknown: string[];
} {
  const known = new Set<string>(EVIDENCE.map((e) => e.id));
  const ticked = new Set<string>();
  const unknown: string[] = [];
  for (const line of lines) {
    const m = /^[-*]\s+\[[xX]\]\s+`([\w-]+)`/.exec(line.trim());
    if (!m?.[1]) continue;
    if (known.has(m[1])) ticked.add(m[1]);
    else unknown.push(m[1]);
  }
  return { ticked, unknown };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Hosts of the database URLs checks write to, if any is not local. */
export function remoteDatabases(env: Record<string, string | undefined>): string[] {
  return ["DATABASE_URL", "TEST_DATABASE_URL"].flatMap((name) => {
    const value = env[name];
    if (!value) return [];
    try {
      const { hostname } = new URL(value);
      return LOCAL_HOSTS.has(hostname) ? [] : [`${name} → ${hostname}`];
    } catch {
      return [`${name} (not a valid URL)`];
    }
  });
}
