// Uploads an LFS object through its native Git transport in an isolated repository.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const exec = promisify(execFile),
  directory = process.env.FORGEJO_TEST_FIXTURES;
assert.ok(directory?.includes("forgejo-ui-test-"), "Use disposable fixtures");
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const { user } = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const cookies = new Map();
async function native(path, values) {
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
    !data.error && !data.errorMessage,
    `Native request failed: ${path}`,
  );
  return data;
}
await native("/user/login", {
  user_name: user.username,
  password: user.password,
});
const bootstrap = await native("/-/ui/data/bootstrap");
const name = `zz-test-lfs-browser-${Date.now()}`,
  repository = `${user.username}/${name}`;
await native("/repo/create", {
  uid: String(bootstrap.user.id),
  repo_name: name,
  private: "true",
  auto_init: "on",
  default_branch: "zz-test-main",
  readme: "Default",
  description: "Disposable LFS browser verification",
});
const content = Buffer.from(
    `Native Forgejo LFS browser verification ${Date.now()}\n`,
  ),
  oid = createHash("sha256").update(content).digest("hex");
const authorization =
  "Basic " +
  Buffer.from(`${user.username}:${user.password}`).toString("base64");
const batch = await fetch(`${base}/${repository}.git/info/lfs/objects/batch`, {
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
});
assert.ok(batch.ok, `LFS batch returned ${batch.status}`);
const object = (await batch.json()).objects[0];
assert.ok(!object.error && object.actions?.upload, "LFS upload action missing");
const upload = object.actions.upload;
assert.equal(
  new URL(upload.href).origin,
  base,
  "LFS upload remains on disposable instance",
);
const uploaded = await fetch(upload.href, {
  method: "PUT",
  headers: { ...upload.header, "Content-Type": "application/octet-stream" },
  body: content,
});
assert.ok(uploaded.ok, `LFS upload returned ${uploaded.status}`);
const checkout = resolve(directory, `${name}-checkout`);
const gitEnv = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.extraHeader",
  GIT_CONFIG_VALUE_0: `Authorization: ${authorization}`,
};
const git = (...args) => exec("git", args, { env: gitEnv });
await git("clone", `${base}/${repository}.git`, checkout);
await git("-C", checkout, "config", "user.name", "UI LFS Test");
await git("-C", checkout, "config", "user.email", "lfs-test@example.test");
await writeFile(
  `${checkout}/.gitattributes`,
  "*.txt filter=lfs diff=lfs merge=lfs -text\n",
);
await writeFile(
  `${checkout}/large-asset.txt`,
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`,
);
await git("-C", checkout, "add", ".");
await git("-C", checkout, "commit", "-m", "Add LFS pointer fixture");
await git("-C", checkout, "push");
await writeFile(
  `${directory}/lfs-fixtures.json`,
  JSON.stringify(
    {
      repository,
      oid,
      size: content.length,
      content: content.toString(),
      checkout,
    },
    null,
    2,
  ),
);
console.log(`Created ${repository} with one real LFS object.`);
