import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error(
    "Set FORGEJO_TEST_FIXTURES to a disposable Docker fixture directory.",
  );
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Unexpected integration API request");
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
test.afterEach(async () => {
  expect(errors).toEqual([]);
});

test("project search, real sort, grid view and import form", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Sort", exact: true }).click();
  await page.getByRole("option", { name: "Name, A–Z", exact: true }).click();
  await expect(
    page.locator(".repo-row").filter({ hasText: "zz-test-atlas" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.locator(".repo-list")).toHaveClass(/grid-view/);
  await page.locator("#project-search").fill("no-such-project");
  await page.locator("#project-search").press("Enter");
  await expect(
    page.getByRole("heading", { name: "No matching projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(
    page.locator(".repo-row").filter({ hasText: "zz-test-atlas" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Import an existing project" }).click();
  await expect(
    page.getByRole("heading", { name: "Import a project" }),
  ).toBeVisible();
  await expect(page.getByLabel("Git repository URL")).toBeVisible();
});

test("code browser, Markdown, clone fallback, star, history and diff", async ({
  page,
}) => {
  await page.goto(root);
  await expect(page.locator(".readme-panel .markdown h1")).toBeVisible();
  await expect(page.locator(".file-table-row").first()).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    }),
  );
  await page
    .getByRole("button", { name: "Copy HTTPS URL", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copied" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Starred", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Starred", exact: true }).click();
  await page
    .locator(".file-table-row")
    .filter({ hasText: "README.md" })
    .click();
  await expect(page.locator(".code-panel .markdown h1")).toBeVisible();
  await page
    .getByRole("button", { name: "View source code", exact: true })
    .click();
  await expect(page.locator(".source-line").first()).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Commits", exact: true }),
  ).toBeVisible();
  await page.locator(".commit-list-row a").first().click();
  await expect(page.locator(".diff-file").first()).toBeVisible();
});

test("one active sidebar item and pin preferences survive reload", async ({
  page,
}) => {
  await page.goto(`${root}/issues`);
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  await nav
    .getByRole("button", { name: "Unpin Issues", exact: true })
    .first()
    .click();
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  await page.reload();
  await expect(
    nav
      .getByRole("group", { name: "Pinned", exact: true })
      .getByRole("link", { name: /^Issues/ }),
  ).toHaveCount(0);
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  await nav.getByRole("button", { name: "Pin Issues", exact: true }).click();
  await page.reload();
  await expect(
    nav
      .getByRole("group", { name: "Pinned", exact: true })
      .getByRole("link", { name: /^Issues/ }),
  ).toHaveCount(1);
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  await nav.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
});

test("issue Markdown preview, comment and close/reopen persist", async ({
  page,
}) => {
  await page.goto(`${root}/issues/1`);
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  const body = "**Browser verified** comment with `code`.";
  const comment = page.getByLabel("Comment", { exact: true });
  await comment.fill("Browser verified comment with `code`.");
  await comment.evaluate((field) =>
    field.setSelectionRange(0, "Browser verified".length),
  );
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(comment).toHaveValue(body);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator(".markdown-editor strong")).toHaveText(
    "Browser verified",
  );
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(
    page.locator(".discussion-entry").filter({ hasText: "Browser verified" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close issue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reopen issue", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reopen issue", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen issue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close issue", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});

test("wiki creation and editing, releases, and project settings persist", async ({
  page,
}) => {
  await page.goto(`${root}/wiki`);
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByLabel("Page title").fill(`zz-test-Guide ${Date.now()}`);
  await page
    .getByLabel("Page content", { exact: true })
    .fill("# Team guide\n\nA **shared** place for documentation.");
  await page.getByRole("button", { name: "Save page", exact: true }).click();
  await expect(
    page
      .locator(".wiki-layout .markdown")
      .getByRole("heading", { name: "Team guide", exact: true, level: 1 }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Page content", { exact: true })
    .fill("# Updated guide\n\nSaved through the normal endpoint.");
  await page.getByRole("button", { name: "Save page", exact: true }).click();
  await expect(
    page
      .locator(".wiki-layout .markdown")
      .getByRole("heading", { name: "Updated guide", exact: true, level: 1 }),
  ).toBeVisible();
  await page.goto(`${root}/releases`);
  await page.getByRole("link", { name: "New release", exact: true }).click();
  await page.getByLabel("Tag name").fill(`zz-test-v0.1.0-ui-${Date.now()}`);
  await page.getByLabel("Release title").fill("zz-test-Browser tested release");
  await page
    .getByLabel("Release notes", { exact: true })
    .fill("## Changes\n\n- A complete release form");
  await page
    .getByRole("button", { name: "Create release", exact: true })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "zz-test-Browser tested release" })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".release-entry")
      .filter({
        has: page.getByRole("heading", {
          name: "zz-test-Browser tested release",
          exact: true,
        }),
      })
      .getByRole("heading", { name: "Changes", exact: true, level: 2 }),
  ).toBeVisible();
  await page.goto(`${root}/settings`);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Project details saved from the new UI.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Project details saved from the new UI.",
  );
});

test("profile saves without changing existing privacy fields", async ({
  page,
}) => {
  const before = await page.evaluate(
    async () =>
      await (
        await fetch("/user/settings", { headers: { "X-Forgejo-UI": "1" } })
      ).json(),
  );
  await page.goto("/-/ui/account");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("zz-test-Browser Test User");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Profile updated.");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "zz-test-Browser Test User",
  );
  const after = await page.evaluate(
    async () =>
      await (
        await fetch("/user/settings", { headers: { "X-Forgejo-UI": "1" } })
      ).json(),
  );
  for (const key of [
    "visibility",
    "keep_email_private",
    "keep_activity_private",
    "keep_pronouns_private",
  ])
    expect(after[key]).toEqual(before[key]);
});

test("common pages and private-resource denial stay in the SPA", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const [url, heading] of [
    [`${root}/boards`, "Issue boards"],
    [`${root}/actions`, "Pipelines"],
    ["/-/ui/notifications", "Notifications"],
    ["/-/ui/organizations", "Organizations"],
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("This screen is being rebuilt")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.goto("/-/ui/projects/" + fixtures.denied);
  await expect(page.getByRole("alert")).toContainText(
    "does not exist or you do not have access",
  );
});

test("notifications can be marked read and unread", async ({ page }) => {
  await page.goto("/-/ui/notifications");
  const row = page
    .locator(".notification-row")
    .filter({ hasText: "zz-test-Polish the project overview" })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark read", exact: true }).click();
  await page.getByRole("tab", { name: "Read", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark unread", exact: true }).click();
  await page.getByRole("tab", { name: "Unread", exact: true }).click();
  await expect(row).toBeVisible();
});

test("board filter, card movement and creation from a board persist", async ({
  page,
}) => {
  await page.goto(`${root}/boards/${fixtures.board}`);
  await page.getByLabel("Filter board").fill("Polish");
  await expect(page.locator(".kanban-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear board filter" }).click();
  const card = page
    .locator(".kanban-card")
    .filter({ hasText: "zz-test-Polish the project overview" });
  await card.getByRole("combobox").click();
  await page.getByRole("option", { name: "To Do", exact: true }).click();
  await expect(
    page
      .locator(".kanban-column")
      .filter({
        has: page.getByRole("heading", { name: "To Do", exact: true }),
      })
      .locator(".kanban-card"),
  ).toContainText("Polish");
  await page.reload();
  await expect(card.getByRole("combobox")).toHaveText("To Do");
  await page.getByRole("link", { name: "New issue", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Created directly from the board");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Created directly from the board",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${root}/boards/${fixtures.board}`);
  await expect(
    page
      .locator(".kanban-card")
      .filter({ hasText: "zz-test-Created directly from the board" }),
  ).toBeVisible();
});

test("mobile pages do not overflow and navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [
    root,
    `${root}/issues`,
    `${root}/issues/1`,
    `${root}/boards/${fixtures.board}`,
    `${root}/releases`,
    `${root}/wiki`,
    `${root}/settings`,
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("main").getByRole("heading").first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".sidebar")).not.toBeVisible();
});

test("merge request overview, actual changes and native merge", async ({
  page,
}) => {
  await page.goto(`${root}/merge-requests/${fixtures.pull}`);
  await expect(
    page
      .locator(".issue-description .markdown")
      .getByRole("heading", { name: "Summary", exact: true, level: 2 }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Changes/ }).click();
  await expect(page.locator(".diff-file summary")).toContainText("overview.md");
  await expect(page.locator(".diff-line.added").first()).toContainText(
    "Project overview",
  );
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(page.locator(".diff-file[open]")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Changed files" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".diff-file[open]")).toHaveCount(1);
  await page.getByRole("tab", { name: /Overview/ }).click();
  await expect(
    page.getByRole("button", { name: "Merge", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.locator(".merge-panel h3")).toHaveText("Merged");
  await page.goto(`${root}/merge-requests?state=merged`);
  await expect(page.locator(".issue-row")).toHaveCount(1);
  await expect(page.locator(".issue-row").first()).toContainText(
    "Add project overview",
  );
  await page.getByRole("tab", { name: /^Closed/ }).click();
  await expect(page.locator(".issue-row")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No closed merge requests" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(
    page.locator(".issue-row").filter({ hasText: "Add project overview" }),
  ).toHaveCount(1);
  await page.goto(`${root}/merge-requests/${fixtures.pull}`);
  await page.reload();
  await expect(page.locator(".merge-panel h3")).toHaveText("Merged");
});

test("dropdown search, keyboard selection, and form values", async ({
  page,
}) => {
  await page.goto(root);
  const branch = page.getByRole("button", {
    name: "Switch branch",
    exact: true,
  });
  await branch.click();
  const search = page.getByRole("textbox", {
    name: "Filter branches and tags…",
    exact: true,
  });
  await search.fill("no-matching-branch");
  await expect(
    page.getByText("No results found.", { exact: true }),
  ).toBeVisible();
  await search.fill("zz-test-feature-overview");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page
    .getByRole("option", { name: "zz-test-feature-overview", exact: true })
    .focus();
  await page
    .getByRole("option", { name: "zz-test-feature-overview", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/ref=zz-test-feature-overview/);
  await expect(branch).toContainText("zz-test-feature-overview");
  await branch.click();
  await expect(search).toBeVisible();
  await expect(branch).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(branch).toHaveAttribute("aria-expanded", "false");
  await expect(branch).toBeFocused();
  await expect(page.getByRole("option")).toHaveCount(0);

  await page.goto("/-/ui/projects");
  const sort = page.getByRole("combobox", { name: "Sort", exact: true });
  await sort.focus();
  await sort.press("Space");
  await expect(
    page.getByRole("option", { name: "Recently updated", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=leastupdate/);
  await expect(sort).toHaveText("Least recently updated");

  await page.goto("/-/ui/projects/new");
  await page.getByRole("combobox", { name: "Visibility", exact: true }).click();
  await page.getByRole("option", { name: /Public/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Visibility", exact: true }),
  ).toHaveText("Public");
  expect(
    await page
      .locator(".workspace-form")
      .evaluate((form) => new FormData(form).get("private")),
  ).toBe("");
  await page.getByRole("combobox", { name: "Visibility", exact: true }).click();
  await page.getByRole("option", { name: /Private/ }).click();
  expect(
    await page
      .locator(".workspace-form")
      .evaluate((form) => new FormData(form).get("private")),
  ).toBe("on");

  await page.goto(`${root}/merge-requests/new`);
  await page
    .getByRole("combobox", { name: "Source branch", exact: true })
    .click();
  await page
    .getByRole("option", { name: "zz-test-feature-overview", exact: true })
    .click();
  expect(
    await page.locator(".mr-branch-form").evaluate((form) => ({
      head: new FormData(form).get("head"),
      base: new FormData(form).get("base"),
    })),
  ).toEqual({ head: "zz-test-feature-overview", base: "zz-test-main" });
});

test("create and account menus navigate, dismiss and sign out", async ({
  page,
}) => {
  await page.goto(root);
  const create = page.getByRole("button", { name: "Create new", exact: true });
  await create.click();
  await expect(page).toHaveURL(new RegExp(`${root}$`));
  await expect(
    page.getByRole("menuitem", { name: "New issue", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await create.click();
  await page
    .getByRole("menuitem", { name: "New merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/merge-requests\/new$/);
  await expect(page.getByRole("menu")).toHaveCount(0);

  const account = page.getByRole("button", {
    name: `Account: ${credentials.user.username}`,
    exact: true,
  });
  await account.click();
  await page
    .getByRole("menuitem", { name: "Edit profile", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await account.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.mouse.click(400, 160);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await account.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const bootstrap = await page.request.get("/-/ui/data/bootstrap");
  expect((await bootstrap.json()).user).toBeNull();
});

test("pipeline list opens a real queued run and its jobs", async ({ page }) => {
  await page.goto(`${root}/actions`);
  await expect(page.locator(".pipeline-row").first()).toBeVisible({
    timeout: 15000,
  });
  await page
    .locator(".pipeline-row")
    .first()
    .locator('a[href*="/actions/runs/"]')
    .click();
  await expect(page).toHaveURL(/actions\/runs\/\d+$/);
  await expect(page.locator(".pipeline-summary")).toBeVisible();
  await expect(page.locator(".pipeline-jobs a").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
