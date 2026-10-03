import { test } from "node:test";
import assert from "node:assert/strict";
const origin = process.env.FORGEJO_TEST_URL;
const username = process.env.FORGEJO_TEST_USER;
const password = process.env.FORGEJO_TEST_PASSWORD;
const repository = process.env.FORGEJO_TEST_REPO;
const denied = process.env.FORGEJO_TEST_DENIED_REPO;
const boardId = process.env.FORGEJO_TEST_BOARD;
const ready = !!(origin && username && password && repository && denied);

test(
  "integrated SPA uses native Forgejo sessions and preserves route boundaries",
  { skip: !ready },
  async (t) => {
    const base = origin.replace(/\/$/, "");
    const cookies = new Map();
    const get = async (path, options = {}) => {
      const result = await fetch(base + path, {
        redirect: "manual",
        ...options,
        headers: {
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...options.headers,
        },
      });
      for (const cookie of result.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const at = pair.indexOf("=");
        cookies.set(pair.slice(0, at), pair.slice(at + 1));
      }
      return result;
    };
    await t.test(
      "browser deep links return the SPA and missing data/assets do not",
      async () => {
        const response = await get("/-/ui/projects/example/repo");
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /<div id="root"><\/div>/);
        assert.match(html, /<base href="\/-\/ui\/"/);
        assert.doesNotMatch(html, /__FORGEJO_UI_BASE__/);
        const script = html.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1];
        assert.equal((await get("/-/ui/" + script)).status, 200);
        assert.equal((await get("/-/ui/assets/missing.js")).status, 404);
        assert.equal((await get("/-/ui/data")).status, 404);
        const missing = await get("/-/ui/data/missing");
        assert.equal(missing.status, 404);
        assert.match(missing.headers.get("content-type"), /application\/json/);
      },
    );
    await t.test(
      "native login enters the SPA while protocol routes remain native",
      async () => {
        const login = await get("/user/login");
        assert.equal(login.status, 303);
        assert.equal(login.headers.get("location"), "/-/ui/login");
        const version = await get("/api/v1/version");
        assert.equal(version.status, 200);
        assert.match(version.headers.get("content-type"), /application\/json/);
      },
    );
    await t.test("anonymous bootstrap has no user", async () => {
      const response = await get("/-/ui/data/bootstrap");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).user, null);
    });
    await t.test(
      "public repositories are readable without signing in",
      async () => {
        const response = await get("/-/ui/data/repos/" + repository);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).full_name, repository);
        assert.equal((await get("/-/ui/data/repos/" + denied)).status, 404);
      },
    );
    await t.test(
      "failed SPA sign-in returns safe structured errors and keeps origin protection",
      async () => {
        const options = {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Forgejo-UI": "1",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            user_name: username,
            password: "deliberately-incorrect-fixture-password",
          }),
        };
        const failure = await get("/user/login", options);
        assert.equal(failure.status, 422);
        const error = await failure.json();
        assert.equal(typeof error.errorMessage, "string");
        assert.equal(error.password, undefined);
        const hostile = await get("/user/login", {
          ...options,
          headers: {
            ...options.headers,
            Origin: "https://untrusted.example",
            "Sec-Fetch-Site": "cross-site",
          },
        });
        assert.equal(hostile.status, 403);
        assert.equal(
          (await (await get("/-/ui/data/bootstrap")).json()).user,
          null,
        );
      },
    );
    await t.test(
      "normal login authenticates SPA data without integration tokens",
      async () => {
        const login = await get("/user/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Forgejo-UI": "1",
            Accept: "application/json",
          },
          body: new URLSearchParams({ user_name: username, password }),
        });
        assert.equal(login.status, 200);
        assert.ok((await login.json()).redirect);
        const response = await get("/-/ui/data/bootstrap");
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const data = await response.json();
        assert.equal(data.contract, 1);
        assert.equal(data.user.username, username);
      },
    );
    await t.test(
      "repository and code data obey native permissions",
      async () => {
        const response = await get("/-/ui/data/repos/" + repository);
        assert.equal(response.status, 200);
        const metadata = await response.json();
        assert.equal(metadata.full_name, repository);
        assert.equal(typeof metadata.open_issues_count, "number");
        assert.equal(typeof metadata.open_pr_counter, "number");
        assert.equal(typeof metadata.clone.HTTPS, "string");
        for (const [route, target] of [
          ["", ""],
          ["/issues", "/issues"],
          ["/projects", "/boards"],
        ]) {
          const navigation = await get("/" + repository + route, {
            headers: { Accept: "text/html" },
          });
          assert.equal(navigation.status, 303);
          assert.equal(
            navigation.headers.get("location"),
            "/-/ui/projects/" + repository + target,
          );
        }
        assert.equal(
          (await get("/?native=1")).headers.get("location"),
          "/-/ui/",
        );
        assert.equal((await get("/-/ui/data/repos/" + denied)).status, 404);
        const tree = await get("/-/ui/data/repos/" + repository + "/tree");
        assert.equal(tree.status, 200);
        const entries = (await tree.json()).entries;
        assert.ok(Array.isArray(entries));
        const readme = entries.find((e) => e.name === "README.md");
        assert.ok(
          readme,
          "Use an initialized fixture repository with README.md",
        );
        const blob = await get(
          "/-/ui/data/repos/" + repository + "/tree?path=README.md",
        );
        assert.equal(blob.status, 200);
        assert.equal(typeof (await blob.json()).content, "string");
        assert.equal(
          (
            await get(
              "/-/ui/data/repos/" + repository + "/tree?path=..%2Fsecret",
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "project overview and reference lists expose real Git data with repository permissions",
      async () => {
        const prefix = `/-/ui/data/repos/${repository}`;
        const overviewResponse = await get(`${prefix}/overview`);
        assert.equal(overviewResponse.status, 200);
        assert.equal(overviewResponse.headers.get("cache-control"), "no-store");
        const overview = await overviewResponse.json();
        const branches = await (await get(`${prefix}/branches`)).json();
        const tags = await (await get(`${prefix}/tags`)).json();
        const commits = await (await get(`${prefix}/commits`)).json();
        assert.equal(overview.branch_count, branches.total);
        assert.equal(overview.tag_count, tags.total);
        assert.equal(overview.commit_count, commits.total);
        assert.ok(overview.branch_count >= 2);
        assert.ok(overview.commit_count >= 1);
        assert.ok(Number.isFinite(Date.parse(overview.created_at)));
        assert.ok(overview.size_bytes >= 0);
        assert.equal(typeof overview.avatar_url, "string");
        assert.equal(typeof overview.watching, "boolean");
        assert.ok(Array.isArray(overview.languages));
        for (const language of overview.languages) {
          assert.equal(typeof language.name, "string");
          assert.equal(typeof language.color, "string");
          assert.ok(language.percentage > 0 && language.percentage <= 100);
        }
        assert.equal(branches.items[0].default, true);
        assert.equal(branches.items[0].can_delete, false);
        assert.match(branches.items[0].commit.sha, /^[a-f0-9]{40,64}$/);
        const filtered = await (
          await get(`${prefix}/branches?q=zz-test-feature-overview`)
        ).json();
        assert.equal(filtered.total, 1);
        assert.equal(filtered.items[0].name, "zz-test-feature-overview");
        const empty = await (
          await get(`${prefix}/tags?q=missing-tag-for-ui-test`)
        ).json();
        assert.equal(empty.total, 0);
        assert.deepEqual(empty.items, []);
        for (const suffix of ["overview", "branches", "tags"]) {
          assert.equal(
            (await get(`/-/ui/data/repos/${denied}/${suffix}`)).status,
            404,
          );
        }
      },
    );
    await t.test(
      "browsing pages retain native reads and selected response fields",
      async () => {
        const nativeOptions = {
          headers: { "X-Forgejo-UI": "1", Accept: "application/json" },
        };
        for (const suffix of [
          "/graph",
          "/search/branch/zz-test-main?q=shared",
          "/blame/branch/zz-test-main/README.md",
        ]) {
          const response = await get(`/${repository}${suffix}`, nativeOptions);
          assert.equal(response.status, 200, suffix);
          const data = await response.json();
          assert.ok(Array.isArray(data.items), suffix);
          assert.ok(data.items.length > 0, suffix);
          assert.equal(
            (await get(`/${denied}${suffix}`, nativeOptions)).status,
            404,
            suffix,
          );
        }
        const blame = await (
          await get(
            `/${repository}/blame/branch/zz-test-main/README.md`,
            nativeOptions,
          )
        ).json();
        assert.match(
          blame.items.flatMap((item) => item.lines).join("\n"),
          /shared workspace/,
        );
        const activity = await (
          await get(`/-/ui/data/repos/${repository}/activity?period=weekly`)
        ).json();
        assert.ok(activity.commits >= 1);
        assert.ok(activity.opened_issues >= 1);
        for (const suffix of ["activity", "stars", "watchers", "forks"]) {
          const response = await get(
            `/-/ui/data/repos/${repository}/${suffix}`,
          );
          assert.equal(response.status, 200, suffix);
          assert.equal(
            (await get(`/-/ui/data/repos/${denied}/${suffix}`)).status,
            404,
            suffix,
          );
        }
        const history = await (
          await get(
            `/-/ui/data/repos/${repository}/commits?ref=zz-test-feature-overview&path=overview.md`,
          )
        ).json();
        assert.equal(history.total, 1);
        assert.equal(history.items[0].message, "zz-test-Add project overview");
      },
    );
    await t.test(
      "issue and merge-request lists return structured data",
      async () => {
        for (const kind of ["issues", "pulls"]) {
          const response = await get(`/-/ui/data/repos/${repository}/${kind}`);
          assert.equal(response.status, 200);
          const data = await response.json();
          assert.ok(Array.isArray(data.items));
          assert.equal(typeof data.total, "number");
          if (data.items.length) {
            const detail = await get(
              `/-/ui/data/repos/${repository}/${kind}/${data.items[0].number}`,
            );
            assert.equal(detail.status, 200);
            const discussion = await detail.json();
            assert.equal(discussion.issue.id, data.items[0].id);
            assert.ok(Array.isArray(discussion.comments));
          }
          assert.equal(
            (await get(`/-/ui/data/repos/${denied}/${kind}`)).status,
            404,
          );
        }
      },
    );
    await t.test(
      "new native page data preserves private access and exposes selected fields",
      async () => {
        const opts = {
          headers: { "X-Forgejo-UI": "1", Accept: "application/json" },
        };
        for (const suffix of ["/releases", "/wiki/", "/actions", "/settings"]) {
          const allowed = await get(`/${repository}${suffix}`, opts);
          assert.equal(allowed.status, 200, suffix);
          assert.equal(allowed.headers.get("cache-control"), "no-store");
          const data = await allowed.json();
          assert.equal(data.password, undefined);
          assert.equal(data.EventPayload, undefined);
          const forbidden = await get(`/${denied}${suffix}`, opts);
          assert.equal(forbidden.status, 404, suffix);
        }
        const profile = await (await get("/user/settings", opts)).json();
        assert.equal(profile.name, username);
        assert.equal(typeof profile.keep_email_private, "boolean");
        assert.equal(profile.email, undefined);
        assert.equal(profile.passwd, undefined);
        const history = await (
          await get(`/-/ui/data/repos/${repository}/commits`)
        ).json();
        assert.ok(history.items.length > 0);
        assert.equal(
          (await get(`/-/ui/data/repos/${denied}/commits`)).status,
          404,
        );
        const notifications = await (await get("/notifications", opts)).json();
        assert.ok(Array.isArray(notifications.items));
      },
    );
    await t.test(
      "native compare returns branch differences, empty state and private access denial",
      async () => {
        const opts = {
          headers: { "X-Forgejo-UI": "1", Accept: "application/json" },
        };
        const compared = await get(
          `/${repository}/compare/zz-test-main...zz-test-feature-overview`,
          opts,
        );
        assert.equal(compared.status, 200);
        assert.equal(compared.headers.get("cache-control"), "no-store");
        const data = await compared.json();
        assert.equal(data.nothing_to_compare, false);
        assert.equal(data.existing_pull.title, "zz-test-Add project overview");
        assert.ok(
          data.commits.some(
            (commit) => commit.message === "zz-test-Add project overview",
          ),
        );
        assert.equal(data.can_create, false);
        const empty = await (
          await get(`/${repository}/compare/zz-test-main...zz-test-main`, opts)
        ).json();
        assert.equal(empty.nothing_to_compare, true);
        assert.equal(empty.can_create, false);
        assert.equal(
          (await get(`/${denied}/compare/zz-test-main...zz-test-main`, opts))
            .status,
          404,
        );
      },
    );
    await t.test(
      "native board moves persist and reject foreign origins",
      { skip: !boardId },
      async () => {
        const dataPath = `/-/ui/data/repos/${repository}/projects/${boardId}`;
        const board = await (await get(dataPath)).json();
        assert.equal(board.can_write, true);
        const source = board.columns.find((c) => c.issues.length);
        const target = board.columns.find((c) => c.id !== source?.id);
        assert.ok(
          source && target,
          "Use a board with an issue and at least two columns",
        );
        const issue = source.issues[0];
        const move = (column, ids, extraHeaders = {}) =>
          get(`/${repository}/projects/${boardId}/${column}/move`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: new URL(base).origin,
              ...extraHeaders,
            },
            body: JSON.stringify({
              issues: ids.map((issueID, sorting) => ({ issueID, sorting })),
            }),
          });
        const ids = [...target.issues.map((i) => i.id), issue.id];
        assert.equal(
          (
            await move(target.id, ids, {
              Origin: "https://untrusted.example",
              "Sec-Fetch-Site": "cross-site",
            })
          ).status,
          403,
        );
        const result = await move(target.id, ids);
        assert.equal(result.status, 200);
        assert.equal((await result.json()).errorMessage, undefined);
        try {
          const updated = await (await get(dataPath)).json();
          assert.ok(
            updated.columns
              .find((c) => c.id === target.id)
              .issues.some((i) => i.id === issue.id),
          );
          assert.ok(
            !updated.columns
              .find((c) => c.id === source.id)
              .issues.some((i) => i.id === issue.id),
          );
        } finally {
          assert.equal(
            (
              await move(
                source.id,
                source.issues.map((i) => i.id),
              )
            ).status,
            200,
          );
        }
        assert.equal(
          (await get(`/-/ui/data/repos/${denied}/projects/${boardId}`)).status,
          404,
        );
      },
    );
    await t.test("SPA logout destroys the native session", async () => {
      const response = await get("/user/logout", {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      });
      assert.equal(response.status, 200);
      assert.ok((await response.json()).redirect);
      assert.equal(
        (await (await get("/-/ui/data/bootstrap")).json()).user,
        null,
      );
    });
  },
);
