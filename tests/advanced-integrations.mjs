// Native integration checks against an isolated, explicitly enabled Docker fixture.
// This fixture never uses the demo instance or the integration API.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const stamp = Date.now(),
  container = `forgejo-ui-advanced-${stamp}`;
const port = Number(process.env.FORGEJO_ADVANCED_PORT || 3112),
  origin = `http://localhost:${port}`;
const uiOrigin = process.env.FORGEJO_ADVANCED_UI || origin;
const out = resolve(".forgejo", `advanced-${stamp}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const gateway = JSON.parse(
  execFileSync("docker", ["network", "inspect", "bridge"], {
    encoding: "utf8",
  }),
)[0].IPAM.Config[0].Gateway;
const events = [];
const receiver = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  events.push({ body, headers: req.headers, url: req.url });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));
});
await new Promise((r) => receiver.listen(0, "0.0.0.0", r));
const receiverURL = `http://${gateway}:${receiver.address().port}/webhook`;
const credentials = {
  user: {
    username: "integration-owner",
    password: randomBytes(24).toString("base64url"),
  },
  other: {
    username: "integration-reader",
    password: randomBytes(24).toString("base64url"),
  },
};
await writeFile(`${out}/credentials.json`, JSON.stringify(credentials), {
  mode: 0o600,
});
const env = {
  security__INSTALL_LOCK: "true",
  database__DB_TYPE: "sqlite3",
  database__PATH: "/data/gitea/advanced.db",
  server__ROOT_URL: `${origin}/`,
  server__HTTP_ADDR: "0.0.0.0",
  server__LANDING_PAGE: "/-/ui/",
  server__DISABLE_SSH: "false",
  server__LFS_START_SERVER: "true",
  service__DISABLE_REGISTRATION: "true",
  mailer__ENABLED: "false",
  webhook__ALLOWED_HOST_LIST: gateway,
  repository__DISABLE_MIGRATIONS: "false",
  migrations__ALLOW_LOCALNETWORKS: "true",
  federation__ENABLED: "true",
  security__DISABLE_GIT_HOOKS: "false",
  indexer__REPO_INDEXER_ENABLED: "true",
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
    `127.0.0.1:${port}:3000`,
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `FORGEJO__${k}=${v}`]),
    process.env.FORGEJO_ADVANCED_IMAGE || "forgejo-ui:16.0.5-local",
  ],
  { stdio: "pipe" },
);
let browser, page;
const completed = [],
  errors = [],
  failures = [];
