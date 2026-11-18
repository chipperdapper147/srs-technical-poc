import type { Locator, Page } from "@playwright/test";

/**
 * The signed-out screen, shown in place of any page. In e2e the web runs the
 * dev auth port (no Auth0), so both buttons sign straight back in.
 */
export class SignInPage {
  readonly heading: Locator;
  readonly description: Locator;
  readonly googleButton: Locator;
  readonly emailButton: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    const main = page.getByRole("main");
    this.heading = main.getByRole("heading", { level: 1, name: "Sign in" });
    this.description = main.getByText(/invite-only/);
    this.googleButton = main.getByRole("button", { name: "Continue with Google" });
    this.emailButton = main.getByRole("button", { name: "Continue with email and password" });
  }
}
