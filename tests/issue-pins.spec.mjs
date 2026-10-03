import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory?.includes("forgejo-ui-test-"))
  throw new Error("Use disposable fixtures");
const { user } = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
let fixture;
try {
  fixture = JSON.parse(
    await readFile(`${directory}/issue-list-fixtures.json`, "utf8"),
  );
} catch {}
test.skip(!fixture, "Run tests/issue-list-fixtures.mjs on disposable fixtures");
const repository = fixture?.repository;
test("native pinned cards reorder and retain order after reload", async ({
  page,
}) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const marker = `zz-test-Pincard${String(Date.now()).replace(/\d/g, (digit) => String.fromCharCode(97 + Number(digit)))}`,
    titles = [`${marker} alpha`, `${marker} beta`];
  for (const title of titles) {
    const response = await page.request.post(`/${repository}/issues/new`, {
      headers: { "X-Forgejo-UI": "1" },
      form: { title, content: "Pinned card browser verification" },
    });
    expect(response.ok()).toBe(true);
    expect((await response.json()).redirect).toMatch(/issues\/\d+$/);
  }
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/${repository}/issues?q=${marker}`,
          { headers: { "X-Forgejo-UI": "1" } },
        );
        return (await response.json()).total;
      },
      { timeout: 30000 },
    )
    .toBe(2);
  await page.goto(`/-/ui/projects/${repository}/issues?q=${marker}`);
  const rows = page.locator(".native-issue-row");
  await expect(rows).toHaveCount(2);
  for (const title of titles) {
    await rows
      .filter({ hasText: title })
      .getByRole("button", { name: `Actions for ${title}`, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Pin to top", exact: true })
      .click();
    await expect(
      page
        .locator(".native-issue-pins")
        .getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
  }
  const pins = page.locator(".native-issue-pins article");
  await expect(pins.first()).toContainText(titles[0]);
  await page
    .getByRole("button", { name: `Move pinned ${titles[1]} up`, exact: true })
    .click();
  await expect(pins.first()).toContainText(titles[1]);
  await page.reload();
  await expect(pins.first()).toContainText(titles[1]);
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(pins).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/issue-pins-dark-mobile.png",
    fullPage: true,
  });
  for (const title of titles) {
    await page
      .getByRole("button", { name: `Unpin ${title}`, exact: true })
      .click();
    await expect(
      page
        .locator(".native-issue-pins")
        .getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("checkbox", {
      name: "Select all items on this page",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
});