const headers = {
  "X-Forgejo-UI": "1",
  Origin: origin,
  Accept: "application/json",
};
async function native(path, form) {
  const response = form
    ? await page.request.post(origin + path, { headers, form })
    : await page.request.get(origin + path, { headers });
  assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
  const data = await response.json();
  assert.ok(
    !data.error && !data.errorMessage,
    `Native action failed: ${path}: ${data.errorMessage || data.error}`,
  );
  return data;
}
async function check(name, fn) {
  if (
    process.env.FORGEJO_ADVANCED_ONLY &&
    !process.env.FORGEJO_ADVANCED_ONLY.split(",").some((s) => name.includes(s))
  )
    return;
  console.log(`Checking ${name}`);
  try {
    await fn();
    completed.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL ${name}: ${error.stack}`);
    await writeFile(
      `${out}/failure-${failures.length}.txt`,
      await page.locator("body").innerText(),
    );
    await page.screenshot({
      path: `${out}/failure-${failures.length}.png`,
      fullPage: true,
    });
  }
}
async function settings(repo) {
  await page.goto(`${uiOrigin}/-/ui/projects/${repo}/settings`);
  await expect(
    page.getByRole("heading", { name: "Project settings", exact: true }),
  ).toBeVisible();
}
function section(name) {
  return page
    .locator("details.configuration-section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function openSection(name) {
  const s = section(name);
  if (!(await s.getAttribute("open"))) {
    if (!(await s.evaluate((e) => e.open)))
      await s.locator(":scope > summary").click();
  }
  return s;
}
async function choose(label, name, parent = page) {
  await parent.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function danger(repo, title) {
  await settings(repo);
  const advanced = await openSection("Advanced");
  await advanced.getByRole("button", { name: title, exact: true }).click();
  const dialog = advanced.getByRole("alertdialog");
  await dialog.locator('input[name="repo_name"]').fill(repo);
  await dialog.getByRole("button", { name: title, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + "/-/ui/data/bootstrap")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 60000 },
    )
    .toBe(200);
  for (const [role, c] of Object.entries(credentials))
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
        c.username,
        "--password",
        c.password,
        "--email",
        `${c.username}@example.test`,
        "--must-change-password=false",
        ...(role === "user" ? ["--admin"] : []),
      ],
      { stdio: "pipe" },
    );
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      errors.push("Integration API request");
  });
  await page.goto(uiOrigin + "/-/ui/login");
  await page.getByLabel("Username or email").fill(credentials.user.username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const bootstrap = await native("/-/ui/data/bootstrap"),
    user = credentials.user;
  const create = async (name, extra = {}) => {
    await native("/repo/create", {
      uid: String(bootstrap.user.id),
      repo_name: name,
      private: "false",
      auto_init: "on",
      default_branch: "main",
      readme: "Default",
      ...extra,
    });
    return `${user.username}/${name}`;
  };
  const repo = await create("integration-source"),
    root = `/-/ui/projects/${repo}/settings`;
  await writeFile(
    `${out}/environment.json`,
    JSON.stringify({ container, origin, out, repository: repo }),
    { mode: 0o600 },
  );
  const authorization =
    "Basic " +
    Buffer.from(`${user.username}:${user.password}`).toString("base64");
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: ${authorization}`,
  };
  const git = (...args) =>
    execFileSync("git", args, {
      env: gitEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const checkout = resolve(out, "source-checkout");
  git("clone", `${origin}/${repo}.git`, checkout);
  git("-C", checkout, "config", "user.name", "Integration fixture");
  git("-C", checkout, "config", "user.email", "integration@example.test");
  const commit = async (name, content = "Integration change\n") => {
    await writeFile(`${checkout}/${name}`, content);
    git("-C", checkout, "add", name);
    git("-C", checkout, "commit", "-m", `Add ${name}`);
    git("-C", checkout, "push");
    return git("-C", checkout, "rev-parse", "HEAD");
  };
  const tip = (repo) =>
    git("ls-remote", `${origin}/${repo}.git`, "refs/heads/main").split(/\s/)[0];
  await check("webhook real signed delivery, history and replay", async () => {
    const secret = randomBytes(24).toString("hex");
    await page.goto(uiOrigin + root + "/hooks/forgejo/new");
    await page.getByLabel("URL", { exact: true }).fill(receiverURL);
    await page.getByLabel("Secret token", { exact: true }).fill(secret);
    await page
      .getByRole("button", { name: "Add webhook", exact: true })
      .click();
    await expect(page).toHaveURL(/\/settings\/hooks$/);
    await page.getByRole("link", { name: receiverURL, exact: true }).click();
    await page
      .getByRole("button", { name: "Send test event", exact: true })
      .click();
    await expect.poll(() => events.length, { timeout: 20000 }).toBe(1);
    const event = events[0];
    assert.equal(
      event.headers["x-forgejo-signature"],
      createHmac("sha256", secret).update(event.body).digest("hex"),
    );
    assert.equal(event.headers["x-forgejo-event"], "push");
    assert.equal(JSON.parse(event.body).repository.full_name, repo);
    // History must advance on this page without requiring a browser reload.
    await expect(page.locator(".configuration-deliveries")).toContainText(
      "Succeeded",
      { timeout: 20000 },
    );
    await page
      .locator(".configuration-deliveries details > summary")
      .first()
      .click();
    await expect(page.locator(".configuration-deliveries")).toContainText(
      "HTTP 200",
    );
    await page
      .getByRole("button", { name: "Resend event", exact: true })
      .first()
      .click();
    await expect.poll(() => events.length, { timeout: 20000 }).toBe(2);
    assert.equal(events[1].body, event.body);
    await page.reload();
    await expect(page.locator(".configuration-deliveries")).toContainText(
      "Succeeded",
    );
  });

  await check(
    "personal organization and system webhook event delivery and replay",
    async () => {
      await native("/org/create", {
        org_name: "webhook-namespace",
        visibility: "0",
      });
      const options = await native("/repo/create");
      const owner = options.owners.find((o) => o.name === "webhook-namespace");
      assert.ok(owner);
      await native("/repo/create", {
        uid: String(owner.id),
        repo_name: "events",
        auto_init: "on",
        readme: "Default",
        default_branch: "main",
      });
      for (const [scope, uiRoot, nativeRoot, eventRepo] of [
        ["personal", "/-/ui/account", "/user/settings", repo],
        [
          "organization",
          "/-/ui/organizations/webhook-namespace/settings",
          "/org/webhook-namespace/settings",
          "webhook-namespace/events",
        ],
        ["system", "/-/ui/admin", "/admin", repo],
      ]) {
        const hookURL = receiverURL + "/" + scope;
        await page.goto(
          uiOrigin +
            uiRoot +
            (scope === "system"
              ? "/system-hooks/forgejo/new"
              : "/hooks/forgejo/new"),
        );
        await page.getByLabel("URL", { exact: true }).fill(hookURL);
        await choose("Webhook trigger", "All events");
        await page
          .getByRole("button", { name: "Add webhook", exact: true })
          .click();
        await expect(page).toHaveURL(/\/hooks$/);
        if (scope === "system")
          await page
            .getByRole("row")
            .filter({ hasText: hookURL })
            .getByRole("link", { name: "Edit", exact: true })
            .click();
        else
          await page.getByRole("link", { name: hookURL, exact: true }).click();
        const hookPage = page.url();
        await native(`/${eventRepo}/issues/new`, {
          title: `${scope} webhook event`,
          content: "Real native issue event delivery",
        });
        await expect
          .poll(
            () =>
              events.filter(
                (e) =>
                  e.url === `/webhook/${scope}` &&
                  e.headers["x-forgejo-event"] === "issues",
              ).length,
            { timeout: 20000 },
          )
          .toBe(1);
        await page.goto(hookPage);
        await expect(page.locator(".configuration-deliveries")).toContainText(
          "Succeeded",
          { timeout: 10000 },
        );
        await page
          .locator(".configuration-deliveries details > summary")
          .first()
          .click();
        await expect(page.locator(".configuration-deliveries")).toContainText(
          "HTTP 200",
        );
        await page
          .getByRole("button", { name: "Resend event", exact: true })
          .first()
          .click();
        await expect
          .poll(
            () =>
              events.filter(
                (e) =>
                  e.url === `/webhook/${scope}` &&
                  e.headers["x-forgejo-event"] === "issues",
              ).length,
            { timeout: 20000 },
          )
          .toBe(2);
      }
    },
  );
  await check("repository team assignment and removal", async () => {
    await native("/org/create", { org_name: "team-settings", visibility: "0" });
    const options = await native("/repo/create");
    const owner = options.owners.find((o) => o.name === "team-settings");
    await native("/repo/create", {
      uid: String(owner.id),
      repo_name: "restricted",
      auto_init: "on",
      default_branch: "main",
      readme: "Default",
    });
    await page.goto(uiOrigin + "/-/ui/organizations/team-settings/teams/new");
    await page.getByLabel("Team name", { exact: true }).fill("reviewers");
    await page
      .getByRole("button", { name: "Create team", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "reviewers", exact: true }),
    ).toBeVisible();
    await page.goto(
      uiOrigin +
        "/-/ui/projects/team-settings/restricted/settings/collaboration",
    );
    await page.getByLabel("Team name", { exact: true }).fill("reviewers");
    await page.getByRole("button", { name: "Add team", exact: true }).click();
    const row = page
      .locator(".configuration-list article")
      .filter({ has: page.getByText("reviewers", { exact: true }) });
    await expect(row).toContainText("Project access");
    await page.reload();
    await expect(row).toContainText("Project access");
    await row
      .getByRole("button", { name: "Remove reviewers", exact: true })
      .click();
    await row
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    assert.ok(
      !(
        await native("/team-settings/restricted/settings/collaboration")
      ).teams.some((t) => t.name === "reviewers"),
    );
  });
  await check("enabled SSH deploy key add and delete", async () => {
    const key = `${out}/deploy-key`;
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
    await page.goto(uiOrigin + root + "/keys");
    await page
      .getByLabel("Title", { exact: true })
      .fill("Read-only integration key");
    await page
      .getByLabel("Public SSH key", { exact: true })
      .fill(await readFile(key + ".pub", "utf8"));
    await page
      .getByRole("button", { name: "Add deploy key", exact: true })
      .click();
    const row = page
      .locator(".configuration-list article")
      .filter({ hasText: "Read-only integration key" });
    await expect(row).toContainText("Read only");
    await page.reload();
    await expect(row).toContainText("SHA256:");
    await row
      .getByRole("button", {
        name: "Delete Read-only integration key",
        exact: true,
      })
      .click();
    await row
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(row).toHaveCount(0);
  });
  await check(
    "signature trust persistence and enabled federation validation",
    async () => {
      await settings(repo);
      const signing = await openSection("Commit signing");
      await choose("Signature trust model", "Committer", signing);
      await signing
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(signing.getByRole("status")).toHaveText("Changes saved.");
      await page.reload();
      await openSection("Commit signing");
      await expect(signing.getByRole("combobox")).toContainText("Committer");
      const federation = await openSection("Federation");
      await federation
        .getByLabel("Following repositories")
        .fill("not a repository URL");
      await federation
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(federation.getByRole("alert")).toBeVisible();
      await federation.getByLabel("Following repositories").fill("");
      await federation
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(federation.getByRole("status")).toHaveText("Changes saved.");
      const data = await native(`/${repo}/settings`);
      assert.equal(data.repository.trust_model, "committer");
      assert.equal(data.following_repos, "");
    },
  );
  await check(
    "runner registration token rotation and persistence",
    async () => {
      await page.goto(uiOrigin + root + "/actions/runners");
      const token = await openSection("Registration token");
      await token
        .getByRole("button", { name: "Reveal registration token", exact: true })
        .click();
      const before = await token
        .locator(".configuration-token code")
        .innerText();
      assert.ok(before.length > 20);
      await token
        .getByRole("button", { name: "Reset registration token", exact: true })
        .click();
      await token
        .getByRole("alertdialog")
        .getByRole("button", { name: "Reset token", exact: true })
        .click();
      await expect(token.getByRole("alertdialog")).toHaveCount(0);
      await expect(token.locator(".configuration-token code")).not.toHaveText(
        before,
      );
      const after = await token
        .locator(".configuration-token code")
        .innerText();
      await page.reload();
      await openSection("Registration token");
      await token
        .getByRole("button", { name: "Reveal registration token", exact: true })
        .click();
      await expect(token.locator(".configuration-token code")).toHaveText(
        after,
      );
    },
  );
  await check(
    "administrator repository health and index rebuilds",
    async () => {
      await settings(repo);
      const maintenance = await openSection("Repository maintenance");
      const health = maintenance.getByLabel("Enable repository health checks", {
        exact: true,
      });
      const before = await health.isChecked();
      await health.setChecked(!before);
      await maintenance
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(maintenance.getByRole("status").first()).toHaveText(
        "Changes saved.",
      );
      await page.reload();
      await openSection("Repository maintenance");
      await expect(health).toBeChecked({ checked: !before });
      for (const kind of ["stats", "code", "issues"]) {
        const form = maintenance.locator("form").filter({
          has: page.getByRole("button", {
            name: `Rebuild ${kind} index`,
            exact: true,
          }),
        });
        await form.getByRole("button").click();
        await expect(form.getByRole("status")).toHaveText("Changes saved.");
      }
    },
  );

  await check("server Git hook edit, execution and disable", async () => {
    await page.goto(uiOrigin + root + "/hooks/git/pre-receive");
    await page
      .getByLabel("Hook script", { exact: true })
      .fill(
        "#!/bin/sh\ncat >/dev/null\necho advanced-hook-executed >&2\nexit 0\n",
      );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(/hooks\/git$/);
    await writeFile(
      `${checkout}/hook-proof.txt`,
      "Run the configured server hook\n",
    );
    git("-C", checkout, "add", ".");
    git("-C", checkout, "commit", "-m", "Run integration hook");
    const push = execFileSync("git", ["-C", checkout, "push"], {
      env: gitEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // A second push records stderr so the marker proves server execution.
    await writeFile(
      `${checkout}/hook-proof.txt`,
      "Run the configured server hook twice\n",
    );
    git("-C", checkout, "add", ".");
    git("-C", checkout, "commit", "-m", "Prove integration hook");
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("git", ["-C", checkout, "push"], {
      env: gitEnv,
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /advanced-hook-executed/);
    await page.goto(uiOrigin + root + "/hooks/git/pre-receive");
    await page.getByLabel("Hook script", { exact: true }).fill("");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.locator(".configuration-list article").filter({
        has: page.getByRole("link", { name: "pre-receive", exact: true }),
      }),
    ).toContainText("Not configured");
  });
  await check(
    "wiki default branch normalization and confirmed deletion",
    async () => {
      await page.goto(`${uiOrigin}/-/ui/projects/${repo}/wiki?action=new`);
      await page.getByLabel("Page title", { exact: true }).fill("Home");
      await page
        .getByRole("textbox", { name: "Page content", exact: true })
        .fill("# Integration wiki\n\nRetained before normalization.");
      await page
        .getByRole("button", { name: "Save page", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Home", exact: true, level: 2 }),
      ).toBeVisible();
      // Create a real legacy default branch so normalization does actual work.
      const wikiPath = `/data/git/repositories/${repo}.wiki.git`;
      execFileSync(
        "docker",
        [
          "exec",
          "-u",
          "git",
          container,
          "git",
          "--git-dir",
          wikiPath,
          "branch",
          "-m",
          "main",
          "legacy",
        ],
        { stdio: "pipe" },
      );
      execFileSync(
        "docker",
        [
          "exec",
          container,
          "sqlite3",
          "/data/gitea/advanced.db",
          "UPDATE repository SET wiki_branch='legacy' WHERE name='integration-source';",
        ],
        { stdio: "pipe" },
      );
      await danger(repo, "Normalize wiki branch");
      const refs = execFileSync(
        "docker",
        [
          "exec",
          "-u",
          "git",
          container,
          "git",
          "--git-dir",
          wikiPath,
          "symbolic-ref",
          "HEAD",
        ],
        { encoding: "utf8" },
      ).trim();
      assert.equal(refs, "refs/heads/main");
      await page.goto(`${uiOrigin}/-/ui/projects/${repo}/wiki`);
      await expect(
        page.getByText("Retained before normalization.", { exact: true }),
      ).toBeVisible();
      await danger(repo, "Delete wiki");
      await page.goto(`${uiOrigin}/-/ui/projects/${repo}/wiki`);
      await expect(page.getByRole("heading", { name: /wiki/i })).toBeVisible();
      assert.equal(
        (await native(`/${repo}/settings`)).repository.default_wiki_branch,
        "main",
      );
      const { spawnSync } = await import("node:child_process");
      assert.notEqual(
        spawnSync("docker", ["exec", container, "test", "-d", wikiPath]).status,
        0,
      );
    },
  );
  await check(
    "LFS available pointer association to another accessible repository",
    async () => {
      const donor = await create("lfs-donor"),
        content = Buffer.from("Shared native LFS fixture content\n"),
        oid = createHash("sha256").update(content).digest("hex");
      await commit(
        "shared-lfs-pointer.bin",
        `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`,
      );
      const batch = await fetch(
        `${origin}/${donor}.git/info/lfs/objects/batch`,
        {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/vnd.git-lfs+json",
            Accept: "application/vnd.git-lfs+json",
          },
          body: JSON.stringify({
            operation: "upload",
            transfers: ["basic"],
            objects: [{ oid, size: content.length }],
          }),
        },
      );
      assert.ok(batch.ok);
      const object = (await batch.json()).objects[0];
      assert.ok(object.actions?.upload);
      const upload = object.actions.upload;
      assert.ok(
        (
          await fetch(upload.href, {
            method: "PUT",
            headers: {
              ...upload.header,
              "Content-Type": "application/octet-stream",
            },
            body: content,
          })
        ).ok,
      );
      // Forgejo normally associates reachable pointers on push. Insert the pointer
      // through Git first and only upload its content afterwards in the donor.

      let pointers = await native(`/${repo}/settings/lfs/pointers`);
      let pointer = pointers.items.find((p) => p.oid === oid);
      if (pointer.in_repo)
        throw new Error(
          "Pointer fixture already associated; create missing pointer before donor upload",
        );
      assert.ok(pointer.associatable);
      await page.goto(uiOrigin + root + "/lfs/pointers");
      const row = page
        .locator(".configuration-list article")
        .filter({ hasText: oid });
      await expect(row).toContainText("Available");
      await row.getByRole("button", { name: "Associate", exact: true }).click();
      await expect(row).toContainText("Associated");
      await page.reload();
      await expect(row).toContainText("Associated");
      await page.goto(uiOrigin + root + "/lfs/show/" + oid);
      await expect(page.locator(".configuration-lfs-preview")).toContainText(
        content.toString().trim(),
      );
    },
  );
  await check(
    "push mirror setup, actual synchronization, update and removal",
    async () => {
      const target = await create("push-target", { auto_init: "" }),
        targetURL = `http://localhost:3000/${target}.git`;
      await settings(repo);
      let mirrors = await openSection("Mirroring repositories");
      const add = mirrors.locator("form").filter({
        has: page.getByRole("button", {
          name: "Add push mirror",
          exact: true,
        }),
      });
      await add
        .getByLabel("Git repository URL", { exact: true })
        .fill(targetURL);
      await add
        .getByLabel("Authentication username", { exact: true })
        .fill(user.username);
      await add
        .getByLabel("Authentication password or token", { exact: true })
        .fill(user.password);
      await add
        .getByRole("button", { name: "Add push mirror", exact: true })
        .click();
      await expect(add.getByRole("status")).toHaveText("Changes saved.");
      const row = mirrors
        .locator(".configuration-mirror-row")
        .filter({ hasText: targetURL });
      await expect(row).toBeVisible();
      await row
        .getByRole("button", { name: "Synchronize", exact: true })
        .click();
      await expect.poll(() => tip(target), { timeout: 30000 }).toBe(tip(repo));
      await row.getByLabel("Branch filter", { exact: true }).fill("main");
      await row
        .getByRole("button", { name: "Update mirror", exact: true })
        .click();
      await expect(
        row
          .locator("form")
          .filter({
            has: page.getByRole("button", {
              name: "Update mirror",
              exact: true,
            }),
          })
          .getByRole("status"),
      ).toHaveText("Changes saved.");
      const sha = await commit("mirror-synchronization.txt");
      await row
        .getByRole("button", { name: "Synchronize", exact: true })
        .click();
      await expect.poll(() => tip(target), { timeout: 30000 }).toBe(sha);
      await page.reload();
      await openSection("Mirroring repositories");
      await expect(
        row.getByLabel("Branch filter", { exact: true }),
      ).toHaveValue("main");
      await expect(row).not.toContainText("Last synchronized Never");
      await row.getByRole("button", { name: /Delete / }).click();
      await row
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(row).toHaveCount(0);
      assert.equal((await native(`/${repo}/settings`)).push_mirrors.length, 0);
    },
  );
  await check(
    "pull mirror import, edit, actual synchronization and conversion",
    async () => {
      const name = "pull-mirror",
        target = `${user.username}/${name}`;
      await page.goto(uiOrigin + "/-/ui/projects/import");
      await page
        .getByLabel("Git repository URL", { exact: true })
        .fill(`http://localhost:3000/${repo}.git`);
      await page.getByLabel("Project name", { exact: true }).fill(name);
      await page
        .getByLabel("Keep this project synchronized as a pull mirror", {
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Import project", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp("/projects/" + target + "$"));
      await expect
        .poll(
          () => {
            try {
              return tip(target);
            } catch {
              return "";
            }
          },
          { timeout: 30000 },
        )
        .toBe(tip(repo));
      await settings(target);
      const mirrors = await openSection("Mirroring repositories");
      const form = mirrors.locator("form").filter({
        has: page.getByRole("button", {
          name: "Update pull mirror",
          exact: true,
        }),
      });
      await form.getByLabel("Update interval", { exact: true }).fill("12h");
      await form
        .getByRole("button", { name: "Update pull mirror", exact: true })
        .click();
      await expect(form.getByRole("status")).toHaveText("Changes saved.");
      const sha = await commit("pull-mirror-synchronization.txt");
      await mirrors
        .getByRole("button", { name: "Synchronize pull mirror", exact: true })
        .click();
      await expect.poll(() => tip(target), { timeout: 30000 }).toBe(sha);
      await danger(target, "Convert mirror");
      assert.equal(
        (await native(`/${target}/settings`)).repository.mirror,
        false,
      );
      assert.equal(tip(target), sha);
    },
  );
  await check("fork conversion retains Git history", async () => {
    const source = await create("fork-parent");
    await native("/org/create", {
      org_name: "integration-forks",
      visibility: "0",
    });
    const options = await native("/repo/create");
    const owner = options.owners.find((o) => o.name === "integration-forks");
    assert.ok(owner);
    await native(`/${source}/fork`, {
      uid: String(owner.id),
      repo_name: "detached-fork",
    });
    const target = "integration-forks/detached-fork";
    assert.equal((await native(`/${target}/settings`)).repository.fork, true);
    const before = tip(target);
    await danger(target, "Detach fork");
    assert.equal((await native(`/${target}/settings`)).repository.fork, false);
    assert.equal(tip(target), before);
  });

  await check("import failure, successful retry and cancellation", async () => {
    let mode = "fail",
      waiting = [];
    const remote = createServer(async (req, res) => {
      if (mode === "hold") {
        waiting.push(res);
        return;
      }
      if (mode === "fail") {
        res.writeHead(500);
        res.end("Fixture remote temporarily unavailable");
        return;
      }
      let body;
      if (req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks);
      }
      const path = req.url.replace(/^\/remote\.git/, `/${repo}.git`);
      const upstream = await fetch(origin + path, {
        method: req.method,
        headers: { ...req.headers, host: new URL(origin).host },
        body,
      });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    });
    await new Promise((r) => remote.listen(0, "0.0.0.0", r));
    const remoteURL = `http://${gateway}:${remote.address().port}/remote.git`;
    try {
      const start = async (name) => {
        await page.goto(uiOrigin + "/-/ui/projects/import");
        await page
          .getByLabel("Git repository URL", { exact: true })
          .fill(remoteURL);
        await page.getByLabel("Project name", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: "Import project", exact: true })
          .click();
        await expect(page).toHaveURL(
          new RegExp("/projects/" + user.username + "/" + name + "$"),
        );
      };
      await start("retry-import");
      await expect(
        page.getByText("Project import failed", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole("button", { name: "Retry import", exact: true }),
      ).toBeVisible();
      const failed = await native(
        `/-/ui/data/repos/${user.username}/retry-import`,
      );
      assert.equal(failed.migration.status, 3);
      const outsider = await browser.newContext();
      try {
        const login = await outsider.request.post(origin + "/user/login", {
          headers,
          form: {
            user_name: credentials.other.username,
            password: credentials.other.password,
          },
        });
        assert.ok(login.ok());
        const denied = await outsider.request.get(
          origin + `/-/ui/data/repos/${user.username}/retry-import`,
          { headers },
        );
        assert.equal(denied.status(), 404);
        const task = await outsider.request.get(
          origin + `/user/task/${failed.migration.id}`,
          { headers },
        );
        assert.equal(task.status(), 404);
      } finally {
        await outsider.close();
      }
      mode = "proxy";
      await page
        .getByRole("button", { name: "Retry import", exact: true })
        .click();
      await expect
        .poll(
          () => {
            try {
              return tip(`${user.username}/retry-import`);
            } catch {
              return "";
            }
          },
          { timeout: 30000 },
        )
        .toBe(tip(repo));
      await expect(
        page.getByRole("button", { name: "Open project", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await page
        .getByRole("button", { name: "Open project", exact: true })
        .click();
      await expect(page.locator(".project-overview")).toBeVisible();
      mode = "hold";
      await start("cancel-import");
      await expect
        .poll(() => waiting.length, { timeout: 20000 })
        .toBeGreaterThan(0);
      await page
        .getByRole("button", { name: "Cancel import", exact: true })
        .click();
      await expect(
        page.getByText("Project import failed", { exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.getByRole("button", { name: "Retry import", exact: true }),
      ).toBeVisible();
      const state = await native(
        `/-/ui/data/repos/${user.username}/cancel-import`,
      );
      assert.equal(state.migration.status, 3);
    } finally {
      for (const response of waiting) response.destroy();
      remote.closeAllConnections();
      await new Promise((r) => remote.close(r));
    }
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(`All ${completed.length} enabled integration checks passed.`);
} catch (error) {
  console.error(error.stack);
  if (page) {
    await writeFile(
      `${out}/failure.txt`,
      await page.locator("body").innerText(),
    );
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        completed,
        errors,
        failures,
        image: execFileSync(
          "docker",
          ["inspect", "--format", "{{.Image}}", container],
          { encoding: "utf8" },
        ).trim(),
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await new Promise((r) => receiver.close(r));
  if (process.env.FORGEJO_ADVANCED_KEEP === "1")
    console.log(`Retained ${container} at ${origin}; evidence ${out}`);
  else execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
}
