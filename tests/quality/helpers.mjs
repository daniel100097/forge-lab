import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error(
    "Quality checks require FORGEJO_TEST_FIXTURES from a disposable Docker instance.",
  );
const allCredentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
export const credentials = { user: allCredentials.quality };
export const fixture = JSON.parse(
  await readFile(`${directory}/quality.json`, "utf8"),
);
export const root = `/-/ui/projects/${fixture.repository}`;
export async function login(page) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".repo-row")).toHaveCount(1);
  await settle(page);
}
export async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".loading-state, .skeleton")).toHaveCount(0);
}
export async function theme(page, mode) {
  await page.addInitScript((value) => {
    localStorage.setItem("forgejo-ui:/:color-mode:v1", value);
  }, mode);
  await page.emulateMedia({ colorScheme: mode });
}
