import assert from "node:assert/strict";
import { test } from "node:test";
import { checkNames } from "./fixture-test.mjs";

test("fixture guard accepts prefixed repository, branch and issue names", () => {
  assert.doesNotThrow(() =>
    checkNames("http://localhost:3100/repo/create", {
      repo_name: "zz-test-repository",
      default_branch: "zz-test-main",
    }),
  );
  assert.doesNotThrow(() =>
    checkNames(
      "http://localhost:3100/zz-test-owner/zz-test-repository/issues/new",
      { title: "zz-test-issue" },
    ),
  );
});

test("fixture guard rejects unprefixed mutations before sending them", () => {
  assert.throws(
    () =>
      checkNames("http://localhost:3100/repo/create", { repo_name: "demo" }),
    /Unsafe disposable fixture/,
  );
  assert.throws(
    () =>
      checkNames(
        "http://localhost:3100/zz-test-owner/zz-test-repository/issues/new",
        { title: "demo issue" },
      ),
    /Unsafe disposable fixture/,
  );
  assert.throws(
    () =>
      checkNames(
        "http://localhost:3100/zz-test-owner/zz-test-repository/_edit/zz-test-main/README.md",
        { new_branch_name: "feature" },
      ),
    /Unsafe disposable fixture/,
  );
});

test("fixture guard imports only disposable repositories", () => {
  assert.throws(
    () =>
      checkNames("http://localhost:3100/repo/migrate", {
        repo_name: "zz-test-import",
        clone_addr: "https://example.test/demo/repo.git",
      }),
    /Import only prefixed/,
  );
  assert.doesNotThrow(() =>
    checkNames("http://localhost:3100/repo/migrate", {
      repo_name: "zz-test-import",
      clone_addr: "http://127.0.0.1:3000/zz-test-owner/zz-test-repository.git",
    }),
  );
});

test("fixture guard protects board lists and teams and rejects stock label imports", () => {
  assert.throws(
    () =>
      checkNames(
        "http://localhost:3100/zz-test-owner/zz-test-repository/projects/1",
        { title: "Unprefixed column" },
      ),
    /Unsafe disposable fixture/,
  );
  assert.throws(
    () =>
      checkNames("http://localhost:3100/org/zz-test-org/teams/new", {
        team_name: "Unprefixed team",
      }),
    /Unsafe disposable fixture/,
  );
  assert.throws(
    () =>
      checkNames(
        "http://localhost:3100/zz-test-owner/zz-test-repository/labels/initialize",
        { template_name: "Default" },
      ),
    /Stock label templates/,
  );
});
