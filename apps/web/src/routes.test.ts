import { afterAll, describe, expect, it, vi } from "vitest";
vi.stubGlobal("window", { location: { origin: "https://forgejo.example" } });
vi.stubGlobal("document", {
  querySelector: () => ({ href: "https://forgejo.example/git/-/ui/" }),
});
const { uiRoute, isNativeResource } = await import("./routes");
afterAll(() => vi.unstubAllGlobals());
const normalized = (value: string) => {
  const url = new URL(value, "https://forgejo.example");
  url.searchParams.sort();
  return url.pathname + url.search + url.hash;
};
describe("native page navigation", () => {
  it.each([
    [
      "/studio/atlas/wiki/zz-test-100%25+%2B+guide.-",
      "/projects/studio/atlas/wiki?page=zz-test-100%2525%2B%252B%2Bguide.-",
    ],
    [
      "/studio/atlas/src/branch/feature%2Fsearch/docs/Guide%20one.md?view=code#L12",
      "/projects/studio/atlas?ref=feature%2Fsearch&path=docs%2FGuide+one.md&type=branch&view=code#L12",
    ],
    ["/studio/atlas/_new/main/", "/projects/studio/atlas/new?ref=main&path="],
    [
      "/studio/atlas/_upload/feature%2Fsearch/",
      "/projects/studio/atlas/upload?ref=feature%2Fsearch&path=",
    ],
    [
      "/studio/atlas/_delete/main/README.md",
      "/resolve?path=%2Fgit%2Fstudio%2Fatlas%2F_delete%2Fmain%2FREADME.md",
    ],
    [
      "/studio/atlas/_diffpatch/main/",
      "/projects/studio/atlas/patch?ref=main&path=",
    ],
    [
      "/studio/atlas/blame/tag/v1/README.md?ignore=0",
      "/resolve?path=%2Fgit%2Fstudio%2Fatlas%2Fblame%2Ftag%2Fv1%2FREADME.md%3Fignore%3D0",
    ],
    [
      "/studio/atlas/cherry-pick/abc123?cherry-pick-type=revert",
      "/projects/studio/atlas/revert?sha=abc123&cherry-pick-type=revert",
    ],
    [
      "/studio/atlas/compare/main...feature/search?expand=1",
      "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&expand=1",
    ],
    [
      "/studio/atlas/compare/main...alice/renamed:feature/search",
      "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&source_project=alice%2Frenamed",
    ],
    [
      "/studio/atlas/compare/main...alice:feature/search",
      "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&source_owner=alice",
    ],
    [
      "/studio/atlas/compare/main..v1",
      "/projects/studio/atlas/compare?target=main&source=v1&method=..",
    ],
    [
      "/studio/atlas/wiki?action=_pages",
      "/projects/studio/atlas/wiki?action=pages",
    ],
    [
      "/studio/atlas/wiki/Guide%20one?action=_revision",
      "/projects/studio/atlas/wiki/history?name=Guide%2520one",
    ],
    [
      "/studio/atlas/wiki?action=_revision",
      "/projects/studio/atlas/wiki/history?name=Home",
    ],
    [
      "/studio/atlas/wiki/Guide?action=_edit#part",
      "/projects/studio/atlas/wiki?page=Guide&action=edit#part",
    ],
    [
      "/studio/atlas/search/branch/feature%2Fsearch?q=test",
      "/projects/studio/atlas/search?ref=feature%2Fsearch&type=branch&q=test",
    ],
    [
      "/explore/repos?q=atlas&sort=updated",
      "/projects?tab=explore&q=atlas&sort=updated",
    ],
    [
      "/user/settings/appearance?tab=code#preview",
      "/account/appearance?tab=code#preview",
    ],
    ["/studio/atlas/?tab=readme", "/projects/studio/atlas?tab=readme"],
    [
      "/org/studio/dashboard/developers?date=2026-09-30",
      "/organizations/studio/activity?team=developers&date=2026-09-30",
    ],
    [
      "/studio/atlas/pulls/4/files",
      "/projects/studio/atlas/merge-requests/4?tab=changes",
    ],
    [
      "/studio/atlas/pulls/4/files#issuecomment-12",
      "/projects/studio/atlas/merge-requests/4?tab=changes#issuecomment-12",
    ],
    [
      "/studio/atlas/pulls/4/files/abc123",
      "/projects/studio/atlas/merge-requests/4?tab=changes&to=abc123",
    ],
    [
      "/studio/atlas/pulls/4/files/abc123..def456",
      "/projects/studio/atlas/merge-requests/4?tab=changes&from=abc123&to=def456",
    ],
    [
      "/studio/atlas/pulls/4/commits",
      "/projects/studio/atlas/merge-requests/4?tab=commits",
    ],
    [
      "/studio/atlas/pulls/4/commits/abc123",
      "/projects/studio/atlas/merge-requests/4?tab=changes&commit=abc123",
    ],
    [
      "/studio/atlas/projects/3/edit",
      "/projects/studio/atlas/boards/3/settings",
    ],
    ["/studio/atlas/projects/3", "/projects/studio/atlas/boards/3"],
    [
      "/studio/atlas/activity/monthly",
      "/projects/studio/atlas/activity?period=monthly",
    ],
    [
      "/studio/atlas/activity/contributors",
      "/projects/studio/atlas/activity/contributors",
    ],
    [
      "/studio/atlas/find/branch/feature/search",
      "/projects/studio/atlas/find?ref=feature%2Fsearch&type=branch",
    ],
    [
      "/studio/atlas/find/tag/v1",
      "/projects/studio/atlas/find?ref=v1&type=tag",
    ],
    [
      "/org/studio/issues/developers?state=closed",
      "/organizations/studio/issues?team=developers&state=closed",
    ],
    [
      "/org/studio/pulls/developers",
      "/organizations/studio/merge-requests?team=developers",
    ],
    [
      "/org/studio/milestones/developers",
      "/organizations/studio/milestones?team=developers",
    ],
    ["/org/studio/pulls", "/organizations/studio/merge-requests"],
    [
      "/studio/atlas/commits/branch/feature%2Fsearch/search?q=fix&all=on",
      "/projects/studio/atlas/history?ref=feature%2Fsearch&type=branch&q=fix&all=true",
    ],
    [
      "/studio/atlas/commits/branch/main/search?q=fix",
      "/resolve?path=%2Fgit%2Fstudio%2Fatlas%2Fcommits%2Fbranch%2Fmain%2Fsearch%3Fq%3Dfix",
    ],
    [
      "/studio/atlas/settings/actions",
      "/projects/studio/atlas/settings/actions/runners",
    ],
    [
      "/studio/atlas/settings/actions/secrets",
      "/projects/studio/atlas/settings/actions/secrets",
    ],
    [
      "/org/studio/settings/actions",
      "/organizations/studio/settings/actions/runners",
    ],
    ["/admin/actions", "/admin/actions/runners"],
    ["/admin/actions/variables", "/admin/actions/variables"],
    ["/user/settings/actions", "/account/actions/runners"],
    ["/studio/atlas/settings/tags/7", "/projects/studio/atlas/settings/tags/7"],
    [
      "/studio/atlas/does-not-exist",
      "/not-found?path=%2Fstudio%2Fatlas%2Fdoes-not-exist",
    ],
  ])("preserves %s", (input, expected) => {
    expect(normalized(uiRoute("/git" + input))).toBe(normalized(expected));
  });
  it("keeps SPA links and excludes private transport roots", () => {
    expect(uiRoute("/git/-/ui/projects?tab=explore#items")).toBe(
      "/projects?tab=explore#items",
    );
    expect(uiRoute("/git/-/ui/data/bootstrap")).toBe("/projects");
    expect(uiRoute("https://other.example/user/login")).toBe("/projects");
  });
});

it("keeps downloadable assets and feeds on their native handlers", () => {
  for (const path of [
    "/git/studio/atlas/archive/main.zip",
    "/studio/atlas/releases/download/v1/tool.zip",
    "/attachments/123",
    "/studio/atlas/pulls/4.diff",
    "/studio/atlas/compare/main...feature.patch",
    "/studio/atlas/wiki/raw/Guide",
    "/studio/atlas/rss/branch/main",
  ])
    expect(isNativeResource(path)).toBe(true);
  expect(isNativeResource("/studio/atlas/releases/tag/v1")).toBe(false);
  expect(isNativeResource("/studio/atlas/pulls/4")).toBe(false);
});
