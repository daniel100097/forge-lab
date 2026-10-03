import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable Docker fixtures.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  page._publishingErrors = errors;
});
test.afterEach(async ({ page }) => expect(page._publishingErrors).toEqual([]));
test("release asset, edit, detail, and deletion preserve the Git tag", async ({
  page,
}) => {
  const tag = `zz-test-publishing-test-${Date.now()}`;
  await page.goto(`${root}/releases/new`);
  await page.getByLabel("Tag name", { exact: true }).fill(tag);
  await page
    .getByLabel("Release title", { exact: true })
    .fill("zz-test-Publishing workflow");
  await page
    .getByRole("textbox", { name: "Release notes", exact: true })
    .fill("## Highlights\n\nAn actual release created in the browser.");
  await page.getByLabel("Release assets", { exact: true }).setInputFiles({
    name: "release-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Release notes for browser testing.\n"),
  });
  await page
    .getByRole("button", { name: "Create release", exact: true })
    .click();
  await expect(page).toHaveURL(/\/releases$/);
  await page
    .getByRole("textbox", { name: "Search releases", exact: true })
    .fill(tag);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".release-entry")).toHaveCount(1);
  await page
    .getByRole("link", { name: "zz-test-Publishing workflow", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Publishing workflow",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${root}/releases/latest`);
  await expect(page).toHaveURL(new RegExp(`/releases/tag/${tag}$`));
  const archive = await page.request.get(
    await page
      .getByRole("link", {
        name: /^Source code \(zip\)(?: · \d+ downloads?)?$/,
      })
      .getAttribute("href"),
  );
  expect(archive.ok()).toBe(true);
  expect((await archive.body()).subarray(0, 2).toString()).toBe("PK");
  const asset = page.getByRole("link", { name: /release-notes.txt/ });
  await expect(asset).toBeVisible();
  const url = await asset.getAttribute("href");
  const response = await page.request.get(url);
  expect(await response.text()).toContain("Release notes for browser testing.");
  await page.getByRole("link", { name: "Edit release", exact: true }).click();
  await page
    .getByLabel("Release title", { exact: true })
    .fill("zz-test-Publishing workflow updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/releases$/);
  await page
    .getByRole("link", {
      name: "zz-test-Publishing workflow updated",
      exact: true,
    })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Release actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete release", exact: true })
    .click();
  await expect(page).toHaveURL(/\/releases$/);
  await expect(
    page.getByRole("link", {
      name: "zz-test-Publishing workflow updated",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto(`${root}/tags?q=${tag}`);
  await expect(page.locator(".repository-reference-row")).toContainText(tag);
});
test("wiki search, historical page content, rename and delete", async ({
  page,
}) => {
  const title = `zz-test-Publishing guide ${Date.now()}`;
  await page.goto(`${root}/wiki?action=new`);
  await page.getByLabel("Page title", { exact: true }).fill(title);
  await page
    .getByRole("textbox", { name: "Page content", exact: true })
    .fill("# Publishing guide\n\nOriginal searchable handbook text.");
  await page.getByRole("button", { name: "Save page", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true, level: 2 }),
  ).toBeVisible();
  const currentPageUrl = page.url();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page content", exact: true })
    .fill("# Publishing guide\n\nUpdated searchable handbook text.");
  await page.getByRole("button", { name: "Save page", exact: true }).click();
  await expect(
    page.getByText("Updated searchable handbook text.", { exact: true }),
  ).toBeVisible();
  await page.goto(`${root}/wiki/search?q=searchable`);
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: title, exact: true }).click();
  await page
    .getByRole("button", { name: "Wiki page actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Page history", exact: true })
    .click();
  await expect(page.locator(".publish-history")).toHaveCount(2);
  const changes = page
    .locator(".publish-history")
    .first()
    .getByRole("link", { name: /^View changes/ });
  const changesUrl = await changes.getAttribute("href");
  await changes.click();
  await expect(page.locator(".diff-file")).toContainText(
    "Updated searchable handbook text.",
  );
  const patch = await page.request.get(
    await page
      .getByRole("link", { name: "Download patch", exact: true })
      .getAttribute("href"),
  );
  expect(patch.ok()).toBe(true);
  expect(await patch.text()).toContain("Updated searchable handbook text.");
  await page.goBack();
  await page
    .locator(".publish-history")
    .last()
    .getByRole("link")
    .first()
    .click();
  await expect(
    page.getByText("Original searchable handbook text.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View current page", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Wiki page actions", exact: true })
    .click();
  const rawUrl = await page
    .getByRole("menuitem", { name: "Download raw page", exact: true })
    .getAttribute("href");
  const raw = await page.request.get(rawUrl);
  expect(raw.ok()).toBe(true);
  expect(await raw.text()).toContain("Updated searchable handbook text.");
  await page.keyboard.press("Escape");
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(changesUrl);
  await expect(page.locator(".diff-file")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/wiki-commit-dark-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(currentPageUrl);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Page title", { exact: true })
    .fill("zz-test-Renamed publishing guide");
  await page.getByRole("button", { name: "Save page", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Renamed publishing guide",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Wiki page actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Renamed publishing guide",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("release draft visibility, prerelease flags and replacing uploaded assets", async ({
  page,
  browser,
}) => {
  const tag = `zz-test-release-flags-${Date.now()}`;
  await page.goto(`${root}/releases/new`);
  await page.getByLabel("Tag name", { exact: true }).fill(tag);
  await page.getByLabel("Release title", { exact: true }).fill(tag);
  await page.getByLabel("Save as a draft", { exact: true }).check();
  await page.getByLabel("This is a pre-release", { exact: true }).check();
  await page.getByLabel("Hide source-code archives", { exact: true }).check();
  await page.getByLabel("Release assets", { exact: true }).setInputFiles({
    name: "before.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Original asset"),
  });
  await page
    .getByRole("button", { name: "Create release", exact: true })
    .click();
  await expect(page).toHaveURL(/\/releases$/);
  await page.goto(`${root}/releases/tag/${tag}`);
  await expect(page.locator(".release-detail")).toContainText("Draft");
  await expect(page.locator(".release-detail")).toContainText("Pre-release");
  await expect(
    page.getByRole("link", {
      name: /^Source code \(zip\)(?: · \d+ downloads)?$/,
    }),
  ).toHaveCount(0);
  const reader = await browser.newContext({
    baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  });
  const login = await reader.request.post("/user/login", {
    headers: { "X-Forgejo-UI": "1" },
    form: {
      user_name: credentials.other.username,
      password: credentials.other.password,
    },
  });
  expect(login.ok()).toBe(true);
  const nativeRoot = `/${fixtures.repository}/releases/tag/${tag}`;
  expect(
    (
      await reader.request.get(nativeRoot, { headers: { "X-Forgejo-UI": "1" } })
    ).status(),
  ).toBe(404);
  await page.getByRole("link", { name: "Edit release", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove before.txt", exact: true })
    .click();
  await page.getByLabel("Release assets", { exact: true }).setInputFiles({
    name: "after.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Replacement asset"),
  });
  await page.getByLabel("Save as a draft", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/releases$/);
  await page.goto(`${root}/releases/tag/${tag}`);
  await expect(page.locator(".release-detail")).not.toContainText("Draft");
  await expect(page.getByRole("link", { name: /before.txt/ })).toHaveCount(0);
  const download = await page.request.get(
    await page.getByRole("link", { name: /after.txt/ }).getAttribute("href"),
  );
  expect(await download.text()).toBe("Replacement asset");
  const visible = await reader.request.get(nativeRoot, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect(visible.ok()).toBe(true);
  expect((await visible.json()).can_write).toBe(false);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Release actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete release", exact: true })
    .click();
  await expect(page).toHaveURL(/\/releases$/);
  await reader.close();
});
