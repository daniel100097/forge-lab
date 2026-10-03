import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("Use a disposable FORGEJO_TEST_FIXTURES directory.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const headers = {
  "X-Forgejo-UI": "1",
  Origin: base,
  "Sec-Fetch-Site": "same-origin",
};
const root = `/-/ui/projects/${fixtures.repository}`;
async function login(page, key = "user") {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials[key].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[key].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
async function createMR(page) {
  const suffix = Date.now(),
    branch = `zz-test-review-${suffix}`;
  const editorPath = `/${fixtures.repository}/_edit/zz-test-main/README.md`;
  const editor = await (await page.request.get(editorPath, { headers })).json();
  const commit = await page.request.post(editorPath, {
    headers,
    form: {
      tree_path: "README.md",
      content: `${editor.content}\nzz-test-Review lifecycle ${suffix}\n`,
      last_commit: editor.last_commit,
      commit_summary: `zz-test-Review lifecycle ${suffix}`,
      commit_message: "",
      commit_choice: "commit-to-new-branch",
      new_branch_name: branch,
      commit_mail_id: String(editor.commit_mails[0].id),
    },
  });
  expect(commit.ok(), await commit.text()).toBe(true);
  const result = await page.request.post(
    `/${fixtures.repository}/compare/zz-test-main...${branch}`,
    {
      headers,
      form: {
        title: `zz-test-Review lifecycle ${suffix}`,
        content: "Review fixture",
        base_branch: "zz-test-main",
        head_branch: branch,
      },
    },
  );
  expect(result.ok(), await result.text()).toBe(true);
  const body = await result.json();
  const number = Number(body.redirect.match(/pulls\/(\d+)/)?.[1]);
  expect(number).toBeGreaterThan(0);
  return { number, branch, suffix };
}
test("native review request, private draft, approval, inline edit/reply, resolution and viewed state", async ({
  page,
  browser,
}) => {
  test.setTimeout(100000);
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API used");
  });
  await login(page);
  const { number, suffix } = await createMR(page);
  const otherContext = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 1000 },
  });
  const other = await otherContext.newPage();
  other.on("pageerror", (err) => errors.push(err.message));
  other.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API used");
  });
  await login(other, "other");
  expect(
    (
      await other.request.post(`/${fixtures.repository}/action/watch`, {
        headers,
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`${root}/merge-requests/${number}`);
  await page
    .getByRole("combobox", { name: "Request review from", exact: true })
    .click();
  await page
    .getByRole("option", { name: credentials.other.username, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Request review", exact: true })
    .click();
  await expect(page.locator(".review-status-row")).toContainText(
    "Review requested",
  );
  await other.goto(`${root}/merge-requests/${number}?tab=changes`);
  const added = other
    .locator(".diff-line.added")
    .filter({ hasText: `zz-test-Review lifecycle ${suffix}` });
  await added.hover();
  await added.getByRole("button", { name: /Comment on/ }).click();
  await other
    .getByLabel("Inline comment", { exact: true })
    .fill(`Draft note ${suffix}`);
  await other
    .getByRole("button", { name: "Add to review", exact: true })
    .click();
  await expect(
    other.getByText("Pending review", { exact: true }),
  ).toBeVisible();
  const draftData = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/pulls/${number}/review`,
    )
  ).json();
  expect(JSON.stringify(draftData)).not.toContain(`Draft note ${suffix}`);
  await other
    .getByRole("button", { name: "Finish review (1)", exact: true })
    .click();
  await other
    .getByLabel("Review summary", { exact: true })
    .fill(`Approved after review ${suffix}`);
  await other
    .getByRole("combobox", { name: "Review outcome", exact: true })
    .click();
  await other.getByRole("option", { name: "Approve", exact: true }).click();
  await other
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(other.getByText("Pending review", { exact: true })).toHaveCount(
    0,
  );
  await other.getByLabel("Viewed", { exact: true }).click();
  await expect(other.getByLabel("Viewed", { exact: true })).toBeChecked();
  await other.reload();
  await expect(other.getByLabel("Viewed", { exact: true })).toBeChecked();
  await other
    .getByRole("button", { name: "Side-by-side", exact: true })
    .click();
  await expect(other.locator(".diff-parallel")).toBeVisible();
  const thread = other.locator(".review-thread").first();
  await thread
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await thread
    .getByLabel("Edit inline comment", { exact: true })
    .fill(`Updated note ${suffix}`);
  await thread
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await expect(thread).toContainText(`Updated note ${suffix}`);
  await page.reload();
  await expect(page.locator(".review-status-row")).toContainText("Approved");
  const summaryId = await page
    .locator(".discussion-entry")
    .filter({ hasText: `Approved after review ${suffix}` })
    .getAttribute("id");
  const summary = page.locator(`#${summaryId}`);
  await summary
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await summary
    .getByLabel("Edit comment", { exact: true })
    .fill(`Edited review summary ${suffix}`);
  await summary
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await expect(
    page
      .locator(".discussion-entry")
      .filter({ hasText: `Edited review summary ${suffix}` }),
  ).toBeVisible();

  const published = page
    .locator(".review-thread")
    .filter({ hasText: `Updated note ${suffix}` });
  await published.getByRole("button", { name: "Reply…", exact: true }).click();
  await published
    .getByLabel("Reply", { exact: true })
    .fill(`Author reply ${suffix}`);
  await published.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(published).toContainText(`Author reply ${suffix}`);
  await published
    .getByRole("button", { name: "Resolve discussion", exact: true })
    .click();
  await expect(published.getByText("Resolved", { exact: true })).toBeVisible();
  await published
    .getByRole("button", { name: "Reopen discussion", exact: true })
    .click();
  await expect(published.getByText("Resolved", { exact: true })).toHaveCount(0);
  await page
    .locator(".review-status-row")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await expect(
    page.locator(".review-status-row").filter({ hasText: "Approved" }),
  ).toHaveCount(0);
  await other
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  await expect(
    other.getByRole("dialog", { name: "Submit review", exact: true }),
  ).toBeVisible();
  await other.keyboard.press("Escape");
  await expect(
    other.getByRole("dialog", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
  await other
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  await other
    .getByLabel("Review summary", { exact: true })
    .fill(`Changes requested ${suffix}`);
  await other
    .getByRole("combobox", { name: "Review outcome", exact: true })
    .click();
  await other
    .getByRole("option", { name: "Request changes", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".review-status-row")).toContainText(
    "Changes requested",
  );
  const selfReview = await page.request.post(
    `/${fixtures.repository}/pulls/${number}/files/reviews/submit`,
    {
      headers,
      form: {
        type: "approve",
        content: "Cannot approve own change",
        commit_id: draftData.head_sha,
      },
    },
  );
  expect([403, 422]).toContain(selfReview.status());
  await other.goto(`${root}/merge-requests/${number}?tab=changes`);
  await added.hover();
  await added.getByRole("button", { name: /Comment on/ }).click();
  await other
    .getByLabel("Inline comment", { exact: true })
    .fill(`Immediate note ${suffix}`);
  await other
    .getByRole("button", { name: "Add comment now", exact: true })
    .click();
  const immediate = other
    .locator(".review-comment")
    .filter({ hasText: `Immediate note ${suffix}` });
  await expect(immediate).toBeVisible();
  await immediate.getByRole("button", { name: "Delete", exact: true }).click();
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(immediate).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "playwright-results/review-overview-tested.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(`${root}/merge-requests/${number}?tab=commits`);
  await expect(page.locator(".pull-commit-row")).toHaveCount(1);
  await page.locator(".pull-commit-row a").first().click();
  await expect(page.locator(".diff-file")).toBeVisible();
  await expect(page.getByLabel("Viewed", { exact: true })).toHaveCount(0);
  await page.goto(`${root}/merge-requests/${number}`);
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .locator("#discussion-comment-form")
    .getByRole("button", { name: "Close merge request", exact: true })
    .click();
  await expect(
    page
      .locator("#discussion-comment-form")
      .getByRole("button", { name: "Reopen merge request", exact: true }),
  ).toBeVisible();
  await page
    .locator("#discussion-comment-form")
    .getByRole("button", { name: "Reopen merge request", exact: true })
    .click();
  await expect(
    page
      .locator("#discussion-comment-form")
      .getByRole("button", { name: "Close merge request", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await otherContext.close();
});

test("create a merge request from a fork with the same branch name", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, "other");
  const suffix = Date.now();
  const sources = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/pull-sources`,
    )
  ).json();
  let fork = sources.items.find((item) =>
    item.full_name.startsWith(credentials.other.username + "/"),
  )?.full_name;
  if (!fork) {
    const forkName = `zz-test-review-fork-${suffix}`;
    fork = `${credentials.other.username}/${forkName}`;
    await page.goto(`${root}/fork`);
    await page.getByLabel("Project name", { exact: true }).fill(forkName);
    await page
      .getByRole("button", { name: "Fork project", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`projects/${fork}$`));
  }
  const compareData = await (
    await page.request.get(
      `/${fixtures.repository}/compare/zz-test-main...${fork}:zz-test-main`,
      { headers },
    )
  ).json();
  if (compareData.existing_pull)
    await page.request.post(
      `/${fixtures.repository}/pulls/${compareData.existing_pull.number}/comments`,
      { headers, form: { status: "close", content: "" } },
    );
  const editorPath = `/${fork}/_edit/zz-test-main/README.md`,
    editor = await (await page.request.get(editorPath, { headers })).json();
  const result = await page.request.post(editorPath, {
    headers,
    form: {
      tree_path: "README.md",
      content: editor.content + `\nCross-fork change ${suffix}\n`,
      last_commit: editor.last_commit,
      commit_summary: `Cross-fork change ${suffix}`,
      commit_choice: "direct",
      commit_mail_id: String(editor.commit_mails[0].id),
    },
  });
  expect(result.ok(), await result.text()).toBe(true);
  await page.goto(`${root}/merge-requests/new`);
  await page
    .getByRole("combobox", { name: "Source project", exact: true })
    .click();
  await page.getByRole("option", { name: fork, exact: true }).click();
  await page
    .getByRole("combobox", { name: "Source branch", exact: true })
    .click();
  await page.getByRole("option", { name: "zz-test-main", exact: true }).click();
  await page
    .getByRole("button", { name: "Compare branches and continue", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).not.toHaveValue("");
  await page
    .getByLabel("Title", { exact: true })
    .fill(`zz-test-Fork merge request ${suffix}`);
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`projects/${fixtures.repository}/merge-requests/\\d+$`),
  );
  await expect(
    page.getByRole("heading", {
      name: `zz-test-Fork merge request ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Changes/ })).toBeVisible();
});
