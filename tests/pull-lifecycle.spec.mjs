import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const headers = {
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
async function commit(page, repo, ref, file, content, branch = "") {
  const path = `/${repo}/_${file === "README.md" ? "edit" : "new"}/${ref}/${file === "README.md" ? file : ""}`;
  const editor = await (await page.request.get(path, { headers })).json();
  const result = await page.request.post(path, {
    headers,
    form: {
      tree_path: file,
      content:
        file === "README.md" ? editor.content + "\n" + content + "\n" : content,
      last_commit: editor.last_commit || "",
      commit_summary: content.split("\n")[0].slice(0, 70),
      commit_message: "",
      commit_choice: branch ? "commit-to-new-branch" : "direct",
      new_branch_name: branch,
      commit_mail_id: String(editor.commit_mails[0].id),
    },
  });
  expect(result.ok(), await result.text()).toBe(true);
}
async function branch(page, repo, source, name) {
  const result = await page.request.post(
    `/${repo}/branches/_new/branch/${source}`,
    {
      headers,
      form: { new_branch_name: name, create_tag: "false", current_path: "" },
    },
  );
  expect(result.ok(), await result.text()).toBe(true);
}
async function newMR(page, repo, head) {
  const result = await page.request.post(
    `/${repo}/compare/zz-test-main...${head}`,
    {
      headers,
      form: {
        title: `zz-test-Lifecycle ${head}`,
        content: "Disposable browser lifecycle",
        base_branch: "zz-test-main",
        head_branch: head,
      },
    },
  );
  expect(result.ok(), await result.text()).toBe(true);
  return Number((await result.json()).redirect.match(/pulls\/(\d+)/)[1]);
}
async function review(page, repo, index) {
  return (
    await page.request.get(`/-/ui/data/repos/${repo}/pulls/${index}/review`)
  ).json();
}
async function prepare(page) {
  const name = `zz-test-review-lifecycle-${Date.now()}`,
    repo = `${credentials.user.username}/${name}`;
  const data = await (
    await page.request.get("/repo/create", { headers })
  ).json();
  const result = await page.request.post("/repo/create", {
    headers,
    form: {
      uid: String(
        data.owners.find((o) => o.name === credentials.user.username).id,
      ),
      repo_name: name,
      default_branch: "zz-test-main",
      auto_init: "true",
      readme: "Default",
      private: "false",
    },
  });
  expect(result.ok(), await result.text()).toBe(true);
  return { repo, root: `/-/ui/projects/${repo}` };
}
test("merge request ranges, source update, target change, automatic merge and source cleanup", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await login(page);
  const { repo, root } = await prepare(page);
  await commit(
    page,
    repo,
    "zz-test-main",
    "README.md",
    "First reviewed change",
    "zz-test-source",
  );
  const index = await newMR(page, repo, "zz-test-source");
  await commit(
    page,
    repo,
    "zz-test-source",
    "README.md",
    "Second reviewed change",
  );
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/${repo}/pulls/${index}/commits/list`, {
              headers,
            })
          ).json()
        ).commits.length,
    )
    .toBe(2);
  const commits = (
    await (
      await page.request.get(`/${repo}/pulls/${index}/commits/list`, {
        headers,
      })
    ).json()
  ).commits;
  await page.goto(`${root}/merge-requests/${index}?tab=changes`);
  await page
    .getByRole("combobox", { name: "From commit", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp("First reviewed change") })
    .click();
  await expect(page.locator(".diff-file")).toContainText(
    "Second reviewed change",
  );
  await expect(page.locator(".diff-line.added")).not.toContainText([
    "First reviewed change",
  ]);
  const selection = await review(page, repo, index);
  const first = commits.find((c) => c.summary === "First reviewed change").id;
  const range = await (
    await page.request.get(
      `/-/ui/data/repos/${repo}/pulls/${index}/review?from=${first}`,
    )
  ).json();
  expect(range.view_base_sha).toBe(first);
  await commit(page, repo, "zz-test-main", "base.txt", "Target branch update");
  await page.goto(`${root}/merge-requests/${index}`);
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Merge target branch", exact: true })
    .click();
  await expect
    .poll(async () => (await review(page, repo, index)).head_sha)
    .not.toBe(selection.head_sha);
  await branch(page, repo, "zz-test-main", "zz-test-release");
  await page.reload();
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Target branch", exact: true })
    .click();
  await page
    .getByRole("option", { name: "zz-test-release", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change target branch", exact: true })
    .click();
  await expect(page.locator(".merge-request-subtitle")).toContainText(
    "zz-test-release",
  );
  await page
    .getByRole("combobox", { name: "Target branch", exact: true })
    .click();
  await page.getByRole("option", { name: "zz-test-main", exact: true }).click();
  await page
    .getByRole("button", { name: "Change target branch", exact: true })
    .click();
  await expect(page.locator(".merge-request-subtitle")).toContainText(
    "zz-test-main",
  );
  const checkbox = page.getByLabel(
    "Allow maintainers to edit the source branch",
    { exact: true },
  );
  const old = await checkbox.isChecked();
  await checkbox.click();
  await expect
    .poll(async () => (await review(page, repo, index)).allow_maintainer_edit)
    .toBe(!old);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/-/ui/data/repos/${repo}/pulls/${index}`)
          ).json()
        ).pull.mergeable,
      { timeout: 30000 },
    )
    .toBe(true);
  await page.goto(`${root}/settings/branches/edit`);
  await page
    .getByLabel("Branch name or pattern", { exact: true })
    .fill("zz-test-main");
  await page.getByLabel("Required approvals", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Save branch protection", exact: true })
    .click();
  await expect(page).toHaveURL(/settings\/branches$/);
  await page.goto(`${root}/merge-requests/${index}`);
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Set to auto-merge", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel auto-merge", exact: true }),
  ).toBeVisible();
  expect((await review(page, repo, index)).auto_merge).toBe(true);
  await page
    .getByRole("button", { name: "Cancel auto-merge", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Set to auto-merge", exact: true }),
  ).toBeVisible();
  expect((await review(page, repo, index)).auto_merge).toBe(false);
  await page.goto(`${root}/settings/collaboration`);
  await page
    .getByLabel("Username", { exact: true })
    .fill(credentials.other.username);
  await page
    .getByRole("option", { name: credentials.other.username, exact: true })
    .click();
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(
    page.getByText(`@${credentials.other.username}`, { exact: true }),
  ).toBeVisible();
  await page.goto(`${root}/merge-requests/${index}`);
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Set to auto-merge", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel auto-merge", exact: true }),
  ).toBeVisible();
  const otherContext = await browser.newContext({ baseURL: base });
  const other = await otherContext.newPage();
  await login(other, "other");
  await other.goto(`${root}/merge-requests/${index}`);
  await other
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  await other
    .getByLabel("Review summary", { exact: true })
    .fill("Approved disposable automatic merge");
  await other
    .getByRole("combobox", { name: "Review outcome", exact: true })
    .click();
  await other.getByRole("option", { name: "Approve", exact: true }).click();
  await other
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
  await otherContext.close();
  await expect
    .poll(async () => (await review(page, repo, index)).merged, {
      timeout: 30000,
    })
    .toBe(true);
  await page.reload();
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete source branch", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete source branch", exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await (
          await page.request.get(`/${repo}/branches/list`, { headers })
        ).json()
      ).results.includes("zz-test-source"),
    )
    .toBe(false);
  await expect(
    page.getByRole("button", { name: "Delete source branch", exact: true }),
  ).toHaveCount(0);
});

