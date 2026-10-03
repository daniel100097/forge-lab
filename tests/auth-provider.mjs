// Real native OAuth/OIDC round-trip against a local disposable identity provider.
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
import { mkdir, writeFile } from "node:fs/promises";
const out = new URL("../.forgejo/auth-provider-test/", import.meta.url)
  .pathname;
await mkdir(out, { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "browser-fixture",
  use: "sig",
  alg: "RS256",
};
const gateway = JSON.parse(
  execFileSync("docker", ["network", "inspect", "bridge"], {
    encoding: "utf8",
  }),
)[0].IPAM.Config[0].Gateway;
let issuer, nonce;
const user = {
  sub: "external-fixture",
  preferred_username: "external-member",
  name: "External Member",
  email: "external@example.test",
  email_verified: true,
};
const jwt = () => {
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const payload = `${encode({ alg: "RS256", typ: "JWT", kid: jwk.kid })}.${encode({ ...user, iss: issuer, aud: "browser-client", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, nonce })}`;
  return (
    payload +
    "." +
    sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")
  );
};
const idp = createServer(async (req, res) => {
  const url = new URL(req.url, issuer);
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/.well-known/openid-configuration")
    return res.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: issuer + "/authorize",
        token_endpoint: issuer + "/token",
        userinfo_endpoint: issuer + "/userinfo",
        jwks_uri: issuer + "/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "profile", "email"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
        ],
      }),
    );
  if (url.pathname === "/jwks") return res.end(JSON.stringify({ keys: [jwk] }));
  if (url.pathname === "/authorize") {
    nonce = url.searchParams.get("nonce");
    const target = new URL(url.searchParams.get("redirect_uri"));
    target.searchParams.set("code", "browser-code");
    target.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: target.href });
    return res.end();
  }
  if (url.pathname === "/token") {
    for await (const chunk of req) {
    }
    return res.end(
      JSON.stringify({
        access_token: "fixture-access",
        token_type: "Bearer",
        expires_in: 300,
        id_token: jwt(),
      }),
    );
  }
  if (url.pathname === "/userinfo") return res.end(JSON.stringify(user));
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((r) => idp.listen(0, "0.0.0.0", r));
issuer = `http://${gateway}:${idp.address().port}`;
const container = `forgejo-ui-auth-provider-${Date.now()}`,
  origin = "http://localhost:3122",
  password = randomBytes(24).toString("base64url");
const env = {
  security__INSTALL_LOCK: "true",
  database__DB_TYPE: "sqlite3",
  database__PATH: "/data/gitea/provider.db",
  server__ROOT_URL: origin + "/",
  server__HTTP_ADDR: "0.0.0.0",
  server__LANDING_PAGE: "/-/ui/",
  service__DISABLE_REGISTRATION: "false",
  service__ENABLE_CAPTCHA: "false",
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
    "127.0.0.1:3122:3000",
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `FORGEJO__${k}=${v}`]),
    "forgejo-ui:16.0.5-local",
  ],
  { stdio: "pipe" },
);
const wait = async () => {
  for (let i = 0; i < 35; i++) {
    try {
      if ((await fetch(origin + "/-/ui/data/bootstrap")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Disposable server did not start");
};
let browser;
try {
  await wait();
  const cli = (args) =>
    exec(
      "docker",
      [
        "exec",
        "-u",
        "git",
        container,
        "/usr/local/bin/gitea",
        "admin",
        ...args,
        "--config",
        "/data/gitea/conf/app.ini",
      ],
      { stdio: "pipe" },
    );
  await cli([
    "user",
    "create",
    "--username",
    "provider-admin",
    "--email",
    "admin@example.test",
    "--password",
    password,
    "--admin",
    "--must-change-password=false",
  ]);
  await cli([
    "auth",
    "add-oauth",
    "--name",
    "Test SSO",
    "--provider",
    "openidConnect",
    "--key",
    "browser-client",
    "--secret",
    "fixture-client-secret",
    "--auto-discover-url",
    issuer + "/.well-known/openid-configuration",
    "--scopes",
    "openid",
    "--scopes",
    "profile",
    "--scopes",
    "email",
  ]);
  execFileSync("docker", ["restart", container], { stdio: "pipe" });
  await wait();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/-/ui/login");
  await page.getByRole("link", { name: "Test SSO", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/-/ui/") && !url.pathname.endsWith("/login"),
    { timeout: 30000 },
  );
  if (!page.url().endsWith("/projects")) {
    await page
      .getByRole("button", { name: "New account", exact: true })
      .click();
    await page.getByLabel("Username", { exact: true }).fill("external-member");
    if (await page.getByLabel("Email address", { exact: true }).count())
      await page
        .getByLabel("Email address", { exact: true })
        .fill("external@example.test");
    if (await page.getByLabel("Password", { exact: true }).count())
      await page.getByLabel("Password", { exact: true }).fill(password);
    if (await page.getByLabel("Confirm password", { exact: true }).count())
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: /Create account|Continue|Link account/ })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Account: external-member" }),
  ).toBeVisible();
  await page.goto(origin + "/-/ui/account/security");
  await expect(page.locator("main")).toContainText("Test SSO");
  await page.screenshot({ path: out + "linked-account.png", fullPage: true });
  await page.getByRole("button", { name: "Account: external-member" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Test SSO", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account: external-member" }),
  ).toBeVisible();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Native external OIDC signup/link + subsequent provider sign-in passed",
  );
} catch (error) {
  console.error(error.message);
  if (browser) {
    const p = browser.contexts()[0].pages()[0];
    await p.screenshot({ path: out + "failure.png", fullPage: true });
    await writeFile(out + "failure.txt", await p.locator("body").innerText());
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  execFileSync("docker", ["stop", container], { stdio: "pipe" });
  idp.closeAllConnections();
  idp.close();
}
