import {
  test,
  expect as baseExpect,
  chooseAppearance,
} from "./fixture-test.mjs";
import { readFile } from "node:fs/promises";

const expect = baseExpect.configure({ timeout: 30000 });
const directory = process.env.FORGEJO_TEST_FIXTURES;
if (!directory) throw new Error("Use disposable FORGEJO_TEST_FIXTURES.");
const credentials = JSON.parse(
  await readFile(`${directory}/credentials.json`, "utf8"),
);
const base = process.env.FORGEJO_TEST_URL || "http://localhost:3100";
const variants = [
  ["light", 1280, "Light", "en-US"],
  ["dark", 1280, "Dark", "en-US"],
  ["mobile", 390, "Light", "en-US"],
  ["german", 1280, "Light", "de-DE"],
];

async function login(page, who = credentials.user) {
  await page.goto("/-/ui/login");
  await page.getByLabel("Username or email").fill(who.username);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

function apiFor(page, who = credentials.user) {
  return async (path, method = "GET", data) => {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${who.username}:${who.password}`).toString("base64")}`,
      },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.status() === 204 ? null : response.json();
  };
}

async function appearance(page, root, width, theme, language) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .context()
    .addCookies([{ name: "lang", value: "en-US", url: base }]);
  await page.request.get("/-/ui/data/bootstrap?lang=en-US");
  await page.goto(root);
  await chooseAppearance(page, theme);
  await page
    .context()
    .addCookies([{ name: "lang", value: language, url: base }]);
  await page.request.get(`/-/ui/data/bootstrap?lang=${language}`);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function visibleAnchor(page, id) {
  const target = page.locator(`#issuecomment-${id}`);
  await expect(target).toBeVisible();
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return box && box.y >= 45 && box.y < 900;
    })
    .toBe(true);
}

