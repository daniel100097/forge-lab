import { afterEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("document", {
  querySelector: () => ({ href: "https://forgejo.example/git/-/ui/" }),
});
const { native, repoPath, request, post, RequestError, appSubUrl } =
  await import("./api");
afterEach(() => vi.unstubAllGlobals());

describe("native Forgejo requests", () => {
  it("keeps the installation subpath and normal session credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        headers: {
          "Content-Type": "application/json",
          "X-Total-Count": "23",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await request("/repo/search");
    expect(appSubUrl).toBe("/git");
    expect(fetch).toHaveBeenCalledWith(
      "/git/repo/search",
      expect.objectContaining({
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
    expect(result.total).toBe(23);
    expect(repoPath("a b", "thing#1")).toBe("/a%20b/thing%231");
    expect(native("/user/login")).toBe("/git/user/login");
  });
  it("accepts native no-content mutations without expiring the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      request("/owner/repo/issues/unpin/2", { method: "DELETE" }),
    ).resolves.toEqual({ data: undefined, total: 0 });
  });
  it("treats HTML login and account-state responses as a session transition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Sign in</html>", {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(request("/-/ui/data/bootstrap")).rejects.toMatchObject({
      loginRequired: true,
    });
  });
  it("does not mistake an HTML 404 for an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Not found", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(
      request("/-/ui/data/repos/private/repository"),
    ).rejects.toMatchObject({ status: 404, loginRequired: false });
  });
  it("rejects native error envelopes even when HTTP status is 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"errorMessage":"The issue has moved"}', {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      post("/owner/repo/projects/1/2/move", { issues: [] }),
    ).rejects.toThrow("The issue has moved");
  });
  it("preserves JSON request bodies for native board mutations", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetch);
    await post("/owner/repo/projects/1/2/move", {
      issues: [{ issueID: 4, sorting: 0 }],
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: '{"issues":[{"issueID":4,"sorting":0}]}',
    });
  });
  it("reports permission failures from JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"message":"Not allowed"}', {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(request("/admin/config")).rejects.toBeInstanceOf(RequestError);
  });
});
