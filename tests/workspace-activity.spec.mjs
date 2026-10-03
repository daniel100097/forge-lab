import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Disposable fixture required");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
async function login(page) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("workspace native activity, global issue filters, milestones, notifications and search", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await login(page);
  await page.goto("/-/ui/activity");
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".profile-activity")).toBeVisible();
  await page.goto("/-/ui/work/issues");
  await expect(page.locator(".issue-list")).toBeVisible();
  const data = await (
    await page.request.get("/issues?type=your_repositories&state=open", {
      headers: { "X-Forgejo-UI": "1" },
    })
  ).json();
  expect(data.items.length).toBeGreaterThan(0);
  await expect(page.locator(".issue-list")).toContainText(data.items[0].title);
  await page
    .getByRole("combobox", { name: "Filter work", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Created by you", exact: true })
    .click();
  await expect(page).toHaveURL(/type=created_by/);
  await page
    .getByLabel("Search work items", { exact: true })
    .fill("nonexistent-work-" + Date.now());
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching work items", exact: true }),
  ).toBeVisible();
  await page.goto("/-/ui/work/milestones");
  await expect(
    page.getByRole("heading", { name: "Milestones", exact: true }),
  ).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await page.goto("/-/ui/notifications");
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subscriptions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Subscription type", exact: true })
    .click();
  await page.getByRole("option", { name: "Issues", exact: true }).click();
  await expect(page).toHaveURL(/issueType=issues/);
  await page.getByRole("link", { name: "Watching", exact: true }).click();
  await expect(page.getByLabel("Search watched projects")).toBeVisible();
  await page.goto("/-/ui/search");
  await expect(
    page.getByRole("heading", { name: "Search code", exact: true }),
  ).toBeVisible();
  const searchData = await (
    await page.request.get("/explore/code", {
      headers: { "X-Forgejo-UI": "1" },
    })
  ).json();
  if (!searchData.enabled)
    await expect(
      page.getByRole("heading", {
        name: "Code search is not enabled",
        exact: true,
      }),
    ).toBeVisible();
  else {
    await page.getByLabel("Search code", { exact: true }).fill("zz-test-atlas");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test("native notification pin and read states persist and session events sign out other tabs", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/-/ui/notifications");
  const rows = page.locator(".notification-row");
  await expect(rows.first()).toBeVisible();
  const first = rows.first(),
    title = await first.locator("strong").innerText();
  if (await first.getByRole("button", { name: "Unpin", exact: true }).count())
    await first.getByRole("button", { name: "Unpin", exact: true }).click();
  const row = rows
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
  await row.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Unpin", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    row.getByRole("button", { name: "Unpin", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Unpin", exact: true }).click();
  await row.getByRole("button", { name: "Mark read", exact: true }).click();
  await page.getByRole("tab", { name: "Read", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark unread", exact: true }).click();
  await page.getByRole("tab", { name: "Unread", exact: true }).click();
  await expect(row).toBeVisible();
  const second = await context.newPage();
  await second.goto("/-/ui/projects");
  await second.getByRole("button", { name: /Account:/ }).click();
  await second.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(second).toHaveURL(/\/login$/);
  await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
