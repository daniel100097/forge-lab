import { test, expect } from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Disposable fixture required");
const creds = JSON.parse(
  await readFile(directory + "/credentials.json", "utf8"),
);
async function login(page, user) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("owner can issue and cancel team invitations; only recipient can accept once", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.FORGEJO_TEST_INVITATIONS_CONTAINER,
    "Requires isolated invitation-enabled fixture",
  );
  await login(page, creds.user);
  const org = `zz-test-invite-browser-${Date.now()}`;
  await page.goto("/-/ui/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(org);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await page.goto(`/-/ui/organizations/${org}/teams/new`);
  await page
    .getByLabel("Team name", { exact: true })
    .fill("zz-test-developers");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByLabel(/^Username(?: or email)?$/).fill(creds.other.username);
  await page
    .getByRole("button", { name: "Invite to team", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending invitations", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel invitation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending invitations", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Invite to team", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending invitations", exact: true }),
  ).toBeVisible();
  const token = execFileSync(
    "docker",
    [
      "exec",
      process.env.FORGEJO_TEST_INVITATIONS_CONTAINER,
      "sqlite3",
      "/data/gitea/forgejo-test.db",
      `SELECT token FROM team_invite WHERE org_id=(SELECT id FROM user WHERE lower_name='${org}')`,
    ],
    { encoding: "utf8" },
  ).trim();
  const denied = await page.request.get(`/org/invite/${token}`, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect([403, 404]).toContain(denied.status());
  const recipient = await browser.newContext();
  const member = await recipient.newPage();
  await login(member, creds.other);
  await member.goto(`/-/ui/organizations/invite/${token}`);
  await expect(
    member.getByRole("heading", { name: "Team invitation", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(member).toHaveURL(
    new RegExp(`/organizations/${org}/teams/zz-test-developers$`),
  );
  await expect(member.locator(".organization-members")).toContainText(
    creds.other.username,
  );
  await expect(
    member.getByRole("button", { name: "Leave team", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pending invitations", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".organization-members")).toContainText(
    creds.other.username,
  );
  const reused = await member.request.get(`/org/invite/${token}`, {
    headers: { "X-Forgejo-UI": "1" },
  });
  expect([403, 404]).toContain(reused.status());
  await recipient.close();
});
