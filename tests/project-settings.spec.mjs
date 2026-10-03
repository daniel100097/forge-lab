import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("Use a disposable FORGEJO_TEST_FIXTURES directory.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}/settings`;
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
});
test.afterEach(() => expect(errors).toEqual([]));
async function remove(page, row, name, label = "Delete") {
  await row
    .getByRole("button", { name: `${label} ${name}`, exact: true })
    .click();
  await row
    .getByRole("alertdialog")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(row).toHaveCount(0);
}
test("native project settings save details and reload units", async ({
  page,
}) => {
  await page.goto(root);
  await expect(
    page.getByRole("heading", { name: "Project settings", exact: true }),
  ).toBeVisible();
  const details = page.locator("details").filter({
    has: page.getByRole("heading", { name: "Project details", exact: true }),
  });
  const before = await details
    .getByLabel("Description", { exact: true })
    .inputValue();
  const description = `Native settings browser check ${Date.now()}`;
  await details.getByLabel("Description", { exact: true }).fill(description);
  await details
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(details.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(details.getByLabel("Description", { exact: true })).toHaveValue(
    description,
  );
  await details.getByLabel("Description", { exact: true }).fill(before);
  await details
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(details.getByRole("status")).toHaveText("Changes saved.");
  await page.goto(`${root}/units`);
  await expect(
    page.getByRole("heading", {
      name: "Visibility, project features, permissions",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Repository", { exact: true })).toBeChecked();
  await page.screenshot({
    path: "playwright-results/settings-features-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("native protected branch and tag CRUD", async ({ page }) => {
  const branch = `zz-test-browser-protected-${Date.now()}*`;
  await page.goto(`${root}/branches/edit`);
  await page.getByLabel("Branch name or pattern", { exact: true }).fill(branch);
  await page
    .getByRole("button", { name: "Save branch protection", exact: true })
    .click();
  await expect(page).toHaveURL(/settings\/branches$/);
  let row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByText(branch, { exact: true }) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(
    page.getByLabel("Branch name or pattern", { exact: true }),
  ).toHaveValue(branch);
  await page.getByLabel("Required approvals", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Save branch protection", exact: true })
    .click();
  await expect(row).toContainText("2 required approvals");
  await remove(page, row, branch);
  const tag = `zz-test-browser-tag-${Date.now()}*`;
  await page.goto(`${root}/tags`);
  await page.getByRole("button", { name: "Protect tag", exact: true }).click();
  await page.getByLabel("Tag name or pattern", { exact: true }).fill(tag);
  await page
    .getByRole("button", { name: "Save tag protection", exact: true })
    .click();
  row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByText(tag, { exact: true }) });
  await expect(row).toBeVisible();
  await remove(page, row, tag);
});
test("native CI values reject forbidden fixture names; optional CRUD keeps secrets private", async ({
  page,
}) => {
  for (const section of ["variables", "secrets"]) {
    const noun = section === "secrets" ? "secret" : "variable",
      name = `${process.env.FORGEJO_TEST_PREFIX_ONLY === "1" ? "zz-test-" : ""}BROWSER_${section.toUpperCase()}_${Date.now()}`;
    await page.goto(`${root}/actions/${section}`);
    if (process.env.FORGEJO_TEST_PREFIX_ONLY === "1") {
      test.info().annotations.push({
        type: "coverage-limit",
        description:
          "Native Actions keys disallow hyphens; verify rejection instead of successful key CRUD under zz-test-only rules.",
      });
      const nativePath = `/${fixtures.repository}/settings/actions/${section}`;
      const rejected = await page.request.post(
        section === "secrets" ? nativePath : nativePath + "/new",
        {
          headers: { "X-Forgejo-UI": "1" },
          form: { name, data: "zz-test-value" },
        },
      );
      const result = await rejected.json();
      expect(
        Boolean(
          result.error || result.errorMessage || rejected.status() >= 400,
        ),
      ).toBe(true);
      const existing = await (
        await page.request.get(nativePath, { headers: { "X-Forgejo-UI": "1" } })
      ).json();
      expect(existing.items.some((item) => item.name === name)).toBe(false);
      continue;
    }
    await page
      .getByRole("button", { name: `Add ${noun}`, exact: true })
      .click();
    await page.getByLabel("Key", { exact: true }).fill(name);
    await page.getByLabel("Value", { exact: true }).fill("browser-value");
    await page
      .locator("form")
      .getByRole("button", { name: `Add ${noun}`, exact: true })
      .click();
    let row = page
      .locator(".configuration-list article")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toBeVisible();
    const response = await page.request.get(
      `/${fixtures.repository}/settings/actions/${section}`,
      { headers: { "X-Forgejo-UI": "1" } },
    );
    const data = await response.json();
    const item = data.items.find((value) => value.name === name);
    expect(item).toBeTruthy();
    if (section === "secrets") expect(item).not.toHaveProperty("data");
    else expect(item.data).toBe("browser-value");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByLabel(section === "secrets" ? "New value" : "Value", {
        exact: true,
      })
      .fill("updated-browser-value");
    await page
      .getByRole("button", { name: `Update ${noun}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Update ${noun}`, exact: true }),
    ).toHaveCount(0);
    await remove(page, row, name);
  }
});
test("native runner create edit detail and deletion", async ({ page }) => {
  const name = `zz-test-browser-runner-${Date.now()}`;
  await page.goto(`${root}/actions/runners/new`);
  await page.getByLabel("Runner name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Disposable browser test runner");
  await page
    .getByRole("button", { name: "Create runner", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Register your runner", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".configuration-token code")).toContainText(
    "connections:",
  );
  await page
    .getByRole("button", { name: "Finish registration", exact: true })
    .click();
  const row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated browser runner");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.goto(`${root}/actions/runners`);
  await row.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByText("Updated browser runner", { exact: true }),
  ).toBeVisible();
  await page.getByText("Remove runner", { exact: true }).click();
  await page
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/settings\/actions\/runners$/);
  await expect(row).toHaveCount(0);
});
test("native webhooks and LFS locks work in the SPA", async ({ page }) => {
  const url = `https://example.invalid/browser-webhook-${Date.now()}`;
  await page.goto(`${root}/hooks/forgejo/new`);
  await page.getByLabel("URL", { exact: true }).fill(url);
  await page.getByLabel("Enable webhook", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect(page).toHaveURL(/settings\/hooks$/);
  let row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByRole("link", { name: url, exact: true }) });
  await expect(row).toContainText("Disabled");
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue(url);
  await page.goto(`${root}/hooks`);
  const deletion = row.getByRole("button", { name: /Delete webhook/ });
  await deletion.click();
  await row
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  const path = `browser-lock-${Date.now()}.bin`;
  await page.goto(`${root}/lfs/locks`);
  await page.getByLabel("File path", { exact: true }).fill(path);
  await page.getByRole("button", { name: "Lock file", exact: true }).click();
  row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByText(path, { exact: true }) });
  await expect(row).toBeVisible();
  await remove(page, row, path, "Unlock");
  await page.goto(`${root}/lfs/pointers`);
  await expect(
    page.getByRole("heading", { name: "LFS pointers", exact: true }),
  ).toBeVisible();
});

