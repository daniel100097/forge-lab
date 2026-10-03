import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("Workspace tests require disposable Docker fixtures.");
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
test("organization teams, membership, project namespace and visibility persist", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await login(page);
  const org = `zz-test-browser-org-${Date.now()}`;
  const root = `/-/ui/organizations/${org}`;
  await page.goto("/-/ui/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(org);
  await page
    .getByRole("combobox", { name: "Organization visibility", exact: true })
    .click();
  await page.getByRole("option", { name: /Private/ }).click();
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${org}$`));
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await page.getByRole("link", { name: "New team", exact: true }).click();
  await page
    .getByLabel("Team name", { exact: true })
    .fill("zz-test-developers");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Read access for a real organization team.");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "zz-test-developers", exact: true }),
  ).toBeVisible();
  const sidebar = page.getByRole("navigation", {
    name: "Organization navigation",
  });
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await sidebar.getByRole("button", { name: "Pin Teams", exact: true }).click();
  await expect(
    sidebar.getByRole("link", { name: "Teams", exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    sidebar.getByRole("button", { name: "Unpin Teams", exact: true }),
  ).toBeVisible();
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await sidebar.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(
    sidebar.getByRole("link", { name: "Teams", exact: true }),
  ).toBeVisible();
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await sidebar.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(
    sidebar.getByRole("link", { name: "Teams", exact: true }),
  ).toHaveCount(1);
  await page
    .getByLabel(/^Username(?: or email)?$/)
    .fill(credentials.other.username);
  await page.getByRole("button", { name: "Add to team", exact: true }).click();
  await expect(page.locator(".organization-members")).toContainText(
    `@${credentials.other.username}`,
  );
  await page.goto(root);
  await page.getByRole("link", { name: "New project", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Project namespace", exact: true }),
  ).toContainText(org);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("zz-test-shared-source");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${org}/zz-test-shared-source$`),
  );
  await page.goto(`${root}/teams/zz-test-developers/repositories`);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("zz-test-shared-source");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await expect(page.locator(".organization-members")).toContainText(
    `${org}/zz-test-shared-source`,
  );
  await page.goto(`${root}/members`);
  await page
    .getByRole("button", {
      name: `Actions for ${credentials.other.username}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Make membership public", exact: true })
    .click();
  await expect(
    page
      .locator(".organization-members article")
      .filter({ hasText: `@${credentials.other.username}` }),
  ).toContainText("Public");
  await page.goto(`${root}/settings`);
  await page
    .getByLabel("Display name", { exact: true })
    .fill("zz-test-Browser workspace");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Settings saved through Forgejo.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Organization settings saved",
  );
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "zz-test-Browser workspace",
  );
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await login(member, credentials.other);
  await member.goto(root);
  await expect(
    member.getByRole("heading", {
      name: "zz-test-Browser workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(member.locator(".repo-list")).toContainText(
    `${org}/zz-test-shared-source`,
  );
  await member.goto(`${root}/settings`);
  await expect(
    member.getByRole("button", { name: "Save changes", exact: true }),
  ).toHaveCount(0);
  const denied = await member.request.get(`/org/${org}/settings`, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect([403, 404]).toContain(denied.status());
  await memberContext.close();
  const anonymous = await browser.newContext();
  const response = await anonymous.request.get(`/${org}`, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect([403, 404]).toContain(response.status());
  await anonymous.close();
  expect(errors).toEqual([]);
});
test("public directory and profile follow state use native routes", async ({
  page,
}) => {
  await login(page);
  await page.goto("/-/ui/users");
  await page.getByLabel("Search users").fill(credentials.other.username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .locator(".workspace-people a")
    .filter({ hasText: `@${credentials.other.username}` })
    .click();
  await expect(page.locator(".profile-username")).toContainText(
    `@${credentials.other.username}`,
  );
  const following = page.getByRole("button", { name: "Unfollow", exact: true });
  if (await following.count()) await following.click();
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(following).toBeVisible();
  await page.reload();
  await expect(following).toBeVisible();
  await following.click();
  await expect(
    page.getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Profile navigation" })
    .getByRole("link", { name: "Activity", exact: true })
    .click();
  await expect(page.locator(".profile-activity")).toBeVisible();
});

test("organization labels, OAuth application, blocked users, avatar and deletion use native settings", async ({
  page,
}) => {
  await login(page);
  const org = `zz-test-browser-settings-${Date.now()}`;
  const root = `/-/ui/organizations/${org}`;
  await page.goto("/-/ui/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(org);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${org}$`));
  await page.goto(`${root}/settings/labels`);
  await page.getByRole("button", { name: "New label", exact: true }).click();
  await page
    .getByLabel("Label name", { exact: true })
    .fill("zz-test-team::design");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A shared label created through the SPA.");
  await page.getByRole("button", { name: "Save label", exact: true }).click();
  await expect(
    page.locator(".account-row").filter({ hasText: "zz-test-team::design" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".account-row").filter({ hasText: "zz-test-team::design" }),
  ).toContainText("A shared label");
  await page.goto(`${root}/settings/applications`);
  await page
    .getByLabel("Application name", { exact: true })
    .fill("zz-test-Browser organization app");
  await page
    .getByLabel("Redirect URIs", { exact: true })
    .fill("https://example.invalid/callback");
  await page
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/oauth2\/\d+$/);
  await expect(page.locator(".account-secret")).toBeVisible();
  await page
    .getByLabel("Application name", { exact: true })
    .fill("zz-test-Updated organization app");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Application name", { exact: true }),
  ).toHaveValue("zz-test-Updated organization app");
  await expect(page.locator(".account-secret")).toHaveCount(0);
  await page.goto(`${root}/settings/blocked_users`);
  await page
    .getByLabel("Username", { exact: true })
    .fill(credentials.other.username);
  await page.getByRole("button", { name: "Block user", exact: true }).click();
  await expect(page.locator(".account-row")).toContainText(
    credentials.other.username,
  );
  await page.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No blocked users", exact: true }),
  ).toBeVisible();
  await page.goto(`${root}/settings/avatar`);
  await page.getByLabel("Avatar image").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YCp0r8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Upload avatar", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Avatar updated");
  await page.goto(`${root}/settings/storage_overview`);
  await expect(
    page.getByRole("heading", { name: /Storage usage/ }),
  ).toBeVisible();
  await page.goto(`${root}/settings/delete`);
  await page.getByLabel(`Type ${org} to confirm`, { exact: true }).fill(org);
  await page
    .getByRole("button", { name: "Delete organization", exact: true })
    .click();
  await expect(page).toHaveURL(/\/-\/ui\/organizations$/);
});
test("organization dashboards and shared webhook, runner, secret and variable settings work", async ({
  page,
}) => {
  await login(page);
  const org = `zz-test-org-integrations-${Date.now()}`,
    root = `/-/ui/organizations/${org}/settings`;
  await page.goto("/-/ui/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(org);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/organizations/${org}$`));
  for (const route of ["activity", "issues", "merge-requests", "milestones"]) {
    await page.goto(`/-/ui/organizations/${org}/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  }
  const hook = `https://example.invalid/${org}`;
  await page.goto(`${root}/hooks/forgejo/new`);
  await page.getByLabel("URL", { exact: true }).fill(hook);
  await page.getByLabel("Enable webhook", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect(page).toHaveURL(/settings\/hooks$/);
  const hookrow = page
    .locator(".configuration-list article")
    .filter({ has: page.getByRole("link", { name: hook, exact: true }) });
  await expect(hookrow).toContainText("Disabled");
  await hookrow.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue(hook);
  for (const section of ["variables", "secrets"]) {
    const noun = section === "secrets" ? "secret" : "variable",
      name = `${process.env.FORGEJO_TEST_PREFIX_ONLY === "1" ? "zz-test-" : ""}ORG_${section.toUpperCase()}_${Date.now()}`;
    await page.goto(`${root}/actions/${section}`);
    if (process.env.FORGEJO_TEST_PREFIX_ONLY === "1") {
      test.info().annotations.push({
        type: "coverage-limit",
        description:
          "Native Actions keys disallow hyphens; verify rejection instead of successful key CRUD under zz-test-only rules.",
      });
      const nativePath = `/org/${org}/settings/actions/${section}`;
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
    await page.getByLabel("Value", { exact: true }).fill("workspace-value");
    await page
      .locator("form")
      .getByRole("button", { name: `Add ${noun}`, exact: true })
      .click();
    const row = page
      .locator(".configuration-list article")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toBeVisible();
    const data = await (
      await page.request.get(`/org/${org}/settings/actions/${section}`, {
        headers: { "X-Forgejo-UI": "1" },
      })
    ).json();
    const item = data.items.find((i) => i.name === name);
    expect(item).toBeTruthy();
    if (section === "secrets")
      expect(JSON.stringify(item)).not.toContain("workspace-value");
    else expect(item.data).toBe("workspace-value");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByLabel(section === "secrets" ? "New value" : "Value", {
        exact: true,
      })
      .fill("updated-workspace-value");
    await page
      .getByRole("button", { name: `Update ${noun}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Update ${noun}`, exact: true }),
    ).toHaveCount(0);
  }
  const runner = `zz-test-org-runner-${Date.now()}`;
  await page.goto(`${root}/actions/runners/new`);
  await page.getByLabel("Runner name", { exact: true }).fill(runner);
  await page
    .getByRole("button", { name: "Create runner", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Register your runner", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish registration", exact: true })
    .click();
  await expect(page.locator(".configuration-list")).toContainText(runner);
  await page.goto(`${root}/packages`);
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator("main")).toContainText(/Package/i);
});
