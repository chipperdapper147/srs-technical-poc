import axe from "axe-core";
import { expect } from "vitest";

/**
 * Fail on accessibility violations axe can detect in jsdom. Colour contrast
 * needs real rendering, so it is left to the browser.
 */
export async function expectNoA11yViolations(container: Element) {
  const { violations } = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  const summary = violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
  );
  expect(summary).toEqual([]);
}
