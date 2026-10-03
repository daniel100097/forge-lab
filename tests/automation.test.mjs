import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { ciEnvironment } from "../scripts/ci-image.mjs";
import {
  candidateTarget,
  mainTarget,
  registryImage,
  registryPassword,
  releaseTarget,
} from "../scripts/release-image.mjs";
import { localLinks } from "../scripts/check-docs.mjs";
import { testGo } from "../scripts/test-go.mjs";
import { goImage } from "../scripts/test-images.mjs";
import { collectImages, testCi } from "../scripts/ci-tests.mjs";

test("OIDC obtains fresh registry credentials using the configured audience", async () => {
  const environment = {
    FORGEJO_SERVER_URL: "https://git.example.test/",
    REGISTRY_OIDC_AUDIENCE: "zz-test-audience",
    ACTIONS_ID_TOKEN_REQUEST_URL:
      "https://git.example.test/api/actions/idtoken?placeholder=true",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "zz-test-request-token",
    REGISTRY_PASSWORD: "zz-test-unused-password",
  };
  let requests = 0;
  const request = async (endpoint, options) => {
    requests += 1;
    assert.equal(endpoint.searchParams.get("audience"), "zz-test-audience");
    assert.equal(endpoint.searchParams.get("placeholder"), "true");
    assert.equal(options.headers.Authorization, "Bearer zz-test-request-token");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true,
      json: async () => ({ value: `zz-test-jwt-${requests}` }),
    };
  };
  assert.equal(await registryPassword(environment, request), "zz-test-jwt-1");
  assert.equal(await registryPassword(environment, request), "zz-test-jwt-2");
  assert.equal(
    await registryPassword({ REGISTRY_PASSWORD: "zz-test-password" }, () => {
      throw new Error("unexpected request");
    }),
    "zz-test-password",
  );
  for (const endpoint of [
    "https://other.example.test/idtoken",
    "file:///tmp/idtoken",
    "https://user:secret@git.example.test/idtoken",
  ])
    await assert.rejects(
      registryPassword(
        { ...environment, ACTIONS_ID_TOKEN_REQUEST_URL: endpoint },
        request,
      ),
      /configured Forgejo server/,
    );
  assert.equal(requests, 2);
  assert.equal(
    await registryPassword(
      {
        ...environment,
        FORGEJO_SERVER_URL: "http://192.0.2.1:3000/",
        REGISTRY_OIDC_ISSUER: "https://git.example.test/",
      },
      request,
    ),
    "zz-test-jwt-3",
  );
  await assert.rejects(
    registryPassword(
      { ...environment, REGISTRY_OIDC_ISSUER: "https://other.example.test/" },
      request,
    ),
    /configured Forgejo server/,
  );
  await assert.rejects(
    registryPassword(
      { ...environment, ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
      request,
    ),
    /enable-openid-connect/,
  );
  await assert.rejects(
    registryPassword(environment, async () => ({ ok: false, status: 403 })),
    /failed \(403\)/,
  );
  await assert.rejects(
    registryPassword(environment, async () => ({
      ok: true,
      json: async () => ({ value: "" }),
    })),
    /no ID token/,
  );
});

test("CI tests use a daemon-local workspace and clean up after failures", async () => {
  for (const failure of [
    undefined,
    "create",
    "cp",
    "test:docker",
    "collect-images",
    "copy-results",
  ]) {
    const calls = [];
    let container;
    const workspace = "/var/lib/docker/volumes/zz-test-ci-workspace/_data";
    const execute = async (command, args) => {
      assert.equal(command, "docker");
      calls.push(args);
      if (args[0] === "volume" && args[1] === "create") container = args.at(-1);
      if (failure && (args[0] === failure || args.at(-1) === failure))
        throw new Error(`zz-test-${failure}`);
      if (
        failure === "copy-results" &&
        args[0] === "cp" &&
        args[1].endsWith("/.ci-results/.")
      )
        throw new Error("zz-test-copy-results");
    };
    const capture = (command, args) => {
      if (command === "which") return "/zz-test-job/bin/docker";
      if (args[0] === "info")
        return JSON.stringify([
          { Name: "compose", Path: "/zz-test-job/bin/docker-compose" },
        ]);
      return workspace;
    };
    try {
      if (failure)
        await assert.rejects(
          testCi(execute, capture),
          new RegExp(`zz-test-${failure}`),
        );
      else await testCi(execute, capture);
      const create = calls.find((args) => args[0] === "create");
      assert.ok(create.includes("--network=host"));
      assert.ok(
        create.includes(`type=volume,source=${container},target=${workspace}`),
      );
      assert.ok(!create.some((arg) => arg.includes(process.cwd())));
      assert.ok(!create.some((arg) => arg.includes("/zz-test-job")));
      assert.deepEqual(calls.at(-1), ["volume", "rm", container]);
      if (failure !== "create")
        assert.deepEqual(calls.at(-2), [
          "rm",
          "--force",
          "--volumes",
          container,
        ]);
      if (!failure) {
        for (const tool of ["docker", "docker-compose"])
          assert.ok(
            calls.some(
              (args) =>
                args[0] === "cp" && args.includes(`/zz-test-job/bin/${tool}`),
            ),
          );
        assert.ok(calls.some((args) => args.at(-1) === "test:docker"));
        assert.ok(calls.some((args) => args.at(-1) === "collect-images"));
        assert.ok(
          calls.some(
            (args) => args[0] === "cp" && args[1].endsWith("/.ci-results/."),
          ),
        );
      }
    } finally {
      if (container)
        await rm(resolve("playwright-results", container), {
          recursive: true,
          force: true,
        });
    }
  }
});

