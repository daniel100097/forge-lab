import { test, expect } from "../fixture-test.mjs";
import { fileURLToPath } from "node:url";
import { root, login, settle, theme } from "./helpers.mjs";

// Stable native fixture; do not mock endpoint responses. Only time-dependent text
// is masked. Keep these views free of mutations from the zz-test-main regression suite.
for (const [name, mode, viewport] of [
  ["light", "light", { width: 1440, height: 1000 }],
  ["dark", "dark", { width: 1440, height: 1000 }],
  ["mobile-dark", "dark", { width: 390, height: 844 }],
]) {
  test(`${name}: project and file layout`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-30T12:00:00Z"));
    await page.setViewportSize(viewport);
    await theme(page, mode);
    await login(page);
    for (const [screen, url, ready] of [
      ["project", root, ".readme-panel .markdown h1"],
      ["file", `${root}?ref=zz-test-main&path=src%2Findex.ts`, ".source-line"],
    ]) {
      await page.goto(url);
      await expect(page.locator(ready).first()).toBeVisible();
      if (screen === "project")
        await expect(
          page
            .getByRole("complementary", {
              name: "Project information",
              exact: true,
            })
            .locator("strong"),
        ).toHaveCount(4);
      await settle(page);
      await expect(page).toHaveScreenshot(`${screen}-${name}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        stylePath: fileURLToPath(new URL("./screenshot.css", import.meta.url)),
      });
    }
  });
}
