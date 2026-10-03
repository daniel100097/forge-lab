import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error(
    "Set FORGEJO_TEST_FIXTURES to a disposable Docker fixture directory.",
  );
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const root = `/-/ui/projects/${fixtures.repository}`;
const branch = `zz-test-new-merge-request-${Date.now()}`;
const headers = {
  "X-Forgejo-UI": "1",
  Origin: base,
  "Sec-Fetch-Site": "same-origin",
};
async function native(page, path, form) {
  const response = form
    ? await page.request.post(path, { headers, form })
    : await page.request.get(path, { headers });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  const data = await response.json();
  expect(
    data.errorMessage || data.error,
    `${path}: native validation`,
  ).toBeFalsy();
  return data;
}
async function login(page, role = "user") {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials[role].username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
async function prepare(page) {
  const name = `zz-test-create-mr-${Date.now()}`;
  const boot = await native(page, "/-/ui/data/bootstrap");
  await native(page, "/repo/create", {
    uid: String(boot.user.id),
    repo_name: name,
    auto_init: "true",
    default_branch: "zz-test-main",
    readme: "Default",
  });
  return { repo: `${credentials.user.username}/${name}`, name };
}
async function commit(page, repo, source, content, newBranch = "") {
  const path = `/${repo}/_edit/${source}/README.md`;
  const editor = await native(page, path);
  await native(page, path, {
    tree_path: "README.md",
    content,
    last_commit: editor.last_commit,
    commit_summary: `Creation fixture ${newBranch || source}`,
    commit_message: "",
    commit_choice: newBranch ? "commit-to-new-branch" : "direct",
    new_branch_name: newBranch,
    commit_mail_id: String(editor.commit_mails[0].id),
  });
}
async function units(page, repo, { empty = false, maintainer = false } = {}) {
  await native(page, `/${repo}/settings/units`, {
    enable_code: "true",
    enable_issues: "true",
    enable_pulls: "true",
    enable_projects: "true",
    pulls_allow_merge: "true",
    pulls_default_merge_style: "merge",
    pulls_default_update_style: "merge",
    enable_autodetect_manual_merge: String(!empty),
    default_allow_maintainer_edit: String(maintainer),
  });
}
test("native branch comparison, changes, creation and duplicate handling", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1"))
      errors.push("Unexpected integration API request");
  });
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  // Use the normal editor action to commit a unique branch without touching
  // the shared fixture merge request or the default branch.
  const editorPath = `/${fixtures.repository}/_edit/zz-test-main/README.md`;
  const editorResponse = await page.request.get(editorPath, { headers });
  expect(editorResponse.ok()).toBe(true);
  const editor = await editorResponse.json();
  const commitResponse = await page.request.post(editorPath, {
    headers,
    form: {
      tree_path: "README.md",
      content: `${editor.content}\n## Merge requests\n\nCompare your branch, review your changes, and create a draft.\n`,
      last_commit: editor.last_commit,
      commit_summary: "Add merge request creation guide",
      commit_message: "",
      commit_choice: "commit-to-new-branch",
      new_branch_name: branch,
      commit_mail_id: String(editor.commit_mails[0].id),
    },
  });
  expect(commitResponse.ok()).toBe(true);
  expect((await commitResponse.json()).redirect).toBeTruthy();
  const labelName = `zz-test-Creation label ${Date.now()}`;
  const milestoneName = `zz-test-Creation milestone ${Date.now()}`;
  await native(page, `/${fixtures.repository}/labels/new`, {
    title: labelName,
    color: "#1068bf",
  });
  await native(page, `/${fixtures.repository}/labels/new`, {
    title: `${labelName} second`,
    color: "#108548",
  });
  await native(page, `/${fixtures.repository}/milestones/new`, {
    title: milestoneName,
    content: "Creation metadata",
    deadline: "2030-01-01",
  });
  await page.goto(`${root}/merge-requests/new`);
  const compare = page.getByRole("button", {
    name: "Compare branches and continue",
  });
  await expect(compare).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Source branch", exact: true })
    .click();
  await page.getByRole("option", { name: "zz-test-main", exact: true }).click();
  await expect(
    page.getByText("Source and target branches must be different."),
  ).toBeVisible();
  await expect(compare).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Source branch", exact: true })
    .click();
  await page.getByRole("option", { name: branch, exact: true }).click();
  await compare.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Add merge request creation guide",
  );
  await expect(
    page.getByRole("tab", { name: "Commits 1", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^Changes/ }).click();
  await expect(page.locator(".diff-file summary")).toContainText("README.md");
  await expect(
    page.locator(".diff-line.added").filter({ hasText: "Compare your branch" }),
  ).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Review the merge request creation guide");
  const description = page.getByLabel("Description", { exact: true });
  await description.fill("native compare workflow");
  await description.evaluate((input) => {
    input.focus();
    input.setSelectionRange(0, input.value.length);
  });
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(description).toHaveValue("**native compare workflow**");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator(".markdown-editor .markdown strong")).toHaveText(
    "native compare workflow",
  );
  await page.getByRole("tab", { name: "Write", exact: true }).click();
  await page.getByRole("combobox", { name: "Labels", exact: true }).click();
  await page.getByRole("option", { name: labelName, exact: true }).click();
  await page
    .getByRole("option", { name: `${labelName} second`, exact: true })
    .click();
  await page.keyboard.press("Escape");
  const metadata = await native(
    page,
    `/${fixtures.repository}/compare/zz-test-main...${branch}`,
  );
  const assignee = metadata.assignees[0];
  expect(assignee).toBeTruthy();
  await page.getByRole("combobox", { name: "Assignees", exact: true }).click();
  await page
    .getByRole("option")
    .filter({ hasText: `@${assignee.Name}` })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Milestone", exact: true }).click();
  await page.getByRole("option", { name: milestoneName, exact: true }).click();
  const board = metadata.projects[0];
  expect(board).toBeTruthy();
  await page.getByRole("combobox", { name: "Board", exact: true }).click();
  await page.getByRole("option", { name: board.Title, exact: true }).click();
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "creation-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Native merge request attachment"),
  });
  await expect(
    page.getByLabel("Allow edits from maintainers", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change branches", exact: true })
    .click();
  await compare.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "zz-test-Review the merge request creation guide",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    /native compare workflow/,
  );
  await expect(
    page.getByRole("combobox", { name: "Labels", exact: true }),
  ).toContainText(labelName);
  await expect(
    page.getByRole("combobox", { name: "Milestone", exact: true }),
  ).toContainText(milestoneName);
  await expect(
    page.getByRole("button", {
      name: "Remove creation-notes.txt",
      exact: true,
    }),
  ).toBeVisible();
  const canPersistDraft = process.env.FORGEJO_TEST_PREFIX_ONLY !== "1";
  if (!canPersistDraft)
    test.info().annotations.push({
      type: "coverage-limit",
      description:
        "Native draft prefixes conflict with the literal zz-test- fixture-name rule; draft persistence and mark-ready are not exercised.",
    });
  await page.getByLabel("Mark as draft", { exact: true }).check();
  if (!canPersistDraft)
    await page.getByLabel("Mark as draft", { exact: true }).uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Create merge request", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "playwright-results/new-merge-request-mobile-tested.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "playwright-results/new-merge-request-form-tested.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/merge-requests\/\d+$/);
  const number = Number(new URL(page.url()).pathname.split("/").at(-1));
  await expect(
    page.getByRole("heading", {
      name: canPersistDraft
        ? "Draft merge request"
        : "zz-test-Review the merge request creation guide",
      exact: true,
    }),
  ).toBeVisible();
  let response = await page.request.get(
    `/-/ui/data/repos/${fixtures.repository}/pulls/${number}`,
  );
  const created = await response.json();
  expect(created.pull.draft).toBe(canPersistDraft);
  const persisted = await native(
    page,
    `/-/ui/data/repos/${fixtures.repository}/pulls/${number}/metadata`,
  );
  expect(persisted.label_ids).toContain(
    metadata.labels.find((label) => label.Name === labelName).ID,
  );
  expect(persisted.label_ids).toContain(
    metadata.labels.find((label) => label.Name === `${labelName} second`).ID,
  );
  expect(persisted.assignee_ids).toContain(assignee.ID);
  expect(persisted.milestone_id).toBe(
    metadata.milestones.find((milestone) => milestone.Name === milestoneName)
      .ID,
  );
  const attachments = await native(
    page,
    `/${fixtures.repository}/issues/${number}/attachments`,
  );
  expect(JSON.stringify(attachments)).toContain("creation-notes.txt");
  const boardData = await native(
    page,
    `/-/ui/data/repos/${fixtures.repository}/projects/${board.ID}`,
  );
  expect(
    boardData.columns
      .flatMap((column) => column.issues)
      .map((issue) => issue.number),
  ).toContain(number);
  if (canPersistDraft) {
    await page
      .getByRole("button", { name: "Mark as ready", exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", {
      name: "zz-test-Review the merge request creation guide",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as ready", exact: true }),
  ).toHaveCount(0);
  response = await page.request.get(
    `/-/ui/data/repos/${fixtures.repository}/pulls/${number}`,
  );
  expect((await response.json()).pull.draft).toBe(false);

  await page.goto(
    `${root}/merge-requests/new?source_branch=${branch}&target_branch=zz-test-main&step=create`,
  );
  await expect(
    page.getByText("A merge request already exists for these branches"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `!${number} · zz-test-Review the merge request creation guide`,
    }),
  ).toHaveAttribute("href", `${root}/merge-requests/${number}`);
  await expect(
    page.getByRole("button", { name: "Create merge request", exact: true }),
  ).toHaveCount(0);
  await page.goto(
    `${root}/merge-requests/new?source_branch=zz-test-main&target_branch=zz-test-main&step=create`,
  );
  await expect(page.getByText("There are no changes to merge")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create merge request", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("native empty-request policy and commits with no file differences", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  const { repo } = await prepare(page);
  const ui = `/-/ui/projects/${repo}/merge-requests/new`;
  await units(page, repo);
  for (const name of ["zz-test-empty-blocked", "zz-test-empty-allowed"])
    await native(page, `/${repo}/branches/_new/branch/zz-test-main`, {
      new_branch_name: name,
      create_tag: "false",
      current_path: "",
    });
  await page.goto(
    `${ui}?source_branch=zz-test-empty-blocked&target_branch=zz-test-main&step=create`,
  );
  await expect(
    page.getByText("There are no changes to merge", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create merge request", exact: true }),
  ).toHaveCount(0);
  await units(page, repo, { empty: true });
  await page.goto(
    `${ui}?source_branch=zz-test-empty-allowed&target_branch=zz-test-main&step=create`,
  );
  await expect(
    page.getByText("These branches have no changes yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Commits 0", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Changes 0", exact: true }).click();
  await expect(
    page.getByText("No file changes to display.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Prepare work before pushing commits");
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/merge-requests\/1$/);
  const empty = await native(page, `/-/ui/data/repos/${repo}/pulls/1`);
  expect(empty.pull.title).toBe("zz-test-Prepare work before pushing commits");

  // Two genuine commits return the tree to its original content. A zero-file
  // diff must not prevent creating a request containing those commits.
  const initial = await native(page, `/${repo}/_edit/zz-test-main/README.md`);
  await commit(
    page,
    repo,
    "zz-test-main",
    initial.content + "\nTemporary change\n",
    "zz-test-no-file-diff",
  );
  await commit(page, repo, "zz-test-no-file-diff", initial.content);
  await units(page, repo);
  await page.goto(
    `${ui}?source_branch=zz-test-no-file-diff&target_branch=zz-test-main&step=create`,
  );
  await expect(
    page.getByRole("tab", { name: "Commits 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Changes 0", exact: true }).click();
  await expect(
    page.getByText("No file changes to display.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Review two commits without file changes");
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/merge-requests\/2$/);

  await commit(
    page,
    repo,
    "zz-test-main",
    initial.content + "\nStale branch\n",
    "zz-test-stale-source",
  );
  await page.goto(
    `${ui}?source_branch=zz-test-stale-source&target_branch=zz-test-main&step=create`,
  );
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Keep my draft if the branch disappears");
  await native(page, `/${repo}/branches/delete`, {
    name: "zz-test-stale-source",
  });
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "zz-test-Keep my draft if the branch disappears",
  );

  await page.goto(
    `${ui}?source_branch=missing-branch&target_branch=zz-test-main&step=create`,
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create merge request", exact: true }),
  ).toHaveCount(0);
});

test("fork defaults, contributor permissions and target-scoped metadata", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  const { repo, name } = await prepare(page);
  await units(page, repo, { maintainer: true });
  await native(page, `/${repo}/labels/new`, {
    title: "zz-test-Target project label",
    color: "#af6722",
  });
  const otherContext = await browser.newContext({ baseURL: base });
  const other = await otherContext.newPage();
  try {
    await login(other, "other");
    await other.goto(`/-/ui/projects/${repo}/fork`);
    await other
      .getByLabel("Project name", { exact: true })
      .fill(`zz-test-renamed-${name}`);
    await other
      .getByRole("button", { name: "Fork project", exact: true })
      .click();
    const fork = `${credentials.other.username}/zz-test-renamed-${name}`;
    await expect(other).toHaveURL(new RegExp(`/projects/${fork}$`));
    const initial = await native(
      other,
      `/${fork}/_edit/zz-test-main/README.md`,
    );
    await commit(
      other,
      fork,
      "zz-test-main",
      initial.content + "\nContributor change\n",
      "zz-test-contributor",
    );
    await native(other, `/${fork}/labels/new`, {
      title: "zz-test-Fork project label",
      color: "#1068bf",
    });
    const query = new URLSearchParams({
      source_owner: credentials.other.username,
      target_project: repo,
      source_branch: "zz-test-contributor",
      target_branch: "zz-test-main",
      step: "create",
    });
    const url = `/-/ui/projects/${repo}/merge-requests/new?${query}`;
    await other.goto(url);
    await expect(other).toHaveURL(
      new RegExp(`source_project=${encodeURIComponent(fork)}`),
    );
    await expect(
      other.getByLabel("Allow edits from maintainers", { exact: true }),
    ).toBeChecked();
    await expect(
      other.getByRole("combobox", { name: "Labels", exact: true }),
    ).toHaveCount(0);
    await expect(
      other.getByRole("combobox", { name: "Assignees", exact: true }),
    ).toHaveCount(0);
    await expect(
      other.locator(".mr-compare-commit").getByRole("link").first(),
    ).toHaveAttribute("href", new RegExp(`/projects/${fork}/commit/`));
    await other
      .getByLabel("Allow edits from maintainers", { exact: true })
      .uncheck();
    await other
      .getByLabel("Title", { exact: true })
      .fill("zz-test-Contributor chooses maintainer access");
    await other.getByLabel("Attach files", { exact: true }).setInputFiles({
      name: "contributor.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Target repository attachment"),
    });
    await other
      .getByRole("button", { name: "Create merge request", exact: true })
      .click();
    await expect(other).toHaveURL(
      new RegExp(`/projects/${repo}/merge-requests/1$`),
    );
    const review = await native(
      other,
      `/-/ui/data/repos/${repo}/pulls/1/review`,
    );
    expect(review.allow_maintainer_edit).toBe(false);
    expect(
      JSON.stringify(await native(other, `/${repo}/issues/1/attachments`)),
    ).toContain("contributor.txt");

    // A user with write permissions sees metadata from the selected target,
    // and switching projects must drop IDs from the previous repository.
    await native(other, `/${fork}/settings/collaboration`, {
      collaborator: credentials.user.username,
    });
    await commit(
      page,
      repo,
      "zz-test-main",
      "Target contributor branch\n",
      "zz-test-target-work",
    );
    await page.goto(
      `/-/ui/projects/${repo}/merge-requests/new?source_branch=zz-test-target-work&target_branch=zz-test-main&step=create`,
    );
    await page.getByRole("combobox", { name: "Labels", exact: true }).click();
    await page
      .getByRole("option", {
        name: "zz-test-Target project label",
        exact: true,
      })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Change branches", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Target project", exact: true })
      .click();
    await page.getByRole("option", { name: fork, exact: true }).click();
    await page
      .getByRole("button", {
        name: "Compare branches and continue",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Labels", exact: true }),
    ).toContainText("No labels");
    await page.getByRole("combobox", { name: "Labels", exact: true }).click();
    await expect(
      page.getByRole("option", {
        name: "zz-test-Target project label",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", {
        name: "zz-test-Fork project label",
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    await otherContext.close();
  }
});

test("YAML merge-request templates preserve fields and native body generation", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  const { repo } = await prepare(page);
  await native(page, `/${repo}/labels/new`, {
    title: "zz-test-Template label",
    color: "#108548",
  });
  const template = `name: Change proposal
about: Describe the change before review
title: '[Change] '
labels: ['zz-test-Template label']
body:
  - type: markdown
    attributes:
      value: Explain the impact for reviewers.
  - type: input
    id: area
    attributes:
      label: Affected area
    validations:
      required: true
  - type: textarea
    id: body
    attributes:
      label: Change summary
      value: Template summary
    validations:
      required: true
  - type: dropdown
    id: risk
    attributes:
      label: Risk level
      options:
        - Low
        - High
    validations:
      required: true
  - type: dropdown
    id: checks
    attributes:
      label: Verification
      multiple: true
      options:
        - Unit tests
        - Browser tests
    validations:
      required: true
  - type: checkboxes
    id: ready
    attributes:
      label: Review readiness
      options:
        - label: I reviewed the changes
          required: true
`;
  const editor = await native(page, `/${repo}/_new/zz-test-main/`);
  await native(page, `/${repo}/_new/zz-test-main/`, {
    tree_path: ".forgejo/PULL_REQUEST_TEMPLATE.yaml",
    content: template,
    last_commit: editor.last_commit || "",
    commit_summary: "Add merge request form",
    commit_choice: "direct",
    commit_mail_id: String(editor.commit_mails[0].id),
  });
  await commit(
    page,
    repo,
    "zz-test-main",
    "A change with a YAML proposal\n",
    "zz-test-yaml-proposal",
  );
  await page.goto(
    `/-/ui/projects/${repo}/merge-requests/new?source_branch=zz-test-yaml-proposal&target_branch=zz-test-main&step=create&field%3Aarea=Compare+UI`,
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "[Change] ",
  );
  await expect(page.getByLabel("Affected area", { exact: true })).toHaveValue(
    "Compare UI",
  );
  await expect(
    page.getByRole("combobox", { name: "Labels", exact: true }),
  ).toContainText("zz-test-Template label");
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/merge-requests\/new\?/);
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-[Change] Use native proposal fields");
  await page
    .getByLabel("Affected area", { exact: true })
    .fill("Merge request creation");
  await page
    .getByLabel("Change summary", { exact: true })
    .fill("Use the configured YAML fields and keep draft values.");
  await page.getByRole("combobox", { name: "Risk level", exact: true }).click();
  await page.getByRole("option", { name: "Low", exact: true }).click();
  await page.getByLabel("Unit tests", { exact: true }).check();
  await page.getByLabel("Browser tests", { exact: true }).check();
  await page.getByLabel("I reviewed the changes", { exact: true }).check();
  await page
    .getByRole("button", { name: "Change branches", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare branches and continue", exact: true })
    .click();
  await expect(page.getByLabel("Affected area", { exact: true })).toHaveValue(
    "Merge request creation",
  );
  await expect(page.getByLabel("Change summary", { exact: true })).toHaveValue(
    "Use the configured YAML fields and keep draft values.",
  );
  await expect(
    page.getByRole("combobox", { name: "Risk level", exact: true }),
  ).toContainText("Low");
  await expect(page.getByLabel("Unit tests", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Browser tests", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("I reviewed the changes", { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Create merge request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/merge-requests\/1$/);
  const issue = (await native(page, `/-/ui/data/repos/${repo}/pulls/1`)).issue;
  expect(issue.body).toContain("Merge request creation");
  expect(issue.body).toContain(
    "Use the configured YAML fields and keep draft values.",
  );
  expect(issue.body).toContain("Low");
  expect(issue.body).toContain("Unit tests");
  expect(issue.body).toContain("Browser tests");
  expect(issue.body).toContain("[x] I reviewed the changes");
  expect(issue.labels.map((label) => label.name)).toContain(
    "zz-test-Template label",
  );
});
