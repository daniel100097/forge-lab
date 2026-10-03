import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("File editor tests require disposable Docker fixtures.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;
const nativeRoot = `/${fixtures.repository}`;
const pageHeaders = { "X-Forgejo-UI": "1", Accept: "application/json" };

test("file editor previews, creates a branch, commits directly and preserves concurrent edits", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/v1"))
      errors.push("Unexpected integration API request");
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto(`${root}?ref=zz-test-main&path=README.md`);
  await page.getByRole("link", { name: "Edit file", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit file", exact: true }),
  ).toBeVisible();
  const editor = page.getByRole("textbox", {
    name: "File content",
    exact: true,
  });
  const commitMessage = page.getByLabel("Commit message", { exact: true });
  await expect(commitMessage.locator("..")).toHaveCSS("display", "flex");
  await expect(commitMessage.locator("..")).toHaveCSS(
    "flex-direction",
    "column",
  );
  await expect(commitMessage).toHaveCSS("border-top-style", "solid");
  expect((await commitMessage.boundingBox()).width).toBeGreaterThan(500);
  await expect(page.locator(".cm-scroller")).toHaveCSS(
    "font-family",
    /GitLab Mono/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => Math.round((await page.locator(".main").boundingBox()).x))
    .toBe(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await commitMessage.boundingBox()).width).toBeGreaterThan(280);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(async () => (await commitMessage.boundingBox()).width)
    .toBeGreaterThan(500);
  await editor.fill(
    "# Browser editor\n\nA change from the single-file editor.\n",
  );
  await page.getByRole("tab", { name: /Preview changes/ }).click();
  await expect(page.locator(".file-editor-preview .diff-file")).toContainText(
    "Browser editor",
  );
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  await expect(editor).toContainText("Browser editor");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/edit\?/);
  await expect(editor).toContainText("Browser editor");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/\/edit\?/);
  await expect(editor).toContainText("Browser editor");
  await page
    .getByRole("radio", { name: "Create a new branch", exact: true })
    .check();
  const branch = `zz-test-browser/editor-${Date.now()}`;
  await page.getByLabel("New branch name", { exact: true }).fill(branch);
  await page
    .getByLabel("Start a new merge request with these changes")
    .uncheck();
  await page
    .getByLabel("Commit message", { exact: true })
    .fill("Verify browser editor commit");
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`ref=${encodeURIComponent(branch)}`));
  await expect(page.locator(".code-panel .markdown h1")).toHaveText(
    /^#?Browser editor$/,
  );

  const nativeEditor = `${nativeRoot}/_edit/${branch}/README.md`;
  await page.goto(nativeEditor);
  await expect(page).toHaveURL(
    new RegExp(`/edit\\?.*ref=${encodeURIComponent(branch)}`),
  );
  await expect(editor).toContainText("Browser editor");
  await editor.fill(
    "# Browser editor\n\nCommitted directly to the new branch.\n",
  );
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(page.locator(".code-panel .markdown")).toContainText(
    "Committed directly to the new branch.",
  );
  await page.getByRole("link", { name: "Edit file", exact: true }).click();
  await expect(editor).toContainText("Committed directly to the new branch.");
  const original = await (
    await page.request.get(nativeEditor, { headers: pageHeaders })
  ).json();
  expect(original.branch).toBe(branch);
  expect(original.last_commit).toMatch(/^[0-9a-f]{40,64}$/);
  expect(original.commit_mails.length).toBeGreaterThan(0);
  const form = {
    tree_path: "README.md",
    content: "# Concurrent edit\n\nA different commit won the race.\n",
    commit_summary: "Concurrent edit",
    commit_choice: "direct",
    last_commit: original.last_commit,
    commit_mail_id: String(original.commit_mails[0].id),
  };
  const hostile = await page.request.post(nativeEditor, {
    headers: {
      ...pageHeaders,
      Origin: "https://untrusted.example",
      "Sec-Fetch-Site": "cross-site",
    },
    form,
  });
  expect(hostile.status()).toBe(403);
  const result = await page.request.post(nativeEditor, {
    headers: pageHeaders,
    form,
  });
  expect(result.ok()).toBeTruthy();
  expect((await result.json()).redirect).toBeTruthy();
  await editor.fill(
    "# Stale edit\n\nThis must not overwrite the concurrent commit.\n",
  );
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(editor).toContainText("Stale edit");
  const saved = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/tree?${new URLSearchParams({ ref: branch, path: "README.md" })}`,
    )
  ).json();
  expect(saved.content).toContain("A different commit won the race.");
  expect(saved.content).not.toContain("Stale edit");
  const anonymous = await request.get(nativeEditor, { headers: pageHeaders });
  const anonymousData = await anonymous.json();
  expect(anonymousData.content).toBeUndefined();
  expect(errors).toEqual([]);
});
