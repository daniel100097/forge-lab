import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error("File operations require disposable Docker fixtures.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;

test("new file, multi-file upload, replacement, and delete commit through native routes", async ({
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
  await page.goto(root);
  await page
    .getByRole("button", { name: "Add to project", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New file", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("File name", { exact: true })
    .fill("browser-created.md");
  await page
    .getByRole("textbox", { name: "File content", exact: true })
    .fill("# Created in the browser\n\nA real Git commit.\n");
  await page.getByRole("tab", { name: /Preview changes/ }).click();
  await expect(page.locator(".file-editor-preview .diff-file")).toContainText(
    "Created in the browser",
  );
  const branch = `zz-test-browser/files-${Date.now()}`;
  await page
    .getByRole("radio", { name: "Create a new branch", exact: true })
    .check();
  await page.getByLabel("New branch name", { exact: true }).fill(branch);
  await page
    .getByLabel("Start a new merge request with these changes")
    .uncheck();
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".code-panel .markdown").getByRole("heading", {
      name: "Created in the browser",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`ref=${encodeURIComponent(branch)}`));

  await page.goto(`${root}/upload?${new URLSearchParams({ ref: branch })}`);
  await page.getByLabel("Upload to directory").fill("browser-uploads");
  await page.getByLabel("Choose files to upload").setInputFiles([
    {
      name: "alpha.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Uploaded alpha\n"),
    },
    {
      name: "beta.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Uploaded beta\n"),
    },
  ]);
  await expect(page.locator(".file-upload-list li")).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/upload\?/);
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "alpha.md" }),
  ).toBeVisible();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "beta.txt" }),
  ).toBeVisible();
  await page.locator(".file-table-row").filter({ hasText: "alpha.md" }).click();
  await expect(
    page
      .locator(".code-panel .markdown")
      .getByRole("heading", { name: "Uploaded alpha", level: 1, exact: true }),
  ).toBeVisible();

  await page.goto(
    `${root}/upload?${new URLSearchParams({ ref: branch, path: "browser-uploads" })}`,
  );
  await page.getByLabel("Choose files to upload").setInputFiles({
    name: "alpha.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Uploaded replacement\n"),
  });
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "alpha.md" }),
  ).toBeVisible();
  const existing = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/tree?${new URLSearchParams({ ref: branch, path: "browser-uploads/alpha.md" })}`,
    )
  ).json();
  expect(existing.content).toBe("# Uploaded replacement\n");

  await page.goto(
    `${root}?${new URLSearchParams({ ref: branch, path: "browser-created.md" })}`,
  );
  await page.getByRole("button", { name: "File actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete file", exact: true })
    .click();
  await expect(page.locator(".file-delete-notice")).toContainText(
    "browser-created.md",
  );
  await page.getByRole("button", { name: "Delete file", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${fixtures.repository}\\?`),
  );
  await expect(
    page.locator(".file-table-row").filter({ hasText: "browser-created.md" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".file-table-row").filter({ hasText: "browser-uploads" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("apply patch, cherry-pick, revert and commit notes persist", async ({
  page,
}) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const branch = `zz-test-browser/patch-${Date.now()}`;
  await page.goto(`${root}/patch?ref=zz-test-main`);
  await page
    .getByLabel("Patch content")
    .fill(
      "diff --git a/browser-patch.txt b/browser-patch.txt\nnew file mode 100644\n--- /dev/null\n+++ b/browser-patch.txt\n@@ -0,0 +1 @@\n+Created by native apply patch\n",
    );
  await page.getByRole("tab", { name: "Preview changes", exact: true }).click();
  await expect(page.locator(".patch-editor .diff-file")).toContainText(
    "Created by native apply patch",
  );
  await page
    .getByRole("radio", { name: "Create a new branch", exact: true })
    .check();
  await page.getByLabel("New branch name", { exact: true }).fill(branch);
  await page
    .getByLabel("Start a new merge request with these changes")
    .uncheck();
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "browser-patch.txt" }),
  ).toBeVisible();
  const tree = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/tree?${new URLSearchParams({ ref: branch })}`,
    )
  ).json();
  await page.goto(`${root}/commit/${tree.sha}`);
  await expect(page.locator(".commit-detail-summary h2")).toHaveText(
    "Apply patch",
  );
  await page
    .getByRole("button", { name: "Commit actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add note", exact: true }).click();
  await page
    .getByLabel("Commit note", { exact: true })
    .fill("Browser verified **Git note**.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".commit-notes .markdown strong")).toHaveText(
    "Git note",
  );
  await page.reload();
  await expect(page.locator(".commit-notes .markdown strong")).toHaveText(
    "Git note",
  );

  await page.goto(
    `${root}/cherry-pick?${new URLSearchParams({ ref: "zz-test-main", sha: tree.sha })}`,
  );
  await expect(
    page.getByRole("heading", { name: "Cherry-pick commit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Create a new branch", exact: true })
    .check();
  const pickedBranch = `zz-test-browser/picked-${Date.now()}`;
  await page.getByLabel("New branch name", { exact: true }).fill(pickedBranch);
  await page
    .getByLabel("Start a new merge request with these changes")
    .uncheck();
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "browser-patch.txt" }),
  ).toBeVisible();
  const picked = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/tree?${new URLSearchParams({ ref: pickedBranch })}`,
    )
  ).json();
  await page.goto(
    `${root}/revert?${new URLSearchParams({ ref: pickedBranch, sha: picked.sha })}`,
  );
  await expect(
    page.getByRole("heading", { name: "Revert commit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(
    page.locator(".file-table-row").filter({ hasText: "browser-patch.txt" }),
  ).toHaveCount(0);
  await expect(page.locator(".readme-panel")).toBeVisible();
  const original = await (
    await page.request.get(
      `/-/ui/data/repos/${fixtures.repository}/tree?${new URLSearchParams({ ref: branch, path: "browser-patch.txt" })}`,
    )
  ).json();
  expect(original.content).toBe("Created by native apply patch\n");
});
test("editing can rename and move a file with preview and a native commit", async ({
  page,
}) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const name = `zz-test-rename-${Date.now()}`,
    project = `/-/ui/projects/zz-test-studio/${name}`;
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${name}$`));
  await page.goto(project + "/edit?ref=zz-test-main&path=README.md");
  await page.getByLabel("File name", { exact: true }).fill("docs/GUIDE.md");
  await expect(
    page.getByRole("button", { name: "Commit changes", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "File content", exact: true })
    .fill("# Moved guide\n\nRenamed and moved through the SPA.\n");
  await page.getByRole("tab", { name: /Preview changes/ }).click();
  await expect(page.locator(".file-editor-preview .diff-file")).toContainText(
    "Moved guide",
  );
  await page
    .getByRole("button", { name: "Commit changes", exact: true })
    .click();
  await expect(page).toHaveURL(/path=docs%2FGUIDE.md/);
  await expect(
    page
      .locator(".code-panel .markdown")
      .getByRole("heading", { name: "Moved guide", level: 1, exact: true }),
  ).toBeVisible();
  await page.goto(project);
  await expect(
    page
      .locator(".file-table-row > span:first-child")
      .filter({ hasText: /^README.md$/ }),
  ).toHaveCount(0);
  await expect(page.locator(".file-table")).toContainText("docs");
  await page.goto(project + "/history?ref=zz-test-main&path=docs%2FGUIDE.md");
  await expect(page.locator(".commit-list")).toContainText(/README|GUIDE/i);
});
