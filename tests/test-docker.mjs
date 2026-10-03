import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const project = `zz-test-forgejo-ui-test-${Date.now()}`;
const directory = resolve(".forgejo", project);
const port = process.env.FORGEJO_TEST_PORT || "3100";
if (!/^\d{4,5}$/.test(port)) throw new Error("Invalid disposable test port");
const origin = `http://localhost:${port}`;
const setupOnly = process.env.FORGEJO_TEST_SETUP_ONLY === "1";
process.env.FORGEJO_TEST_PORT = port;
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "compose.yaml",
  "-f",
  "tests/compose.test.yaml",
];
function run(command, args, env = process.env, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} failed (${code})\n${output}`)),
    );
  });
}
const docker = (...args) => run("docker", [...compose, ...args]);
await mkdir(directory, { recursive: true, mode: 0o700 });
const credentials = Object.fromEntries(
  [
    ["user", "zz-test-studio"],
    ["other", "zz-test-private-owner"],
    ["admin", "zz-test-browser-admin"],
    ["quality", "zz-test-quality-browser"],
  ].map(([key, username]) => [
    key,
    { username, password: randomBytes(24).toString("base64url") },
  ]),
);
await writeFile(`${directory}/credentials.json`, JSON.stringify(credentials), {
  mode: 0o600,
});
try {
  await docker("up", "-d", "--no-build");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${origin}/-/ui/data/bootstrap`);
      if (response.ok && (await response.json()).contract === 1) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Docker Forgejo did not become ready");
  for (const { username, password } of Object.values(credentials)) {
    await run(
      "docker",
      [
        ...compose,
        "exec",
        "-T",
        "-u",
        "git",
        "forgejo",
        "/usr/local/bin/gitea",
        "admin",
        "user",
        "create",
        "--config",
        "/data/gitea/conf/app.ini",
        "--username",
        username,
        "--password",
        password,
        "--email",
        `${username}@example.test`,
        "--must-change-password=false",
        ...(username === credentials.admin.username ? ["--admin"] : []),
      ],
      process.env,
      true,
    );
  }
  const env = {
    ...process.env,
    FORGEJO_TEST_URL: origin,
    FORGEJO_NATIVE_ORIGIN: origin,
    FORGEJO_TEST_FIXTURES: directory,
    FORGEJO_TEST_PREFIX_ONLY: "1",
  };
  await run("node", ["tests/fixtures.mjs"], env);
  for (const fixtureScript of [
    "issue-list-fixtures",
    "lfs-fixtures",
    "lfs-preview-fixtures",
  ])
    await run("node", [`tests/${fixtureScript}.mjs`], env);
  await run("node", ["tests/quality/fixtures.mjs"], env);
  const fixtures = JSON.parse(
    await readFile(`${directory}/fixtures.json`, "utf8"),
  );
  await writeFile(
    `${directory}/environment.json`,
    JSON.stringify(
      {
        project,
        origin,
        directory,
        compose,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (setupOnly) {
    console.log(`Disposable fixtures ready: ${directory}/environment.json`);
  } else {
    if (process.env.FORGEJO_TEST_QUALITY === "1")
      await run("node", ["scripts/browser-tests.mjs", "quality"], env);
    await run("node", ["--test", "tests/integration.test.mjs"], {
      ...env,
      FORGEJO_TEST_USER: credentials.user.username,
      FORGEJO_TEST_PASSWORD: credentials.user.password,
      FORGEJO_TEST_REPO: fixtures.repository,
      FORGEJO_TEST_DENIED_REPO: fixtures.denied,
      FORGEJO_TEST_BOARD: String(fixtures.board),
    });
    await run(
      process.env.FORGEJO_TEST_DOCKER_BROWSERS === "1" ? "node" : "npx",
      [
        ...(process.env.FORGEJO_TEST_DOCKER_BROWSERS === "1"
          ? ["scripts/browser-tests.mjs", "regression"]
          : ["playwright", "test", "--config", "tests/playwright.config.mjs"]),
        "--output",
        resolve("playwright-results", project),
      ],
      env,
    );
    console.log("Docker integration and browser checks passed.");
  }
} finally {
  if (setupOnly || process.env.FORGEJO_TEST_KEEP === "1") {
    console.log(
      `Disposable instance retained at ${origin}; credentials: ${directory}/credentials.json`,
    );
    console.log(`Cleanup: docker ${compose.join(" ")} down --volumes`);
  } else {
    await docker("down", "--volumes");
  }
}
