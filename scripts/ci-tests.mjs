import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { local, run } from "./lib.mjs";
import { browserImage } from "./test-images.mjs";

function output(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

export async function collectImages(source, target) {
  await mkdir(source, { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: async (path) => {
      const entry = await lstat(path);
      return entry.isDirectory() || (entry.isFile() && path.endsWith(".png"));
    },
  });
}

export async function testCi(execute = run, capture = output) {
  const container = `zz-test-ci-tests-${randomUUID()}`;
  const binary = capture("which", ["docker"]);
  const plugins = JSON.parse(
    capture("docker", ["info", "--format", "{{json .ClientInfo.Plugins}}"]),
  );
  const compose = plugins.find((plugin) => plugin.Name === "compose")?.Path;
  if (!compose) throw new Error("Docker Compose 2.24.4+ is required.");
  let created = false;
  let ready = false;
  let workspace;
  await execute("docker", ["volume", "create", "--driver", "local", container]);
  try {
    workspace = capture("docker", [
      "volume",
      "inspect",
      "--format",
      "{{.Mountpoint}}",
      container,
    ]);
    if (!isAbsolute(workspace) || /[,\r\n]/.test(workspace))
      throw new Error("Expected an absolute local Docker volume mountpoint.");
    await execute("docker", [
      "create",
      "--name",
      container,
      "--platform",
      "linux/amd64",
      "--network=host",
      "--ipc=host",
      "--mount",
      `type=volume,source=${container},target=${workspace}`,
      "--mount",
      "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock",
      "--workdir",
      workspace,
      "--env",
      `PATH=${workspace}/.ci-tools:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      "--env",
      `DOCKER_CONFIG=${workspace}/.ci-docker`,
      "--env",
      "CI=true",
      "--env",
      "FORGEJO_TEST_QUALITY=1",
      "--env",
      "FORGEJO_TEST_DOCKER_BROWSERS=1",
      "--entrypoint",
      "sleep",
      browserImage,
      "infinity",
    ]);
    created = true;
    await execute("docker", ["start", container]);
    await execute("docker", [
      "exec",
      container,
      "mkdir",
      "-p",
      "apps/web",
      ".ci-tools",
      ".ci-docker/cli-plugins",
      "playwright-results",
    ]);
    for (const file of [
      "package.json",
      "package-lock.json",
      "compose.yaml",
      "scripts",
      "tests",
      "apps/web/package.json",
    ])
      await execute("docker", [
        "cp",
        local(file),
        `${container}:${workspace}/${file === "scripts" || file === "tests" ? "" : file}`,
      ]);
    await execute("docker", [
      "cp",
      "--follow-link",
      binary,
      `${container}:${workspace}/.ci-tools/docker`,
    ]);
    await execute("docker", [
      "cp",
      "--follow-link",
      compose,
      `${container}:${workspace}/.ci-docker/cli-plugins/docker-compose`,
    ]);
    ready = true;
    await execute("docker", [
      "exec",
      container,
      "npm",
      "ci",
      "--no-audit",
      "--no-fund",
    ]);
    await execute("docker", ["exec", container, "npm", "run", "test:docker"]);
  } finally {
    try {
      if (ready) {
        await execute("docker", [
          "exec",
          container,
          "node",
          "scripts/ci-tests.mjs",
          "collect-images",
        ]);
        const directory = local("playwright-results", container);
        await mkdir(directory, { recursive: true });
        await execute("docker", [
          "cp",
          `${container}:${workspace}/.ci-results/.`,
          directory,
        ]);
      }
    } finally {
      try {
        if (created)
          await execute("docker", ["rm", "--force", "--volumes", container]);
      } finally {
        await execute("docker", ["volume", "rm", container]);
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "collect-images")
    await collectImages(resolve("playwright-results"), resolve(".ci-results"));
  else await testCi();
}
