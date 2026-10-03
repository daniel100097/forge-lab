import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { local, run } from "./lib.mjs";
import { goImage } from "./test-images.mjs";

export async function testGo(execute = run) {
  const container = `zz-test-go-${randomUUID()}`;
  await execute("docker", [
    "create",
    "--name",
    container,
    "--workdir",
    "/tmp/spaui",
    "--env",
    "GO111MODULE=off",
    goImage,
    "go",
    "test",
    ".",
  ]);
  try {
    await execute("docker", [
      "cp",
      local("integration/forgejo/overlay/modules/spaui"),
      `${container}:/tmp/`,
    ]);
    await execute("docker", ["start", "--attach", container]);
  } finally {
    await execute("docker", ["rm", "--force", "--volumes", container]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await testGo();
