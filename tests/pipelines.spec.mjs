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
    await readFile(`${directory}/pipeline-fixtures.json`, "utf8"),
  );
} catch {}
test.skip(
  !fixture,
  "Run tests/runner-fixtures.mjs to create a disposable Docker runner",
);
const root = `/-/ui/projects/${fixture?.repository}`;
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
async function dispatch(page, message, seconds = 0) {
  await page.goto(`${root}/actions/new?workflow=zz-test-manual.yml`);
  await page.getByLabel("Message to print", { exact: true }).fill(message);
  await page
    .getByRole("combobox", { name: "Deployment environment", exact: true })
    .click();
  await page.getByRole("option", { name: "production", exact: true }).click();
  await page.getByLabel("Enable verification", { exact: true }).check();
  await page
    .getByLabel("Delay in seconds", { exact: true })
    .fill(String(seconds));
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click();
  await expect(page).toHaveURL(/actions\?workflow=zz-test-manual.yml$/);
  await page
    .locator(".pipeline-row")
    .first()
    .getByRole("link", { name: "zz-test-Browser verification", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^Pipeline #/ }),
  ).toBeVisible();
}
async function waitSuccess(page) {
  await expect(page.locator(".pipeline-summary .pipeline-badge")).toHaveText(
    "success",
    { timeout: 120000 },
  );
}
test("real runner dispatch inputs logs artifact download delete and retries", async ({
  page,
}) => {
  test.setTimeout(240000);
  const message = `zz-test-browser-run-${Date.now()}`;
  await dispatch(page, message);
  await waitSuccess(page);
  await page.getByRole("button", { name: /zz-test-Verify inputs/ }).click();
  await expect(page.locator(".job-log")).toContainText(
    `message=${message} environment=production enabled=true`,
  );
  await page.screenshot({
    path: "playwright-results/pipeline-success-logs.png",
    fullPage: true,
    animations: "disabled",
  });
  const log = await page.request.get(
    await page
      .getByRole("link", { name: "Download log", exact: true })
      .getAttribute("href"),
  );
  expect(log.status()).toBe(200);
  expect(await log.text()).toContain(message);
  const artifact = page.getByRole("link", {
    name: "zz-test-browser-report",
    exact: true,
  });
  await expect(artifact).toBeVisible();
  const response = await page.request.get(await artifact.getAttribute("href"));
  expect(response.status()).toBe(200);
  expect((await response.body()).length).toBeGreaterThan(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Delete artifact zz-test-browser-report",
      exact: true,
    })
    .click();
  await expect(artifact).toHaveCount(0);
  await page.getByRole("button", { name: "Retry job", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Job attempt", exact: true }),
  ).toContainText("Attempt 2");
  await waitSuccess(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Job attempt", exact: true }),
  ).toContainText("Attempt 3");
  await waitSuccess(page);
  await chooseAppearance(page, "Dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /zz-test-Verify inputs/ }).click();
  await expect(page.locator(".job-log")).toContainText(message);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/pipeline-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${fixture.repository}/actions$`));
  await page.goto(`${root}/actions?workflow=zz-test-manual.yml`);
  await page
    .getByRole("button", { name: "Disable workflow", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable workflow", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Enable workflow", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Disable workflow", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "playwright-results/pipeline-list-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("real runner in-progress pipeline cancellation", async ({ page }) => {
  test.setTimeout(120000);
  await dispatch(page, `zz-test-browser-cancel-${Date.now()}`, 90);
  await expect(page.locator(".pipeline-summary .pipeline-badge")).toHaveText(
    "running",
    { timeout: 45000 },
  );
  await page
    .getByRole("button", { name: "Prioritize pipeline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove priority", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove priority", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prioritize pipeline", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel pipeline", exact: true })
    .click();
  await expect(page.locator(".pipeline-summary .pipeline-badge")).toHaveText(
    "cancelled",
    { timeout: 30000 },
  );
  // Keep the cancelled task record until the runner acknowledges cancellation.
  // Completed-run deletion is covered by the preceding test.
});
test("pipeline status and actor filters preserve each other", async ({
  page,
}) => {
  test.setTimeout(150000);
  await dispatch(page, `zz-test-browser-filters-${Date.now()}`);
  await waitSuccess(page);
  const pipelineIndex = new URL(page.url()).pathname.match(/\/runs\/(\d+)/)[1];
  await page.goto(`${root}/actions`);
  await page
    .getByRole("combobox", { name: "Pipeline status", exact: true })
    .click();
  await page.getByRole("option", { name: "Success", exact: true }).click();
  await expect(page).toHaveURL(/status=1/);
  await expect(page.locator(".pipeline-row").first()).toBeVisible();
  for (const badge of await page.locator(".pipeline-row .pipeline-badge").all())
    await expect(badge).toHaveText("success");
  await page
    .getByRole("combobox", { name: "Triggered by", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`@${credentials.user.username}`) })
    .click();
  await expect(page).toHaveURL(/actor=\d+/);
  expect(new URL(page.url()).searchParams.get("status")).toBe("1");
  await expect(page.locator(".pipeline-row").first()).toBeVisible();
  await page
    .getByRole("link", { name: "Latest pipeline", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${fixture.repository}/actions/runs/${pipelineIndex}(?:/|$)`),
  );
  await expect(
    page.getByRole("heading", {
      name: `Pipeline #${pipelineIndex}`,
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${fixture.repository}/actions$`));
});
