import { test, expect } from "../fixture-test.mjs";
import AxeBuilder from "@axe-core/playwright";
import { credentials, root, login, settle, theme } from "./helpers.mjs";

for (const mode of ["light", "dark"]) {
  test(`${mode}: core routes, source, menus and accessible controls`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/v1"))
        errors.push("Unexpected integration API request");
    });
    await theme(page, mode);
    await login(page);
    for (const [path, ready] of [
      [root, ".readme-panel .markdown h1"],
      [`${root}?ref=zz-test-main&path=src%2Findex.ts`, ".source-line"],
      [`${root}/issues`, ".issue-list"],
      [`${root}/merge-requests/new`, ".new-merge-request"],
      [`${root}/edit?ref=zz-test-main&path=README.md`, ".cm-editor"],
    ]) {
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeVisible();
      await settle(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(audit.violations, `${mode} accessibility: ${path}`).toEqual([]);
    }
    await page
      .getByRole("button", {
        name: `Account: ${credentials.user.username}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Appearance", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Create new", exact: true }).click();
    await expect(
      page.getByRole("menu", { name: "Create new", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${root}?ref=zz-test-main&path=src%2Findex.ts`);
    await expect(page.locator(".source-line").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
