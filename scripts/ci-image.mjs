import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { local, run } from "./lib.mjs";

const record = local(".forgejo/ci-image.json");

export function ciEnvironment(project, environment = process.env) {
  if (!/^zz-test-forgejo-ui-ci-[0-9]+(?:-[0-9]+)?$/.test(project || ""))
    throw new Error("CI_IMAGE_PROJECT must be zz-test-forgejo-ui-ci-<run-id>.");
  return {
    ...environment,
    COMPOSE_PROJECT_NAME: project,
    COMPOSE_FILE: "compose.yaml:tests/compose.ci.yaml",
  };
}

function output(command, args, env = process.env) {
  return execFileSync(command, args, {
    cwd: local(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

export async function testedImage() {
  const data = JSON.parse(await readFile(record, "utf8"));
  if (!/^sha256:[a-f0-9]{64}$/.test(data.id || ""))
    throw new Error("Missing a valid recorded CI image ID.");
  const image = output("docker", ["compose", "config", "--images"]);
  const actual = output("docker", [
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    image,
  ]);
  if (image !== data.image || actual !== data.id)
    throw new Error(
      "The local image changed after the CI build; refusing export/publication.",
    );
  if (output("git", ["rev-parse", "HEAD"]) !== data.revision)
    throw new Error("The checkout changed after the CI build.");
  return data;
}

async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function main(mode) {
  if (mode === "build" || mode === "cleanup") {
    const env = ciEnvironment(process.env.CI_IMAGE_PROJECT);
    if (mode === "cleanup") {
      await run(
        "docker",
        ["compose", "down", "--volumes", "--remove-orphans"],
        { env },
      );
      return;
    }
    await run(
      "flock",
      ["/tmp/forgejo-rebuild.lock", "docker", "compose", "up", "-d", "--build"],
      { env },
    );
    const image = output("docker", ["compose", "config", "--images"], env);
    const id = output(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", image],
      env,
    );
    const revision = output("git", ["rev-parse", "HEAD"]);
    await mkdir(local(".forgejo"), { recursive: true });
    await writeFile(
      record,
      JSON.stringify({ image, id, revision }, null, 2) + "\n",
    );
    console.log(`Built ${image} (${id}) at ${revision}`);
  } else if (mode === "verify" || mode === "export") {
    const data = await testedImage();
    if (mode === "verify") {
      console.log(`Verified candidate ${data.id}`);
      return;
    }
    const directory = local(".forgejo/artifacts");
    await mkdir(directory, { recursive: true });
    const archiveTag = `forgejo-ui:sha-${data.revision}`;
    await run("docker", ["image", "tag", data.id, archiveTag]);
    await run("docker", [
      "image",
      "save",
      "--output",
      `${directory}/forgejo-ui.tar`,
      archiveTag,
    ]);
    await run("gzip", ["--force", `${directory}/forgejo-ui.tar`]);
    await writeFile(
      `${directory}/image.json`,
      JSON.stringify({ ...data, archiveTag }, null, 2) + "\n",
    );
    const files = ["forgejo-ui.tar.gz", "image.json"];
    await writeFile(
      `${directory}/SHA256SUMS`,
      (
        await Promise.all(
          files.map(
            async (file) =>
              `${await checksum(`${directory}/${file}`)}  ${file}`,
          ),
        )
      ).join("\n") + "\n",
    );
    console.log(`Image archive, metadata and checksums: ${directory}`);
  } else {
    throw new Error("Expected build, verify, export or cleanup.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv[2]);
