// Isolated native fixtures with enough issues to verify server search and paging.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const directory = process.env.FORGEJO_TEST_FIXTURES;
assert.ok(directory?.includes("forgejo-ui-test-"), "Use disposable fixtures");
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100",
  { user } = JSON.parse(
    await readFile(`${directory}/credentials.json`, "utf8"),
  );
const cookies = new Map();
async function native(path, fields) {
  const response = await fetch(base + path, {
    redirect: "manual",
    method: fields ? "POST" : "GET",
    headers: {
      "X-Forgejo-UI": "1",
      Accept: "application/json",
      Origin: base,
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  for (const c of response.headers.getSetCookie()) {
    const pair = c.split(";")[0],
      at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  assert.ok(response.ok, `${path} returned ${response.status}`);
  const data = await response.json();
  assert.ok(
    !data.error && !data.errorMessage,
    `Native request failed: ${path}`,
  );
  return data;
}
await native("/user/login", {
  user_name: user.username,
  password: user.password,
});
const who = await native("/-/ui/data/bootstrap");
const name = `zz-test-issue-list-browser-${Date.now()}`,
  repository = `${user.username}/${name}`,
  root = `/${repository}`;
await native("/repo/create", {
  uid: String(who.user.id),
  repo_name: name,
  auto_init: "on",
  default_branch: "zz-test-main",
  readme: "Default",
});
for (const [title, color] of [
  ["zz-test-ready", "#108548"],
  ["zz-test-blocked", "#c91c00"],
])
  await native(`${root}/labels/new`, { title, color });
await native(`${root}/milestones/new`, {
  title: "zz-test-List verification milestone",
  content: "Disposable milestone",
  deadline: "2027-01-15",
});
await native(`${root}/projects/new`, {
  title: "zz-test-List verification board",
  board_type: "1",
  card_type: "0",
});
const titles = [
  "zz-test-Oldest offpage needle",
  ...Array.from(
    { length: 32 },
    (_, i) => `zz-test-Page filler ${String(i + 1).padStart(2, "0")}`,
  ),
  "zz-test-Bulk alpha",
  "zz-test-Bulk beta",
];
const issues = [];
for (const title of titles) {
  const data = await native(`${root}/issues/new`, {
    title,
    content:
      title === "zz-test-Oldest offpage needle"
        ? "Unique body phrase cobalt porcupine"
        : "Native issue-list verification fixture",
  });
  issues.push({
    title,
    number: Number(data.redirect.match(/issues\/(\d+)/)[1]),
  });
}
// Fixture readiness includes Forgejo's asynchronous issue search index.
const deadline = Date.now() + 30000;
while ((await native(`${root}/issues?q=cobalt+porcupine`)).total !== 1) {
  assert.ok(
    Date.now() < deadline,
    "Issue search index did not become zz-test-ready",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
}
const pullStates = {};
for (const state of ["merged", "closed"]) {
  const branch = `zz-test-list-${state}`;
  const editor = await native(`${root}/_new/zz-test-main/`);
  await native(`${root}/_new/zz-test-main/`, {
    tree_path: `${state}.txt`,
    content: `Native ${state} fixture\n`,
    last_commit: editor.last_commit || "",
    commit_summary: `Add ${state} fixture`,
    commit_choice: "commit-to-new-branch",
    new_branch_name: branch,
    commit_mail_id: String(editor.commit_mails[0].id),
  });
  const pull = await native(`${root}/compare/zz-test-main...${branch}`, {
    title: `zz-test-List ${state} request`,
    content: "Independent list-state fixture",
  });
  const index = Number(pull.redirect.match(/pulls\/(\d+)/)[1]);
  pullStates[state] = index;
  if (state === "merged") {
    const until = Date.now() + 30000;
    let review;
    do {
      review = await native(
        `/-/ui/data/repos/${repository}/pulls/${index}/review`,
      );
      assert.ok(Date.now() < until, "Merge check did not finish");
      if (review.checking) await new Promise((r) => setTimeout(r, 200));
    } while (review.checking);
    await native(`${root}/pulls/${index}/merge`, {
      do: "merge",
      head_commit_id: review.head_sha,
      merge_title_field: "Merged list fixture",
    });
  } else
    await native(`${root}/pulls/${index}/comments`, {
      content: "",
      status: "close",
    });
}
await writeFile(
  `${directory}/issue-list-fixtures.json`,
  JSON.stringify({ repository, issues, pullStates }, null, 2),
);
console.log(
  `Created ${repository} with ${issues.length} issues and filter metadata.`,
);
