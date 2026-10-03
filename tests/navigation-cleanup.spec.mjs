import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";

const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${directory}/fixtures.json`, "utf8"),
);
const root = `/-/ui/projects/${fixtures.repository}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("settings have one navigation with the correct nested selection and mobile access", async ({
  page,
}) => {
  const navigation = page.getByRole("navigation", {
    name: "Project navigation",
    exact: true,
  });
  for (const section of [
    "general",
    "units",
    "branches",
    "tags",
    "actions/runners",
    "hooks",
  ]) {
    await page.goto(`${root}/settings/${section}`);
    const destination =
      section === "general"
        ? `${root}/settings`
        : `${root}/settings/${section}`;
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      destination,
    );
    await expect(
      page.getByRole("navigation", { name: "Project settings", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(`a[href="${destination}"]`)).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await navigation.locator(`a[href="${root}/settings/branches"]`).click();
  await expect(page).toHaveURL(`${root}/settings/branches`);
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("pinned project links appear once and collapsing pins preserves access", async ({
  page,
}) => {
  await page.goto(`${root}/issues`);
  const navigation = page.getByRole("navigation", {
    name: "Project navigation",
    exact: true,
  });
  const issues = navigation.getByRole("link", { name: /^Issues/ });
  await expect(issues).toHaveCount(1);
  await navigation.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(issues).toHaveCount(1);
  await navigation.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(issues).toHaveCount(1);
  await expect(issues).toBeVisible();
  await expect(issues).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(issues).toHaveCount(1);
  await page.goto(`${root}/settings`);
  await navigation
    .getByRole("button", { name: "Pin General", exact: true })
    .click();
  await expect(
    navigation.getByRole("link", { name: "General", exact: true }),
  ).toHaveCount(1);
  await navigation
    .getByRole("link", { name: "Repository", exact: true })
    .click();
  await expect(page).toHaveURL(`${root}/settings/branches`);
  await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
  await page.reload();
  await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    `${root}/settings/branches`,
  );
});

test("project type filters preserve native query semantics, history and a single tab row", async ({
  page,
}) => {
  await page.goto(
    "/-/ui/projects?q=zz-test-&sort=alphabetically&private=false&page=2",
  );
  const select = page.getByRole("combobox", {
    name: "Project type",
    exact: true,
  });
  await expect(page.getByRole("tablist")).toHaveCount(1);
  await expect(page.locator(".pill-tabs")).toHaveCount(0);
  for (const [mode, label] of [
    ["source", "Sources"],
    ["fork", "Forks"],
    ["mirror", "Mirrors"],
    ["collaborative", "Collaborative"],
    ["", "All types"],
  ]) {
    await select.click();
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/repo/search" &&
        (url.searchParams.get("mode") || "") === mode
      );
    });
    await page.getByRole("option", { name: label, exact: true }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const nativeParams = new URL(response.url()).searchParams;
    expect(nativeParams.get("sort")).toBe("alpha");
    expect(nativeParams.get("is_private")).toBe("false");
    const params = new URL(page.url()).searchParams;
    expect(params.get("mode") || "").toBe(mode);
    expect(params.get("q")).toBe("zz-test-");
    expect(params.get("sort")).toBe("alphabetically");
    expect(params.get("private")).toBe("false");
    expect(params.has("page")).toBe(false);
    const payload = await response.json();
    if (mode === "source")
      expect(
        payload.data.every(
          (item) => !item.repository.fork && !item.repository.mirror,
        ),
      ).toBe(true);
    if (mode === "fork")
      expect(payload.data.every((item) => item.repository.fork)).toBe(true);
    if (mode === "mirror")
      expect(payload.data.every((item) => item.repository.mirror)).toBe(true);
  }
  await page.goBack();
  await expect(select).toContainText("Collaborative");
  await page.reload();
  await expect(select).toContainText("Collaborative");
});
