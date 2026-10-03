import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { testedImage } from "./ci-image.mjs";

export function registryImage(image, server = "", repository = "") {
  if (!image) {
    const origin = new URL(server);
    if (
      !["https:", "http:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository)
    )
      throw new Error("Expected the Forgejo server URL and owner/repository.");
    image = `${origin.host}/${repository.toLowerCase()}`;
  }
  const [registry, ...path] = image.split("/");
  const host = /^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::([0-9]+))?$/.exec(registry);
  if (
    !host ||
    (!registry.includes(".") &&
      !registry.includes(":") &&
      registry !== "localhost") ||
    (host[1] && (+host[1] < 1 || +host[1] > 65535)) ||
    path.length < 2 ||
    path.some((part) => !/^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/.test(part))
  )
    throw new Error(
      "Set RELEASE_IMAGE to an explicit registry/owner/image (without a tag).",
    );
  return { registry, image };
}

export function releaseTarget(tag, image) {
  const version =
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(
      tag,
    );
  if (
    !version ||
    tag.length > 128 ||
    version[4]
      ?.split(".")
      .some((part) => !/^[0-9A-Za-z-]+$/.test(part) || /^0\d+$/.test(part))
  )
    throw new Error(
      "Release tag must be a semantic version, for example v0.1.0.",
    );
  const { registry } = registryImage(image);
  return { registry, target: `${image}:${tag}` };
}

export function mainTarget(image, event, ref) {
  if (
    !["push", "workflow_dispatch"].includes(event) ||
    ref !== "refs/heads/main"
  )
    throw new Error(
      "Main publication requires a push/manual run on refs/heads/main.",
    );
  const { registry } = registryImage(image);
  return { registry, target: `${image}:main` };
}

export function candidateTarget(image, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || ""))
    throw new Error("Expected a full commit SHA for the candidate image.");
  const { registry } = registryImage(image);
  return { registry, target: `${image}:sha-${revision}` };
}

const run = (args, options = {}) => {
  const result = spawnSync("docker", args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed.`);
};

export async function registryPassword(
  environment = process.env,
  request = fetch,
) {
  if (environment.REGISTRY_OIDC_AUDIENCE) {
    if (
      !environment.ACTIONS_ID_TOKEN_REQUEST_URL ||
      !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    )
      throw new Error(
        "OIDC requires enable-openid-connect: true and the runner's ID token environment.",
      );
    const endpoint = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
    const server = new URL(
      environment.REGISTRY_OIDC_ISSUER || environment.FORGEJO_SERVER_URL,
    );
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.origin !== server.origin ||
      endpoint.username ||
      endpoint.password
    )
      throw new Error(
        "The OIDC endpoint must belong to the configured Forgejo server.",
      );
    endpoint.searchParams.set("audience", environment.REGISTRY_OIDC_AUDIENCE);
    const response = await request(endpoint, {
      headers: {
        Authorization: `Bearer ${environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Forgejo OIDC token request failed (${response.status}).`,
      );
    const data = await response.json();
    if (typeof data.value !== "string" || !data.value.trim())
      throw new Error("Forgejo OIDC returned no ID token.");
    return data.value;
  }
  if (!environment.REGISTRY_PASSWORD)
    throw new Error(
      "Set REGISTRY_OIDC_AUDIENCE or REGISTRY_PASSWORD (a package-write token).",
    );
  return environment.REGISTRY_PASSWORD;
}

async function main(mode) {
  if (
    ![
      "validate",
      "publish",
      "candidate",
      "validate-main",
      "publish-main",
      "candidate-main",
    ].includes(mode)
  )
    throw new Error(
      "Expected validate, candidate or publish (optionally suffixed -main).",
    );
  const { image } = registryImage(
    process.env.RELEASE_IMAGE,
    process.env.FORGEJO_SERVER_URL,
    process.env.FORGEJO_REPOSITORY,
  );
  let { registry, target } = mode.endsWith("-main")
    ? mainTarget(image, process.env.FORGEJO_EVENT_NAME, process.env.FORGEJO_REF)
    : releaseTarget(process.env.RELEASE_TAG || "", image);
  if (mode === "validate" && process.env.REQUIRE_REGISTRY_CREDENTIALS !== "1") {
    console.log(`Registry target: ${target}`);
    return;
  }
  const validating = mode.startsWith("validate");
  const source = validating ? undefined : await testedImage();
  if (mode.startsWith("candidate")) {
    target = candidateTarget(image, source.revision).target;
    console.log(`Publishing untested candidate: ${target}`);
  }
  const username = process.env.REGISTRY_USER;
  if (!username) throw new Error("Set REGISTRY_USER to the package owner.");
  const password = await registryPassword();
  const config = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const directory = await config.mkdtemp(
    `${tmpdir()}/zz-test-forgejo-ui-registry-`,
  );
  const env = { ...process.env, DOCKER_CONFIG: directory };
  try {
    run(["login", registry, "--username", username, "--password-stdin"], {
      env,
      input: password,
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (validating) {
      console.log(`Registry authentication verified for ${target}`);
      return;
    }
    run(["tag", source.id, target], { env });
    run(["push", target], { env });
    run(["image", "inspect", "--format", "{{json .RepoDigests}}", target], {
      env,
    });
    console.log(`Published ${target}`);
  } finally {
    await config.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv[2]);
