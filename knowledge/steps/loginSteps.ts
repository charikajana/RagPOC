import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { getPage } from '../support/world';

// ─────────────────────────────────────────────
// BACKGROUND
// ─────────────────────────────────────────────
Given('the application is running', async function () {
  const page = getPage(this);
  await page.goto(process.env['BASE_URL'] || 'http://localhost:3000');
  await expect(page).toHaveTitle(/Application/);
});

Given('I am on the login page', async function () {
  const page = getPage(this);
  await page.goto('/login');
  await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
});

// ─────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────
When('I enter username {string}', async function (username: string) {
  const page = getPage(this);
  await page.locator('[data-testid="username-input"]').fill(username);
});

When('I enter password {string}', async function (password: string) {
  const page = getPage(this);
  await page.locator('[data-testid="password-input"]').fill(password);
});

When('I click the login button', async function () {
  const page = getPage(this);
  await page.locator('[data-testid="login-button"]').click();
});

// ─────────────────────────────────────────────
// ASSERTIONS
// ─────────────────────────────────────────────
Then('I should be redirected to the dashboard', async function () {
  const page = getPage(this);
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await expect(page.locator('[data-testid="dashboard-container"]')).toBeVisible();
});

Then('I should see the welcome message {string}', async function (message: string) {
  const page = getPage(this);
  await expect(page.locator('[data-testid="welcome-message"]')).toHaveText(message);
});

Then('I should see the error message {string}', async function (message: string) {
  const page = getPage(this);
  await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  await expect(page.locator('[data-testid="error-message"]')).toContainText(message);
});

Then('I should remain on the login page', async function () {
  const page = getPage(this);
  await expect(page).toHaveURL(/.*\/login/);
});

Then('I should see validation errors', async function () {
  const page = getPage(this);
  await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
});

Then('the username field should show {string}', async function (message: string) {
  const page = getPage(this);
  await expect(
    page.locator('[data-testid="username-error"]')
  ).toContainText(message);
});

Then('the password field should show {string}', async function (message: string) {
  const page = getPage(this);
  await expect(
    page.locator('[data-testid="password-error"]')
  ).toContainText(message);
});
