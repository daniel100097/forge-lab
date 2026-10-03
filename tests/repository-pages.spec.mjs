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
const root = `/-/ui/projects/${fixtures.repository}`;
let errors = [];
async function login(page, key = "user") {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials[key].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[key].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await login(page);
});
test.afterEach(() => expect(errors).toEqual([]));

test("native branch create, delete, deleted list and restore", async ({
  page,
}) => {
  const name = `zz-test-browser-native-branch-${Date.now()}`;
  await page.goto(`${root}/branches`);
  await expect(
    page.getByRole("heading", { name: "Branches", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New branch", exact: true }).click();
  await page.getByLabel("Branch name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  const row = page
    .locator(".repository-reference-row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete branch", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Deleted", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(row).toBeVisible();
  await page.getByLabel("Search branches", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".repository-reference-row")).toHaveCount(1);
  await page.reload();
  await expect(row).toBeVisible();
});

test("native tag creation and deletion uses actual tag record", async ({
  page,
}) => {
  const name = `zz-test-browser-native-v1-${Date.now()}`;
  await page.goto(`${root}/tags?new=1`);
  await page.getByLabel("Tag name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create tag", exact: true }).click();
  const row = page
    .locator(".repository-reference-row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toBeVisible();
  // Forgejo asynchronously records pushed tags for its native tag-delete action.
  await expect
    .poll(async () => {
      await page.reload();
      await expect(row).toBeVisible();
      return await row
        .getByRole("button", { name: `Delete ${name}`, exact: true })
        .count();
    })
    .toBe(1);
  await row
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete tag", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

test("repository comparison, code search, graph and blame show real commits", async ({
  page,
}) => {
  const history = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/commits?ref=zz-test-feature-overview`,
    )
  ).json();
  await page.goto(
    `${root}/compare?target=${history.items[1].sha}&source=zz-test-feature-overview`,
  );
  await expect(page.locator(".diff-file").first()).toBeVisible();
  await page.getByRole("button", { name: /^Commits/ }).click();
  await expect(
    page
      .locator(".repository-reference-row")
      .filter({ hasText: "Add project overview" }),
  ).toBeVisible();
  await page.goto(`${root}/search?q=shared`);
  await expect(
    page.locator(".repository-search-result").filter({ hasText: "README.md" }),
  ).toBeVisible();
  await page.goto(`${root}/graph`);
  await expect(
    page.getByRole("img", { name: "Commit ancestry graph" }),
  ).toBeVisible();
  await expect(page.locator(".repository-graph-commit").first()).toBeVisible();
  await page.goto(`${root}/blame?ref=zz-test-main&path=README.md`);
  await expect(
    page
      .locator(".repository-blame-line")
      .filter({ hasText: "shared workspace" }),
  ).toBeVisible();
  await expect(page.locator(".repository-blame-commit").first()).toContainText(
    "Document the workspace",
  );
  await page.screenshot({
    path: "playwright-results/repository-blame-desktop.png",
  });
});

test("activity analytics and social pages support dark mobile deep links", async ({
  page,
}) => {
  await page.goto(`${root}/activity`);
  await expect(page.locator(".repository-activity-stats")).toBeVisible();
  await expect(page.locator(".repository-activity-stats")).toContainText(
    "Commits",
  );
  await page.goto(`${root}/activity/contributors`);
  await expect(
    page.locator(".repository-contributor-card").first(),
  ).toBeVisible({ timeout: 30000 });
  await page.goto(`${root}/activity/code-frequency`);
  await expect(
    page.locator(".repository-stat-table tbody tr").first(),
  ).toBeVisible();
  await page.goto(`${root}/activity/recent-commits`);
  await expect(
    page.locator(".repository-stat-table tbody tr").first(),
  ).toBeVisible();
  for (const kind of ["stars", "watchers", "forks"]) {
    await page.goto(`${root}/${kind}`);
    await expect(page.locator(".repository-page-header h1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${root}/branches`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".repository-reference-row").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/repository-branches-dark-mobile.png",
  });
});

test("read-only user cannot mutate branches and can fork to own namespace", async ({
  page,
}) => {
  const parent = `zz-test-reader-fork-parent-${Date.now()}`;
  const created = await page.evaluate(async (name) => {
    const boot = await (await fetch("/-/ui/data/bootstrap")).json();
    const result = await fetch("/repo/create", {
      method: "POST",
      headers: {
        "X-Forgejo-UI": "1",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        uid: String(boot.user.id),
        repo_name: name,
        auto_init: "on",
        default_branch: "zz-test-main",
        readme: "Default",
      }),
    });
    return {
      status: result.status,
      data: await result.json(),
      owner: boot.user.username,
    };
  }, parent);
  expect(created.status).toBeLessThan(400);
  expect(created.data.redirect).toContain(parent);
  const root = `/-/ui/projects/${created.owner}/${parent}`;
  await page.context().clearCookies();
  await login(page, "other");
  await page.goto(`${root}/branches`);
  await expect(page.locator(".repository-reference-row").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New branch", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
  await page.goto(`${root}/fork`);
  await expect(
    page.getByRole("heading", { name: "Fork project", exact: true }),
  ).toBeVisible();
  const forkName = `zz-test-browser-native-fork-${Date.now()}`;
  await page.getByLabel("Project name", { exact: true }).fill(forkName);
  await page.getByRole("button", { name: "Fork project", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`projects/zz-test-private-owner/${forkName}$`),
  );
  await expect(page.locator(".file-table-row").first()).toBeVisible();
  await page.goto(`${root}/forks`);
  await expect(
    page.getByRole("link", {
      name: `zz-test-private-owner/${forkName}`,
      exact: true,
    }),
  ).toBeVisible();
});
