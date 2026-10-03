import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable fixtures");
const { user } = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
let fixture;
try {
  fixture = JSON.parse(
    await readFile(`${directory}/lfs-fixtures.json`, "utf8"),
  );
} catch {}
test.skip(!fixture, "Run tests/lfs-fixtures.mjs on the disposable instance");
test("real LFS object preview download Git references pointers and deletion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const root = `/-/ui/projects/${fixture.repository}/settings/lfs`;
  await page.goto(root);
  const row = page.locator(".configuration-list article").filter({
    has: page.getByRole("link", { name: fixture.oid, exact: true }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: fixture.oid, exact: true }).click();
  await expect(page.locator(".configuration-lfs-preview")).toContainText(
    fixture.content.trim(),
  );
  const response = await page.request.get(
    await page
      .getByRole("link", { name: "Download object", exact: true })
      .getAttribute("href"),
  );
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe(fixture.content);
  await page.goto(root);
  await row.getByRole("link", { name: "Find references", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "large-asset.txt", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".configuration-list")).toContainText(
    "Add LFS pointer fixture",
  );
  await page.goto(`${root}/pointers`);
  await expect(page.locator(".configuration-list article")).toContainText(
    "Associated",
  );
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "LFS pointers", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/lfs-pointers-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(root);
  await row
    .getByRole("button", {
      name: `Delete LFS object ${fixture.oid.slice(0, 12)}`,
      exact: true,
    })
    .click();
  await row
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.goto(`${root}/pointers`);
  await expect(page.locator(".configuration-list article")).toContainText(
    "Missing",
  );
  expect(errors).toEqual([]);
});
