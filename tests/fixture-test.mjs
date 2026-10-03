import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

export function checkNames(url, fields) {
  const path = new URL(url).pathname;
  const names = new Set();
  if (/\/(?:repo|org)\/create$/.test(path)) {
    names.add("repo_name");
    names.add("org_name");
    names.add("default_branch");
  }
  if (path === "/repo/migrate") {
    names.add("repo_name");
    if (
      fields.clone_addr &&
      !new URL(fields.clone_addr).pathname.startsWith("/zz-test-")
    )
      throw new Error("Import only prefixed disposable repositories.");
  }
  if (
    /\/(?:issues|pulls|projects|labels|milestones|wiki)\/new$/.test(path) ||
    /\/compare\//.test(path)
  )
    names.add("title");
  if (/\/(?:_new|_edit|_upload|branches\/_(?:new|rename))\//.test(path))
    names.add("new_branch_name");
  if (/\/releases\/(?:new|edit)/.test(path)) {
    names.add("tag_name");
    names.add("title");
  }
  if (/\/admin\/users\/new$/.test(path)) names.add("user_name");
  if (/\/admin\/auths\/new$/.test(path)) names.add("name");
  if (/\/teams\/new$/.test(path)) names.add("team_name");
  if (/\/projects\/\d+(?:\/edit|\/\d+)?$/.test(path)) names.add("title");
  if (/\/labels\/initialize$/.test(path))
    throw new Error(
      "Stock label templates create unprefixed names; use a prefixed label.",
    );
  for (const key of names) {
    const value = fields[key];
    if (value && !String(value).startsWith("zz-test-"))
      throw new Error(`Unsafe disposable fixture ${key}=${value} at ${path}`);
  }
}

export const test = base.extend({
  fixtureSafety: [
    async ({ context }, use) => {
      if (process.env.FORGEJO_TEST_PREFIX_ONLY !== "1") return use();
      const directory = process.env.FORGEJO_TEST_FIXTURES;
      if (!directory?.includes("zz-test-forgejo-ui-test-"))
        throw new Error("Use the prefixed disposable harness directory.");
      const credentials = JSON.parse(
        await readFile(`${directory}/credentials.json`, "utf8"),
      );
      for (const identity of Object.values(credentials)) {
        if (!identity.username.startsWith("zz-test-"))
          throw new Error("Disposable usernames must start with zz-test-.");
      }
      const failures = [];
      const originalPost = context.request.post.bind(context.request);
      context.request.post = (url, options) => {
        checkNames(
          new URL(url, process.env.FORGEJO_TEST_URL).href,
          options?.form || {},
        );
        return originalPost(url, options);
      };
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (
          request.method() === "POST" &&
          request
            .headers()
            ["content-type"]?.includes("application/x-www-form-urlencoded")
        ) {
          try {
            checkNames(
              request.url(),
              Object.fromEntries(new URLSearchParams(request.postData() || "")),
            );
          } catch (error) {
            failures.push(error.message);
            return route.abort();
          }
        }
        await route.continue();
      });
      await use();
      expect(failures).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function chooseAppearance(page, name) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  const appearance = page.getByRole("menuitem", {
    name: "Appearance",
    exact: true,
  });
  await appearance.focus();
  await appearance.press("ArrowRight");
  await expect(
    page.getByRole("menuitemradio", { name, exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => {
      const result = await page.request.get("/user/settings/appearance", {
        headers: { "X-Forgejo-UI": "1" },
      });
      return (await result.json()).theme;
    })
    .toMatch(
      new RegExp(
        "-" + (name === "System" ? "auto" : name.toLowerCase()) + "(?:-|$)",
      ),
    );
}
