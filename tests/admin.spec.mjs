import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  headers = {
    "X-Forgejo-UI": "1",
    Origin: base,
    "Sec-Fetch-Site": "same-origin",
  };
async function login(page, role = "admin") {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials[role].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("admin-only native pages and disposable user create/edit/delete", async ({
  page,
}) => {
  test.skip(
    !credentials.admin,
    "Disposable fixture requires a separate admin account.",
  );
  test.setTimeout(60000);
  await login(page);
  const name = `zz-test-managed-${Date.now()}`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API used");
  });
  for (const section of [
    "",
    "users",
    "orgs",
    "repos",
    "emails",
    "packages",
    "auths",
    "config",
    "config/settings",
    "notices",
    "monitor/stats",
    "monitor/cron",
    "monitor/queue",
    "monitor/stacktrace",
  ]) {
    const response = await page.request.get(
      `/admin${section ? "/" + section : ""}`,
      { headers },
    );
    expect(response.ok(), section).toBe(true);
    const data = await response.json();
    expect(data.page, section).toMatch(/^admin\//);
    expect(JSON.stringify(data), section).not.toMatch(
      /"(?:Passwd|Salt|Rands|PasswordHash|ClientSecret|BindPassword)"/,
    );
  }
  await page.goto("/-/ui/admin/users/new");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${name}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Disposable-Admin-User!123");
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await page.getByRole("link", { name: "Edit user", exact: true }).click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Managed user verified");
  await page.getByLabel("Restricted account", { exact: true }).check();
  await page.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByText("Managed user verified", { exact: true }),
  ).toBeVisible();
  const data = await (
    await page.request.get(`/admin/users/${id}`, { headers })
  ).json();
  expect(data.User.IsRestricted).toBe(true);
  expect(data.User.FullName).toBe("Managed user verified");
  await page.goto(`/-/ui/admin/users/${id}/edit`);
  await page.getByRole("button", { name: "Delete user", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete user", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.getByLabel("Search records", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No records found", exact: true }),
  ).toBeVisible();
  await page.context().clearCookies();
  await login(page, "user");
  const denied = await page.request.get("/admin/users", { headers });
  const body = await denied.text();
  expect(body).not.toContain("Managed user verified");
  expect(body).not.toContain('"Users"');
  await page.goto("/-/ui/admin");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(errors).toEqual([]);
});
test("authentication source credentials remain server-side across native editing", async ({
  page,
}) => {
  test.skip(
    !credentials.admin,
    "Disposable fixture requires a separate admin account.",
  );
  await login(page);
  const name = `zz-test-ldap-${Date.now().toString(36)}`,
    secret = "Fixture-bind-secret-123!";
  await page.goto("/-/ui/admin/auths/new");
  await page.getByLabel("Source name", { exact: true }).fill(name);
  await page.getByLabel("Enabled", { exact: true }).uncheck();
  await page
    .getByLabel("Enable user synchronization", { exact: true })
    .uncheck();
  await page.getByLabel("Host", { exact: true }).fill("ldap.example.test");
  await page
    .getByLabel("Bind DN", { exact: true })
    .fill("cn=forgejo,dc=example,dc=test");
  await page.getByLabel("Bind Password", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Add authentication source", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/auths(?:\/\d+)?$/);
  if (new URL(page.url()).pathname.endsWith("/auths"))
    await page.getByRole("link", { name, exact: true }).click();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const response = await page.request.get(`/admin/auths/${id}`, { headers });
  expect(await response.text()).not.toContain(secret);
  await page.getByLabel("Source name", { exact: true }).fill(`${name}-edited`);
  await page
    .getByRole("button", { name: "Save authentication source", exact: true })
    .click();
  await expect
    .poll(async () => {
      const persisted = await page.request.get(`/admin/auths/${id}`, {
        headers,
      });
      return (await persisted.json()).AuthFields.Name;
    })
    .toBe(`${name}-edited`);
  await page.goto("/-/ui/admin/auths");
  const row = page.locator("tr").filter({
    has: page.getByRole("link", { name: `${name}-edited`, exact: true }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete source", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete source", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

test("admin service health, enabled shared pages and queue worker settings", async ({
  page,
}) => {
  test.skip(
    !credentials.admin,
    "Disposable fixture requires a separate admin account.",
  );
  test.setTimeout(100000);
  await login(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const access = await (await page.request.get("/admin", { headers })).json();
  const routes = ["system_status", "hooks", "repos/unadopted"];
  if (access.SelfCheckEnabled) routes.push("self_check");
  if (access.OAuth2Enabled) routes.push("applications");
  if (access.ActionsEnabled)
    routes.push("actions/runners", "actions/variables");
  for (const section of routes) {
    await page.goto(`/-/ui/admin/${section}`);
    await expect(
      page.locator(".admin-content").getByRole("heading").first(),
    ).toBeVisible();
    await expect(page.locator(".admin-content [role=alert]")).toHaveCount(0);
  }
  if (access.SelfCheckEnabled) {
    await page.goto("/-/ui/admin/self_check");
    await expect(
      page.getByText("No database problems found.", { exact: true }),
    ).toBeVisible();
  }
  const queues = await (
    await page.request.get("/admin/monitor/queue", { headers })
  ).json();
  expect(queues.Queues.length).toBeGreaterThan(0);
  const queue =
    queues.Queues.find((q) => q.Name === "mail") || queues.Queues[0];
  await page.goto(`/-/ui/admin/monitor/queue/${queue.ID}`);
  const workers = page.getByLabel("Maximum workers", { exact: true });
  await expect(workers).toHaveValue(String(queue.MaxWorkers));
  const original = Number(queue.MaxWorkers),
    changed = original > 0 ? original + 1 : 2;
  await workers.fill(String(changed));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/admin/monitor/queue/${queue.ID}`, {
              headers,
            })
          ).json()
        ).Queue.MaxWorkers,
    )
    .toBe(changed);
  await workers.fill(String(original));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/admin/monitor/queue/${queue.ID}`, {
              headers,
            })
          ).json()
        ).Queue.MaxWorkers,
    )
    .toBe(original);
  await page.goto("/-/ui/admin");
  await expect(page.locator(".admin-metrics > div")).toHaveCount(8);
  await expect(page.locator(".admin-metrics")).not.toContainText("…");
  await page.screenshot({
    path: "playwright-results/admin-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await chooseAppearance(page, "Dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".admin-metrics > div")).toHaveCount(8);
  await expect(page.locator(".admin-metrics")).not.toContainText("…");
  await page.screenshot({
    path: "playwright-results/admin-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "playwright-results/admin-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
