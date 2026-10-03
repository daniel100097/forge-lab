import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const dir = process.env.FORGEJO_TEST_FIXTURES;
if (!dir) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
    await readFile(`${dir}/credentials.json`, "utf8"),
  ),
  fixtures = JSON.parse(await readFile(`${dir}/fixtures.json`, "utf8"));
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  headers = {
    "X-Forgejo-UI": "1",
    "Sec-Fetch-Site": "same-origin",
    Origin: base,
  };
async function login(page, role = "user") {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials[role].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("discussion comments, reactions, history, attachments, board/reference, subscription, pin and lock lifecycle", async ({
  page,
  browser,
}) => {
  test.setTimeout(100000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API used");
  });
  await login(page);
  const title = `zz-test-Discussion lifecycle ${Date.now()}`,
    repo = fixtures.repository;
  const created = await page.request.post(`/${repo}/issues/new`, {
    headers,
    form: { title, content: "Initial discussion description" },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const index = Number(
      (await created.json()).redirect.match(/issues\/(\d+)/)[1],
    ),
    root = `/-/ui/projects/${repo}/issues/${index}`;
  const data = async () =>
    (await page.request.get(`/-/ui/data/repos/${repo}/issues/${index}`)).json();
  await page.goto(root);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const editor = page.getByRole("form", { name: "Edit issue", exact: true });
  await editor
    .getByLabel("Description", { exact: true })
    .fill("Updated discussion description");
  await editor.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "zz-test-description.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Description attachment fixture\n"),
  });
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page
      .locator(".issue-description")
      .getByRole("link", { name: "zz-test-description.txt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await editor
    .getByLabel("Description", { exact: true })
    .fill("Updated again, retaining description attachment");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page
      .locator(".issue-description")
      .getByRole("link", { name: "zz-test-description.txt", exact: true }),
  ).toBeVisible();
  const subscribed = (await data()).lifecycle.watching;
  await page
    .getByRole("button", {
      name: subscribed ? "Unsubscribe" : "Subscribe",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await data()).lifecycle.watching)
    .toBe(!subscribed);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  await expect.poll(async () => (await data()).lifecycle.pinned).toBe(true);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Unpin", exact: true }).click();
  await expect.poll(async () => (await data()).lifecycle.pinned).toBe(false);
  await page
    .getByLabel("Issue reference", { exact: true })
    .fill("zz-test-main");
  await page
    .getByRole("button", { name: "Save reference", exact: true })
    .click();
  await expect
    .poll(async () => (await data()).lifecycle.reference)
    .toBe("zz-test-main");
  await page
    .getByRole("combobox", { name: "Issue board", exact: true })
    .click();
  const board = (await data()).lifecycle.projects.find(
    (item) => item.id === fixtures.board,
  );
  await page.getByRole("option", { name: board.title, exact: true }).click();
  await expect
    .poll(async () => (await data()).lifecycle.project_id)
    .toBe(fixtures.board);
  await page
    .locator(".issue-description")
    .getByRole("button", { name: "Add reaction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "React with +1", exact: true })
    .click();
  await expect(
    page
      .locator(".issue-description")
      .getByRole("button", { name: "Remove +1 reaction (1)", exact: true }),
  ).toBeVisible();
  await page
    .locator(".issue-description")
    .getByRole("button", { name: "Remove +1 reaction (1)", exact: true })
    .click();
  await expect
    .poll(async () => (await data()).lifecycle.reactions.length)
    .toBe(0);
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Comment with attached file");
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "zz-test-discussion.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Browser attachment fixture\n"),
  });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const entry = page
    .locator(".discussion-entry")
    .filter({ hasText: "Comment with attached file" });
  await expect(entry).toBeVisible();
  const link = entry.getByRole("link", {
    name: "zz-test-discussion.txt",
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(
    await (await page.request.get(await link.getAttribute("href"))).text(),
  ).toBe("Browser attachment fixture\n");
  await entry
    .getByRole("button", { name: "Add reaction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "React with heart", exact: true })
    .click();
  await expect(
    entry.getByRole("button", {
      name: "Remove heart reaction (1)",
      exact: true,
    }),
  ).toBeVisible();
  await entry
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await entry
    .getByLabel("Edit comment", { exact: true })
    .fill("Edited comment with attached file");
  await entry
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  const edited = page
    .locator(".discussion-entry")
    .filter({ hasText: "Edited comment with attached file" });
  await expect(
    edited.getByRole("link", { name: "zz-test-discussion.txt", exact: true }),
  ).toBeVisible();
  await edited
    .getByRole("button", { name: "Comment edit history", exact: true })
    .click();
  const history = page.getByRole("dialog", {
    name: "Edit history",
    exact: true,
  });
  await expect(history.locator(".history-columns")).toContainText(
    "Edited comment with attached file",
  );
  await expect(history.locator(".history-columns")).toContainText(
    "Comment with attached file",
  );
  await history
    .getByRole("button", { name: "Delete revision", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete this revision?", exact: true })
    .getByRole("button", { name: "Delete revision", exact: true })
    .click();
  await expect(history.locator(".history-columns")).toContainText(
    "Content removed",
  );
  await history
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Lock discussion", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lock discussion", exact: true })
    .click();
  await expect.poll(async () => (await data()).lifecycle.locked).toBe(true);
  const otherContext = await browser.newContext({ baseURL: base });
  const other = await otherContext.newPage();
  await login(other, "other");
  const otherData = await (
    await other.request.get(`/-/ui/data/repos/${repo}/issues/${index}`)
  ).json();
  expect(otherData.lifecycle.can_manage).toBe(false);
  expect(otherData.can_comment).toBe(false);
  const denied = await other.request.post(`/${repo}/issues/${index}/comments`, {
    headers,
    form: { content: "Should be denied" },
  });
  expect(denied.ok()).toBe(false);
  await otherContext.close();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Unlock discussion", exact: true })
    .click();
  await expect.poll(async () => (await data()).lifecycle.locked).toBe(false);
  await expect(
    page
      .locator(".discussion-event")
      .filter({ hasText: "locked this discussion" }),
  ).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "playwright-results/discussion-lifecycle-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await chooseAppearance(page, "Dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "playwright-results/discussion-lifecycle-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "playwright-results/discussion-lifecycle-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await edited
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await expect(edited).toHaveCount(0);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete issue", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete issue", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${repo}/issues$`));
  expect(
    (
      await page.request.get(`/-/ui/data/repos/${repo}/issues/${index}`)
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
});
