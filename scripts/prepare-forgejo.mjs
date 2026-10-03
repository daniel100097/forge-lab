import {
  readFile,
  readdir,
  mkdir,
  cp,
  writeFile,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { local, run } from "./lib.mjs";

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    ),
  );
  return nested.flat().sort();
}
export async function prepare() {
  const config = JSON.parse(
    await readFile(local("integration/forgejo/version.json"), "utf8"),
  );
  const integration = local("integration/forgejo");
  const hash = createHash("sha256");
  for (const file of await files(integration))
    hash.update(relative(integration, file)).update(await readFile(file));
  const revision = hash.digest("hex").slice(0, 16);
  const source = local(".forgejo", `source-${revision}`);
  const stamp = join(source, ".ui-prepared");
  await mkdir(local(".forgejo"), { recursive: true });
  try {
    await access(stamp);
  } catch {
    // Never reset or overwrite an existing checkout. An interrupted prepare is
    // left for inspection and its path is shown by git's error on the next run.
    await run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      config.tag,
      config.repository,
      source,
    ]);
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    if (head !== config.commit)
      throw new Error(
        `Upstream revision mismatch: expected ${config.commit}, got ${head}`,
      );
    for (const file of await files(join(integration, "patches"))) {
      if (!file.endsWith(".patch")) continue;
      await run("git", ["apply", "--check", file], { cwd: source });
      await run("git", ["apply", file], { cwd: source });
    }
    await cp(join(integration, "overlay"), source, { recursive: true });
    await writeFile(stamp, `${config.commit}\n${revision}\n`);
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: source,
    encoding: "utf8",
  }).trim();
  if (head !== config.commit)
    throw new Error("Prepared source revision changed; refusing to build it.");
  await writeFile(
    local(".forgejo/current.json"),
    JSON.stringify({ source, revision, ...config }, null, 2) + "\n",
  );
  return source;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await prepare());
