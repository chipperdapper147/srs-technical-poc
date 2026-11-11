import type { Page } from "@playwright/test";

/**
 * Load a page and wait until React has hydrated it (`html[data-hydrated]`, set
 * by the web app's Providers). Before that, server-rendered controls have no
 * handlers: a form would submit natively and reload, which slow browsers hit.
 */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}
