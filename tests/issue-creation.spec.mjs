import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory?.includes("forgejo-ui-test-"))
  throw new Error("Disposable Docker fixture required");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
).user;
test("native YAML issue templates validate fields and persist body and uploaded attachments", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.username);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const origin = process.env.FORGEJO_NATIVE_ORIGIN || "http://localhost:3100",
    headers = { "X-Forgejo-UI": "1", Origin: origin };
  const nativePost = async (path, form) => {
    const result = await page.evaluate(
      async ({ path, form }) => {
        const r = await fetch(path, {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(form),
        });
        return { status: r.status, body: await r.text() };
      },
      { path, form },
    );
    expect(result.status, result.body).toBeLessThan(400);
    const d = JSON.parse(result.body);
    if (d.error || d.errorMessage) throw new Error(d.error || d.errorMessage);
    return d;
  };
  const boot = await (await page.request.get("/-/ui/data/bootstrap")).json();
  const name = `zz-test-issue-forms-${Date.now()}`,
    native = `/${credentials.username}/${name}`,
    root = `/-/ui/projects${native}`;
  await nativePost("/repo/create", {
    uid: String(boot.user.id),
    repo_name: name,
    auto_init: "on",
    default_branch: "zz-test-main",
    readme: "Default",
  });
  const template = `name: Browser bug report
about: Report a reproducible bug
title: '[Bug] '
body:
  - type: markdown
    attributes:
      value: Please include the steps to reproduce.
  - type: input
    id: version
    attributes:
      label: Affected version
      placeholder: 1.0
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: dropdown
    id: browser
    attributes:
      label: Browser
      options:
        - Firefox
        - Chromium
    validations:
      required: true
  - type: checkboxes
    id: terms
    attributes:
      label: Before submitting
      options:
        - label: I checked existing issues
          required: true
`;
  const initial = await (
    await page.request.get(`${native}/_new/zz-test-main`, { headers })
  ).json();
  await nativePost(`${native}/_new/zz-test-main`, {
    tree_path: ".forgejo/ISSUE_TEMPLATE/bug.yaml",
    content: template,
    commit_choice: "direct",
    commit_summary: "Add issue form fixture",
    last_commit: initial.last_commit,
    commit_mail_id: String(initial.commit_mails[0].id),
  });
  await page.goto(`${root}/issues/new`);
  await expect(
    page.getByRole("heading", { name: "Browser bug report", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("[Bug] ");
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-[Bug] Browser issue form");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/new\?/);
  await page.getByLabel("Affected version", { exact: true }).fill("1.2.3");
  await page
    .getByRole("textbox", { name: "Steps to reproduce", exact: true })
    .fill("Open the project and select a file.");
  await page.getByRole("combobox", { name: "Browser", exact: true }).click();
  await page.getByRole("option", { name: "Chromium", exact: true }).click();
  await page.getByLabel("I checked existing issues", { exact: true }).check();
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "steps.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Browser reproduction fixture"),
  });
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/1$/);
  await expect(page.locator(".issue-description")).toContainText("1.2.3");
  await expect(page.locator(".issue-description")).toContainText("Chromium");
  await expect(page.locator(".issue-description")).toContainText(
    "Open the project and select a file.",
  );
  const attachments = await (
    await page.request.get(`${native}/issues/1/attachments`, { headers })
  ).json();
  expect(JSON.stringify(attachments)).toContain("steps.txt");
  await page.goto(`${root}/issues/new`);
  await page
    .getByRole("button", { name: "Create a blank issue", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("zz-test-Blank issue works");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/2$/);
});
