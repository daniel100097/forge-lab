import { createHash } from "node:crypto";
import { test, expect, chooseAppearance } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
    await readFile(`${directory}/credentials.json`, "utf8"),
  ),
  fixtures = JSON.parse(await readFile(`${directory}/fixtures.json`, "utf8"));
const owner = credentials.user.username,
  base = process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  headers = {
    "X-Forgejo-UI": "1",
    Origin: base,
    "Sec-Fetch-Site": "same-origin",
  };
async function login(page) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(owner);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("package registry version, files, project linking, cleanup preview and delete use native browser actions", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  const settings = await (
    await page.request.get("/user/settings/packages", { headers })
  ).json();
  for (const rule of settings.rules || [])
    if (
      rule.type === "generic" &&
      rule.remove_pattern.startsWith("browser-package-")
    ) {
      await page.request.post(`/user/settings/packages/rules/${rule.id}`, {
        headers,
        form: { id: String(rule.id), action: "remove", type: "generic" },
      });
    }
  const name = `zz-test-browser-package-${Date.now()}`;
  // Fixture publishing uses the standard package registry protocol. The SPA
  // itself only reads/mutates native browser routes, never /api/v1.
  const uploaded = await page.request.put(
    `/api/packages/${owner}/generic/${name}/1.0.0/test.txt`,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${owner}:${credentials.user.password}`).toString(
            "base64",
          ),
        "Content-Type": "application/octet-stream",
      },
      data: "Disposable package fixture\n",
    },
  );
  expect(uploaded.status()).toBe(201);
  const errors = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`/-/ui/packages/${owner}`);
  await page.getByLabel("Search packages", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Installation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "test.txt", exact: true }),
  ).toBeVisible();
  const download = await page.request.get(
    `/${owner}/-/packages/generic/${name}/1.0.0/files/` +
      (await page
        .getByRole("link", { name: "test.txt", exact: true })
        .getAttribute("href")
        .then((href) => href.split("/").at(-1))),
  );
  expect(await download.text()).toBe("Disposable package fixture\n");
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .last()
    .click();
  await page
    .getByRole("combobox", { name: "Linked project", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: fixtures.repository.split("/")[1],
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Project link saved");
  await page.goto(`/-/ui/projects/${fixtures.repository}/packages`);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.goto("/-/ui/account/packages");
  await page
    .getByRole("link", { name: "Add cleanup rule", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Package type", exact: true })
    .click();
  await page.getByRole("option", { name: "Generic", exact: true }).click();
  await page.getByLabel("Keep matching versions", { exact: true }).fill("[");
  await page
    .getByRole("button", { name: "Create cleanup rule", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Keep matching versions", { exact: true }).fill("");
  await page
    .getByLabel("Remove matching versions", { exact: true })
    .fill(`${name}.*`);
  await page
    .getByLabel("Match patterns against the full package name", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create cleanup rule", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rules\/\d+$/);
  await page
    .getByLabel("Keep matching versions", { exact: true })
    .fill("^protected$");
  await page
    .getByRole("button", { name: "Save cleanup rule", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cleanup rule saved");
  await page.reload();
  await expect(
    page.getByLabel("Keep matching versions", { exact: true }),
  ).toHaveValue("^protected$");
  await page
    .getByRole("link", { name: "Preview cleanup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cleanup preview", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("button", { name: "Delete cleanup rule", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete cleanup rule", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\/packages$/);
  await page.goto(`/-/ui/packages/${owner}/generic/${name}/1.0.0/settings`);
  await page
    .getByRole("button", { name: "Delete package version", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete package version", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/packages/${owner}$`));
  expect(
    (
      await page.request.get(`/${owner}/-/packages/generic/${name}/1.0.0`, {
        headers,
      })
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
});

