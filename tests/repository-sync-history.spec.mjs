import { test, expect } from "./fixture-test.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const exec = promisify(execFile),
  directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory?.includes("forgejo-ui-test-"))
  throw new Error("Use disposable fixtures");
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
async function login(page, user) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
function gitClient(user) {
  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${user.username}:${user.password}`).toString("base64")}`,
  };
  return (...args) => exec("git", args, { env });
}
test("fork fast-forward sync, divergence restriction, branch search and file history", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await login(page, credentials.user);
  const name = `zz-test-history-sync-${Date.now()}`,
    repository = `${credentials.user.username}/${name}`,
    root = `/-/ui/projects/${repository}`;
  const bootstrap = await (
    await page.request.get("/-/ui/data/bootstrap")
  ).json();
  const created = await page.request.post("/repo/create", {
    headers: { "X-Forgejo-UI": "1" },
    form: {
      uid: String(bootstrap.user.id),
      repo_name: name,
      auto_init: "on",
      default_branch: "zz-test-main",
      readme: "Default",
    },
  });
  expect(created.ok()).toBe(true);
  const otherContext = await browser.newContext({
      baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
    }),
    other = await otherContext.newPage();
  await login(other, credentials.other);
  await other.goto(`${root}/fork`);
  await other.getByLabel("Project name", { exact: true }).fill(name);
  await other
    .getByRole("button", { name: "Fork project", exact: true })
    .click();
  const forkRoot = `/-/ui/projects/${credentials.other.username}/${name}`;
  await expect(other).toHaveURL(new RegExp(`${forkRoot}$`));
  await expect(other.locator(".file-table-row").first()).toBeVisible();
  const ownerGit = gitClient(credentials.user),
    otherGit = gitClient(credentials.other),
    checkout = resolve(directory, name),
    forkCheckout = resolve(directory, `${name}-fork`);
  await ownerGit("clone", `${base}/${repository}.git`, checkout);
  for (const [key, value] of [
    ["user.name", "History UI test"],
    ["user.email", "history@example.test"],
  ])
    await ownerGit("-C", checkout, "config", key, value);
  async function commit(git, dir, file, message) {
    await writeFile(`${dir}/${file}`, message + "\n");
    await git("-C", dir, "add", file);
    await git("-C", dir, "commit", "-m", message);
    await git("-C", dir, "push", "origin", "HEAD");
  }
  await commit(ownerGit, checkout, "upstream.txt", "History upstream marker");
  await other.goto(`${forkRoot}/branches`);
  const sync = other.getByRole("button", { name: /^Sync fork/ });
  await expect(sync).toBeVisible();
  await sync.click();
  await expect(sync).toHaveCount(0);
  await other.goto(`${forkRoot}?ref=zz-test-main&path=upstream.txt`);
  await expect(other.locator(".source-code")).toContainText(
    "History upstream marker",
  );
  await otherGit(
    "clone",
    `${base}/${credentials.other.username}/${name}.git`,
    forkCheckout,
  );
  for (const [key, value] of [
    ["user.name", "Fork UI test"],
    ["user.email", "fork@example.test"],
  ])
    await otherGit("-C", forkCheckout, "config", key, value);
  const baseSha = (
      await ownerGit("-C", checkout, "rev-parse", "HEAD")
    ).stdout.trim(),
    forkSha = (
      await otherGit("-C", forkCheckout, "rev-parse", "HEAD")
    ).stdout.trim();
  expect(forkSha).toBe(baseSha);
  await commit(
    otherGit,
    forkCheckout,
    "fork-only.txt",
    "History fork divergence marker",
  );
  await commit(
    ownerGit,
    checkout,
    "base-only.txt",
    "History base divergence marker",
  );
  await other.goto(`${forkRoot}/branches`);
  await expect(
    other.locator(".repository-reference-row").first(),
  ).toBeVisible();
  await expect(sync).toHaveCount(0);
  await ownerGit("-C", checkout, "checkout", "-b", "zz-test-history-feature");
  await commit(ownerGit, checkout, "side.txt", "History sidemarker");
  await page.goto(`${root}/history?ref=zz-test-main`);
  await page
    .getByRole("textbox", { name: "Search commits", exact: true })
    .fill("sidemarker");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No matching commits", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "All branches", exact: true })
    .check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".commit-list-row")).toContainText(
    "History sidemarker",
  );
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "All branches", exact: true }),
  ).toBeChecked();
  await page.goto(`${root}/history?ref=zz-test-main&path=upstream.txt`);
  await expect(page.locator(".commit-list-row")).toHaveCount(1);
  await expect(page.locator(".commit-list-row")).toContainText(
    "History upstream marker",
  );
  expect(errors).toEqual([]);
  await otherContext.close();
});
