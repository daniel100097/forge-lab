import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const directory = process.env.FORGEJO_TEST_FIXTURES;
assert.ok(
  directory,
  "Set FORGEJO_TEST_FIXTURES to a disposable fixture directory",
);
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3000";
function client() {
  const cookies = new Map();
  return async (path, fields) => {
    const res = await fetch(base + path, {
      redirect: "manual",
      method: fields ? "POST" : "GET",
      headers: {
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(fields
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              Origin: base,
            }
          : {}),
      },
      body: fields ? new URLSearchParams(fields) : undefined,
    });
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return res;
  };
}
for (const [key, repo, description, privateRepo] of [
  [
    "user",
    "zz-test-atlas",
    "A thoughtful home for our next big idea. Design, build, and ship together.",
    false,
  ],
  ["other", "zz-test-private-fixture", "Private permission test", true],
]) {
  const request = client();
  const user = credentials[key];
  await request("/user/login");
  const login = await request("/user/login", {
    user_name: user.username,
    password: user.password,
  });
  assert.equal(login.status, 303, `login ${login.status}`);
  const who = await (await request("/-/ui/data/bootstrap")).json();
  let existing = await request(`/-/ui/data/repos/${user.username}/${repo}`);
  if (existing.status !== 200) {
    const created = await request("/repo/create", {
      uid: String(who.user.id),
      repo_name: repo,
      description,
      auto_init: "on",
      default_branch: "zz-test-main",
      readme: "Default",
      ...(privateRepo ? { private: "on" } : {}),
    });
    assert.ok(
      [302, 303].includes(created.status),
      `create repo ${created.status}`,
    );
    console.log("Created", `${user.username}/${repo}`);
  }
  if (!privateRepo) {
    const path = `/${user.username}/${repo}`;
    let boards = await (
      await request(`/-/ui/data/repos${path}/projects`)
    ).json();
    if (!boards.items.length) {
      const created = await request(`${path}/projects/new`, {
        title: "zz-test-Product roadmap",
        content: "A shared plan from first idea to release.",
        template_type: "1",
        card_type: "0",
      });
      assert.ok(
        [302, 303].includes(created.status),
        `create board ${created.status}`,
      );
      boards = await (await request(`/-/ui/data/repos${path}/projects`)).json();
    }
    const board = boards.items[0];
    const issues = await (
      await request(`/-/ui/data/repos${path}/issues`)
    ).json();
    if (!issues.items.length) {
      for (const title of [
        "zz-test-Polish the project overview",
        "zz-test-Bring keyboard navigation to boards",
        "zz-test-Review the first release",
      ]) {
        const created = await request(`${path}/issues/new`, {
          title,
          content:
            "Created through the normal Forgejo browser endpoint for integration verification.",
          project_id: String(board.id),
        });
        assert.equal(created.status, 200);
        const data = await created.json();
        assert.ok(data.redirect, JSON.stringify(data));
      }
    }
    // Real Git changes exercise history, diff, merge and native pipeline reads.
    const checkout = `${directory}/checkout`;
    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0:
        "Authorization: Basic " +
        Buffer.from(`${user.username}:${user.password}`).toString("base64"),
    };
    const git = (...args) => exec("git", args, { env: gitEnv });
    await git("clone", `${base}${path}.git`, checkout);
    await git("-C", checkout, "config", "user.name", "UI Test");
    await git(
      "-C",
      checkout,
      "config",
      "user.email",
      "zz-test-studio@example.test",
    );
    await mkdir(`${checkout}/.forgejo/workflows`, { recursive: true });
    await writeFile(
      `${checkout}/README.md`,
      "# Atlas\n\nA **shared workspace** for the team.\n\n## Getting started\n\n- Browse files\n- Review merge requests\n\n```sh\ngit clone example\n```\n",
    );
    await writeFile(
      `${checkout}/.forgejo/workflows/check.yml`,
      "name: Checks\non: [push]\njobs:\n  check:\n    runs-on: docker\n    steps:\n      - run: echo 'Browser test fixture'\n",
    );
    await git("-C", checkout, "add", ".");
    await git(
      "-C",
      checkout,
      "commit",
      "-m",
      "Document the workspace and add checks",
    );
    await git("-C", checkout, "push", "origin", "zz-test-main");
    await git("-C", checkout, "checkout", "-b", "zz-test-feature-overview");
    await writeFile(
      `${checkout}/overview.md`,
      "# Project overview\n\nA change to review and merge.\n",
    );
    await git("-C", checkout, "add", ".");
    await git("-C", checkout, "commit", "-m", "zz-test-Add project overview");
    await git("-C", checkout, "push", "origin", "zz-test-feature-overview");
    const pullResponse = await request(
      `${path}/compare/zz-test-main...zz-test-feature-overview`,
      {
        title: "zz-test-Add project overview",
        content: "## Summary\n\nAdds the **project overview**.",
      },
    );
    const pullResult = await pullResponse.json();
    assert.ok(pullResult.redirect, JSON.stringify(pullResult));
    const pullIndex = Number(
      pullResult.redirect.match(/(?:pulls|issues)\/(\d+)/)[1],
    );
    await writeFile(
      `${directory}/fixtures.json`,
      JSON.stringify({
        repository: `${user.username}/${repo}`,
        denied: "zz-test-private-owner/zz-test-private-fixture",
        board: board.id,
        pull: pullIndex,
      }),
    );
    console.log("Board and issues ready", board.id);
  } else {
    const comment = await request(
      "/zz-test-studio/zz-test-atlas/issues/1/comments",
      {
        content: "A teammate has reviewed the workspace plan.",
      },
    );
    assert.ok([200, 302, 303].includes(comment.status));
  }
}