test("fork workflow approval uses native deny, once, always and revoke permissions", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await login(page);
  const { repo, root } = await prepare(page);
  await commit(
    page,
    repo,
    "zz-test-main",
    ".forgejo/workflows/trust.yml",
    `name: Trust approval fixture
on: [pull_request]
jobs:
  verify:
    runs-on: isolated-trust-fixture
    steps:
      - run: echo "Native workflow approval"
`,
  );
  const otherContext = await browser.newContext({ baseURL: base }),
    other = await otherContext.newPage();
  await login(other, "other");
  const forkName = `zz-test-trust-fork-${Date.now()}`,
    fork = `${credentials.other.username}/${forkName}`;
  await other.goto(`${root}/fork`);
  await other.getByLabel("Project name", { exact: true }).fill(forkName);
  await other
    .getByRole("button", { name: "Fork project", exact: true })
    .click();
  await expect(other).toHaveURL(new RegExp(`projects/${fork}$`));
  await commit(
    other,
    fork,
    "zz-test-main",
    "README.md",
    "Untrusted contributor change",
  );
  const created = await other.request.post(
    `/${repo}/compare/zz-test-main...${fork}:zz-test-main`,
    {
      headers,
      form: {
        title: "zz-test-Review contributor workflows",
        content: "Native trust fixture",
      },
    },
  );
  expect(created.ok(), await created.text()).toBe(true);
  const index = Number(
    (await created.json()).redirect.match(/pulls\/(\d+)/)[1],
  );
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).actions_trust?.needs_approval,
      { timeout: 60000 },
    )
    .toBe(true);
  const denied = await other.request.post(
    `/${repo}/pulls/${index}/action-user-trust`,
    { headers, form: { trust: "always" } },
  );
  expect([403, 404]).toContain(denied.status());
  expect((await review(other, repo, index)).actions_trust.can_delegate).toBe(
    false,
  );
  const act = async (name) => {
    await page.goto(`${root}/merge-requests/${index}`);
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name, exact: true })
      .click();
  };
  await page.goto(`${root}/merge-requests/${index}`);
  await expect(
    page.getByRole("heading", {
      name: "Pipeline approval required",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "playwright-results/mr-workflow-trust.png",
    fullPage: true,
    animations: "disabled",
  });
  await act("Deny pending pipelines");
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).actions_trust.needs_approval,
    )
    .toBe(false);
  await commit(
    other,
    fork,
    "zz-test-main",
    "README.md",
    "Contributor second version",
  );
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).actions_trust.needs_approval,
      { timeout: 60000 },
    )
    .toBe(true);
  await act("Approve once");
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).actions_trust.needs_approval,
    )
    .toBe(false);
  expect((await review(page, repo, index)).actions_trust.state).toBe("no");
  await commit(
    other,
    fork,
    "zz-test-main",
    "README.md",
    "Contributor third version",
  );
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).actions_trust.needs_approval,
      { timeout: 60000 },
    )
    .toBe(true);
  await act("Always trust contributor");
  await expect
    .poll(async () => (await review(page, repo, index)).actions_trust.state)
    .toBe("explicitly");
  await act("Revoke workflow trust");
  await expect
    .poll(async () => (await review(page, repo, index)).actions_trust.state)
    .toBe("no");
  await expect(
    page.getByRole("button", { name: "Revoke workflow trust", exact: true }),
  ).toHaveCount(0);
  await otherContext.close();
});

