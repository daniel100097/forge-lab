import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const directory = process.env.FORGEJO_TEST_FIXTURES;
assert.ok(directory, "Quality fixtures require a disposable test directory.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const identity = credentials.quality;
assert.ok(
  identity,
  "Create a fresh fixture including the isolated zz-test-quality-browser user.",
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const cookies = new Map();
async function request(path, fields) {
  const response = await fetch(base + path, {
    redirect: "manual",
    method: fields ? "POST" : "GET",
    headers: {
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded", Origin: base }
        : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
await request("/user/login");
assert.equal(
  (
    await request("/user/login", {
      user_name: identity.username,
      password: identity.password,
    })
  ).status,
  303,
);
const user = (await (await request("/-/ui/data/bootstrap")).json()).user;
const repository = `${user.username}/zz-test-quality-project`;
const exists = await request(`/-/ui/data/repos/${repository}`);
const empty = exists.status === 200 ? (await exists.json()).empty : true;
if (exists.status !== 200) {
  const created = await request("/repo/create", {
    uid: String(user.id),
    repo_name: "zz-test-quality-project",
    default_branch: "zz-test-main",
    description: "Build and review software together.",
  });
  assert.ok(
    [302, 303].includes(created.status),
    `Repository creation failed: ${created.status}`,
  );
}
if (empty) {
  const checkout = `${directory}/quality-checkout-${identity.username}`;
  await mkdir(`${checkout}/src`, { recursive: true });
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0:
      "Authorization: Basic " +
      Buffer.from(`${identity.username}:${identity.password}`).toString(
        "base64",
      ),
    GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z",
  };
  const git = (...args) => exec("git", ["-C", checkout, ...args], { env });
  await git("init", "-b", "zz-test-main");
  await git("config", "user.name", "Quality Team");
  await git("config", "user.email", "quality@example.test");
  await writeFile(
    `${checkout}/README.md`,
    "# Quality project\n\nA shared workspace for the team.\n\n## Getting started\n\nBrowse source files, discuss issues, and review changes.\n\n```sh\nnpm install\nnpm run build\n```\n",
  );
  await writeFile(
    `${checkout}/src/index.ts`,
    "// A small source file for browser checks.\nexport function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n",
  );
  await git("add", ".");
  await git("commit", "-m", "Create the shared workspace");
  await git("remote", "add", "origin", `${base}/${repository}.git`);
  await git("push", "-u", "origin", "zz-test-main");
  const issue = await request(`/${repository}/issues/new`, {
    title: "zz-test-Improve keyboard navigation",
    content: "Make all project controls available from the keyboard.",
  });
  assert.equal(issue.status, 200);
}
await writeFile(`${directory}/quality.json`, JSON.stringify({ repository }), {
  mode: 0o600,
});
console.log("Stable quality project ready.");
