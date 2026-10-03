// Native OpenID 2.0 discovery, provider verification, signup/link and repeat login.
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const out = new URL("../.forgejo/auth-openid-test/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const gateway = JSON.parse(
  execFileSync("docker", ["network", "inspect", "bridge"], {
    encoding: "utf8",
  }),
)[0].IPAM.Config[0].Gateway;
let issuer;
const assertions = new Map();
const idp = createServer(async (req, res) => {
  const url = new URL(req.url, issuer);
  if (url.pathname.startsWith("/identity/")) {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      `<html><head><link rel="openid2.provider" href="${issuer}/openid"><link rel="openid2.local_id" href="${issuer}${url.pathname}"></head><body>Local OpenID fixture</body></html>`,
    );
  }
  if (url.pathname === "/openid") {
    if (req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const p = new URLSearchParams(body),
        record = assertions.get(p.get("openid.sig"));
      const valid =
        record &&
        [...record.entries()].every(
          ([k, v]) => k === "openid.mode" || p.get(k) === v,
        );
      res.setHeader("Content-Type", "text/plain");
      return res.end(
        `ns:http://specs.openid.net/auth/2.0\nis_valid:${!!valid}\n`,
      );
    }
    const target = new URL(url.searchParams.get("openid.return_to")),
      id = url.searchParams.get("openid.claimed_id"),
      sig = randomBytes(32).toString("base64"),
      fields = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": issuer + "/openid",
        "openid.return_to": target.href,
        "openid.response_nonce":
          new Date().toISOString().replace(/\.\d+Z$/, "Z") +
          randomBytes(8).toString("hex"),
        "openid.assoc_handle": "fixture",
        "openid.claimed_id": id,
        "openid.identity": id,
        "openid.signed":
          "op_endpoint,return_to,response_nonce,assoc_handle,claimed_id,identity",
        "openid.sig": sig,
        "openid.sreg.email": "openid@example.test",
        "openid.sreg.nickname": "openid-member",
      };
    const assertion = new URLSearchParams(fields);
    assertions.set(sig, assertion);
    for (const [k, v] of assertion) target.searchParams.set(k, v);
    res.writeHead(302, { Location: target.href });
    return res.end();
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => idp.listen(0, "0.0.0.0", r));
issuer = `http://${gateway}:${idp.address().port}`;
const container = `forgejo-ui-auth-openid-${Date.now()}`,
  origin = "http://localhost:3124";
const env = {
  security__INSTALL_LOCK: "true",
  database__DB_TYPE: "sqlite3",
  database__PATH: "/data/gitea/openid.db",
  server__ROOT_URL: origin + "/",
  server__HTTP_ADDR: "0.0.0.0",
  server__LANDING_PAGE: "/-/ui/",
  server__SSH_AUTHORIZED_PRINCIPALS_ALLOW: "anything",
  service__DISABLE_REGISTRATION: "false",
  service__ENABLE_CAPTCHA: "false",
  openid__ENABLE_OPENID_SIGNIN: "true",
  openid__ENABLE_OPENID_SIGNUP: "true",
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
    "127.0.0.1:3124:3000",
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
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "git",
      container,
      "/usr/local/bin/gitea",
      "admin",
      "user",
      "create",
      "--username",
      "openid-admin",
      "--email",
      "admin@example.test",
      "--password",
      randomBytes(24).toString("base64url"),
      "--admin",
      "--must-change-password=false",
      "--config",
      "/data/gitea/conf/app.ini",
    ],
    { stdio: "pipe" },
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function start() {
    await page.goto(origin + "/-/ui/login");
    await page
      .getByRole("link", { name: "Sign in with OpenID", exact: true })
      .click();
    await page
      .getByLabel("OpenID URI", { exact: true })
      .fill(issuer + "/identity/member");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await start();
  await page.getByLabel("Username", { exact: true }).fill("openid-member");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("openid@example.test");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account: openid-member" }),
  ).toBeVisible();
  await page.goto(origin + "/-/ui/account/security");
  await expect(page.locator("main")).toContainText(issuer + "/identity/member");
  await page.screenshot({ path: out + "openid-identity.png", fullPage: true });
  await page.getByRole("button", { name: "Account: openid-member" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await start();
  await expect(
    page.getByRole("button", { name: "Account: openid-member" }),
  ).toBeVisible();
  await page.goto(origin + "/-/ui/account/keys");
  await page.getByRole("combobox", { name: "Key type", exact: true }).click();
  await page
    .getByRole("option", { name: "SSH principal", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Certificate principal");
  await page.getByLabel("Public key", { exact: true }).fill("openid-member");
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  await expect(
    page.locator(".account-key-card").filter({ hasText: "openid-member" }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete principal key", exact: false })
    .click();
  await expect(
    page.locator(".account-key-card").filter({ hasText: "openid-member" }),
  ).toHaveCount(0);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "OpenID discovery+native verification, signup, identity display, repeat login and SSH principal lifecycle passed",
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
  idp.closeAllConnections();
  idp.close();
}
