// Creates a repository-scoped runner and workflow in the disposable test instance.
// Run tests/Dockerfile.runner first; no production repositories are changed.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const exec = promisify(execFile),
  directory = process.env.FORGEJO_TEST_FIXTURES;
assert.ok(
  directory?.includes("zz-test-forgejo-ui-test-"),
  "Use the disposable fixture directory",
);
const environment = JSON.parse(
  await readFile(`${directory}/environment.json`, "utf8"),
);
const base = process.env.FORGEJO_RUNNER_URL || environment.origin;
assert.equal(
  base,
  environment.origin,
  "Runner fixture must target the disposable test service",
);
assert.ok(environment.project.startsWith("zz-test-forgejo-ui-test-"));
assert.equal(resolve(directory), environment.directory);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.ok(new URL(base).port && new URL(base).port !== "3000");
const credentials = JSON.parse(
    await readFile(`${directory}/credentials.json`, "utf8"),
  ),
  user = credentials.user;
assert.ok(
  user.username.startsWith("zz-test-"),
  "Use a prefixed disposable runner owner",
);
const cookies = new Map();
async function request(path, values) {
  const response = await fetch(base + path, {
    redirect: "manual",
    method: values ? "POST" : "GET",
    headers: {
      "X-Forgejo-UI": "1",
      Accept: "application/json",
      Origin: base,
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(values
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: values ? new URLSearchParams(values) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  assert.ok(response.ok, `${path} returned ${response.status}`);
  const data = await response.json();
  assert.ok(
    !data.errorMessage && !data.error,
    `Native request failed: ${path}`,
  );
  return data;
}
await request("/user/login", {
  user_name: user.username,
  password: user.password,
});
const who = await request("/-/ui/data/bootstrap");
const name = `zz-test-pipeline-browser-${Date.now()}`,
  path = `/${user.username}/${name}`;
await request("/repo/create", {
  uid: String(who.user.id),
  repo_name: name,
  private: "true",
  auto_init: "on",
  default_branch: "zz-test-main",
  readme: "Default",
  description: "Disposable real-runner browser verification",
});
const runDir = resolve(directory, `${name}-runner`),
  checkout = resolve(directory, `${name}-checkout`);
await mkdir(runDir, { recursive: true, mode: 0o700 });
const gitEnv = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.extraHeader",
  GIT_CONFIG_VALUE_0:
    "Authorization: Basic " +
    Buffer.from(`${user.username}:${user.password}`).toString("base64"),
};
const git = (...args) => exec("git", args, { env: gitEnv });
await git("clone", `${base}${path}.git`, checkout);
await git("-C", checkout, "config", "user.name", "UI Runner Test");
await git("-C", checkout, "config", "user.email", "runner-test@example.test");
await mkdir(`${checkout}/.forgejo/workflows`, { recursive: true });
const artifactRevision = (
  await exec("git", [
    "ls-remote",
    "https://code.forgejo.org/actions/upload-artifact.git",
    "refs/tags/v3",
  ])
).stdout.split(/\s+/)[0];
assert.match(artifactRevision, /^[a-f0-9]{40}$/);
const workflow = `name: zz-test-Browser verification
on:
  workflow_dispatch:
    inputs:
      message:
        description: Message to print
        type: string
        default: browser-default
        required: true
      environment:
        description: Deployment environment
        type: choice
        options: [staging, production]
        default: staging
      enabled:
        description: Enable verification
        type: boolean
        default: true
      seconds:
        description: Delay in seconds
        type: number
        default: 0
jobs:
  zz-test-verify:
    runs-on: zz-test-ui-host
    steps:
      - name: zz-test-Verify inputs
        run: |
          echo 'message=\${{ inputs.message }} environment=\${{ inputs.environment }} enabled=\${{ inputs.enabled }}'
          sleep '\${{ inputs.seconds }}'
          mkdir -p zz-test-artifacts
          printf '%s\\n' 'Forgejo SPA runner artifact' > zz-test-artifacts/zz-test-report.txt
      - name: zz-test-Upload report
        uses: https://code.forgejo.org/actions/upload-artifact@${artifactRevision}
        with:
          name: zz-test-browser-report
          path: zz-test-artifacts/zz-test-report.txt
`;
await writeFile(`${checkout}/.forgejo/workflows/zz-test-manual.yml`, workflow);
await git("-C", checkout, "add", ".");
await git(
  "-C",
  checkout,
  "commit",
  "-m",
  "Add real browser verification workflow",
);
await git("-C", checkout, "push");
const runner = await request(`${path}/settings/actions/runners/new`, {
  runner_name: `${name}-runner`,
  runner_description: "Disposable repository-scoped runner",
});
assert.ok(runner.token && runner.runner?.uuid);
await writeFile(
  `${runDir}/config.yaml`,
  `log:\n  level: info\nserver:\n  connections:\n    forgejo:\n      url: ${JSON.stringify(base)}\n      uuid: ${JSON.stringify(runner.runner.uuid)}\n      token: ${JSON.stringify(runner.token)}\nrunner:\n  capacity: 1\n  labels: ["zz-test-ui-host:host"]\n  fetch_interval: 1s\n  report_interval: 1s\ncache:\n  enabled: false\n`,
  { mode: 0o600 },
);
// The image runs as uid1000, matching the workspace's owner.
await chmod(runDir, 0o700);
await writeFile(
  `${directory}/pipeline-fixtures.json`,
  JSON.stringify(
    {
      repository: path.slice(1),
      runnerId: runner.runner.id,
      runDir,
      checkout,
      container: `${name}-runner`,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
await exec("docker", [
  "run",
  "-d",
  "--name",
  `${name}-runner`,
  "--network",
  "host",
  "--mount",
  `type=bind,src=${runDir},dst=/data`,
  "forgejo-ui-test-runner:13.2.0",
  "forgejo-runner",
  "--config",
  "/data/config.yaml",
  "daemon",
]);
console.log(`Created ${path} and its disposable Docker runner.`);
