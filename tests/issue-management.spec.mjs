import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";

const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error(
    "Use a disposable Docker fixture for issue-management mutations.",
  );
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;
const data = `/-/ui/data/repos/${fixtures.repository}`;
const native = `/${fixtures.repository}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("labels and milestones persist, issue metadata uses native mutations, and validation rejects stale edits", async ({
  page,
}) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      failures.push("Integration API request");
  });
  const suffix = Date.now().toString(36);
  const labelName = `zz-test-review-${suffix}`,
    milestoneName = `zz-test-Release ${suffix}`;
  await page.goto(`${root}/labels`);
  await page.getByRole("button", { name: "New label", exact: true }).click();
  const labelForm = page.getByRole("form", { name: "New label" });
  await labelForm.getByLabel("Title", { exact: true }).fill(labelName);
  await labelForm
    .getByLabel("Description", { exact: true })
    .fill("Ready for review");
  await labelForm.getByRole("button", { name: "Create label" }).click();
  const labelRow = page
    .locator(".label-management-row")
    .filter({ hasText: labelName });
  await expect(labelRow).toBeVisible();
  await labelRow
    .getByRole("button", { name: `Edit label ${labelName}` })
    .click();
  await page
    .getByRole("form", { name: "Edit label" })
    .getByLabel("Description", { exact: true })
    .fill("Reviewed and ready");
  await page
    .getByRole("form", { name: "Edit label" })
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(labelRow).toContainText("Reviewed and ready");

  await page.goto(`${root}/milestones/new`);
  await page.getByLabel("Title", { exact: true }).fill(milestoneName);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Ship the reviewed work");
  await page.getByLabel("Due date", { exact: true }).fill("2027-01-15");
  await page.getByRole("button", { name: "Create milestone" }).click();
  await page.getByRole("link", { name: milestoneName, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: milestoneName, exact: true }),
  ).toBeVisible();
  const milestoneURL = page.url();

  await page.goto(`${root}/issues/1`);
  await page.getByRole("button", { name: "Edit labels", exact: true }).click();
  const popup = page.locator(".metadata-popup");
  await popup.getByRole("button", { name: labelName, exact: true }).click();
  await expect(
    popup.getByRole("button", { name: labelName, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Issue milestone", exact: true })
    .click();
  await page.getByRole("option", { name: milestoneName, exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Issue milestone", exact: true }),
  ).toContainText(milestoneName);
  await page
    .getByRole("button", { name: "Edit assignees", exact: true })
    .click();
  const assignee = popup.getByRole("button", {
    name: credentials.user.username,
    exact: true,
  });
  if ((await assignee.getAttribute("aria-pressed")) !== "true")
    await assignee.click();
  await expect(assignee).toHaveAttribute("aria-pressed", "true");
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit due date", exact: true })
    .click();
  await popup.getByLabel("Due date", { exact: true }).fill("2027-01-10");
  await popup.getByRole("button", { name: "Save date" }).click();
  await expect(page.locator(".discussion-aside")).toContainText("2027-01-10");
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".discussion-aside")).toContainText(labelName);
  await expect(
    page.getByRole("combobox", { name: "Issue milestone", exact: true }),
  ).toContainText(milestoneName);

  const metadata = await (
    await page.request.get(`${data}/issues/1/metadata`)
  ).json();
  expect(metadata.assignee_ids.length).toBeGreaterThan(0);
  expect(metadata.due_date).toBe("2027-01-10");
  const nativeForm = async (route, form) =>
    page.request.post(route, { form, headers: { "X-Forgejo-UI": "1" } });
  const initial = await (await page.request.get(`${data}/issues/1`)).json();
  const changed = await nativeForm(`${native}/issues/1/content`, {
    content: `${initial.issue.body}\n\nRevision ${suffix}`,
    content_version: String(metadata.content_version),
    ignore_attachments: "true",
  });
  expect(changed.ok()).toBeTruthy();
  const stale = await nativeForm(`${native}/issues/1/content`, {
    content: "Stale overwrite",
    content_version: String(metadata.content_version),
    ignore_attachments: "true",
  });
  expect(await stale.json()).toHaveProperty("errorMessage");
  expect((await page.request.get(`${data}/issues/4/metadata`)).status()).toBe(
    404,
  );
  expect(
    (
      await page.request.get(`/-/ui/data/repos/${fixtures.denied}/labels`)
    ).status(),
  ).toBe(404);

  await page.goto(milestoneURL);
  await expect(page.locator(".milestone-issue-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close milestone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen milestone", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reopen milestone", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/milestones$/);
  await page.goto(`${root}/labels`);
  await labelRow.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(labelRow).toHaveCount(0);
  expect(failures).toEqual([]);
});

test("board settings create, reorder, edit and delete real columns", async ({
  page,
}) => {
  const suffix = Date.now().toString(36),
    listName = `zz-test-Verify ${suffix}`;
  await page.goto(`${root}/boards/${fixtures.board}/settings`);
  await page
    .getByLabel("Board title", { exact: true })
    .fill(`zz-test-Delivery ${suffix}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Board saved.");
  const addForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Add list", exact: true }),
  });
  await addForm.getByLabel("List title", { exact: true }).fill(listName);
  await addForm.getByRole("button", { name: "Add list", exact: true }).click();
  let row = page.locator(".board-column-setting").filter({ hasText: listName });
  await expect(row).toBeVisible();
  const columnCount = await page.locator(".board-column-setting").count();
  await row.getByRole("button", { name: `Move ${listName} left` }).click();
  await expect(
    page.locator(".board-column-setting").nth(columnCount - 2),
  ).toContainText(listName);
  await row.getByRole("button", { name: `Actions for ${listName}` }).click();
  await page.getByRole("menuitem", { name: "Edit list", exact: true }).click();
  await row.getByLabel("List title", { exact: true }).fill(`${listName} ready`);
  await row.getByRole("button", { name: "Save list", exact: true }).click();
  await expect(row).toContainText(`${listName} ready`);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Close board", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reopen board", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen board", exact: true }).click();
});

