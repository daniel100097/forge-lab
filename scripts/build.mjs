import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { prepare } from "./prepare-forgejo.mjs";
import { local, run } from "./lib.mjs";
await run("npm", ["run", "build:web"]);
const source = await prepare();
const target = join(source, "routers/web/spa/dist");
await rm(target, { recursive: true, force: true });
await cp(local("apps/web/dist"), target, { recursive: true });
await run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: source });
await mkdir(local(".forgejo/tmp"), { recursive: true });
await run("make", ["build"], {
  cwd: source,
  env: {
    ...process.env,
    GOTOOLCHAIN: "auto",
    GOTMPDIR: process.env.GOTMPDIR ?? local(".forgejo/tmp"),
    GOMAXPROCS: process.env.GOMAXPROCS ?? "4",
    GOFLAGS: process.env.GOFLAGS ?? "-p=4",
    TAGS: "bindata sqlite sqlite_unlock_notify",
  },
});
await mkdir(local(".forgejo/bin"), { recursive: true });
await cp(join(source, "gitea"), local(".forgejo/bin/forgejo"));
console.log(
  "Built .forgejo/bin/forgejo with the independently compiled SPA embedded.",
);