for (const kind of ["issues", "pulls"]) {
  test(`${kind} native and copied anchors resolve later pages without breaking pagination`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(300000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const api = apiFor(page);
    const name = `zz-test-anchor-${kind}-${Date.now()}`;
    const repo = `${credentials.user.username}/${name}`;
    await api("/user/repos", "POST", {
      name,
      auto_init: true,
      default_branch: "zz-test-main",
    });
    let visitor;
    try {
      if (kind === "pulls")
        await api(`/repos/${repo}/contents/zz-test-change.txt`, "POST", {
          content: Buffer.from("zz-test-review-line\n").toString("base64"),
          message: "zz-test-review-line",
          branch: "zz-test-main",
          new_branch: "zz-test-head",
        });
      const issue = await api(`/repos/${repo}/${kind}`, "POST", {
        title: "zz-test-anchor-pagination",
        body: "zz-test-anchor-description",
        ...(kind === "pulls"
          ? { base: "zz-test-main", head: "zz-test-head" }
          : {}),
      });
      const comments = [];
      for (let index = 0; index < 55; index++)
        comments.push(
          await api(`/repos/${repo}/issues/${issue.number}/comments`, "POST", {
            body: `zz-test-comment-${index + 1}`,
          }),
        );
      const last = comments.at(-1).id;
      const first = comments[0].id;
      const root = `/-/ui/projects/${repo}/${kind === "pulls" ? "merge-requests" : "issues"}/${issue.number}`;
      const dataRoot = `/-/ui/data/repos/${repo}/${kind}/${issue.number}`;
      await login(page);
      for (const [variant, width, theme, language] of variants) {
        await appearance(page, root, width, theme, language);
        await page.goto(
          `/${repo}/${kind}/${issue.number}#issuecomment-${last}`,
        );
        await expect(page).toHaveURL(
          new RegExp(`${root}#issuecomment-${last}$`),
        );
        await visibleAnchor(page, last);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme.toLowerCase(),
        );
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          language === "de-DE" ? "de" : "en",
        );
        const result = await (
          await page.request.get(`${dataRoot}?comment_id=${last}`)
        ).json();
        expect(result.page).toBe(2);
        expect(result.comments.some((comment) => comment.id === last)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-${variant}-anchor.png`),
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.reload();
        await visibleAnchor(page, last);
        await page
          .getByRole("button", {
            name: language === "de-DE" ? "Zurück" : "Previous",
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`${root}\\?page=1$`));
        await expect(page.locator(`#issuecomment-${first}`)).toBeVisible();
        await expect(page.locator(`#issuecomment-${last}`)).toHaveCount(0);
        await page
          .getByRole("button", {
            name: language === "de-DE" ? "Weiter" : "Next",
            exact: true,
          })
          .click();
        await expect(page.locator(`#issuecomment-${last}`)).toBeVisible();
        await page.evaluate((commentID) => {
          location.hash = `issuecomment-${commentID}`;
        }, first);
        await visibleAnchor(page, first);
        await page.goBack();
        await expect(page.locator(`#issuecomment-${last}`)).toBeVisible();
      }
      await appearance(page, root, 1280, "Light", "en-US");
      await page.goto(`${root}#issuecomment-${last}`);
      await visibleAnchor(page, last);
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              window.copiedCommentURL = text;
            },
          },
        }),
      );
      await page
        .locator(`#issuecomment-${last}`)
        .getByRole("button", { name: "Content actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Copy link", exact: true })
        .click();
      const copied = await page.evaluate(() => window.copiedCommentURL);
      expect(copied).toContain(
        `/${repo}/${kind}/${issue.number}#issuecomment-${last}`,
      );
      await page.goto(copied);
      await visibleAnchor(page, last);
      await page.goto(`${root}#issuecomment-999999999`);
      await expect(page.locator(`#issuecomment-${first}`)).toBeVisible();
      const invalid = await (
        await page.request.get(`${dataRoot}?page=999999&comment_id=999999999`)
      ).json();
      expect(invalid.page).toBe(2);
      await api(`/repos/${repo}/issues/comments/${last}`, "DELETE");
      await page.goto(`${root}#issuecomment-${last}`);
      await page.reload();
      await expect(page.locator(`#issuecomment-${first}`)).toBeVisible();
      await expect(page.locator(`#issuecomment-${last}`)).toHaveCount(0);
      visitor = await browser.newContext({ baseURL: base });
      const anonymous = await visitor.newPage();
      await anonymous.goto(`${root}#issuecomment-${comments[53].id}`);
      await visibleAnchor(anonymous, comments[53].id);
      if (kind === "pulls") {
        const otherAPI = apiFor(page, credentials.other);
        const review = await otherAPI(
          `/repos/${repo}/pulls/${issue.number}/reviews`,
          "POST",
          {
            event: "COMMENT",
            body: "zz-test-published-review",
            comments: [
              {
                path: "zz-test-change.txt",
                new_position: 1,
                body: "zz-test-published-inline",
              },
            ],
          },
        );
        const inline = (
          await otherAPI(
            `/repos/${repo}/pulls/${issue.number}/reviews/${review.id}/comments`,
          )
        )[0];
        await page.goto(`${root}#issuecomment-${inline.id}`);
        await page.reload();
        await visibleAnchor(page, inline.id);
        const thread = page
          .locator(".review-thread")
          .filter({ hasText: "zz-test-published-inline" });
        await thread
          .getByRole("button", { name: "Reply…", exact: true })
          .click();
        await thread
          .getByLabel("Reply", { exact: true })
          .fill("zz-test-review-reply");
        await thread
          .getByRole("button", { name: "Reply", exact: true })
          .click();
        const reply = thread
          .locator(".review-comment")
          .filter({ hasText: "zz-test-review-reply" });
        await expect(reply).toBeVisible();
        const replyID = (await reply.getAttribute("id")).split("-")[1];
        await page.goto(`${root}#issuecomment-${replyID}`);
        await visibleAnchor(page, replyID);
        await page.reload();
        await visibleAnchor(page, replyID);
        const replyData = await (
          await page.request.get(`${dataRoot}?comment_id=${replyID}`)
        ).json();
        expect(replyData.page).toBe(2);
        expect(
          replyData.comments.some((comment) => comment.thread_id === inline.id),
        ).toBe(true);
        await page
          .locator(".review-thread")
          .filter({ hasText: "zz-test-review-reply" })
          .getByRole("button", { name: "Resolve discussion", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Reopen discussion", exact: true }),
        ).toBeVisible();
        await page.goto(`${root}#issuecomment-${replyID}`);
        await page.reload();
        await visibleAnchor(page, replyID);
        const pending = await otherAPI(
          `/repos/${repo}/pulls/${issue.number}/reviews`,
          "POST",
          {
            event: "PENDING",
            body: "zz-test-pending-review",
            comments: [
              {
                path: "zz-test-change.txt",
                new_position: 1,
                body: "zz-test-hidden-inline",
              },
            ],
          },
        );
        const pendingComment = (
          await otherAPI(
            `/repos/${repo}/pulls/${issue.number}/reviews/${pending.id}/comments`,
          )
        )[0];
        const hidden = await (
          await page.request.get(`${dataRoot}?comment_id=${pendingComment.id}`)
        ).json();
        expect(hidden.page).toBe(1);
        expect(JSON.stringify(hidden)).not.toContain("zz-test-hidden-inline");
        await anonymous.goto(`${root}#issuecomment-${pendingComment.id}`);
        await expect(anonymous.locator(`#issuecomment-${first}`)).toBeVisible();
        await expect(
          anonymous.locator(`#issuecomment-${pendingComment.id}`),
        ).toHaveCount(0);
        await anonymous.goto(`${root}#issuecomment-${replyID}`);
        await anonymous.reload();
        await visibleAnchor(anonymous, replyID);
      }
      await api(`/repos/${repo}`, "PATCH", { private: true });
      expect(
        (
          await anonymous.request.get(`${dataRoot}?comment_id=${first}`)
        ).status(),
      ).toBe(404);
      expect(errors).toEqual([]);
    } finally {
      await visitor?.close();
      await api(`/repos/${repo}`, "DELETE");
    }
  });
}

