import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory?.includes("forgejo-ui-test-"))
  throw new Error("Use disposable Docker fixtures");
const container = `${directory.split("/").at(-1)}-forgejo-1`;
const user = {
  username: `zz-test-security-${Date.now()}`,
  password: randomBytes(24).toString("base64url"),
};
function totp(secret) {
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
test.beforeAll(() =>
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
      "--config",
      "/data/gitea/conf/app.ini",
      "--username",
      user.username,
      "--password",
      user.password,
      "--email",
      `${user.username}@example.test`,
      "--must-change-password=false",
    ],
    { stdio: "pipe" },
  ),
);
test.beforeEach(async ({ page }) => {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
test("scoped access tokens and OAuth application lifecycle", async ({
  page,
}) => {
  await page.goto("/-/ui/account/applications/tokens/new");
  await page.getByLabel("Token name").fill("zz-test-Browser test token");
  await page.getByRole("combobox", { name: "repository permission" }).click();
  await page.getByRole("option", { name: "Read", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate token", exact: true })
    .click();
  await expect(page.locator(".account-secret code")).toHaveText(
    /^[a-f0-9]{40}$/,
  );
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "zz-test-Browser test token" }),
  ).toContainText("read:repository");
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".account-row")
    .filter({ hasText: "zz-test-Browser test token" })
    .getByRole("button", { name: "Regenerate", exact: true })
    .click();
  await expect(page.locator(".account-secret code")).toHaveText(
    /^[a-f0-9]{40}$/,
  );
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".account-row")
    .filter({ hasText: "zz-test-Browser test token" })
    .getByRole("button", { name: "Revoke", exact: true })
    .click();
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "zz-test-Browser test token" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Application name", { exact: true })
    .fill("zz-test-Browser OAuth");
  await page
    .getByLabel("Redirect URIs", { exact: true })
    .fill("http://localhost:3100/test-callback");
  await page
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/oauth2\/\d+$/);
  await expect(page.locator(".account-secret code")).not.toBeEmpty();
  await page
    .getByLabel("Application name", { exact: true })
    .fill("zz-test-Browser OAuth updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Application name", { exact: true }),
  ).toHaveValue("zz-test-Browser OAuth updated");
  await page.goto("/-/ui/account/applications");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Delete application zz-test-Browser OAuth updated",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", {
      name: "zz-test-Browser OAuth updated",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("two-factor enrollment, TOTP/recovery login, recovery rotation and disable use native state", async ({
  page,
}) => {
  test.setTimeout(80000);
  await page.goto("/-/ui/account/security");
  await page
    .getByRole("link", {
      name: "Enable two-factor authentication",
      exact: true,
    })
    .click();
  await page.getByText("Enter the setup key manually", { exact: true }).click();
  const secret = await page.locator(".account-key").textContent();
  await page
    .getByLabel("Authentication code", { exact: true })
    .fill(totp(secret));
  await page
    .getByRole("button", { name: "Verify and enable", exact: true })
    .click();
  await expect(page.locator(".account-secret code")).not.toBeEmpty();
  const recovery = await page.locator(".account-secret code").textContent();
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Disable two-factor authentication",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Regenerate recovery code", exact: true })
    .click();
  await expect(page.locator(".account-secret code")).not.toHaveText(recovery);
  const rotatedRecovery = await page
    .locator(".account-secret code")
    .textContent();
  const signInAgain = async () => {
    await page
      .getByRole("button", { name: `Account: ${user.username}` })
      .click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\/two-factor$/);
  };
  await signInAgain();
  await page.getByRole("link", { name: "Use a recovery code instead" }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(rotatedRecovery);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("button", { name: `Account: ${user.username}` }),
  ).toBeVisible();
  await signInAgain();
  const previousCode = totp(secret);
  await expect
    .poll(() => totp(secret), { timeout: 32000, intervals: [500] })
    .not.toBe(previousCode);
  await page
    .getByLabel("Authentication code", { exact: true })
    .fill(totp(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("button", { name: `Account: ${user.username}` }),
  ).toBeVisible();
  await page.goto("/-/ui/account/security");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Disable two-factor authentication",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Enable two-factor authentication",
      exact: true,
    }),
  ).toBeVisible();
});
test("WebAuthn registration and removal with a browser authenticator", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  await page.goto("/-/ui/account/security");
  await page
    .getByLabel("Security key name", { exact: true })
    .fill("zz-test-Test passkey");
  await page
    .getByRole("button", { name: "Register security key", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Delete security key zz-test-Test passkey",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Account: ${user.username}` }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/webauthn$/);
  await page
    .getByRole("button", { name: "Use security key", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/-/ui/account/security");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Delete security key zz-test-Test passkey",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Delete security key zz-test-Test passkey",
      exact: true,
    }),
  ).toHaveCount(0);
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
});
test("profile privacy, avatar, preferences and email management persist", async ({
  page,
}) => {
  await page.goto("/-/ui/account");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("zz-test-Workspace member");
  await page.getByLabel("Bio", { exact: true }).fill("Writes useful code.");
  await page.getByLabel("Keep activity private", { exact: true }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Profile updated.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "zz-test-Workspace member",
  );
  await expect(
    page.getByLabel("Keep activity private", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Upload avatar", { exact: true }).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .locator("button")
    .filter({ hasText: /^Upload avatar$/ })
    .click();
  await expect(
    page.getByText("Profile picture updated.", { exact: true }),
  ).toBeVisible();
  await page.goto("/-/ui/account/appearance");
  await page
    .getByRole("combobox", { name: "Color theme", exact: true })
    .click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByLabel("Show additional project feature hints", { exact: true })
    .uncheck();
  await page
    .locator("form")
    .filter({
      has: page.getByLabel("Show additional project feature hints", {
        exact: true,
      }),
    })
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Preferences saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Show additional project feature hints", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/-/ui/account/account");
  const email = `secondary-${Date.now()}@example.test`;
  await page.getByLabel("Add email address", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Add email address", exact: true })
    .click();
  await expect(
    page.locator(".account-row").filter({ hasText: email }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: `Remove ${email}`, exact: true })
    .click();
  await expect(
    page.locator(".account-row").filter({ hasText: email }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", {
      name: "Email notification preference",
      exact: true,
    })
    .click();
  await page
    .getByRole("option", { name: "Only mentions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save notification preference", exact: true })
    .click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", {
      name: "Email notification preference",
      exact: true,
    }),
  ).toContainText("Only mentions");
});