test("project membership roles persist and non-admin readers cannot use settings", async ({
  page,
  browser,
}) => {
  const username = credentials.other.username;
  await page.goto(`${root}/collaboration`);
  let row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByText(`@${username}`, { exact: true }) });
  // This user has no fixture membership; retain any membership created elsewhere.
  if (await row.count())
    test.skip(true, "Fixture user already has collaboration access");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("option", { name: username, exact: true }).click();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(row).toBeVisible();
  await row
    .getByRole("combobox", { name: `Role for ${username}`, exact: true })
    .click();
  await page.getByRole("option", { name: "Read", exact: true }).click();
  await expect(row.getByRole("combobox")).toContainText("Read");
  await page.reload();
  await expect(row.getByRole("combobox")).toContainText("Read");
  const reader = await browser.newContext({
    baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  });
  const tab = await reader.newPage();
  await tab.goto("/-/ui/login");
  await tab.getByLabel("Username or email").fill(credentials.other.username);
  await tab
    .getByLabel("Password", { exact: true })
    .fill(credentials.other.password);
  await tab.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tab).toHaveURL(/\/projects$/);
  await tab.goto(root);
  await expect(
    tab.getByRole("heading", {
      name: "Project settings require administrator access",
      exact: true,
    }),
  ).toBeVisible();
  const response = await tab.request.get(
    `/${fixtures.repository}/settings/actions/secrets`,
    { headers: { "X-Forgejo-UI": "1" } },
  );
  expect([403, 404]).toContain(response.status());
  await reader.close();
  await remove(page, row, username, "Remove");
});
test("settings render dark mobile forms without horizontal overflow", async ({
  page,
}) => {
  await page.goto(`${root}/branches/edit`);
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByLabel("Branch name or pattern", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "playwright-results/settings-protection-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("isolated project feature changes and archive lifecycle use native confirmations", async ({
  page,
}) => {
  test.setTimeout(90000);
  const name = `zz-test-browser-settings-${Date.now()}`;
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${credentials.user.username}/${name}$`),
  );
  const full = `${credentials.user.username}/${name}`,
    settings = `/-/ui/projects/${full}/settings`;
  await page.goto(`/-/ui/projects/${full}/branches`);
  await page.getByRole("button", { name: "New branch", exact: true }).click();
  await page.getByLabel("Branch name", { exact: true }).fill("zz-test-release");
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "zz-test-release", exact: true }),
  ).toBeVisible();
  await page.goto(`${settings}/branches`);
  await page
    .getByRole("combobox", { name: "Default branch", exact: true })
    .click();
  await page
    .getByRole("option", { name: "zz-test-release", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Default branch", exact: true }),
  ).toContainText("zz-test-release");
  await page
    .getByRole("heading", { name: "Rename branch", exact: true })
    .click();
  await page
    .getByLabel("New branch name", { exact: true })
    .fill("zz-test-stable");
  await page
    .getByRole("button", { name: "Rename branch", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Default branch", exact: true }),
  ).toContainText("zz-test-stable");
  await page.goto(`${settings}/units`);
  await page.getByLabel("Enable time tracking", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(
    page.getByLabel("Enable time tracking", { exact: true }),
  ).toBeChecked();
  for (const title of [
    "Archive project",
    "Unarchive project",
    "Delete project",
  ]) {
    await page.goto(settings);
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: title, exact: true });
    await confirm
      .getByLabel(`Type ${full} to confirm`, { exact: true })
      .fill(full);
    await confirm.getByRole("button", { name: title, exact: true }).click();
    await expect(confirm).toHaveCount(0);
  }
  const response = await page.request.get(`/-/ui/data/repos/${full}`);
  expect(response.status()).toBe(404);
});

test("project transfer can be cancelled rejected and accepted by its recipient", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ baseURL: origin });
  const owner = await context.newPage();
  owner.on("pageerror", (e) => errors.push(e.message));
  owner.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await owner.goto("/-/ui/login");
  await owner.getByLabel("Username or email").fill(credentials.other.username);
  await owner
    .getByLabel("Password", { exact: true })
    .fill(credentials.other.password);
  await owner.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(owner).toHaveURL(/\/projects$/);
  const name = `zz-test-browser-transfer-${Date.now()}`,
    full = `${credentials.other.username}/${name}`;
  await owner.goto("/-/ui/projects/new");
  await owner.getByLabel("Project name", { exact: true }).fill(name);
  await owner
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(owner).toHaveURL(new RegExp(`/projects/${full}$`));
  const root = `/-/ui/projects/${full}`,
    settings = `${root}/settings`;
  async function transfer() {
    await owner.goto(settings);
    await owner.getByText("Advanced", { exact: true }).click();
    await owner
      .getByRole("button", { name: "Transfer project", exact: true })
      .click();
    const confirm = owner.getByRole("alertdialog", {
      name: "Transfer project",
      exact: true,
    });
    await confirm
      .getByLabel(`Type ${full} to confirm`, { exact: true })
      .fill(full);
    await confirm
      .getByLabel("New owner", { exact: true })
      .fill(credentials.user.username);
    await confirm
      .getByRole("button", { name: "Transfer project", exact: true })
      .click();
    await expect(
      owner.getByText("Project transfer pending", { exact: true }),
    ).toBeVisible();
  }
  await transfer();
  await owner
    .getByRole("button", { name: "Cancel transfer", exact: true })
    .click();
  await expect(
    owner.getByText("Project transfer pending", { exact: true }),
  ).toHaveCount(0);
  await transfer();
  await page.goto(root);
  await page
    .getByRole("button", { name: "Reject transfer", exact: true })
    .click();
  await expect(
    page.getByText("Project transfer pending", { exact: true }),
  ).toHaveCount(0);
  await transfer();
  await page.goto(root);
  await page
    .getByRole("button", { name: "Accept transfer", exact: true })
    .click();
  const newFull = `${credentials.user.username}/${name}`;
  await expect(page).toHaveURL(new RegExp(`/projects/${newFull}$`));
  await page.goto(`/-/ui/projects/${newFull}/settings`);
  await page.getByText("Advanced", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete project",
    exact: true,
  });
  await confirm
    .getByLabel(`Type ${newFull} to confirm`, { exact: true })
    .fill(newFull);
  await confirm
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  const response = await page.request.get(`/-/ui/data/repos/${newFull}`);
  expect(response.status()).toBe(404);
  await context.close();
});
