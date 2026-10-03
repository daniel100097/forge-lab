import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory)
  throw new Error(
    "Set FORGEJO_TEST_FIXTURES to a disposable fixture directory.",
  );
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const root = `/-/ui/projects/${fixtures.repository}`;

test("native file, compare and account bookmarks preserve state inside the SPA", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const branch = `zz-test-navigation/feature-${Date.now()}`;
  const response = await page.request.post(
    `/${fixtures.repository}/branches/_new/branch/zz-test-main`,
    {
      headers: {
        "X-Forgejo-UI": "1",
        Origin: base,
        "Sec-Fetch-Site": "same-origin",
      },
      form: { create_tag: "false", current_path: "", new_branch_name: branch },
    },
  );
  expect(response.ok()).toBe(true);
  for (const [nativePath, suffix, params, ready] of [
    [
      `src/branch/${branch}/README.md`,
      "",
      { ref: branch, path: "README.md" },
      ".file-info",
    ],
    [
      `_edit/${branch}/README.md`,
      "/edit",
      { ref: branch, path: "README.md" },
      ".cm-editor",
    ],
    [`_new/${branch}/`, "/new", { ref: branch, path: "" }, ".cm-editor"],
    [
      `_upload/${branch}/`,
      "/upload",
      { ref: branch, path: "" },
      "input[type=file]",
    ],
    [
      "compare/zz-test-main...zz-test-feature-overview",
      "/merge-requests/new",
      {
        target_branch: "zz-test-main",
        source_branch: "zz-test-feature-overview",
      },
      ".new-merge-request",
    ],
    [
      "compare/zz-test-main..zz-test-feature-overview",
      "/compare",
      {
        target: "zz-test-main",
        source: "zz-test-feature-overview",
        method: "..",
      },
      "h1",
    ],
  ]) {
    await page.goto(`/${fixtures.repository}/${nativePath}`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === root + suffix &&
        Object.entries(params).every(
          ([key, value]) => url.searchParams.get(key) === value,
        ),
    );
    await expect(page.locator(ready).first()).toBeVisible();
    await page.reload();
    await expect(page.locator(ready).first()).toBeVisible();
  }
  // Links in Markdown and native action results enter the resolver inside SPA.
  await page.goto(
    `/-/ui/resolve?${new URLSearchParams({ path: `/${fixtures.repository}/src/branch/${branch}/README.md#L1` })}`,
  );
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === root &&
      url.searchParams.get("ref") === branch &&
      url.searchParams.get("path") === "README.md" &&
      url.hash === "#L1",
  );
  await expect(page.locator(".file-info").first()).toBeVisible();
  await page.goto("/user/settings/appearance?tab=code#preview");
  await expect(page).toHaveURL(/\/account\/appearance\?tab=code#preview$/);
  await expect(
    page.getByRole("heading", { name: "Preferences", exact: true }),
  ).toBeVisible();
  await page.goto(root + "/missing-screen");
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const raw = await page.request.get(
    `/${fixtures.repository}/raw/branch/zz-test-main/README.md`,
    { maxRedirects: 0 },
  );
  expect(raw.status()).toBe(200);
  expect(raw.headers().location).toBeUndefined();
  expect(errors).toEqual([]);
});