async function editFile(page, repo, ref, file, content, summary) {
  const path = `/${repo}/_edit/${ref}/${file}`;
  const editor = await (await page.request.get(path, { headers })).json();
  const result = await page.request.post(path, {
    headers,
    form: {
      tree_path: file,
      content,
      last_commit: editor.last_commit,
      commit_summary: summary,
      commit_choice: "direct",
      commit_mail_id: String(editor.commit_mails[0].id),
    },
  });
  expect(result.ok(), await result.text()).toBe(true);
}

test("merge request split diff, whitespace, large-file expansion, rebase and outdated conversations", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await login(page);
  const { repo, root } = await prepare(page);
  await commit(
    page,
    repo,
    "zz-test-main",
    "example.ts",
    "const answer = 42;\nconst oldName = true;\n",
  );
  await branch(page, repo, "zz-test-main", "zz-test-diff-review");
  await editFile(
    page,
    repo,
    "zz-test-diff-review",
    "example.ts",
    "const  answer = 42;  \nconst newName = true;\n",
    "Whitespace and code changes",
  );
  await commit(
    page,
    repo,
    "zz-test-diff-review",
    "large.txt",
    Array.from({ length: 520 }, (_, i) => `fixture row ${i}`).join("\n"),
  );
  const index = await newMR(page, repo, "zz-test-diff-review");
  await page.goto(`${root}/merge-requests/${index}?tab=changes`);
  await expect(
    page.getByRole("button", { name: "Load diff for large.txt", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load diff for large.txt", exact: true })
    .click();
  await expect(
    page.locator(".diff-line.added").filter({ hasText: "fixture row 519" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Whitespace changes", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Ignore all whitespace", exact: true })
    .click();
  await expect(
    page.locator(".diff-line.added").filter({ hasText: "answer" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".diff-line.added").filter({ hasText: "newName" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Side-by-side", exact: true }).click();
  const paired = page
    .locator(".diff-line.changed")
    .filter({ hasText: "newName" });
  await expect(paired).toContainText("oldName");
  await expect(paired.locator("code.removed")).toContainText("oldName");
  await expect(paired.locator("code.added")).toContainText("newName");
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "playwright-results/mr-diff-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await chooseAppearance(page, "Dark");
  await page.reload();
  await page.getByRole("button", { name: "Side-by-side", exact: true }).click();
  await page.screenshot({
    path: "playwright-results/mr-diff-dark.png",
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
    path: "playwright-results/mr-diff-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const otherContext = await browser.newContext({ baseURL: base }),
    other = await otherContext.newPage();
  await login(other, "other");
  await other.goto(`${root}/merge-requests/${index}?tab=changes`);
  const line = other.locator(".diff-line.added").filter({ hasText: "newName" });
  await line.hover();
  await line.getByRole("button", { name: /Comment on/ }).click();
  await other
    .getByLabel("Inline comment", { exact: true })
    .fill("Review this code before replacing it");
  await other
    .getByRole("button", { name: "Add comment now", exact: true })
    .click();
  await expect(other.locator(".review-thread")).toContainText(
    "Review this code before replacing it",
  );
  await otherContext.close();
  await editFile(
    page,
    repo,
    "zz-test-diff-review",
    "example.ts",
    "export const replacement = 1;\n",
    "Replace reviewed code",
  );
  await expect
    .poll(
      async () =>
        (await review(page, repo, index)).threads.some((t) => t.outdated),
      { timeout: 30000 },
    )
    .toBe(true);
  await commit(page, repo, "zz-test-main", "target.txt", "New base commit");
  const oldHead = (await review(page, repo, index)).head_sha;
  await page.goto(`${root}/merge-requests/${index}?tab=changes`);
  await page.getByRole("checkbox", { name: /^Show outdated thread/ }).check();
  await expect(page.locator(".review-thread")).toContainText("Outdated");
  await page.goto(`${root}/merge-requests/${index}`);
  await page.getByText("Merge request settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Rebase source branch", exact: true })
    .click();
  await expect
    .poll(async () => (await review(page, repo, index)).head_sha, {
      timeout: 30000,
    })
    .not.toBe(oldHead);
});
