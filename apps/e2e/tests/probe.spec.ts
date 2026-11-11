import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { a11yViolations } from "../support/a11y.ts";
import { test } from "../support/fixtures.ts";

// Throwaway: tags vs explicit rules vs defaults, on a fresh settings page.
const RULES = [
  "area-alt",
  "aria-allowed-attr",
  "aria-braille-equivalent",
  "aria-command-name",
  "aria-conditional-attr",
  "aria-deprecated-role",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-input-field-name",
  "aria-meter-name",
  "aria-progressbar-name",
  "aria-prohibited-attr",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roledescription",
  "aria-roles",
  "aria-tab-name",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-valid-attr-value",
  "aria-valid-attr",
  "audio-caption",
  "autocomplete-valid",
  "avoid-inline-spacing",
  "blink",
  "button-name",
  "bypass",
  "color-contrast",
  "css-orientation-lock",
  "definition-list",
  "dlitem",
  "document-title",
  "duplicate-id-aria",
  "form-field-multiple-labels",
  "frame-focusable-content",
  "frame-title-unique",
  "frame-title",
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "image-alt",
  "input-button-name",
  "input-image-alt",
  "label-content-name-mismatch",
  "label",
  "link-in-text-block",
  "link-name",
  "list",
  "listitem",
  "marquee",
  "meta-refresh",
  "meta-viewport",
  "nested-interactive",
  "no-autoplay-audio",
  "object-alt",
  "p-as-heading",
  "role-img-alt",
  "scrollable-region-focusable",
  "select-name",
  "server-side-image-map",
  "summary-name",
  "svg-img-alt",
  "table-fake-caption",
  "target-size",
  "td-has-header",
  "td-headers-attr",
  "th-has-data-cells",
  "valid-lang",
  "video-caption",
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const variants: Record<string, (p: Page) => Promise<unknown>> = {
  helper: (p) => a11yViolations(p),
  tags: (p) => new AxeBuilder({ page: p }).withTags(TAGS).analyze(),
  "tags-no-contrast": (p) =>
    new AxeBuilder({ page: p }).withTags(TAGS).disableRules(["color-contrast"]).analyze(),
  "tags-wcag2-only": (p) => new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).analyze(),
  "tags-wcag22aa-only": (p) => new AxeBuilder({ page: p }).withTags(["wcag22aa"]).analyze(),
  "tags-wcag21-only": (p) =>
    new AxeBuilder({ page: p }).withTags(["wcag21a", "wcag21aa"]).analyze(),
  rules: (p) => new AxeBuilder({ page: p }).withRules(RULES).analyze(),
  defaults: (p) => new AxeBuilder({ page: p }).analyze(),
};
for (const [name, run] of Object.entries(variants)) {
  test(`settings: ${name}`, async ({ settingsPage, page }) => {
    await settingsPage.goto();
    await settingsPage.gradingSelect.waitFor();
    try {
      await run(page);
      console.log(`PROBE ${name}: ok`);
    } catch (e) {
      console.log(`PROBE ${name}: CRASH ${String(e).split("\n")[0]}`);
    }
  });
}
