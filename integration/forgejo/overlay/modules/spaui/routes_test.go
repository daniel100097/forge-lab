// SPDX-License-Identifier: GPL-3.0-or-later
package spaui

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
)

func TestRoutes(t *testing.T) {
	for input, want := range map[string]string{
		"/": "/projects", "/user/login": "/login",
		"/user/two_factor":                        "/login/two-factor",
		"/user/settings/change_password":          "/login/password",
		"/studio/atlas/issues/12":                 "/projects/studio/atlas/issues/12",
		"/studio/atlas/pulls/4":                   "/projects/studio/atlas/merge-requests/4",
		"/studio/atlas/projects/1":                "/projects/studio/atlas/boards/1",
		"/studio/atlas/releases":                  "/projects/studio/atlas/releases",
		"/studio/atlas/actions/runs/1":            "/projects/studio/atlas/actions/runs/1",
		"/studio/atlas/wiki/commit/abcdef123":     "/projects/studio/atlas/wiki/commit/abcdef123",
		"/studio/atlas/wiki/search":               "/projects/studio/atlas/wiki/search",
		"/studio/atlas/wiki/Team-guide":           "/projects/studio/atlas/wiki?page=Team-guide",
		"/studio/atlas/src/branch/main/README.md": "/projects/studio/atlas?ref=main&path=README.md&type=branch",
		"/studio/atlas/commits/branch/main":       "/projects/studio/atlas/history?ref=main&path=&type=branch",
		"/studio/atlas/_edit/main/README.md":      "/projects/studio/atlas/edit?ref=main&path=README.md",
		"/repo/migrate":                           "/projects/import",
		"/explore/organizations":                  "/organizations",
		"/admin/config":                           "/admin/config",
	} {
		if got := Route(input); got != want {
			t.Errorf("%s: got %s, want %s", input, got, want)
		}
	}
}

func TestNativeQueryNavigation(t *testing.T) {
	for input, want := range map[string]string{
		"/studio/atlas/issues?state=closed":         "/projects/studio/atlas/issues?state=closed",
		"/studio/atlas/wiki/Guide?action=_revision": "/projects/studio/atlas/wiki/history?name=Guide",
		"/studio/atlas/wiki/Guide?action=_edit":     "/projects/studio/atlas/wiki?action=edit&page=Guide",
		"/studio/atlas/wiki?action=_pages":          "/projects/studio/atlas/wiki?action=pages",
		"/user/settings/security/two_factor/enroll": "/account/security/two-factor/enroll",
	} {
		parts := strings.SplitN(input, "?", 2)
		query := ""
		if len(parts) > 1 {
			query = parts[1]
		}
		if got := RouteURL(parts[0], query); got != want {
			t.Errorf("%s: got %s, want %s", input, got, want)
		}
	}
}

func TestSelectedFieldsExcludePrivateState(t *testing.T) {
	type model struct {
		ID                 int
		Name, HashedSecret string
	}
	value := &model{ID: 7, Name: "A key", HashedSecret: "must stay private"}
	selected := Fields(value, "ID", "Name")
	if len(selected) != 2 || selected["ID"] != 7 || selected["Name"] != "A key" {
		t.Fatal("selected fields missing")
	}
	if _, exists := selected["HashedSecret"]; exists {
		t.Fatal("private state exposed")
	}
	if len(Rows([]*model{value}, "ID")) != 1 {
		t.Fatal("list projection missing")
	}
	if len(Fields((*model)(nil), "ID")) != 0 {
		t.Fatal("nil value must have no fields")
	}
}

