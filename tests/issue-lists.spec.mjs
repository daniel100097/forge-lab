import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable fixtures");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
let fixture;
try {
  fixture = JSON.parse(
    await readFile(`${directory}/issue-list-fixtures.json`, "utf8"),
  );
} catch {}
test.skip(
  !fixture,
  "Run tests/issue-list-fixtures.mjs on the disposable instance",
);
const root = `/-/ui/projects/${fixture?.repository}/issues`;
let errors = [];
async function login(page, user = credentials.user) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
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
async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function search(page, value) {
  await page
    .getByRole("textbox", { name: "Search issues", exact: true })
    .fill(value);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}
async function selectAll(page) {
  await page
    .getByRole("checkbox", {
      name: "Select all items on this page",
      exact: true,
    })
    .check();
}
test("issue search reaches body text off the first page and paging retains query and sort", async ({
  page,
}) => {
  await page.goto(`${root}?sort=latest`);
  const rows = page.locator(".native-issue-row");
  await expect(rows.first()).toBeVisible();
  await expect(
    rows.filter({ hasText: "zz-test-Oldest offpage needle" }),
  ).toHaveCount(0);
  await search(page, "cobalt porcupine");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("zz-test-Oldest offpage needle");
  await expect(page).toHaveURL(/sort=latest/);
  await search(page, "zz-test-Page filler");
  await expect(rows.first()).toContainText("zz-test-Page filler");
  const firstPageIds = await rows.evaluateAll((nodes) =>
    nodes.map((n) => n.dataset.issueId),
  );
  const count = await rows.count();
  expect(count).toBeLessThan(32);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("q")).toBe("zz-test-Page filler");
  expect(new URL(page.url()).searchParams.get("sort")).toBe("latest");
  await expect
    .poll(async () => rows.first().getAttribute("data-issue-id"))
    .not.toBe(firstPageIds[0]);
  const secondPageIds = await rows.evaluateAll((nodes) =>
    nodes.map((n) => n.dataset.issueId),
  );
  expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);
  await choose(page, "Sort work items", "Oldest created");
  await expect(page).toHaveURL(/sort=oldest/);
  const nativeOrder = await page.request.get(
    `/${fixture.repository}/issues?q=Page+filler&sort=oldest`,
    { headers: { "X-Forgejo-UI": "1" } },
  );
  expect(nativeOrder.ok()).toBe(true);
  const expectedIds = (await nativeOrder.json()).items.map((item) =>
    String(item.id),
  );
  await expect
    .poll(() =>
      rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.issueId)),
    )
    .toEqual(expectedIds);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
});
test("bulk metadata filters status pins reorder and delete use native issue endpoints", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto(`${root}?q=Bulk`);
  const rows = page.locator(".native-issue-row");
  await expect(rows).toHaveCount(2);
  await selectAll(page);
  await choose(page, "Bulk labels", "Add zz-test-ready");
  await expect(rows.nth(0)).toContainText("zz-test-ready");
  await expect(rows.nth(1)).toContainText("zz-test-ready");
  await selectAll(page);
  await choose(page, "Bulk milestone", "zz-test-List verification milestone");
  await expect(rows.nth(0)).toContainText(
    "zz-test-List verification milestone",
  );
  await expect(rows.nth(1)).toContainText(
    "zz-test-List verification milestone",
  );
  await selectAll(page);
  await choose(page, "Bulk assignees", `Toggle @${credentials.user.username}`);
  await expect(
    rows.locator(`img[alt="${credentials.user.username}"]`),
  ).toHaveCount(2);
  await selectAll(page);
  await choose(page, "Bulk board", "zz-test-List verification board");
  await expect(page.getByText("2 selected", { exact: true })).toHaveCount(0);
  await page.locator(".native-issue-filters summary").click();
  await choose(page, "Include label", "zz-test-ready");
  await choose(page, "Milestone", "zz-test-List verification milestone");
  await choose(page, "Assignee", credentials.user.username);
  await choose(page, "Board", "zz-test-List verification board");
  await choose(page, "My involvement", "Created by me");
  await expect(rows).toHaveCount(2);
  const params = new URL(page.url()).searchParams;
  for (const key of ["labels", "milestone", "assignee", "project", "type"])
    expect(params.has(key)).toBe(true);
  expect(params.get("q")).toBe("Bulk");
  await page.reload();
  await expect(rows).toHaveCount(2);
  await selectAll(page);
  await page
    .getByRole("button", { name: "Close selected", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("tab", { name: /^Closed/ }).click();
  await expect(rows).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Bulk");
  await selectAll(page);
  await page
    .getByRole("button", { name: "Reopen selected", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("tab", { name: /^Open/ }).click();
  await expect(rows).toHaveCount(2);
  for (const title of ["zz-test-Bulk alpha", "zz-test-Bulk beta"]) {
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
  await expect(pins.first()).toContainText("zz-test-Bulk alpha");
  await page
    .getByRole("button", {
      name: "Move pinned zz-test-Bulk beta up",
      exact: true,
    })
    .click();
  await expect(pins.first()).toContainText("zz-test-Bulk beta");
  await page.reload();
  await expect(pins.first()).toContainText("zz-test-Bulk beta");
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(pins).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/issues-filtered-pins-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const title of ["zz-test-Bulk alpha", "zz-test-Bulk beta"])
    await page
      .getByRole("button", { name: `Unpin ${title}`, exact: true })
      .click();
  await expect(pins).toHaveCount(0);
  await page.locator(".native-issue-filters summary").click();
  await choose(page, "Exclude label", "zz-test-ready");
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: /Exclude: zz-test-ready/ }).click();
  await expect(rows).toHaveCount(2);
  await selectAll(page);
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
});
test("read-only users cannot bulk mutate and merged requests remain separate from closed", async ({
  page,
  browser,
}) => {
  await page.goto(
    `/-/ui/projects/${fixture.repository}/merge-requests?state=merged`,
  );
  const rows = page.locator(".native-issue-row");
  await expect(rows.first()).toBeVisible();
  expect(await rows.locator(".native-issue-state.merged").count()).toBe(
    await rows.count(),
  );
  await page.getByRole("tab", { name: /^Closed/ }).click();
  await expect(rows.locator(".native-issue-state.merged")).toHaveCount(0);
  const response = await page.request.get(`/${fixture.repository}/issues`, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.items.length).toBeGreaterThan(0);
  const context = await browser.newContext({
    baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  });
  const reader = await context.newPage();
  await login(reader, credentials.other);
  await reader.goto(root);
  await expect(reader.locator(".native-issue-row").first()).toBeVisible();
  await expect(
    reader.getByRole("checkbox", {
      name: "Select all items on this page",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: /^Actions for / }),
  ).toHaveCount(0);
  const denied = await reader.request.post(
    `/${fixture.repository}/issues/status`,
    {
      headers: { "X-Forgejo-UI": "1" },
      form: { issue_ids: String(data.items[0].id), action: "close" },
    },
  );
  expect([403, 404]).toContain(denied.status());
  await context.close();
});
