/**
 * Accessibility scan of the page as rendered in a real browser: the WCAG 2.x
 * A and AA rules plus axe's best practices (one `h1` per page, landmarks,
 * heading order). Colour contrast needs real rendering and so is off in the
 * jsdom scans (apps/web/src/test/a11y.ts).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/**
 * Violations already tracked in TODO.md, by rule and node selector. Each one
 * waits on a decision there; remove its entry with the fix. Anything else fails.
 */
const KNOWN: { rule: string; target: string; todo: string }[] = [
  {
    // "Next review …" in the study feedback box: muted-foreground on the
    // verdict tints is 3.98 to 4.39:1, under 4.5:1.
    rule: "color-contrast",
    target: ".p-3 > .text-xs",
    todo: "Contrast gaps",
  },
];

/** One line per violating node: `rule: help (selector)`. Empty means none. */
export async function a11yViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.flatMap((v) =>
    v.nodes
      .map((n) => ({ target: n.target.join(" "), summary: n.failureSummary ?? "" }))
      .filter(({ target }) => !KNOWN.some((k) => k.rule === v.id && k.target === target))
      .map(({ target, summary }) => `${v.id}: ${v.help} (${target}) ${summary}`.trim()),
  );
}
