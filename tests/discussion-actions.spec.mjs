import {
  test,
  expect as baseExpect,
  chooseAppearance,
} from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";

const directory = process.env.FORGEJO_TEST_FIXTURES;
const expect = baseExpect.configure({ timeout: 30000 });
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);

for (const kind of ["issues", "pulls"]) {
  test(`${kind} action menu keeps native lifecycle, confirmation focus and responsive translations`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(240000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const who = credentials.user;
    const authorization = `Basic ${Buffer.from(`${who.username}:${who.password}`).toString("base64")}`;
    const api = async (path, method = "GET", data) => {
      const response = await page.request.fetch(`/api/v1${path}`, {
        method,
        headers: { Authorization: authorization },
        data,
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.status() === 204 ? null : response.json();
    };
    const repo = `${who.username}/zz-test-actions-${kind}-${Date.now()}`;
    await api("/user/repos", "POST", {
      name: repo.split("/")[1],
      auto_init: true,
      default_branch: "zz-test-main",
    });
    let reader;
    try {
      if (kind === "pulls") {
        await api(`/repos/${repo}/contents/zz-test-change.md`, "POST", {
          content: Buffer.from("zz-test-action-menu\n").toString("base64"),
          message: "zz-test-action-menu",
          branch: "zz-test-main",
          new_branch: "zz-test-head",
        });
      }
      await page.goto("/-/ui/login");
      await page.getByLabel("Username or email").fill(who.username);
      await page.getByLabel("Password", { exact: true }).fill(who.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/projects$/);
      for (const [variant, width, theme, language] of [
        ["light", 1280, "Light", "en-US"],
        ["dark", 1280, "Dark", "en-US"],
        ["mobile", 390, "Light", "en-US"],
        ["german", 1280, "Light", "de-DE"],
      ]) {
        const created = await api(`/repos/${repo}/${kind}`, "POST", {
          title: `zz-test-${kind}-${variant}`,
          body: "zz-test-menu-confirmation",
          ...(kind === "pulls"
            ? { base: "zz-test-main", head: "zz-test-head" }
            : {}),
        });
        const index = created.number;
        const dataUrl = `/-/ui/data/repos/${repo}/${kind}/${index}`;
        const data = async () => (await page.request.get(dataUrl)).json();
        const root = `/-/ui/projects/${repo}/${kind === "pulls" ? "merge-requests" : kind}/${index}`;
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(root);
        await chooseAppearance(page, theme);
        await page
          .context()
          .addCookies([
            { name: "lang", value: language, url: new URL(page.url()).origin },
          ]);
        await page.request.get(`/-/ui/data/bootstrap?lang=${language}`);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(root);
        await expect(
          page.getByRole("heading", { name: created.title, exact: true }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme.toLowerCase(),
        );
        const german = language === "de-DE";
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          german ? "de" : "en",
        );
        const trigger = page.getByRole("button", {
          name: german ? "Weitere Aktionen" : "More actions",
          exact: true,
        });
        const pin = german ? "Anheften" : "Pin";
        const unpin = german ? "Loslösen" : "Unpin";
        const lock = german ? "Diskussion sperren" : "Lock discussion";
        const unlock = german ? "Diskussion entsperren" : "Unlock discussion";
        const remove = german
          ? kind === "pulls"
            ? "Merge-Request löschen"
            : "Issue löschen"
          : kind === "pulls"
            ? "Delete merge request"
            : "Delete issue";
        const cancel = german ? "Abbrechen" : "Cancel";
        const subscribed = (await data()).lifecycle.watching;
        await page
          .getByRole("button", {
            name: german
              ? subscribed
                ? "Abbestellen"
                : "Abonnieren"
              : subscribed
                ? "Unsubscribe"
                : "Subscribe",
            exact: true,
          })
          .click();
        await expect
          .poll(async () => (await data()).lifecycle.watching)
          .toBe(!subscribed);
        await expect(
          page.getByRole("button", { name: pin, exact: true }),
        ).toHaveCount(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();
        await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
        await expect(
          page.getByRole("menuitem", { name: pin, exact: true }),
        ).toBeEnabled();
        await page.screenshot({
          path: testInfo.outputPath(`${variant}-menu.png`),
          fullPage: false,
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByRole("menuitem", { name: pin, exact: true }).click();
        await expect
          .poll(async () => (await data()).lifecycle.pinned)
          .toBe(true);
        await trigger.click();
        await page.getByRole("menuitem", { name: unpin, exact: true }).click();
        await expect
          .poll(async () => (await data()).lifecycle.pinned)
          .toBe(false);
        await trigger.click();
        await page.getByRole("menuitem", { name: lock, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: cancel, exact: true }).click();
        await expect(trigger).toBeFocused();
        expect((await data()).lifecycle.locked).toBe(false);
        await trigger.click();
        await page.getByRole("menuitem", { name: lock, exact: true }).click();
        await dialog.getByRole("button", { name: lock, exact: true }).click();
        await expect
          .poll(async () => (await data()).lifecycle.locked)
          .toBe(true);
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByRole("menuitem", { name: unlock, exact: true }).click();
        await expect
          .poll(async () => (await data()).lifecycle.locked)
          .toBe(false);
        await trigger.click();
        await expect(
          page.getByRole("menuitem", { name: remove, exact: true }),
        ).toHaveAttribute("data-danger", "true");
        await page.getByRole("menuitem", { name: remove, exact: true }).click();
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: cancel, exact: true }),
        ).toBeFocused();
        await page.screenshot({
          path: testInfo.outputPath(`${variant}-confirm.png`),
          fullPage: false,
          animations: "disabled",
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        expect((await page.request.get(dataUrl)).ok()).toBe(true);
        if (variant === "light") {
          reader = await browser.newContext({
            baseURL: new URL(page.url()).origin,
          });
          const readerPage = await reader.newPage();
          await readerPage.goto(root);
          await expect(
            readerPage.getByRole("heading", {
              name: created.title,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            readerPage.getByRole("button", {
              name: "More actions",
              exact: true,
            }),
          ).toHaveCount(0);
          await reader.close();
          reader = null;
          await page.route(`**/${repo}/${kind}/${index}/delete`, (route) =>
            route.fulfill({
              status: 403,
              contentType: "application/json",
              body: JSON.stringify({ message: "zz-test-denied" }),
            }),
          );
          await trigger.click();
          await page
            .getByRole("menuitem", { name: remove, exact: true })
            .click();
          await dialog
            .getByRole("button", { name: remove, exact: true })
            .click();
          await expect(dialog.locator(".form-error")).toBeVisible();
          expect((await page.request.get(dataUrl)).ok()).toBe(true);
          await dialog
            .getByRole("button", { name: cancel, exact: true })
            .click();
          await page.unroute(`**/${repo}/${kind}/${index}/delete`);
        }
        await trigger.click();
        await page.getByRole("menuitem", { name: remove, exact: true }).click();
        await expect(dialog.locator(".form-error")).toHaveCount(0);
        await dialog.getByRole("button", { name: remove, exact: true }).click();
        await expect(page).toHaveURL(
          new RegExp(
            `/projects/${repo}/${kind === "pulls" ? "merge-requests" : kind}$`,
          ),
        );
        expect((await page.request.get(dataUrl)).status()).toBe(404);
      }
      expect(errors).toEqual([]);
    } finally {
      await reader?.close();
      await api(`/repos/${repo}`, "DELETE");
    }
  });
}