test("CI image collection excludes traces, credentials and symlinks", async () => {
  await mkdir(".forgejo", { recursive: true });
  const directory = await mkdtemp(resolve(".forgejo/zz-test-ci-images-"));
  try {
    const source = `${directory}/source`;
    const target = `${directory}/result`;
    await mkdir(`${source}/nested`, { recursive: true });
    await writeFile(`${source}/nested/failure.png`, "zz-test-image");
    await writeFile(`${source}/trace.zip`, "zz-test-private");
    await writeFile(`${source}/credentials.json`, "zz-test-private");
    await symlink(`${source}/credentials.json`, `${source}/linked.png`);
    await collectImages(source, target);
    assert.equal(
      await readFile(`${target}/nested/failure.png`, "utf8"),
      "zz-test-image",
    );
    for (const file of ["trace.zip", "credentials.json", "linked.png"])
      assert.equal(existsSync(`${target}/${file}`), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Go checks copy checkout files without daemon-side bind mounts", async () => {
  const calls = [];
  await testGo(async (command, args) => calls.push({ command, args }));
  const container = calls[0].args[2];
  assert.match(container, /^zz-test-go-[a-f0-9-]+$/);
  assert.deepEqual(calls, [
    {
      command: "docker",
      args: [
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
      ],
    },
    {
      command: "docker",
      args: [
        "cp",
        resolve("integration/forgejo/overlay/modules/spaui"),
        `${container}:/tmp/`,
      ],
    },
    { command: "docker", args: ["start", "--attach", container] },
    { command: "docker", args: ["rm", "--force", "--volumes", container] },
  ]);
  const dockerfile = await readFile("Dockerfile", "utf8");
  assert.ok(dockerfile.includes(`FROM ${goImage} AS build`));
});

test("Go checks propagate failures and clean up only their own container", async () => {
  for (const failure of ["create", "cp", "start", "rm"]) {
    const calls = [];
    await assert.rejects(
      testGo(async (command, args) => {
        calls.push(args);
        if (args[0] === failure) throw new Error(`zz-test-${failure}`);
      }),
      new RegExp(`zz-test-${failure}`),
    );
    assert.deepEqual(
      calls.map((args) => args[0]),
      failure === "create"
        ? ["create"]
        : failure === "cp"
          ? ["create", "cp", "rm"]
          : ["create", "cp", "start", "rm"],
    );
    if (failure !== "create")
      assert.deepEqual(calls.at(-1), [
        "rm",
        "--force",
        "--volumes",
        calls[0][2],
      ]);
  }
});

async function imageFixture(check) {
  await mkdir(".forgejo", { recursive: true });
  const directory = await mkdtemp(resolve(".forgejo/zz-test-ci-automation-"));
  const id = `sha256:${"a".repeat(64)}`;
  const revision = "b".repeat(40);
  try {
    for (const folder of ["scripts", "bin", ".forgejo"])
      await mkdir(`${directory}/${folder}`);
    for (const script of ["lib.mjs", "ci-image.mjs", "release-image.mjs"])
      await cp(`scripts/${script}`, `${directory}/scripts/${script}`);
    await writeFile(
      `${directory}/.forgejo/ci-image.json`,
      JSON.stringify({ image: "forgejo-ui:zz-test", id, revision }),
    );
    const stub = `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ZZ_TEST_CALLS, JSON.stringify({ tool: process.argv[1].split('/').at(-1), args, config: process.env.DOCKER_CONFIG }) + '\\n');
if (process.argv[1].endsWith('/git')) console.log(process.env.ZZ_TEST_REVISION);
else if (args[0] === 'compose') console.log('forgejo-ui:zz-test');
else if (args[0] === 'image' && args.includes('{{.Id}}')) console.log(process.env.ZZ_TEST_IMAGE_ID);
else if (args[0] === 'login') {
  if (fs.readFileSync(0, 'utf8') !== 'zz-test-password') process.exit(9);
} else if (args[0] === 'push' && process.env.ZZ_TEST_FAIL_PUSH === '1') process.exit(7);
`;
    for (const command of ["docker", "git"])
      await writeFile(`${directory}/bin/${command}`, stub, { mode: 0o700 });
    const execute = (script, mode, overrides = {}) =>
      spawnSync(
        process.execPath,
        [`${directory}/scripts/${script}.mjs`, mode],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${directory}/bin:${process.env.PATH}`,
            ZZ_TEST_CALLS: `${directory}/calls.jsonl`,
            ZZ_TEST_IMAGE_ID: id,
            ZZ_TEST_REVISION: revision,
            RELEASE_TAG: "v1.0.0",
            RELEASE_IMAGE: "registry.example.test/zz-test-owner/zz-test-image",
            REGISTRY_USER: "zz-test-publisher",
            REGISTRY_PASSWORD: "zz-test-password",
            REGISTRY_OIDC_AUDIENCE: "",
            ...overrides,
          },
        },
      );
    await check({
      execute,
      id,
      calls: async () =>
        (await readFile(`${directory}/calls.jsonl`, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("image verification rejects replacement images and checkout revisions", async () => {
  await imageFixture(async ({ execute }) => {
    const valid = execute("ci-image", "verify");
    assert.equal(valid.status, 0, valid.stderr);
    const changedImage = execute("ci-image", "verify", {
      ZZ_TEST_IMAGE_ID: `sha256:${"c".repeat(64)}`,
    });
    assert.equal(changedImage.status, 1);
    assert.match(changedImage.stderr, /local image changed/);
    const changedSource = execute("ci-image", "verify", {
      ZZ_TEST_REVISION: "d".repeat(40),
    });
    assert.equal(changedSource.status, 1);
    assert.match(changedSource.stderr, /checkout changed/);
  });
});

test("publication refuses a replaced image before authenticating", async () => {
  await imageFixture(async ({ execute, calls }) => {
    const result = execute("release-image", "publish", {
      ZZ_TEST_IMAGE_ID: `sha256:${"c".repeat(64)}`,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /local image changed/);
    assert.ok(!(await calls()).some((call) => call.args[0] === "login"));
  });
});

test("publication tags the exact ID and removes credentials after success or push failure", async () => {
  for (const mode of ["publish", "candidate", "publish-main", "candidate-main"])
    for (const failure of ["0", "1"])
      await imageFixture(async ({ execute, calls, id }) => {
        const result = execute("release-image", mode, {
          ZZ_TEST_FAIL_PUSH: failure,
          FORGEJO_EVENT_NAME: "push",
          FORGEJO_REF: "refs/heads/main",
        });
        assert.equal(result.status, Number(failure), result.stderr);
        const commands = await calls();
        assert.deepEqual(commands.find((call) => call.args[0] === "tag").args, [
          "tag",
          id,
          `registry.example.test/zz-test-owner/zz-test-image:${mode.startsWith("candidate") ? `sha-${"b".repeat(40)}` : mode === "publish-main" ? "main" : "v1.0.0"}`,
        ]);
        const login = commands.find((call) => call.args[0] === "login");
        assert.ok(login.args.includes("--password-stdin"));
        assert.ok(!JSON.stringify(commands).includes("zz-test-password"));
        assert.equal(existsSync(login.config), false);
      });
});

test("registry defaults to the Forgejo instance and uses safe publication tags", () => {
  const image = "git.example.test/alice/forgejo-ui";
  assert.deepEqual(
    registryImage("", "https://git.example.test/", "Alice/Forgejo-UI"),
    {
      registry: "git.example.test",
      image,
    },
  );
  assert.equal(
    registryImage("", "https://git.example.test:8443/forgejo/", "team/ui")
      .image,
    "git.example.test:8443/team/ui",
  );
  assert.equal(
    registryImage("localhost:5000/zz-test-team/zz-test-ui").registry,
    "localhost:5000",
  );
  for (const server of [
    "file:///tmp/zz-test",
    "https://user:password@git.example.test/",
  ])
    assert.throws(() => registryImage("", server, "team/ui"));
  for (const repository of [
    "",
    "team",
    "team/ui/extra",
    "team/../ui",
    "team/ui:tag",
  ])
    assert.throws(() =>
      registryImage("", "https://git.example.test/", repository),
    );
  for (const event of ["push", "workflow_dispatch"])
    assert.equal(
      mainTarget(image, event, "refs/heads/main").target,
      `${image}:main`,
    );
  for (const [event, ref] of [
    ["pull_request", "refs/heads/main"],
    ["push", "refs/heads/feature"],
    ["workflow_dispatch", "refs/tags/v1.0.0"],
    [undefined, undefined],
  ])
    assert.throws(
      () => mainTarget(image, event, ref),
      /requires a push\/manual run/,
    );
  assert.equal(
    candidateTarget(image, "a".repeat(40)).target,
    `${image}:sha-${"a".repeat(40)}`,
  );
  for (const revision of ["", "main", "abc123", "x".repeat(40), undefined])
    assert.throws(() => candidateTarget(image, revision), /full commit SHA/);
});

test("registry preflight rejects missing credentials and unsafe main publication", async () => {
  await imageFixture(async ({ execute }) => {
    for (const mode of ["validate-main", "candidate-main", "publish-main"]) {
      const untrusted = execute("release-image", mode, {
        FORGEJO_EVENT_NAME: "pull_request",
        FORGEJO_REF: "refs/heads/main",
      });
      assert.equal(untrusted.status, 1);
      assert.match(untrusted.stderr, /requires a push\/manual run/);
    }
    for (const mode of ["validate-main", "validate"]) {
      const missing = execute("release-image", mode, {
        FORGEJO_EVENT_NAME: "push",
        FORGEJO_REF: "refs/heads/main",
        REGISTRY_PASSWORD: "",
        REQUIRE_REGISTRY_CREDENTIALS: "1",
      });
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /package-write token/);
    }
    const defaults = execute("release-image", "validate-main", {
      RELEASE_IMAGE: "",
      FORGEJO_SERVER_URL: "https://git.example.test/",
      FORGEJO_REPOSITORY: "team/ui",
      FORGEJO_EVENT_NAME: "push",
      FORGEJO_REF: "refs/heads/main",
    });
    assert.equal(defaults.status, 0, defaults.stderr);
    assert.match(defaults.stdout, /git.example.test\/team\/ui:main/);
  });
});

test("CI cleanup cannot select the demo or arbitrary Compose projects", () => {
  for (const project of [
    undefined,
    "",
    "forgejo-ui",
    "zz-test-forgejo-ui-ci-",
    "../demo",
    "zz-test-forgejo-ui-ci-2;touch",
  ])
    assert.throws(() => ciEnvironment(project), /CI_IMAGE_PROJECT/);
  assert.deepEqual(
    ciEnvironment("zz-test-forgejo-ui-ci-123-2", {
      COMPOSE_PROJECT_NAME: "demo",
      COMPOSE_FILE: "production.yaml",
    }),
    {
      COMPOSE_PROJECT_NAME: "zz-test-forgejo-ui-ci-123-2",
      COMPOSE_FILE: "compose.yaml:tests/compose.ci.yaml",
    },
  );
});

test("release tags are explicit Docker-compatible semantic versions", () => {
  for (const tag of ["v0.1.0", "v16.0.5", "v1.2.3-rc.1", "v1.2.3-alpha-beta"])
    assert.equal(
      releaseTarget(tag, "registry.example.test/team/forgejo-ui").target,
      `registry.example.test/team/forgejo-ui:${tag}`,
    );
  for (const tag of [
    "main",
    "latest",
    "v01.2.3",
    "v1.2",
    "v1.2.3-",
    "v1.2.3-01",
    "v1.2.3-rc..1",
    "v1.2.3+metadata",
    `v1.2.3-${"x".repeat(130)}`,
  ])
    assert.throws(
      () => releaseTarget(tag, "registry.example.test/team/forgejo-ui"),
      /semantic version/,
    );
});

test("registry targets cannot silently resolve to Docker Hub or include tags/credentials", () => {
  for (const image of [
    "registry.example.test/team/forgejo-ui",
    "localhost:5000/zz-test-owner/zz-test-image",
    "forgejo.example.test/team/subgroup/ui",
  ])
    assert.equal(releaseTarget("v1.0.0", image).registry, image.split("/")[0]);
  for (const image of [
    "alice/forgejo-ui",
    "docker.io/image",
    "https://registry.example.test/team/ui",
    "user:secret@host/team/ui",
    "registry.example.test/team/ui:latest",
    "registry.example.test/team/ui@sha256:123",
    "registry.example.test/team/",
    "registry.example.test/team//ui",
    "registry.example.test/Team/ui",
    "localhost:70000/team/ui",
    "localhost:0/team/ui",
  ])
    assert.throws(
      () => releaseTarget("v1.0.0", image),
      /registry\/owner\/image/,
    );
});

test("documentation links ignore external destinations and code examples", () => {
  assert.deepEqual(
    localLinks(
      '[Guide](docs/guide.md#heading) [Space](a%20b.md "title") [External](https://example.test) [Heading](#title)\n```sh\n[Example](not-a-file)\n```',
    ),
    ["docs/guide.md", "a b.md"],
  );
});

test("workflows use ubuntu-latest; image builds use the lock helper and always clean up", async () => {
  const compatibility = parse(
    await readFile(".github/workflows/compatibility.yaml", "utf8"),
  );
  assert.equal(compatibility.jobs.patches["runs-on"], "ubuntu-latest");
  for (const file of ["ci", "release"]) {
    const workflow = parse(
      await readFile(`.github/workflows/${file}.yaml`, "utf8"),
    );
    const job = Object.values(workflow.jobs)[0];
    assert.equal(job["runs-on"], "ubuntu-latest");
    assert.match(job.env.CI_IMAGE_PROJECT, /^zz-test-forgejo-ui-ci-/);
    const commands = job.steps.map((step) => step.run || "").join("\n");
    assert.match(commands, /node scripts\/ci-image.mjs build/);
    assert.doesNotMatch(
      commands,
      /docker (?:compose build|build)|npm run test:advanced/,
    );
    assert.match(commands, /npm run check:automation/);
    assert.match(commands, /npm run check:docs/);
    assert.match(commands, /npm run test:go/);
    assert.doesNotMatch(commands, /docker run.*\$PWD/);
    const cleanup = job.steps.find(
      (step) => step.run === "node scripts/ci-image.mjs cleanup",
    );
    assert.equal(cleanup.if, "always()");
    assert.equal(job.steps[0].with["persist-credentials"], false);
    assert.ok(
      job.steps.findIndex((step) => step.run === "npm run test:ci") >
        job.steps.findIndex((step) =>
          step.run?.includes("node scripts/ci-image.mjs build"),
        ),
    );
  }
});

test("workflows build and publish candidates before tests, then promote tested registry tags", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yaml", "utf8"));
  assert.match(ci.jobs.verify.if, /head.repo.full_name == github.repository/);
  const release = parse(
    await readFile(".github/workflows/release.yaml", "utf8"),
  );
  assert.deepEqual(release.on.push.tags, ["v*"]);
  for (const [job, suffix] of [
    [ci.jobs.verify, "-main"],
    [release.jobs.release, ""],
  ]) {
    assert.equal(job.env.RELEASE_IMAGE, "${{ vars.RELEASE_IMAGE }}");
    assert.equal(job.env.FORGEJO_SERVER_URL, "https://ghcr.io");
    assert.equal(job.env.FORGEJO_REPOSITORY, "${{ github.repository }}");
    const steps = job.steps;
    const indexOf = (command) =>
      steps.findIndex((step) => step.run?.split("\n").includes(command));
    const build = indexOf("node scripts/ci-image.mjs build");
    const candidate = indexOf(
      `node scripts/release-image.mjs candidate${suffix}`,
    );
    const checks = indexOf("npm run check");
    const browser = indexOf("npm run test:ci");
    const publish = indexOf(`node scripts/release-image.mjs publish${suffix}`);
    assert.ok(
      build > 0 &&
        build < candidate &&
        candidate < checks &&
        checks < browser &&
        browser < publish,
    );
    assert.ok(build < indexOf("npm ci --no-audit --no-fund"));
    assert.equal(
      steps.filter((step) => step.run === "node scripts/ci-image.mjs build")
        .length,
      1,
    );
    const commands = steps.map((step) => step.run || "").join("\n");
    assert.doesNotMatch(commands, /npm run build:web|ci-image.mjs export/);
    for (const step of steps.filter((step) =>
      step.uses?.includes("upload-artifact"),
    )) {
      assert.equal(step.if, "failure()");
      assert.equal(step.with.path, "playwright-results/**/*.png");
    }
    for (const index of [candidate, publish]) {
      assert.equal(
        steps[index].env.REGISTRY_PASSWORD,
        "${{ secrets.GITHUB_TOKEN }}",
      );
      assert.equal(steps[index].env.REGISTRY_USER, "${{ github.actor }}");
      if (suffix)
        assert.equal(
          steps[index].if,
          "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'",
        );
      else assert.equal(steps[index].if, undefined);
    }
  }
});
