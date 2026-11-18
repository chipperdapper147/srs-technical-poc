import { a11yViolations } from "../support/a11y.ts";
import { expect, test } from "../support/fixtures.ts";

/**
 * E2E runs without Auth0: the web's dev auth port, the API in dev mode. These
 * check the shell's account entry and the signed-out screen; the redirect to
 * Auth0 itself is covered by the web's adapter tests (platform/auth0-session).
 */
test("the shell shows the dev learner, and Sign out shows the sign-in screen", async ({
  dashboardPage,
  shell,
  signInPage,
  page,
}) => {
  await dashboardPage.goto();
  await expect(shell.account("Local learner")).toBeVisible();
  await expect(shell.coursesLink).toBeVisible();

  await shell.signOutButton.click();
  await expect(signInPage.heading).toBeVisible();
  await expect(signInPage.description).toBeVisible();
  await expect(signInPage.googleButton).toBeEnabled();
  await expect(signInPage.emailButton).toBeEnabled();
  await expect(dashboardPage.heading).toHaveCount(0);
  await expect(shell.navLinks).toHaveCount(1);
  await expect(shell.brandLink).toBeVisible();
  await expect(shell.signOutButton).toHaveCount(0);
  expect(await a11yViolations(page)).toEqual([]);

  await signInPage.emailButton.click();
  await expect(dashboardPage.heading).toBeVisible();
  await expect(shell.account("Local learner")).toBeVisible();
});

test("the sign-in screen at phone width", async ({ dashboardPage, shell, signInPage, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboardPage.goto();
  await shell.signOutButton.click();
  await expect(signInPage.heading).toBeVisible();
  expect(await a11yViolations(page)).toEqual([]);
  await signInPage.googleButton.click();
  await expect(dashboardPage.heading).toBeVisible();
});