test("time tracking and dependencies expose and persist native issue actions", async ({
  page,
}) => {
  await page.goto(`${root}/issues/2`);
  await page
    .getByRole("button", { name: "Edit time tracking", exact: true })
    .click();
  const popup = page.locator(".metadata-popup");
  await popup.getByLabel("Hours", { exact: true }).fill("0");
  await popup.getByLabel("Minutes", { exact: true }).fill("45");
  await popup.getByRole("button", { name: "Add time", exact: true }).click();
  await expect(popup.locator(".tracked-time-row")).toContainText("0h 45m");
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".discussion-aside")).toContainText("0h 45m spent");
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop timer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel timer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start timer", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Edit dependencies", exact: true })
    .click();
  await popup.getByLabel("Dependency issue", { exact: true }).fill("#3");
  await popup
    .getByRole("button", { name: "Add dependency", exact: true })
    .click();
  await expect(page.locator(".dependency-row")).toContainText(
    "zz-test-Review the first release",
  );
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".dependency-row")).toContainText(
    "zz-test-Review the first release",
  );
  await page
    .getByRole("button", {
      name: "Remove dependency zz-test-Review the first release",
      exact: true,
    })
    .click();
  await expect(page.locator(".dependency-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit time tracking", exact: true })
    .click();
  await popup
    .getByRole("button", {
      name: `Delete 0h 45m tracked by ${credentials.user.username}`,
      exact: true,
    })
    .click();
  await expect(popup.locator(".tracked-time-row")).toHaveCount(0);
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".discussion-aside")).toContainText("0h 0m spent");
});

test("label template selection, milestone edit and board default/delete complete native planning workflows", async ({
  page,
}) => {
  test.setTimeout(90000);
  const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100",
    headers = {
      "X-Forgejo-UI": "1",
      Origin: base,
      "Sec-Fetch-Site": "same-origin",
    };
  const name = `zz-test-planning-${Date.now()}`,
    repo = `${credentials.user.username}/${name}`,
    ui = `/-/ui/projects/${repo}`;
  const owners = await (
    await page.request.get("/repo/create", { headers })
  ).json();
  const created = await page.request.post("/repo/create", {
    headers,
    form: {
      uid: String(
        owners.owners.find((o) => o.name === credentials.user.username).id,
      ),
      repo_name: name,
      private: "false",
      auto_init: "true",
      readme: "Default",
      default_branch: "zz-test-main",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await page.goto(`${ui}/labels`);
  const labels = await (
    await page.request.get(`/-/ui/data/repos/${repo}/labels`)
  ).json();
  const template =
    labels.templates.find((t) => t.name === "Default") || labels.templates[0];
  expect(template).toBeTruthy();
  await page
    .getByRole("combobox", { name: "Label template", exact: true })
    .click();
  await page
    .getByRole("option")
    .filter({ hasText: template.name })
    .first()
    .click();
  if (process.env.FORGEJO_TEST_PREFIX_ONLY === "1") {
    test.info().annotations.push({
      type: "coverage-limit",
      description:
        "Stock templates create unprefixed labels; explicit prefixed label creation replaces template import.",
    });
    await page.getByRole("button", { name: "New label", exact: true }).click();
    await page
      .getByRole("form", { name: "New label" })
      .getByLabel("Title", { exact: true })
      .fill("zz-test-planning-label");
    await page
      .getByRole("button", { name: "Create label", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Import labels", exact: true })
      .click();
  }
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/-/ui/data/repos/${repo}/labels`)
          ).json()
        ).items.length,
    )
    .toBeGreaterThan(0);
  await page.goto(`${ui}/milestones/new`);
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Planning release");
  await page
    .getByRole("button", { name: "Create milestone", exact: true })
    .click();
  await page
    .getByRole("link", { name: "zz-test-Planning release", exact: true })
    .click();
  await page.getByRole("link", { name: "Edit milestone", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Planning release updated");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Milestone editor persistence");
  await page.getByLabel("Due date", { exact: true }).fill("2027-02-03");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/milestones\/\d+$/);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Planning release updated",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Milestone editor persistence", { exact: true }),
  ).toBeVisible();
  await page.goto(`${ui}/boards/new`);
  await page
    .getByLabel("Board name", { exact: true })
    .fill("zz-test-Planning board");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page).toHaveURL(/boards$/);
  await page.getByRole("link", { name: /zz-test-Planning board/ }).click();
  await expect(page).toHaveURL(/boards\/\d+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await page.goto(`${ui}/boards/${id}/settings`);
  const data = await (
    await page.request.get(`/-/ui/data/repos/${repo}/projects/${id}/settings`)
  ).json();
  const column = data.columns.find((c) => !c.default);
  const row = page
    .locator(".board-column-setting")
    .filter({ hasText: column.title });
  await row
    .getByRole("button", { name: `Actions for ${column.title}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Set as default list", exact: true })
    .click();
  await expect(row.getByText("Default", { exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByText("Default", { exact: true })).toBeVisible();
  await page
    .locator(".management-danger")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${repo}/boards$`));
  expect(
    (
      await page.request.get(`/-/ui/data/repos/${repo}/projects/${id}/settings`)
    ).status(),
  ).toBe(404);
});
