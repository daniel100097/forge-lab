import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("Appearance tests require disposable fixtures.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;

test("appearance persists, follows the system and respects reduced motion", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const choose = async (name) => {
    await page
      .getByRole("button", {
        name: `Account: ${credentials.user.username}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Appearance", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  };
  await choose("Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("forgejo-ui:/:color-mode:v1"),
    ),
  ).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const second = await context.newPage();
  await second.goto(root);
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await choose("Light");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  await second.close();
  await choose("System");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  for (const url of [
    root,
    `${root}/issues/1`,
    `${root}/merge-requests/new`,
    `${root}/boards/${fixtures.board}`,
    `${root}/edit?ref=zz-test-main&path=README.md`,
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("main").getByRole("heading").first(),
    ).toBeVisible();
    const color = await page
      .locator(".main")
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(color).toBe("rgb(24, 23, 29)");
  }
  const create = page.getByRole("button", { name: "Create new", exact: true });
  await create.click();
  await expect(
    page.getByRole("menu", { name: "Create new", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".action-menu")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).not.toBe("0s");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await create.click();
  await expect(
    page.getByRole("menu", { name: "Create new", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".action-menu")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}/merge-requests/new`);
  await expect(
    page.getByRole("heading", { name: "New merge request", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  expect(errors).toEqual([]);
});
