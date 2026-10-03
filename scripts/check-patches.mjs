import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Always check a clean checkout. Build caches must not hide a broken patch series.
const version = JSON.parse(
  await readFile("integration/forgejo/version.json", "utf8"),
);
const target = process.env.FORGEJO_CHECK_TAG || version.tag;
const expected = process.env.FORGEJO_CHECK_COMMIT || version.commit;
if (!/^[a-f0-9]{40}$/.test(expected))
  throw new Error("Expected a full 40-character upstream Git commit.");
if (process.env.FORGEJO_CHECK_TAG && !process.env.FORGEJO_CHECK_COMMIT)
  throw new Error(
    "An upgrade candidate requires both FORGEJO_CHECK_TAG and FORGEJO_CHECK_COMMIT.",
  );
const directory = await mkdtemp(join(tmpdir(), "forgejo-ui-patches-"));
const run = (args) =>
  execFileSync("git", args, {
    cwd: directory,
    stdio: "pipe",
    encoding: "utf8",
  });
try {
  run(["clone", "--depth", "1", "--branch", target, version.repository, "."]);
  const actual = run(["rev-parse", "HEAD"]).trim();
  if (actual !== expected)
    throw new Error(`Expected ${expected}; upstream tag resolves to ${actual}`);
  const patches = (await readdir("integration/forgejo/patches"))
    .filter((p) => p.endsWith(".patch"))
    .sort();
  for (const patch of patches) {
    const path = resolve("integration/forgejo/patches", patch);
    run(["apply", "--check", path]);
    run(["apply", path]);
  }
  console.log(
    `${patches.length} patches apply cleanly to ${target} (${actual}).`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