test("Cargo index and Chef key browser actions; npm dependencies and version filtering", async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  await page.goto("/-/ui/account/packages");
  const initialize = page.getByRole("button", {
    name: "Initialize Cargo index",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Cargo package index", exact: true }),
  ).toBeVisible();
  if (await initialize.count()) {
    await initialize.click();
    await expect(
      page.getByRole("button", { name: "Rebuild Cargo index", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Rebuild Cargo index", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cargo index updated");
  expect(
    (
      await (
        await page.request.get("/user/settings/packages", { headers })
      ).json()
    ).cargo_index,
  ).toBe(true);
  await page
    .getByRole("button", { name: "Generate Chef key", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate Chef key", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("chef-private-key.pem");
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain("PRIVATE KEY");
  const name = `zz-test-browser-npm-${Date.now()}`;
  const archive =
    "H4sIAAAAAAAA/ytITM5OTE/VL4DQelnF+XkMVAYGBgZmJiYK2MRBwNDcSIHB2NTMwNDQzMwAqA7IMDUxA9LUdgg2UFpcklgEdAql5kD8ogCnhwio5lJQUMpLzE1VslJQcihOzi9I1S9JLS7RhSYIJR2QgrLUouLM/DyQGkM9Az1D3YIiqExKanFyUWZBCVQ2BKhVwQVJDKwosbQkI78IJO/tZ+LsbRykxFXLNdA+HwWjYBSMgpENACgAbtAACAAA";
  for (const version of ["1.0.0", "2.0.0"]) {
    const result = await page.request.put(
      `/api/packages/${owner}/npm/${name}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${owner}:${credentials.user.password}`).toString(
              "base64",
            ),
        },
        data: {
          name,
          _id: name,
          "dist-tags": { latest: version },
          versions: {
            [version]: {
              name,
              version,
              description: "Browser npm fixture",
              license: "MIT",
              dependencies: { react: "^19.0.0" },
              devDependencies: { typescript: "^5.0.0" },
              dist: {
                shasum: createHash("sha1")
                  .update(Buffer.from(archive, "base64"))
                  .digest("hex"),
                integrity:
                  "sha512-" +
                  createHash("sha512")
                    .update(Buffer.from(archive, "base64"))
                    .digest("base64"),
              },
            },
          },
          _attachments: { [`${name}-${version}.tgz`]: { data: archive } },
        },
      },
    );
    expect(result.status(), await result.text()).toBe(201);
  }
  await page.goto(`/-/ui/packages/${owner}/npm/${name}/2.0.0`);
  await expect(
    page.getByRole("heading", { name: "Installation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".package-command")).toContainText([
    "registry=",
    "npm install",
  ]);
  await expect(page.locator(".package-metadata")).toContainText("react");
  await expect(page.locator(".package-metadata")).toContainText("^19.0.0");
  await expect(page.locator(".package-metadata")).toContainText("typescript");
  await page.getByRole("link", { name: /^All versions/ }).click();
  await expect(page.locator(".package-row")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Sort versions", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Version ascending", exact: true })
    .click();
  await expect(page.locator(".package-row").first()).toContainText("1.0.0");
  await page.getByLabel("Search versions", { exact: true }).fill("2.0");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".package-row")).toHaveCount(1);
  await expect(page.locator(".package-row")).toContainText("2.0.0");
  for (const version of ["1.0.0", "2.0.0"])
    expect(
      (
        await page.request.post(
          `/${owner}/-/packages/npm/${name}/${version}/settings`,
          { headers, form: { action: "delete" } },
        )
      ).ok(),
    ).toBe(true);
});

test("container registry exposes real OCI metadata, pull instructions and package settings", async ({
  page,
}) => {
  await login(page);
  const name = `zz-test-browser-image-${Date.now()}`,
    imagePath = `${owner}/${name}`;
  const auth = await page.request.get(
    `/v2/token?service=container_registry&scope=repository:${imagePath}:push,pull`,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${owner}:${credentials.user.password}`).toString(
            "base64",
          ),
      },
    },
  );
  expect(auth.ok()).toBe(true);
  const token = (await auth.json()).token,
    registryHeaders = { Authorization: `Bearer ${token}` };
  const config = Buffer.from(
    JSON.stringify({
      architecture: "amd64",
      os: "linux",
      rootfs: { type: "layers", diff_ids: [] },
      config: {
        Labels: {
          "org.opencontainers.image.title": "Browser registry verification",
        },
      },
    }),
  );
  const digest = "sha256:" + createHash("sha256").update(config).digest("hex");
  const upload = await page.request.post(`/v2/${imagePath}/blobs/uploads/`, {
    headers: registryHeaders,
  });
  expect(upload.status(), await upload.text()).toBe(202);
  const location = new URL(upload.headers().location, base);
  location.searchParams.set("digest", digest);
  const blob = await page.request.put(location.pathname + location.search, {
    headers: { ...registryHeaders, "Content-Type": "application/octet-stream" },
    data: config,
  });
  expect(blob.status(), await blob.text()).toBe(201);
  const manifest = {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest,
      size: config.length,
    },
    layers: [],
  };
  const published = await page.request.put(`/v2/${imagePath}/manifests/1.0.0`, {
    headers: { ...registryHeaders, "Content-Type": manifest.mediaType },
    data: JSON.stringify(manifest),
  });
  expect(published.status(), await published.text()).toBe(201);
  await page.goto(`/-/ui/packages/${owner}/container/${name}/1.0.0`);
  await expect(page.locator(".package-command").first()).toContainText(
    `docker pull`,
  );
  await expect(page.locator(".package-command").first()).toContainText(
    `${imagePath}:1.0.0`,
  );
  await expect(page.locator(".package-metadata")).toContainText("amd64");
  await expect(page.locator(".package-metadata")).toContainText("linux");
  await page.screenshot({
    path: "playwright-results/container-package-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await chooseAppearance(page, "Dark");
  await page.reload();
  await expect(page.locator(".package-metadata")).toContainText("amd64");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "playwright-results/container-package-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Delete package version", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete package version", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/packages/${owner}$`));
});