test("organization settings have one complete navigation in every variant", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300000);
  const api = apiFor(page);
  const org = `zz-test-org-navigation-${Date.now()}`;
  await api("/orgs", "POST", { username: org, visibility: "public" });
  const root = `/-/ui/organizations/${org}/settings`;
  const paths = [
    "",
    "avatar",
    "labels",
    "packages",
    "applications",
    "hooks",
    "actions/runners",
    "actions/secrets",
    "actions/variables",
    "blocked_users",
    "delete",
  ];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let visitor;
  try {
    await login(page);
    for (const [variant, width, theme, language] of variants) {
      await appearance(page, root, width, theme, language);
      await page.goto(root);
      const navigation = page.locator("aside nav").first();
      for (const path of paths) {
        if (width === 390)
          await page
            .getByRole("button", {
              name:
                language === "de-DE" ? "Navigation öffnen" : "Open navigation",
              exact: true,
            })
            .click();
        const destination = root + (path ? "/" + path : "");
        await expect(
          navigation.locator(`a[href="${destination}"]`),
        ).toHaveCount(1);
        await navigation.locator(`a[href="${destination}"]`).click();
        await expect(page).toHaveURL(base + destination);
        await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(
          1,
        );
        await expect(
          navigation.locator('a[aria-current="page"]'),
        ).toHaveAttribute("href", destination);
        await expect(
          page
            .locator("main nav[aria-label]")
            .filter({ has: page.locator(`a[href="${root}/avatar"]`) }),
        ).toHaveCount(0);
        await expect(page.locator(`main a[href="${root}/labels"]`)).toHaveCount(
          0,
        );
        await expect(page.locator("main .form-error")).toHaveCount(0);
        if (["", "avatar", "actions/runners"].includes(path)) {
          await page
            .locator(".loading-state,.skeleton")
            .first()
            .waitFor({ state: "hidden" });
          await page.waitForTimeout(250);
          await page.screenshot({
            path: testInfo.outputPath(
              `organization-${variant}-${path.replaceAll("/", "-") || "general"}.png`,
            ),
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await appearance(page, root, 1280, "Light", "en-US");
    await page.goto(root + "/avatar");
    const nav = page.locator("aside nav").first();
    await nav.getByRole("button", { name: "Pin Avatar", exact: true }).click();
    await expect(nav.locator(`a[href="${root}/avatar"]`)).toHaveCount(1);
    await nav.getByRole("button", { name: "Pinned", exact: true }).click();
    await expect(nav.locator(`a[href="${root}/avatar"]:visible`)).toHaveCount(
      1,
    );
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await page.reload();
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      root + "/avatar",
    );
    await page.route(`**/${org}`, async (route) => {
      if (route.request().resourceType() !== "fetch") return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      data.settings_features = {
        webhooks: false,
        applications: false,
        actions: false,
        packages: false,
        storage: true,
      };
      await route.fulfill({ response, json: data });
    });
    await page.reload();
    await expect(nav.locator(`a[href="${root}/storage_overview"]`)).toHaveCount(
      1,
    );
    for (const path of [
      "hooks",
      "applications",
      "packages",
      "actions/runners",
      "actions/secrets",
      "actions/variables",
    ])
      await expect(nav.locator(`a[href="${root}/${path}"]`)).toHaveCount(0);
    visitor = await browser.newContext({ baseURL: base });
    const anonymous = await visitor.newPage();
    await anonymous.goto(`/-/ui/organizations/${org}`);
    await expect(anonymous.locator("main h1")).toBeVisible();
    await expect(anonymous.locator(`aside a[href^="${root}"]`)).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await visitor?.close();
    await api(`/orgs/${org}`, "DELETE");
  }
});
