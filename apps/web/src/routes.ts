import { appSubUrl, uiBase } from "./api";

// These browser links are downloads/feeds, not application pages.
export function isNativeResource(path: string): boolean {
  return (
    /\/(raw|media|attachments|archive)\//.test(path) ||
    /\/releases\/download\//.test(path) ||
    /\/(rss|atom)(?:\/|$)/.test(path) ||
    /\/(?:pulls\/\d+|commit\/[a-f0-9]+|compare\/.+)\.(?:diff|patch)$/.test(path)
  );
}

const activityPeriods = [
  "daily",
  "halfweekly",
  "weekly",
  "monthly",
  "quarterly",
  "semiyearly",
  "yearly",
];

// Native operation redirects and old bookmarks enter the same SPA routes.
export function uiRoute(input: string): string {
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin) return "/projects";
  if (
    ["data", "assets"].some(
      (part) =>
        url.pathname === `${uiBase}/${part}` ||
        url.pathname.startsWith(`${uiBase}/${part}/`),
    )
  )
    return "/projects";
  if (url.pathname === uiBase || url.pathname.startsWith(uiBase + "/"))
    return (
      (url.pathname.slice(uiBase.length) || "/projects") + url.search + url.hash
    );
  const rawPath =
    appSubUrl && url.pathname.startsWith(appSubUrl + "/")
      ? url.pathname.slice(appSubUrl.length)
      : url.pathname;
  const path = rawPath.replace(/\/$/, "") || "/";
  // Native query values survive navigation; route-derived values take precedence.
  const finish = (destination: string) => {
    const result = new URL(destination, window.location.origin);
    const query = new URLSearchParams(url.search);
    if (/\/wiki(?:\/|$)/.test(path)) {
      switch (query.get("action")) {
        case "_revision":
          result.pathname += "/history";
          result.searchParams.set(
            "name",
            result.searchParams.get("page") || "Home",
          );
          result.searchParams.delete("page");
          query.delete("action");
          break;
        case "_edit":
          query.set("action", "edit");
          break;
        case "_new":
          query.set("action", "new");
          break;
        case "_pages":
          query.set("action", "pages");
          break;
      }
    }
    for (const key of new Set(query.keys())) {
      if (!result.searchParams.has(key))
        for (const value of query.getAll(key))
          result.searchParams.append(key, value);
    }
    return result.pathname + result.search + url.hash;
  };
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const routes: Record<string, string> = {
    "/": "/projects",
    "/api/swagger": "/help/api",
    "/api/forgejo/swagger": "/help/api/forgejo",
    "/explore/code": "/search",
    "/milestones": "/work/milestones",
    "/report_abuse": "/report-abuse",
    "/notifications/subscriptions": "/notifications/subscriptions",
    "/notifications/watching": "/notifications/watching",
    "/user/sign_up": "/register",
    "/user/recover_account": "/recover-account",
    "/user/activate": "/activate",
    "/user/activate_email": "/activate-email",
    "/user/webauthn": "/login/webauthn",
    "/user/login/openid": "/login/openid",
    "/user/openid/connect": "/login/openid/connect",
    "/user/openid/register": "/login/openid/register",
    "/user/link_account": "/login/link-account",
    "/user/link_account_signin": "/login/link-account",
    "/user/link_account_signup": "/login/link-account",
    "/login/oauth/authorize": "/oauth/authorize",

    "/user/login": "/login",
    "/user/two_factor": "/login/two-factor",
    "/user/two_factor/scratch": "/login/recovery",
    "/user/forgot_password": "/forgot-password",
    "/user/settings/change_password": "/login/password",
    "/user/change_password": "/login/password",
    "/user/settings": "/account",
    "/repo/create": "/projects/new",
    "/repo/migrate": "/projects/import",
    "/explore/organizations": "/organizations",
    "/explore/users": "/users",
    "/org/create": "/organizations/new",
    "/issues": "/work/issues",
    "/pulls": "/work/merge-requests",
    "/notifications": "/notifications",
    "/explore/repos": "/projects?tab=explore",
  };
  if (routes[path]) return finish(routes[path]);
  // Native "actions" settings roots redirect to their runners page.
  if (path === "/admin/actions") return finish("/admin/actions/runners");
  if (path === "/admin" || path.startsWith("/admin/")) return finish(path);
  if (path === "/user/settings/actions")
    return finish("/account/actions/runners");
  if (path.startsWith("/user/settings/"))
    return finish(
      path
        .replace("/user/settings/", "/account/")
        .replace("/two_factor/", "/two-factor/")
        .replace("/blocked_users", "/blocked"),
    );
  const parts = path.split("/").filter(Boolean);
  if (parts[1] === "-" && parts[2] === "projects")
    return finish(
      `/users/${parts[0]}/boards${parts.length > 3 ? "/" + parts.slice(3).join("/") : ""}`,
    );
  if (parts[1] === "-" && parts[2] === "packages")
    return finish(
      `/packages/${parts[0]}` +
        (parts.length > 3 ? "/" + parts.slice(3).join("/") : ""),
    );
  if (parts[1] === "-" && parts[2] === "code")
    return finish(`/users/${parts[0]}/search`);
  if (parts[0] === "org" && parts.length >= 2) {
    // Team dashboards: /org/{org}/{dashboard,issues,pulls,milestones}/{team}.
    const teamPage = (
      {
        dashboard: "activity",
        issues: "issues",
        pulls: "merge-requests",
        milestones: "milestones",
      } as Record<string, string>
    )[parts[2]];
    if (teamPage && parts[3]) {
      const query = new URLSearchParams(url.search);
      query.set("team", decode(parts[3]));
      return finish(`/organizations/${parts[1]}/${teamPage}?${query}`);
    }
    if (parts[2] === "settings" && parts[3] === "actions" && !parts[4])
      return finish(`/organizations/${parts[1]}/settings/actions/runners`);
    const tail = parts.slice(2);
    if (tail.length)
      tail[0] =
        (
          {
            dashboard: "activity",
            pulls: "merge-requests",
            code: "search",
            projects: "boards",
          } as Record<string, string>
        )[tail[0]] || tail[0];
    return finish(
      `/organizations/${parts[1]}` + (tail.length ? "/" + tail.join("/") : ""),
    );
  }
  if (
    parts.length === 1 &&
    !["user", "admin", "explore", "repo", "-"].includes(parts[0])
  )
    return finish(`/users/${parts[0]}`);
  if (
    parts.length >= 2 &&
    !["user", "admin", "explore", "repo", "-"].includes(parts[0]) &&
    parts[1] !== "-"
  ) {
    const root = `/projects/${parts[0]}/${parts[1]}`;
    if (parts.length === 2) return finish(root);
    const tail = parts.slice(2);
    // A raw slash can separate a branch name or a file path. Let Forgejo's
    // reference resolver choose; encoded refs and internal SPA links need no hop.
    const refIndex = ["src", "commits", "blame"].includes(tail[0])
      ? 2
      : ["_edit", "_new", "_upload", "_delete", "_diffpatch"].includes(tail[0])
        ? 1
        : -1;
    if (
      refIndex >= 0 &&
      tail.length > refIndex + 1 &&
      !/%2f/i.test(tail[refIndex]) &&
      // A commit ID never contains a slash.
      !(refIndex === 2 && tail[1] === "commit")
    )
      return (
        "/resolve?" +
        new URLSearchParams({ path: url.pathname + url.search + url.hash })
      );
    if (tail[0] === "flags") return finish(root + "/settings/flags");
    // Commit search: /commits/{type}/{ref}/search?q= (an encoded ref).
    if (tail[0] === "commits" && tail.length === 4 && tail[3] === "search")
      return finish(
        root +
          "/history?" +
          new URLSearchParams({
            ref: decode(tail[2]),
            type: tail[1],
            all: String(
              /^(?:1|t|true|on)$/i.test(url.searchParams.get("all") ?? ""),
            ),
          }),
      );
    // "Go to file": /find/{type}/{ref}.
    if (tail[0] === "find")
      return finish(
        root +
          "/find" +
          (tail.length >= 3
            ? "?" +
              new URLSearchParams({
                ref: tail.slice(2).map(decode).join("/"),
                type: tail[1],
              })
            : ""),
      );
    if (tail[0] === "settings" && tail[1] === "actions" && !tail[2])
      return finish(root + "/settings/actions/runners");
    if (
      tail[0] === "activity" &&
      tail.length === 2 &&
      activityPeriods.includes(tail[1])
    )
      return finish(root + "/activity?period=" + tail[1]);
    // Merge request tabs: /pulls/{n}/files[/{sha}|/{from}..{to}] and
    // /pulls/{n}/commits[/{sha}]. "commit" shows one commit; "to" without
    // "from" shows the changes from the merge base up to that commit.
    if (tail[0] === "pulls" && /^\d+$/.test(tail[1] ?? "") && tail[2]) {
      const pull = `${root}/merge-requests/${tail[1]}?`;
      if (tail[2] === "files") {
        const [from, to] = tail[3]?.includes("..")
          ? tail[3].split("..", 2)
          : ["", tail[3] ?? ""];
        return finish(
          pull +
            new URLSearchParams({
              tab: "changes",
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            }),
        );
      }
      if (tail[2] === "commits")
        return finish(
          pull +
            new URLSearchParams(
              tail[3]
                ? { tab: "changes", commit: tail[3] }
                : { tab: "commits" },
            ),
        );
    }
    if (tail[0] === "projects" && tail[2] === "edit" && !tail[3])
      return finish(`${root}/boards/${tail[1]}/settings`);
    if (tail[0] === "milestone") return finish(root + "/milestones/" + tail[1]);
    if (
      ["_new", "_upload", "_delete", "_edit", "_diffpatch"].includes(tail[0]) &&
      tail.length >= 2
    )
      return finish(
        root +
          "/" +
          (
            {
              _new: "new",
              _upload: "upload",
              _delete: "delete",
              _edit: "edit",
              _diffpatch: "patch",
            } as Record<string, string>
          )[tail[0]] +
          "?" +
          new URLSearchParams({
            ref: decode(tail[1]),
            path: tail.slice(2).map(decode).join("/"),
          }),
      );
    if (["cherry-pick", "_cherrypick"].includes(tail[0]) && tail[1]) {
      const operation =
        url.searchParams.get("cherry-pick-type") === "revert"
          ? "revert"
          : "cherry-pick";
      return finish(
        root +
          "/" +
          operation +
          "?" +
          new URLSearchParams({
            sha: tail[1],
            ...(tail[2] ? { ref: tail.slice(2).map(decode).join("/") } : {}),
          }),
      );
    }
    if (tail[0] === "search" && tail.length >= 3)
      return finish(
        root +
          "/search?" +
          new URLSearchParams({
            ref: tail.slice(2).map(decode).join("/"),
            type: tail[1],
          }),
      );
    if (
      [
        "releases",
        "packages",
        "settings",
        "actions",
        "commit",
        "branches",
        "tags",
        "graph",
        "activity",
        "stars",
        "watchers",
        "forks",
        "fork",
        "labels",
        "milestones",
        "search",
      ].includes(tail[0])
    )
      return finish(root + "/" + tail.join("/"));
    if (tail[0] === "wiki" && ["commit", "search"].includes(tail[1]))
      return finish(root + "/" + tail.join("/"));
    if (tail[0] === "wiki")
      return finish(
        root +
          "/wiki" +
          (tail.length > 1
            ? "?page=" + encodeURIComponent(tail.slice(1).join("/"))
            : ""),
      );
    if (["src", "commits", "blame"].includes(tail[0]) && tail.length >= 3) {
      const suffix = { src: "", commits: "/history", blame: "/blame" }[tail[0]];
      return finish(
        root +
          suffix +
          "?" +
          new URLSearchParams({
            ref: decode(tail[2]),
            path: tail.slice(3).map(decode).join("/"),
            type: tail[1],
          }),
      );
    }
    if (tail[0] === "compare") {
      const comparison = tail.slice(1).map(decode).join("/");
      const method = comparison.includes("...")
        ? "..."
        : comparison.includes("..")
          ? ".."
          : "";
      const [target, source] = method
        ? comparison.split(method, 2)
        : ["", comparison];
      if (method === "..")
        return finish(
          root + "/compare?" + new URLSearchParams({ target, source, method }),
        );
      const [sourceProject, branch] = source.includes(":")
        ? source.split(":", 2)
        : ["", source];
      return finish(
        root +
          "/merge-requests/new?" +
          new URLSearchParams({
            ...(target ? { target_branch: target } : {}),
            ...(branch ? { source_branch: branch } : {}),
            ...(sourceProject
              ? sourceProject.includes("/")
                ? { source_project: sourceProject }
                : { source_owner: sourceProject }
              : {}),
          }),
      );
    }
    if (["issues", "pulls", "projects"].includes(tail[0])) {
      tail[0] =
        (
          { pulls: "merge-requests", projects: "boards" } as Record<
            string,
            string
          >
        )[tail[0]] ?? tail[0];
      return finish(root + "/" + tail.join("/"));
    }
  }
  return "/not-found?path=" + encodeURIComponent(path);
}