test("authorized OIDC integrations preserve permissions through edits", async ({
  page,
}) => {
  const name = `zz-test-Browser identity ${Date.now()}`;
  await page.goto("/-/ui/account/authorized-integrations/generic/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("OIDC issuer", { exact: true })
    .fill("https://gitlab.com");
  await page.getByRole("textbox", { name: "Claim rules", exact: true }).fill(
    JSON.stringify({
      rules: [{ claim: "sub", compare: "eq", value: "browser-fixture" }],
    }),
  );
  await page
    .getByRole("combobox", { name: "repository permission", exact: true })
    .click();
  await page.getByRole("option", { name: "Read", exact: true }).click();
  await page
    .getByRole("button", { name: "Save integration", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\/authorized-integrations$/);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByLabel("Audience", { exact: true })).not.toHaveValue(
    "",
  );
  await expect(
    page.getByRole("combobox", { name: "repository permission", exact: true }),
  ).toContainText("Read");
  await page.getByLabel("Grant all permissions", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save integration", exact: true })
    .click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByLabel("Grant all permissions", { exact: true }),
  ).toBeChecked();
  await page.goto("/-/ui/account/authorized-integrations");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
});

test("OAuth consent denies and grants with the native callback", async ({
  page,
}) => {
  const name = `zz-test-Consent browser ${Date.now()}`;
  const origin = new URL(page.url()).origin;
  const callback = `${origin}/test-oauth-callback`;
  await page.route("**/test-oauth-callback*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Client callback received</p>",
    }),
  );
  await page.goto("/-/ui/account/applications");
  await page.getByLabel("Application name", { exact: true }).fill(name);
  await page.getByLabel("Redirect URIs", { exact: true }).fill(callback);
  await page
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/oauth2\/\d+$/);
  const clientID = await page
    .locator("label")
    .filter({ hasText: "Client ID" })
    .locator("code")
    .textContent();
  const params = new URLSearchParams({
    client_id: clientID.trim(),
    redirect_uri: callback,
    response_type: "code",
    scope: "read:user",
    state: "browser-state",
  });
  await page.goto(`/login/oauth/authorize?${params}`);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page).toHaveURL(/test-oauth-callback\?.*error=access_denied/);
  expect(new URL(page.url()).searchParams.get("state")).toBe("browser-state");
  await page.goto(`/login/oauth/authorize?${params}`);
  await page.getByRole("button", { name: "Authorize", exact: true }).click();
  await expect(page).toHaveURL(/test-oauth-callback\?.*code=/);
  expect(new URL(page.url()).searchParams.get("state")).toBe("browser-state");
  await page.goto("/-/ui/account/applications");
  const grant = page.locator(".account-row").filter({
    has: page.getByRole("button", { name: "Revoke access", exact: true }),
  });
  await expect(grant).toContainText("read:user");
});

test("personal webhook CRUD stays inside the SPA", async ({ page }) => {
  const url = `https://example.invalid/personal-${Date.now()}`;
  await page.goto("/-/ui/account/hooks/forgejo/new");
  await page.getByLabel("URL", { exact: true }).fill(url);
  await page.getByLabel("Enable webhook", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/hooks$/);
  const row = page
    .locator(".configuration-list article")
    .filter({ has: page.getByRole("link", { name: url, exact: true }) });
  await expect(row).toContainText("Disabled");
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue(url);
  await page.goto("/-/ui/account/hooks");
  await row.getByRole("button", { name: /Delete webhook/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

test("forced password change validates and completes inside the SPA", async ({
  page,
}) => {
  const username = `zz-test-password-required-${Date.now()}`,
    password = randomBytes(24).toString("base64url"),
    next = randomBytes(24).toString("base64url");
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
      "--config",
      "/data/gitea/conf/app.ini",
      "--username",
      username,
      "--email",
      username + "@example.test",
      "--password",
      password,
      "--must-change-password=true",
    ],
    { stdio: "pipe" },
  );
  await page.getByRole("button", { name: `Account: ${user.username}` }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/password$/);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm password", { exact: true }).fill("mismatch");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/match/i);
  await page.getByLabel("Confirm password", { exact: true }).fill(next);
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Account: ${username}` }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Account: ${username}` }),
  ).toBeVisible();
});

test("account password editing rejects old-password errors and persists", async ({
  page,
}) => {
  const next = randomBytes(24).toString("base64url");
  await page.goto("/-/ui/account/security");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("wrong-password");
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password", { exact: true }).fill(next);
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/password/i);
  await page
    .getByLabel("Current password", { exact: true })
    .fill(user.password);
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.getByRole("button", { name: `Account: ${user.username}` }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Account: ${user.username}` }),
  ).toBeVisible();
  await page.goto("/-/ui/account/security");
  await page.getByLabel("Current password", { exact: true }).fill(next);
  await page.getByLabel("New password", { exact: true }).fill(user.password);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(user.password);
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
});
