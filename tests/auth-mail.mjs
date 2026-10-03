// Full browser authentication flows with an isolated Docker instance and a local SMTP sink.
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const out = new URL("../.forgejo/auth-mail-test/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const messages = [];
const sockets = new Set();
const smtp = createServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.setEncoding("utf8");
  socket.write("220 local.test ESMTP\r\n");
  let buffer = "",
    data = false,
    message = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const at = buffer.indexOf("\r\n"),
        line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      if (data) {
        if (line === ".") {
          messages.push(message);
          message = "";
          data = false;
          socket.write("250 Accepted\r\n");
        } else message += line + "\r\n";
      } else if (/^EHLO|^HELO/.test(line)) socket.write("250 local.test\r\n");
      else if (/^DATA/.test(line)) {
        data = true;
        socket.write("354 End with dot\r\n");
      } else if (/^QUIT/.test(line)) socket.end("221 Bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
await new Promise((r) => smtp.listen(2526, "0.0.0.0", r));
const name = `forgejo-ui-auth-mail-${Date.now()}`;
const origin = "http://localhost:3121";
const env = {
  security__INSTALL_LOCK: "true",
  database__DB_TYPE: "sqlite3",
  database__PATH: "/data/gitea/auth-test.db",
  server__ROOT_URL: origin + "/",
  server__HTTP_ADDR: "0.0.0.0",
  server__LANDING_PAGE: "/-/ui/",
  service__DISABLE_REGISTRATION: "false",
  service__REGISTER_EMAIL_CONFIRM: "true",
  mailer__ENABLED: "true",
  mailer__PROTOCOL: "smtp",
  mailer__SMTP_ADDR: "host.docker.internal",
  mailer__SMTP_PORT: "2526",
  mailer__FROM: "Forgejo test <test@example.test>",
  service__ENABLE_CAPTCHA: "false",
  log__LEVEL: "Warn",
};
let browser;
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "--add-host",
    "host.docker.internal:host-gateway",
    "-p",
    "127.0.0.1:3121:3000",
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `FORGEJO__${k}=${v}`]),
    "forgejo-ui:16.0.5-local",
  ],
  { stdio: "pipe" },
);
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
      name,
      "/usr/local/bin/gitea",
      "admin",
      "user",
      "create",
      "--config",
      "/data/gitea/conf/app.ini",
      "--username",
      "mail-admin",
      "--email",
      "admin@example.test",
      "--password",
      randomBytes(24).toString("base64url"),
      "--admin",
      "--must-change-password=false",
    ],
    { stdio: "pipe" },
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const password = randomBytes(24).toString("base64url"),
    nextPassword = randomBytes(24).toString("base64url");
  async function mailLink(path, after = 0) {
    await expect
      .poll(() => messages.slice(after).some((m) => m.includes(path)), {
        timeout: 30000,
      })
      .toBe(true);
    const body = messages
      .slice(after)
      .find((m) => m.includes(path))
      .replace(/=\r\n/g, "")
      .replace(/=([0-9a-f]{2})/gi, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
    const match = body.match(
      new RegExp(
        `http://localhost:3121${path.replaceAll("/", "\\/")}[^\\s"<>]+`,
      ),
    );
    if (!match) throw new Error("Expected mail link was absent");
    return match[0].replaceAll("&amp;", "&");
  }
  await page.goto(origin + "/-/ui/register");
  await page.getByLabel("Username", { exact: true }).fill("mail-member");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const activation = await mailLink("/user/activate");
  await page.goto(activation);
  // Email activation may require the password before signing the session in.
  const activate = page.getByRole("button", { name: /Activate|Continue/ });
  await page.waitForTimeout(400);
  if (await page.getByLabel("Password", { exact: true }).count()) {
    await page.getByLabel("Password", { exact: true }).fill(password);
    await activate.click();
  }
  await expect(page).toHaveURL(/\/-\/ui\/projects$/);
  await page.getByRole("button", { name: "Account: mail-member" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "git",
      name,
      "/usr/local/bin/gitea",
      "admin",
      "user",
      "create",
      "--config",
      "/data/gitea/conf/app.ini",
      "--username",
      "password-member",
      "--email",
      "password@example.test",
      "--password",
      password,
      "--must-change-password=false",
    ],
    { stdio: "pipe" },
  );
  const mailCount = messages.length;
  await page.goto(origin + "/-/ui/forgot-password");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("password@example.test");
  await page.getByRole("button", { name: /Send.*reset/i }).click();
  const recovery = await mailLink("/user/recover_account", mailCount);
  await page.goto(recovery);
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page
    .getByRole("button", { name: /Reset password|Change password/ })
    .click();
  await expect(page).toHaveURL(/\/-\/ui\/projects$/);
  await page.getByRole("button", { name: "Account: password-member" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username or email").fill("password-member");
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/-\/ui\/projects$/);
  await page.goto(origin + "/-/ui/account/account");
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "git",
      name,
      "/usr/local/bin/gitea",
      "admin",
      "user",
      "create",
      "--config",
      "/data/gitea/conf/app.ini",
      "--username",
      "email-member",
      "--email",
      "email@example.test",
      "--password",
      password,
      "--must-change-password=false",
    ],
    { stdio: "pipe" },
  );
  await page.getByRole("button", { name: "Account: password-member" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username or email").fill("email-member");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/-\/ui\/projects$/);
  await page.goto(origin + "/-/ui/account/account");
  const beforeEmail = messages.length;
  await page
    .getByLabel("Add email address", { exact: true })
    .fill("second@example.test");
  await page
    .getByRole("button", { name: "Add email address", exact: true })
    .click();
  const confirmation = await mailLink("/user/activate_email", beforeEmail);
  await page.goto(confirmation);
  await page.goto(origin + "/-/ui/account/account");
  await expect(
    page.locator(".account-row").filter({ hasText: "second@example.test" }),
  ).not.toContainText("Unverified");
  await page.screenshot({ path: out + "confirmed-email.png", fullPage: true });

  // Use independent keys, never the developer's SSH/GPG keyring.
  const keydir = out + name + "/";
  await mkdir(keydir, { recursive: true, mode: 0o700 });
  const sshkey = keydir + "id_ed25519";
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", sshkey], {
    stdio: "pipe",
  });
  await page.goto(origin + "/-/ui/account/keys");
  await page.getByLabel("Title", { exact: true }).fill("Browser SSH");
  await page
    .getByLabel("Public key", { exact: true })
    .fill(await readFile(sshkey + ".pub", "utf8"));
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  const sshrow = page
    .locator(".account-key-card")
    .filter({ hasText: "Browser SSH" });
  await expect(sshrow).toBeVisible();
  await sshrow.getByText("Verify ownership", { exact: true }).click();
  const sshToken = await sshrow.locator("details code").textContent();
  await writeFile(keydir + "ssh-token", sshToken, { mode: 0o600 });
  execFileSync(
    "ssh-keygen",
    ["-Y", "sign", "-f", sshkey, "-n", "localhost", keydir + "ssh-token"],
    { stdio: "pipe" },
  );
  await sshrow
    .getByLabel("Signature", { exact: true })
    .fill(await readFile(keydir + "ssh-token.sig", "utf8"));
  await sshrow.getByRole("button", { name: "Verify key", exact: true }).click();
  await expect(sshrow.getByText("Verified", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await sshrow
    .getByRole("button", { name: "Delete ssh key Browser SSH", exact: true })
    .click();
  await expect(sshrow).toHaveCount(0);
  const gnupg = keydir + "gnupg";
  await mkdir(gnupg, { mode: 0o700 });
  execFileSync(
    "gpg",
    [
      "--homedir",
      gnupg,
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase",
      "",
      "--quick-generate-key",
      "Browser test <second@example.test>",
      "ed25519",
      "sign",
      "1d",
    ],
    { stdio: "pipe" },
  );
  const publicKey = execFileSync(
    "gpg",
    ["--homedir", gnupg, "--armor", "--export", "second@example.test"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  await page.getByRole("combobox", { name: "Key type", exact: true }).click();
  await page.getByRole("option", { name: "GPG key", exact: true }).click();
  await page.getByLabel("Public key", { exact: true }).fill(publicKey);
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  const gpgrow = page.locator(".account-key-card");
  await expect(gpgrow).toHaveCount(1);
  await gpgrow.getByText("Verify ownership", { exact: true }).click();
  const gpgToken = await gpgrow.locator("details code").textContent();
  const signature = execFileSync(
    "gpg",
    ["--homedir", gnupg, "--armor", "--detach-sign"],
    { input: gpgToken, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  await gpgrow.getByLabel("Signature", { exact: true }).fill(signature);
  await gpgrow.getByRole("button", { name: "Verify key", exact: true }).click();
  await expect(gpgrow.getByText("Verified", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await gpgrow.getByRole("button", { name: /Delete gpg key/ }).click();
  await expect(gpgrow).toHaveCount(0);
  await page.goto(origin + "/-/ui/account/account");
  await page.getByText("Delete this account", { exact: true }).click();
  await page
    .getByLabel("Confirm your password", { exact: true })
    .fill(password);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete account permanently", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto(origin + "/-/ui/recover-account?code=expired-test-code");
  await expect(page.locator("main")).toContainText(/invalid|expired/i);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Registration, email activation/confirmation, password recovery, SSH/GPG verification and account deletion passed",
  );
} catch (error) {
  console.error(error);
  if (browser) {
    const p = browser.contexts()[0].pages()[0];
    await p.screenshot({ path: out + "failure.png", fullPage: true });
    await writeFile(out + "failure.txt", await p.locator("body").innerText());
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  execFileSync("docker", ["stop", name], { stdio: "pipe" });
  for (const socket of sockets) socket.destroy();
  smtp.close();
}
