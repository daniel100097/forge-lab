import { spawn, execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { browserImage } from "./test-images.mjs";
export { browserImage } from "./test-images.mjs";
const [suite = "quality", ...extra] = process.argv.slice(2);
if (!["quality", "regression", "advanced"].includes(suite))
  throw new Error("Expected quality, regression or advanced suite.");
const directory = process.cwd();
const env = [
  "FORGEJO_TEST_URL",
  "FORGEJO_TEST_FIXTURES",
  "FORGEJO_TEST_RUNNER",
  "FORGEJO_TEST_MAIL",
  "FORGEJO_NATIVE_ORIGIN",
  "FORGEJO_TEST_MODERATION",
  "FORGEJO_TEST_PREFIX_ONLY",
  "FORGEJO_TEST_INVITATIONS_CONTAINER",
  ...Object.keys(process.env).filter((key) =>
    key.startsWith("FORGEJO_ADVANCED_"),
  ),
  "CI",
]
  .filter((key) => process.env[key] !== undefined)
  .flatMap((key) => [
    "--env",
    `${key}=${key === "FORGEJO_TEST_FIXTURES" ? resolve(process.env[key]) : process.env[key]}`,
  ]);
// Existing account checks provision disposable users through the native CLI.
// Only that mutation suite needs Docker access; quality checks remain read-only.
const dockerAccess = [];
if (suite !== "quality") {
  const binary = execFileSync("which", ["docker"], { encoding: "utf8" }).trim();
  const socket = "/var/run/docker.sock";
  dockerAccess.push(
    "--volume",
    `${binary}:/usr/local/bin/docker:ro`,
    "--volume",
    `${socket}:${socket}`,
    "--group-add",
    String((await stat(socket)).gid),
  );
}
const args = [
  "run",
  "--rm",
  "--name",
  `zz-test-browser-${process.pid}-${Date.now()}`,
  "--platform",
  "linux/amd64",
  "--ipc=host",
  "--network=host",
  "--user",
  `${process.getuid?.() || 0}:${process.getgid?.() || 0}`,
  "--volume",
  `${directory}:${directory}`,
  "--workdir",
  directory,
  ...env,
  ...dockerAccess,
  browserImage,
  ...(suite === "advanced"
    ? ["node", "tests/advanced-integrations.mjs"]
    : [
        "npx",
        "playwright",
        "test",
        "--config",
        suite === "quality"
          ? "tests/quality.config.mjs"
          : "tests/playwright.config.mjs",
      ]),
  ...extra,
];
const child = spawn("docker", args, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
