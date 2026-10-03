// Enabled image CAPTCHA uses the real native validation and image transport.
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const out = new URL("../.forgejo/auth-captcha-test/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const container = `forgejo-ui-auth-captcha-${Date.now()}`,
  origin = "http://localhost:3123";
const env = {
  security__INSTALL_LOCK: "true",
  database__DB_TYPE: "sqlite3",
  database__PATH: "/data/gitea/captcha.db",
  server__ROOT_URL: origin + "/",
  server__HTTP_ADDR: "0.0.0.0",
  server__LANDING_PAGE: "/-/ui/",
  service__DISABLE_REGISTRATION: "false",
  service__ENABLE_CAPTCHA: "true",
  service__CAPTCHA_TYPE: "image",
  service__REQUIRE_CAPTCHA_FOR_LOGIN: "true",
  mailer__ENABLED: "false",
  log__LEVEL: "Warn",
};
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-d",
    "--name",
    container,
    "-p",
    "127.0.0.1:3123:3000",
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `FORGEJO__${k}=${v}`]),
    "forgejo-ui:16.0.5-local",
  ],
  { stdio: "pipe" },
);
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin + "/-/ui/data/bootstrap")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const mode of ["register", "login"]) {
    await page.goto(origin + "/-/ui/" + mode);
    const img = page.getByRole("img", { name: "Verification characters" });
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((e) => e.naturalWidth))
      .toBeGreaterThan(0);
    const first = await img.getAttribute("src");
    await page
      .getByRole("button", { name: "Reload verification image" })
      .click();
    await expect(img).not.toHaveAttribute("src", first);
    await expect
      .poll(() => img.evaluate((e) => e.naturalWidth))
      .toBeGreaterThan(0);
    await page
      .getByLabel(mode === "register" ? "Username" : "Username or email", {
        exact: true,
      })
      .fill("captcha-user");
    if (mode === "register")
      await page
        .getByLabel("Email address", { exact: true })
        .fill("captcha@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("A-fixture-password-123!");
    if (mode === "register")
      await page
        .getByLabel("Confirm password", { exact: true })
        .fill("A-fixture-password-123!");
    await page
      .getByLabel("Verification characters", { exact: true })
      .fill("intentionally-wrong");
    const before = await page
      .locator('input[name="img-captcha-id"]')
      .inputValue();
    await page
      .getByRole("button", {
        name: mode === "register" ? "Create account" : "Sign in",
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      /verification|captcha/i,
    );
    await expect(page.locator('input[name="img-captcha-id"]')).not.toHaveValue(
      before,
    );
    await expect(
      page.getByLabel("Verification characters", { exact: true }),
    ).toHaveValue("");
    await page.screenshot({ path: out + mode + ".png", fullPage: true });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Enabled image CAPTCHA: image/reload, native login+registration rejection, challenge refresh passed",
  );
} catch (error) {
  console.error(error.message);
  if (browser) {
    const p = browser.contexts()[0].pages()[0];
    await writeFile(out + "failure.txt", await p.locator("body").innerText());
    await p.screenshot({ path: out + "failure.png", fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  execFileSync("docker", ["stop", container], { stdio: "pipe" });
}
