import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory?.includes("forgejo-ui-test-"))
  throw new Error("Disposable fixtures required");
const { user } = JSON.parse(
  await readFile(directory + "/credentials.json", "utf8"),
);
async function login(page) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("native topics persist, filter projects and remain private", async ({
  page,
  browser,
}) => {
  await login(page);
  const name = `zz-test-topics-${Date.now()}`,
    topic = `native-topic-${Date.now()}`;
  await page.goto("/-/ui/projects/new");
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${name}$`));
  await page.getByRole("button", { name: "Add topics", exact: true }).click();
  await page
    .getByLabel("Project topics", { exact: true })
    .fill(`${topic},repository-preview`);
  await page.getByRole("button", { name: "Save topics", exact: true }).click();
  await expect(page.locator(".project-topics .topic-list")).toContainText(
    topic,
  );
  await page.reload();
  await page
    .locator(".project-topics")
    .getByRole("link", { name: topic, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`topic=true`));
  await expect(page.locator(".repo-list")).toContainText(name);
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(
    `/-/ui/data/repos/${user.username}/${name}/overview`,
  );
  expect([403, 404]).toContain(denied.status());
  await anonymous.close();
  await page.goto(`/-/ui/projects/${user.username}/${name}`);
  await page.getByRole("button", { name: "Edit topics", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Remove topic repository-preview",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save topics", exact: true }).click();
  await expect(page.locator(".project-topics .topic-list")).not.toContainText(
    "repository-preview",
  );
});
test("native LFS source preview and authenticated download use object content", async ({
  page,
  browser,
}) => {
  let fixture;
  try {
    fixture = JSON.parse(
      await readFile(directory + "/lfs-preview-fixtures.json", "utf8"),
    );
  } catch {}
  test.skip(!fixture, "Run the isolated LFS preview fixture seeder");
  await login(page);
  await page.goto(
    `/-/ui/projects/${fixture.repository}?ref=zz-test-main&path=large-asset.txt`,
  );
  await expect(page.locator(".lfs-file-notice")).toContainText("Git LFS");
  await expect(page.locator(".source-code")).toContainText(
    fixture.content.trim(),
  );
  await expect(page.locator(".source-code")).not.toContainText(
    "version https://git-lfs.github.com/spec/v1",
  );
  const download = page.getByRole("link", { name: "Download", exact: true });
  const url = await download.getAttribute("href");
  expect(url).toContain("/media/commit/");
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe(fixture.content);
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(url, { maxRedirects: 0 });
  expect([302, 303, 403, 404]).toContain(denied.status());
  await anonymous.close();
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await page.goto(
    `/-/ui/projects/${fixture.repository}?ref=zz-test-main&path=missing-asset.txt`,
  );
  await expect(page.locator(".lfs-file-notice")).toContainText(
    "This LFS object is missing",
  );
  await expect(page.locator(".source-code")).toContainText(
    "version https://git-lfs.github.com/spec/v1",
  );
});
