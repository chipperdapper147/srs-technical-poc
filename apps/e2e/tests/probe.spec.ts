import AxeBuilder from "@axe-core/playwright";
import { test } from "../support/fixtures.ts";

// Throwaway: which axe rule crashes Firefox on the settings screen?
test("probe settings", async ({ settingsPage, page, browser }) => {
  test.setTimeout(600_000);
  const crashed: string[] = [];
  for (const ruleId of [
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
  ]) {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-dev-user": "probe" } });
    const p = await ctx.newPage();
    await p.goto("/settings");
    await p.getByRole("combobox").first().waitFor();
    try {
      await new AxeBuilder({ page: p }).withRules([ruleId]).analyze();
    } catch (e) {
      crashed.push(`${ruleId}: ${String(e).split("\n")[0]}`);
    }
    await ctx.close();
  }
  console.log(`PROBE crashed: ${JSON.stringify(crashed)}`);
  void settingsPage;
  void page;
});