func TestNativeRouteCoverage(t *testing.T) {
	normalize := func(value string) string {
		u, _ := url.Parse(value)
		q := u.Query()
		u.RawQuery = q.Encode()
		return u.String()
	}
	for input, want := range map[string]string{
		"/studio/atlas/src/branch/feature%2Fsearch/docs/Guide%20one.md?view=code": "/projects/studio/atlas?ref=feature%2Fsearch&path=docs%2FGuide+one.md&type=branch&view=code",
		"/studio/atlas/_new/main/":                                   "/projects/studio/atlas/new?ref=main&path=",
		"/studio/atlas/_upload/feature%2Fsearch/":                    "/projects/studio/atlas/upload?ref=feature%2Fsearch&path=",
		"/studio/atlas/_delete/main/README.md":                       "/projects/studio/atlas/delete?ref=main&path=README.md",
		"/studio/atlas/_diffpatch/main/":                             "/projects/studio/atlas/patch?ref=main&path=",
		"/studio/atlas/blame/tag/v1/README.md?ignore=0":              "/projects/studio/atlas/blame?ref=v1&path=README.md&type=tag&ignore=0",
		"/studio/atlas/cherry-pick/abc123?cherry-pick-type=revert":   "/projects/studio/atlas/revert?sha=abc123&cherry-pick-type=revert",
		"/studio/atlas/compare/main...feature/search?expand=1":       "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&expand=1",
		"/studio/atlas/compare/main...alice/renamed:feature/search": "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&source_project=alice%2Frenamed",
		"/studio/atlas/compare/main...alice:feature/search":         "/projects/studio/atlas/merge-requests/new?target_branch=main&source_branch=feature%2Fsearch&source_owner=alice",
		"/studio/atlas/compare/main..v1":                             "/projects/studio/atlas/compare?target=main&source=v1&method=..",
		"/studio/atlas/wiki/Guide%20one?action=_revision":            "/projects/studio/atlas/wiki/history?name=Guide%2520one",
		"/studio/atlas/wiki/zz-test-100%25+%2B+guide.-":              "/projects/studio/atlas/wiki?page=zz-test-100%2525%2B%252B%2Bguide.-",
		"/studio/atlas/wiki?action=_revision":                        "/projects/studio/atlas/wiki/history?name=Home",
		"/studio/atlas/wiki/Guide?action=_edit":                      "/projects/studio/atlas/wiki?page=Guide&action=edit",
		"/studio/atlas/search/branch/feature%2Fsearch?q=test":        "/projects/studio/atlas/search?ref=feature%2Fsearch&type=branch&q=test",
		"/explore/repos?q=atlas&sort=updated":                        "/projects?tab=explore&q=atlas&sort=updated",
		"/user/settings/appearance?tab=code":                         "/account/appearance?tab=code",
		"/studio/atlas/?tab=readme":                                  "/projects/studio/atlas?tab=readme",
		"/org/studio/dashboard/developers?date=2026-09-30":           "/organizations/studio/activity?team=developers&date=2026-09-30",
		"/studio/atlas/does-not-exist":                               "/not-found?path=%2Fstudio%2Fatlas%2Fdoes-not-exist",
		"/studio/atlas/pulls/4/files":                                "/projects/studio/atlas/merge-requests/4?tab=changes",
		"/studio/atlas/pulls/4/files/abc123":                         "/projects/studio/atlas/merge-requests/4?tab=changes&to=abc123",
		"/studio/atlas/pulls/4/files/abc123..def456":                 "/projects/studio/atlas/merge-requests/4?tab=changes&from=abc123&to=def456",
		"/studio/atlas/pulls/4/commits":                              "/projects/studio/atlas/merge-requests/4?tab=commits",
		"/studio/atlas/pulls/4/commits/abc123":                       "/projects/studio/atlas/merge-requests/4?tab=changes&commit=abc123",
		"/studio/atlas/pulls/4":                                      "/projects/studio/atlas/merge-requests/4",
		"/studio/atlas/projects/3/edit":                              "/projects/studio/atlas/boards/3/settings",
		"/studio/atlas/projects/3":                                   "/projects/studio/atlas/boards/3",
		"/studio/atlas/activity/monthly":                             "/projects/studio/atlas/activity?period=monthly",
		"/studio/atlas/activity/contributors":                        "/projects/studio/atlas/activity/contributors",
		"/studio/atlas/find/branch/feature/search":                   "/projects/studio/atlas/find?ref=feature%2Fsearch&type=branch",
		"/org/studio/issues/developers?state=closed":                 "/organizations/studio/issues?team=developers&state=closed",
		"/org/studio/pulls/developers":                               "/organizations/studio/merge-requests?team=developers",
		"/org/studio/milestones/developers":                          "/organizations/studio/milestones?team=developers",
		"/org/studio/pulls":                                          "/organizations/studio/merge-requests",
		"/studio/atlas/settings/actions":                             "/projects/studio/atlas/settings/actions/runners",
		"/studio/atlas/settings/actions/secrets":                     "/projects/studio/atlas/settings/actions/secrets",
		"/org/studio/settings/actions":                               "/organizations/studio/settings/actions/runners",
		"/admin/actions":                                             "/admin/actions/runners",
		"/user/settings/actions":                                     "/account/actions/runners",
		"/studio/atlas/settings/tags/7":                              "/projects/studio/atlas/settings/tags/7",
	} {
		u, _ := url.Parse(input)
		got := RouteURL(u.EscapedPath(), u.RawQuery)
		if normalize(got) != normalize(want) {
			t.Errorf("%s: got %s, want %s", input, got, want)
		}
	}
}
func TestNativeCommitSearch(t *testing.T) {
	got, _ := url.Parse(RouteRepositoryURL("/studio/atlas/commits/branch/feature/x/search", "q=fix&all=on", "feature/x", "search"))
	if got.Path != "/projects/studio/atlas/history" || got.Query().Get("ref") != "feature/x" || got.Query().Has("path") || got.Query().Get("q") != "fix" || got.Query().Get("all") != "true" {
		t.Fatal(got)
	}
	got, _ = url.Parse(RouteRepositoryURL("/studio/atlas/commits/branch/main/search", "q=fix&all=false", "main", "search"))
	if got.Query().Has("all") || got.Query().Has("path") {
		t.Fatal(got)
	}
}

func TestNativeResolvedBranches(t *testing.T) {
	for _, path := range []string{"/studio/atlas/src/branch/feature/search/docs/Guide.md", "/studio/atlas/_edit/feature/search/docs/Guide.md"} {
		got, _ := url.Parse(RouteRepositoryURL(path, "view=code", "feature/search", "docs/Guide.md"))
		if got.Query().Get("ref") != "feature/search" || got.Query().Get("path") != "docs/Guide.md" || got.Query().Get("view") != "code" {
			t.Fatal(got)
		}
	}
}

func TestWithFields(t *testing.T) {
	type release struct {
		ID   int64  `json:"id"`
		Body string `json:"body"`
	}
	got, ok := WithFields(&release{ID: 9007199254740993, Body: "**x**"}, map[string]any{"body_html": "<strong>x</strong>", "body_edit": nil}).(map[string]any)
	if !ok || got["body_html"] != "<strong>x</strong>" || got["body"] != "**x**" {
		t.Fatal(got)
	}
	if _, exists := got["body_edit"]; exists {
		t.Fatal("empty extras must be omitted")
	}
	if id, _ := got["id"].(json.Number); id.String() != "9007199254740993" {
		t.Fatal("ids must keep their precision", got["id"])
	}
	if WithFields("text", map[string]any{"a": 1}) != "text" {
		t.Fatal("non-objects are returned unchanged")
	}
}
