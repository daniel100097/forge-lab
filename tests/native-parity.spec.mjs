import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";

const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("Native parity checks require disposable fixtures.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("native Swagger authorizations, schemas and real API execution remain available", async ({
  page,
}) => {
  await page.goto("/-/ui/help/api");
  const frame = page.frameLocator("iframe");
  await expect(
    frame.locator('.opblock-tag[data-tag="miscellaneous"]'),
  ).toBeVisible({ timeout: 60000 });
  await frame.locator(".auth-wrapper .authorize").click();
  await expect(frame.locator(".dialog-ux")).toBeVisible();
  await expect(frame.locator(".auth-container").first()).toBeVisible();
  const basic = frame
    .locator(".auth-container")
    .filter({ hasText: "Basic authorization" });
  await basic.locator("#auth_username").fill(credentials.user.username);
  await basic.locator("#auth_password").fill(credentials.user.password);
  await basic
    .getByRole("button", { name: "Apply credentials", exact: true })
    .click();
  await expect(basic).toContainText("Logout");
  await frame.locator(".dialog-ux .close-modal").click();
  await frame.locator('.opblock-tag[data-tag="miscellaneous"]').click();
  await frame.getByText("/version", { exact: true }).click();
  const operation = frame.locator("#operations-miscellaneous-getVersion");
  await operation
    .getByRole("button", { name: "Try it out", exact: true })
    .click();
  await operation.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(operation.locator(".responses-inner")).toContainText("version");
  await expect(operation.locator(".live-responses-table")).toContainText("200");
  await expect(page).toHaveURL(/#\/miscellaneous\/getVersion$/);
  await chooseAppearance(page, "Dark");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(operation.locator(".live-responses-table")).toContainText("200");
  await frame.locator('.opblock-tag[data-tag="user"]').click();
  await frame.getByText("/user", { exact: true }).click();
  const currentUser = frame.locator("#operations-user-userGetCurrent");
  await currentUser
    .getByRole("button", { name: "Try it out", exact: true })
    .click();
  await currentUser
    .getByRole("button", { name: "Execute", exact: true })
    .click();
  await expect(currentUser.locator(".live-responses-table")).toContainText(
    "200",
  );
  await expect(currentUser.locator(".responses-inner")).toContainText(
    credentials.user.username,
  );
  await page.reload();
  await expect(frame.locator("#operations-user-userGetCurrent")).toHaveClass(
    /is-open/,
  );
  await page
    .getByRole("button", { name: "Searchable reference", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Find an endpoint" }),
  ).toBeVisible();
  await page.goto("/-/ui/help/api/forgejo");
  await expect(
    page.frameLocator("iframe").locator(".swagger-ui .info"),
  ).toBeVisible({ timeout: 60000 });
  await chooseAppearance(page, "System");
});

test("native Markdown table/link/indent/font tools persist rendered issue content", async ({
  page,
}) => {
  const title = `zz-test-Markdown parity ${Date.now()}`;
  await page.goto(`${root}/issues/new?blank=1`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.fill("zz-test-parity ");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page
    .getByLabel("Link URL", { exact: true })
    .fill("https://example.test/zz-test-link");
  await page.getByLabel("Link text", { exact: true }).fill("zz-test-link");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await page.getByLabel("Rows", { exact: true }).fill("2");
  await page.getByLabel("Columns", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(description).toHaveValue(/\| Header +\| Header +\| Header +\|/);
  await page
    .getByRole("button", { name: "Toggle monospace font", exact: true })
    .click();
  await expect(description).toHaveClass(/font-sans/);
  await description.press("ControlOrMeta+Enter");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".issue-description .markdown table"),
  ).toBeVisible();
  await expect(
    page.locator(
      '.issue-description a[href="https://example.test/zz-test-link"]',
    ),
  ).toBeVisible();
});

test("enhanced Markdown editor retains legacy tools, keyboard behavior and undo", async ({
  page,
}) => {
  await page.goto(`${root}/issues/new?blank=1`);
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.fill("zz-test-keyboard");
  await description.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(description).toHaveValue("**zz-test-keyboard**");
  await description.press("ControlOrMeta+z");
  await expect(description).toHaveValue("zz-test-keyboard");
  await description.fill("first\nsecond");
  await description.press("ControlOrMeta+a");
  await description.press("Tab");
  await expect(description).toHaveValue("    first\n    second");
  await description.press("Shift+Tab");
  await expect(description).toHaveValue("first\nsecond");
  await description.fill("### zz-test-heading");
  await page.getByRole("button", { name: "Heading 1", exact: true }).click();
  await expect(description).toHaveValue("# zz-test-heading");
  await page.getByRole("button", { name: "Heading 1", exact: true }).click();
  await expect(description).toHaveValue("zz-test-heading");
  await description.fill("- [x] zz-test-task");
  await description.press("End");
  await description.press("Enter");
  await expect(description).toHaveValue("- [x] zz-test-task\n- [ ] ");
  await description.press("Enter");
  await expect(description).toHaveValue("- [x] zz-test-task\n\n");
  await description.fill("zz-test-formatting");
  await description.press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: "Strikethrough", exact: true })
    .click();
  await expect(description).toHaveValue("~~zz-test-formatting~~");
  await page
    .getByRole("button", { name: "Toggle side-by-side preview", exact: true })
    .click();
  await expect(page.locator(".markdown-editor .markdown del")).toHaveText(
    "zz-test-formatting",
  );
  await page
    .getByRole("button", { name: "Toggle fullscreen editor", exact: true })
    .click();
  await expect(page.locator(".markdown-editor")).toHaveClass(/fixed inset-0/);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Link URL", { exact: true })
    .fill("https://example.test/zz-test-fullscreen");
  await dialog
    .getByLabel("Link text", { exact: true })
    .fill("zz-test-fullscreen");
  await dialog.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(description).toHaveValue(
    /\[zz-test-fullscreen\]\(https:\/\/example.test\/zz-test-fullscreen\)/,
  );
  await description.focus();
  await description.press("Escape");
  await expect(page.locator(".markdown-editor")).not.toHaveClass(
    /fixed inset-0/,
  );
});

test("explore retains the native relevance preference and URL override", async ({
  page,
}) => {
  await page.goto("/-/ui/projects?tab=explore&only_show_relevant=true");
  const control = page.getByRole("checkbox", {
    name: "Show only relevant projects",
    exact: true,
  });
  await expect(control).toBeChecked();
  await control.uncheck();
  await expect(page).toHaveURL(/only_show_relevant=false/);
  await page.reload();
  await expect(control).not.toBeChecked();
  const response = await page.request.get(
    "/explore/repos?only_show_relevant=false",
    { headers: { "X-Forgejo-UI": "1" } },
  );
  expect((await response.json()).only_show_relevant).toBe(false);
});
