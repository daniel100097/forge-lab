import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Disposable Docker fixture required");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
async function login(page, user = credentials.user) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
function captureErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  return errors;
}
async function select(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
test("personal owner board: native creation, issue assignment, move, columns and edit persist", async ({
  page,
  browser,
}) => {
  const errors = captureErrors(page);
  await login(page);
  const name = `zz-test-Owner board ${Date.now()}`;
  await page.goto("/-/ui/users/zz-test-studio/boards/new");
  await page.getByLabel("Board name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Cross-project work planning");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page).toHaveURL(/\/boards$/);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/boards\/\d+$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const url = page.url();
  const nativeRoot = `/zz-test-studio/-/projects/${url.split("/").pop()}`;
  await page
    .getByText("Add an existing issue or merge request", { exact: true })
    .click();
  await page
    .getByLabel("Issue reference", { exact: true })
    .fill("zz-test-studio/zz-test-atlas#1");
  await page.getByRole("button", { name: "Add to board", exact: true }).click();
  await expect(page.locator(".kanban-card")).toHaveCount(1);
  const title = await page
    .locator(".kanban-card")
    .getByRole("link", {
      name: "zz-test-Polish the project overview",
      exact: true,
    })
    .innerText();
  const initial = await (
    await page.request.get(nativeRoot, { headers: { "X-Forgejo-UI": "1" } })
  ).json();
  const target = initial.columns.at(-1);
  await select(page, `Move ${title} to column`, target.title);
  await expect(
    page.locator(".kanban-column").filter({
      has: page.getByRole("heading", { name: target.title, exact: true }),
    }),
  ).toContainText(title);
  await page
    .getByRole("button", { name: "Board actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "New column", exact: true }).click();
  await page
    .getByLabel("Column title", { exact: true })
    .fill("zz-test-Verified");
  await page.getByRole("button", { name: "Save column", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "zz-test-Verified", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Board actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit board", exact: true }).click();
  await page.getByLabel("Board name", { exact: true }).fill(name + " updated");
  await page.getByRole("button", { name: "Save board", exact: true }).click();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: name + " updated", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".kanban-card")).toHaveCount(1);
  const verified = await (
    await page.request.get(nativeRoot, { headers: { "X-Forgejo-UI": "1" } })
  ).json();
  expect(verified.columns.find((c) => c.id === target.id).issues.length).toBe(
    1,
  );
  const other = await browser.newContext();
  const visitor = await other.newPage();
  await login(visitor, credentials.other);
  await visitor.goto(url);
  await expect(
    visitor.getByRole("button", { name: "Board actions", exact: true }),
  ).toHaveCount(0);
  const denied = await visitor.request.get(nativeRoot + "/edit", {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect([403, 404]).toContain(denied.status());
  await other.close();
  expect(errors).toEqual([]);
});
test("project creation initializes native gitignore/license and template content", async ({
  page,
}) => {
  const errors = captureErrors(page);
  await login(page);
  const name = `zz-test-template-browser-${Date.now()}`;
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await select(page, "Add gitignore template", "Node");
  await select(page, "License", "MIT");
  await page.getByText("Advanced project options", { exact: true }).click();
  await page
    .getByLabel("Use this project as a template", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/zz-test-studio/${name}$`));
  await expect(page.locator(".file-table")).toContainText(".gitignore");
  await expect(page.locator(".file-table")).toContainText("LICENSE");
  await expect(page.locator(".file-table")).toContainText("README.md");
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name + "-copy");
  await page
    .getByText("Create from a project template", { exact: true })
    .click();
  await page.getByLabel("Search project templates", { exact: true }).fill(name);
  await select(page, "Project template", `zz-test-studio/${name}`);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/zz-test-studio/${name}-copy$`),
  );
  await expect(page.locator(".file-table")).toContainText(".gitignore");
  await expect(page.locator(".file-table")).toContainText("LICENSE");
  expect(errors).toEqual([]);
});
test("native import sources expose only supported metadata and auth controls", async ({
  page,
}) => {
  await login(page);
  await page.goto("/-/ui/projects/import");
  await expect(
    page.getByLabel("Git repository URL", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "GitLab", exact: true }).click();
  await expect(
    page.getByLabel("GitLab project URL", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Authentication for a private source", { exact: true })
    .click();
  await expect(page.getByLabel("Access token", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Merge requests", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Keep this project synchronized as a pull mirror", {
      exact: true,
    })
    .check();
  await expect(page.getByLabel("Merge requests", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "OneDev", exact: true }).click();
  await expect(page.getByLabel("Wiki", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Merge requests", { exact: true }),
  ).toBeVisible();
});
test("abuse report submits native form and prevents duplicate open report", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.FORGEJO_TEST_MODERATION !== "1",
    "Requires the isolated moderation-enabled fixture",
  );
  const other = await browser.newContext();
  const creator = await other.newPage();
  await login(creator, credentials.other);
  const target = `zz-test-report-target-${Date.now()}`;
  await creator.goto("/-/ui/organizations/new");
  await creator.getByLabel("Organization name", { exact: true }).fill(target);
  await creator
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(creator).toHaveURL(new RegExp(`/organizations/${target}$`));
  await other.close();
  await login(page);
  const profile = await (
    await page.request.get(`/${target}`, {
      headers: { "X-Forgejo-UI": "1" },
    })
  ).json();
  await page.goto(`/-/ui/report-abuse?type=org&id=${profile.profile.id}`);
  await select(page, "Report reason", "Other violations of platform rules");
  await page
    .getByRole("textbox", { name: /Additional information/ })
    .fill("Disposable browser test for the native abuse reporting workflow.");
  await page
    .getByRole("button", { name: "Submit report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Report submitted", exact: true }),
  ).toBeVisible();
  await page.goto(`/-/ui/report-abuse?type=org&id=${profile.profile.id}`);
  await expect(page.locator('main [role="alert"]')).toContainText(
    /already.*report/i,
  );
});
test("plain Git import clones real remote contents through native migration", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  const name = `zz-test-import-browser-${Date.now()}`;
  await page.goto("/-/ui/projects/import");
  await page
    .getByLabel("Git repository URL", { exact: true })
    .fill(
      `http://127.0.0.1:3000/${credentials.user.username}/zz-test-atlas.git`,
    );
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/zz-test-studio/${name}$`));
  const ready = page.getByRole("button", { name: "Open project", exact: true });
  for (let i = 0; i < 30; i++) {
    if (await page.locator(".file-table").count()) break;
    if (await ready.isVisible()) await ready.click();
    else await page.reload();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator(".file-table")).toContainText("README");
  await page
    .locator(".file-table-row")
    .filter({ hasText: "README" })
    .first()
    .click();
  await expect(page.locator("main")).toContainText("A shared workspace");
});
