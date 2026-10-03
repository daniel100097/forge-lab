import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
const name = `forgejo-ui-installer-${Date.now()}`;
const out = new URL("../.forgejo/installer-test", import.meta.url).pathname;
await mkdir(out, { recursive: true });
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1:3120:3000",
    "-e",
    "FORGEJO__server__ROOT_URL=http://localhost:3120/",
    "-e",
    "FORGEJO__server__HTTP_ADDR=0.0.0.0",
    "-e",
    "FORGEJO__server__LANDING_PAGE=/-/ui/",
    "forgejo-ui:16.0.5-local",
  ],
  { stdio: "pipe" },
);
let browser;
try {
  for (let n = 0; n < 30; n++) {
    try {
      const r = await fetch("http://localhost:3120/-/ui/data/bootstrap");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3120/");
  await page.waitForURL("**/-/ui/install");
  await page.getByRole("heading", { name: "Set up Forgejo" }).waitFor();
  await page
    .getByRole("combobox", { name: "Database type", exact: true })
    .click();
  await page.getByRole("option", { name: "SQLite3", exact: true }).click();
  await page
    .getByLabel("Administrator username", { exact: true })
    .fill("install-admin");
  await page
    .getByLabel("Administrator email", { exact: true })
    .fill("admin@example.test");
  const password = randomBytes(24).toString("base64url");
  await page
    .getByLabel("Administrator password", { exact: true })
    .fill(password);
  await page
    .getByLabel("Confirm administrator password", { exact: true })
    .fill(password);
  await page.getByText("Email and advanced settings", { exact: true }).click();
  await page
    .getByLabel("Disable public registration", { exact: true })
    .uncheck();
  await page.screenshot({ path: out + "/installer.png", fullPage: true });
  await page
    .getByRole("button", { name: "Install Forgejo", exact: true })
    .click();
  await page.waitForURL("**/-/ui/projects", { timeout: 60000 });
  if (
    !(await page
      .getByRole("button", { name: "Account: install-admin" })
      .count())
  ) {
    await page.goto("http://localhost:3120/-/ui/login");
    await page
      .waitForURL("**/-/ui/projects", { timeout: 5000 })
      .catch(() => {});
    if (!page.url().endsWith("/projects")) {
      await page.getByLabel("Username or email").fill("install-admin");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL("**/-/ui/projects");
    }
  }
  await page.getByRole("button", { name: "Account: install-admin" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("new-member");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/-/ui/projects");
  await page.getByRole("button", { name: "Account: new-member" }).waitFor();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Installer + native registration passed");
} catch (e) {
  console.error(e);
  if (browser) {
    const p = browser.contexts()[0].pages()[0];
    await p.screenshot({ path: out + "/failure.png", fullPage: true });
    await writeFile(out + "/failure.txt", await p.locator("body").innerText());
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  execFileSync("docker", ["stop", name], { stdio: "pipe" });
}
