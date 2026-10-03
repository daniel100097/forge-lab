// Populate the local demo through Git and Forgejo's normal browser endpoints.
// Existing files, branches and discussions are retained; reruns skip seed items.
import { readFile, writeFile, mkdir, mkdtemp, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const base = (process.env.FORGEJO_DEMO_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const directory = resolve(".forgejo/demo");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const user = credentials.user;
const cookies = new Map();
async function request(path, fields) {
  const res = await fetch(base + path, {
    method: fields ? "POST" : "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "X-Forgejo-UI": "1",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(fields
        ? { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  for (const cookie of res.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      i = pair.indexOf("=");
    cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  const body =
    res.headers.get("content-type")?.includes("application/json") && text
      ? JSON.parse(text)
      : null;
  assert.ok(
    res.status < 400 && !body?.error && !body?.errorMessage,
    `${path}: ${res.status} ${body?.message || body?.errorMessage || body?.error || ""}`,
  );
  return body;
}
await request("/user/login");
await request("/user/login", {
  user_name: user.username,
  password: user.password,
});
const me = await request("/-/ui/data/bootstrap");
assert.equal(me.user.username, user.username);
await mkdir(directory, { recursive: true });
const checkoutRoot = await mkdtemp(`${directory}/seed-`);
const env = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.extraHeader",
  GIT_CONFIG_VALUE_0:
    "Authorization: Basic " +
    Buffer.from(`${user.username}:${user.password}`).toString("base64"),
};
const profiles = {
  atlas: {
    name: "Atlas",
    description: "Collaborative planning for teams that build together.",
    stack: "typescript",
    issues: [
      "Make project search accessible from the keyboard",
      "Add pagination to the activity feed",
      "Document backup and restore procedures",
      "Improve empty states for new workspaces",
      "Cache repository language statistics",
      "Verify responsive layouts on mobile",
    ],
  },
  "ui-kit": {
    name: "Orbit UI",
    description:
      "Accessible components, design tokens, and interaction patterns.",
    stack: "typescript",
    issues: [
      "Add focus rings to the split button",
      "Document dark mode color tokens",
      "Support reduced motion in dropdowns",
      "Add a compact density option for tables",
      "Review tooltip placement near viewport edges",
    ],
  },
  "docs-site": {
    name: "Atlas documentation",
    description:
      "Guides, architecture notes, and examples for the Atlas workspace.",
    stack: "markdown",
    issues: [
      "Write the first project tutorial",
      "Add examples for branch protection",
      "Improve navigation on small screens",
      "Document release publishing",
      "Review the self-hosting checklist",
    ],
  },
  sandbox: {
    name: "Team sandbox",
    description: "A private space for experiments and technical proposals.",
    stack: "python",
    issues: [
      "Prototype incremental search indexing",
      "Compare cache invalidation strategies",
      "Measure startup time with a large repository",
      "Document the experiment results",
    ],
  },
};
const report = [];
for (const [name, project] of Object.entries(profiles)) {
  const root = `/${user.username}/${name}`,
    data = `/-/ui/data/repos${root}`;
  const repository = await request(data);
  const branch = repository.default_branch || "main";
  const checkout = `${checkoutRoot}/${name}`;
  const git = (...args) => exec("git", ["-C", checkout, ...args], { env });
  await exec("git", ["clone", `${base}${root}.git`, checkout], { env });
  await git("config", "user.name", "Studio Demo");
  await git("config", "user.email", "studio@example.test");
  const files = {
    "docs/architecture.md": `# ${project.name} architecture\n\n## Overview\n\nThe application separates domain logic, storage, and presentation.\n\n## Request lifecycle\n\n1. Validate the current session.\n2. Load the requested project.\n3. Check permissions before reading or writing data.\n4. Return a bounded result with clear error states.\n\n## Design decisions\n\n- Keep state close to its owner.\n- Prefer explicit contracts between modules.\n- Preserve keyboard and screen-reader support.\n`,
    "docs/contributing.md": `# Contributing\n\nCreate a branch, keep changes focused, and open a merge request.\n\n## Review checklist\n\n- [ ] Describe the user-facing change\n- [ ] Include tests for behavior changes\n- [ ] Check light and dark themes\n- [ ] Verify keyboard navigation\n`,
    "docs/releasing.md":
      "# Release process\n\n1. Review the milestone and open regressions.\n2. Run the test suite.\n3. Tag the release with a semantic version.\n4. Publish release notes and deployment instructions.\n",
    ".editorconfig":
      "root = true\n\n[*]\ncharset = utf-8\nindent_style = space\nindent_size = 2\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n",
    ".forgejo/ISSUE_TEMPLATE/bug.md":
      '---\nname: Bug report\nabout: Report a reproducible problem\ntitle: ""\n---\n## What happened?\n\n## Steps to reproduce\n\n## Expected behavior\n',
    ".forgejo/PULL_REQUEST_TEMPLATE.md":
      "## Summary\n\n## Validation\n\n- [ ] Tests pass\n- [ ] Documentation is updated\n",
    "CONTRIBUTING.md":
      "# Contributing\n\nSee [the contributor guide](docs/contributing.md) for local development and review expectations.\n",
    "CHANGELOG.md":
      "# Changelog\n\n## 0.8.0\n\n- Introduce accessible project navigation.\n- Add repository activity and richer release notes.\n- Improve feedback during long-running operations.\n\n## 0.7.0\n\n- Establish the workspace foundations.\n",
  };
  if (project.stack === "typescript")
    Object.assign(files, {
      "src/index.ts":
        'export { createProject, archiveProject } from "./projects";\nexport type { Project, ProjectStatus } from "./types";\n',
      "src/types.ts":
        'export type ProjectStatus = "active" | "archived";\n\nexport interface Project {\n  id: string;\n  name: string;\n  description: string;\n  status: ProjectStatus;\n  createdAt: string;\n}\n',
      "src/projects.ts":
        'import type { Project } from "./types";\n\nexport function createProject(name: string, description = ""): Project {\n  if (!name.trim()) throw new Error("A project needs a name");\n  return { id: crypto.randomUUID(), name: name.trim(), description, status: "active", createdAt: new Date().toISOString() };\n}\n\nexport function archiveProject(project: Project): Project {\n  return { ...project, status: "archived" };\n}\n',
      "src/styles/tokens.css":
        ":root {\n  --color-surface: #ffffff;\n  --color-text: #18171d;\n  --color-accent: #1f75cb;\n  --space-unit: 4px;\n}\n\n@media (prefers-color-scheme: dark) {\n  :root { --color-surface: #18171d; --color-text: #ececef; }\n}\n",
      "tests/projects.test.ts":
        'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { createProject, archiveProject } from "../src/projects.ts";\n\ntest("a new project starts active", () => {\n  assert.equal(createProject("Atlas").status, "active");\n});\n\ntest("archiving retains project details", () => {\n  const project = createProject("Atlas", "Planning workspace");\n  assert.deepEqual(archiveProject(project), { ...project, status: "archived" });\n});\n',
      "package.json":
        JSON.stringify(
          {
            name: `@studio/${name}`,
            version: "0.8.0",
            private: true,
            type: "module",
            scripts: {
              test: "node --experimental-strip-types --test tests/*.test.ts",
            },
          },
          null,
          2,
        ) + "\n",
      "tsconfig.json":
        '{\n  "compilerOptions": { "target": "ES2022", "module": "ESNext", "strict": true, "noEmit": true },\n  "include": ["src", "tests"]\n}\n',
    });
  if (project.stack === "python")
    Object.assign(files, {
      "src/index.py":
        '"""A small search-index experiment."""\n\ndef tokenize(text: str) -> list[str]:\n    return sorted(set(text.casefold().split()))\n\ndef search(documents: dict[str, str], query: str) -> list[str]:\n    terms = set(tokenize(query))\n    return [key for key, value in documents.items() if terms <= set(tokenize(value))]\n',
      "tests/test_index.py":
        'from src.index import search\n\ndef test_search_is_case_insensitive():\n    assert search({"guide": "Project Guide"}, "project") == ["guide"]\n',
      "pyproject.toml":
        '[project]\nname = "studio-sandbox"\nversion = "0.8.0"\nrequires-python = ">=3.11"\n',
    });
  if (project.stack === "markdown")
    Object.assign(files, {
      "guides/getting-started.md":
        "# Your first project\n\nCreate a project, add a README, and invite your team.\n\n## Plan the work\n\nCapture ideas as issues and organize them in a board.\n\n## Ship a change\n\nCreate a branch, commit your changes, and open a merge request.\n",
      "guides/self-hosting.md":
        "# Self-hosting\n\nRun the application with Docker Compose. Keep data in a persistent volume and configure a public root URL.\n\n## Backups\n\nBack up the database, repositories, and configuration together. Test restoring before relying on the backup.\n",
      "site.config.json":
        '{ "title": "Atlas docs", "navigation": ["Getting started", "Architecture", "Contributing"] }\n',
    });
  let added = 0;
  for (const [file, content] of Object.entries(files)) {
    try {
      await access(`${checkout}/${file}`);
      continue;
    } catch {}
    await mkdir(dirname(`${checkout}/${file}`), { recursive: true });
    await writeFile(`${checkout}/${file}`, content);
    added++;
  }
  if (added) {
    for (const [folder, message, author] of [
      ["docs", "Document architecture and contributor workflow", "Sam Rivera"],
      ["src", "Add the project domain model and theme tokens", "Alex Chen"],
      ["tests", "Cover project behavior with focused tests", "Jamie Morgan"],
      [
        ".",
        "Prepare development configuration and release notes",
        "Studio Demo",
      ],
    ]) {
      try {
        await access(`${checkout}/${folder}`);
      } catch {
        continue;
      }
      await git("add", folder);
      const changed = (
        await git("diff", "--cached", "--name-only")
      ).stdout.trim();
      if (!changed) continue;
      await git(
        "commit",
        "--author",
        `${author} <studio@example.test>`,
        "-m",
        message,
      );
    }
    await git("push", "origin", branch);
  }
  const issues = await request(`${data}/issues?state=all`);
  const issueTitles = new Set(issues.items.map((i) => i.title));
  const boards = await request(`${data}/projects`);
  let board = boards.items[0];
  if (!board) {
    await request(`${root}/projects/new`, {
      title: "Team roadmap",
      content: "Priorities for the next iteration.",
      template_type: "1",
      card_type: "0",
    });
    board = (await request(`${data}/projects`)).items[0];
  }
  let issueCount = 0;
  for (const [index, title] of project.issues.entries()) {
    if (issueTitles.has(title)) continue;
    const result = await request(`${root}/issues/new`, {
      title,
      content: `## Context\n\n${project.description}\n\nThis sample issue gives the team a realistic workflow to explore.\n\n## Acceptance criteria\n\n- [ ] Implement the change\n- [ ] Verify keyboard and mobile behavior\n- [ ] Add a short note to the documentation\n\n<!-- forgejo-ui-demo:v1 -->`,
      ...(board ? { project_id: String(board.id) } : {}),
    });
    const issue = result.redirect?.match(/(?:issues|pulls)\/(\d+)/)?.[1];
    assert.ok(issue, "Issue creation must return its native redirect");
    await request(`${root}/issues/${issue}/comments`, {
      content:
        index % 2
          ? "I have added reproduction notes. Ready to pick up in the next iteration."
          : "The scope looks good. Please include an example and check the empty state.",
    });
    if (index === project.issues.length - 1)
      await request(`${root}/issues/${issue}/comments`, {
        content: "Verified the acceptance criteria. Closing this sample issue.",
        status: "close",
      });
    issueCount++;
  }
  const pulls = await request(`${data}/pulls?state=all`);
  for (const [slug, title, body] of [
    [
      "demo/accessibility",
      "Improve keyboard navigation and focus states",
      "Document the expected keyboard interactions and focus order.",
    ],
    [
      "demo/performance",
      "Explore caching for repeated project queries",
      "Capture the cache key, invalidation rules, and expected behavior.",
    ],
  ]) {
    const exists = (
      await git("ls-remote", "--heads", "origin", slug)
    ).stdout.trim();
    if (!exists) {
      await git("checkout", "-b", slug, branch);
      await mkdir(`${checkout}/proposals`, { recursive: true });
      await writeFile(
        `${checkout}/proposals/${slug.split("/")[1]}.md`,
        `# ${title}\n\n${body}\n\n## Validation\n\n- Add focused behavior tests.\n- Record the before and after results.\n`,
      );
      await git("add", "proposals");
      await git("commit", "-m", title);
      await git("push", "origin", slug);
      await git("checkout", branch);
    }
    if (!pulls.items.some((i) => i.title === title))
      await request(`${root}/compare/${branch}...${slug}`, {
        title,
        content: `## Summary\n\n${body}\n\n## Test plan\n\n- [ ] Review the proposal\n- [ ] Check the diff\n\n<!-- forgejo-ui-demo:v1 -->`,
      });
  }
  const releases = await request(`${root}/releases`);
  if (!releases.items.some((r) => r.tag_name === "demo-v0.8.0"))
    await request(`${root}/releases/new`, {
      tag_name: "demo-v0.8.0",
      tag_target: branch,
      title: `${project.name} 0.8.0`,
      content:
        "## Highlights\n\n- A richer project workspace with accessible navigation.\n- Architecture and contributor documentation.\n- Focused tests and a clear review workflow.\n\n## Upgrading\n\nReview the changelog before updating your deployment.",
    });
  const wiki = await request(`${root}/wiki`);
  const pageNames = (wiki.pages || []).map((p) =>
    typeof p === "string" ? p : p.Name || p.name || p.title,
  );
  for (const [title, content] of [
    [
      "Home",
      `# ${project.name} handbook\n\nWelcome to the team workspace.\n\n- [Architecture](Architecture)\n- [Team workflow](Team-workflow)\n\nUse issues to plan work and merge requests to review changes.\n`,
    ],
    [
      "Architecture",
      "## Components\n\nThe system separates presentation, domain logic, and persistence.\n\n## Decisions\n\nPrefer explicit interfaces, small changes, and automated checks.\n",
    ],
    [
      "Team workflow",
      "## Weekly rhythm\n\n- Monday: triage the issue board.\n- Wednesday: review open merge requests.\n- Friday: publish notes and prepare the next milestone.\n",
    ],
  ]) {
    if (
      pageNames.includes(title) ||
      pageNames.includes(title.replaceAll(" ", "-"))
    )
      continue;
    await request(`${root}/wiki`, {
      action: "_new",
      title,
      content,
      message: `Add ${title} handbook page`,
    });
  }
  report.push({
    repository: `${user.username}/${name}`,
    filesAdded: added,
    issuesAdded: issueCount,
  });
  console.log(
    `Populated ${user.username}/${name}: ${added} files, ${issueCount} issues, two review branches, release and handbook.`,
  );
}
await writeFile(
  `${directory}/seed-report.json`,
  JSON.stringify(
    { createdAt: new Date().toISOString(), repositories: report },
    null,
    2,
  ),
);
console.log("Demo content is ready. Existing repository data was preserved.");
