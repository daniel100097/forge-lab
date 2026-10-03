import { mkdir, access } from "node:fs/promises";
import { local, run } from "./lib.mjs";
const binary = local(".forgejo/bin/forgejo");
try {
  await access(binary);
} catch {
  throw new Error("Run npm run build first.");
}
await mkdir(local(".forgejo/data"), { recursive: true });
await run(binary, [
  "web",
  "--work-path",
  local(".forgejo/data"),
  "--config",
  local(".forgejo/data/custom/conf/app.ini"),
]);
