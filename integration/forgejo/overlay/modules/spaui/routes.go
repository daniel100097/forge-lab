// SPDX-License-Identifier: GPL-3.0-or-later
package spaui

import (
	"net/url"
	"strconv"
	"strings"
)

// RouteURL preserves native page filters when navigation enters the SPA.
func RouteURL(path, rawQuery string) string {
	destination, _ := url.Parse(Route(path))
	if destination == nil {
		return "/projects"
	}
	query, _ := url.ParseQuery(rawQuery)
	values := destination.Query()
	if strings.HasSuffix(destination.Path, "/cherry-pick") && query.Get("cherry-pick-type") == "revert" {
		destination.Path = strings.TrimSuffix(destination.Path, "/cherry-pick") + "/revert"
	}
	if strings.Contains(path, "/wiki/") || strings.HasSuffix(strings.TrimSuffix(path, "/"), "/wiki") {
		switch query.Get("action") {
		case "_revision":
			destination.Path += "/history"
			name := values.Get("page")
			if name == "" {
				name = "Home"
			}
			values.Set("name", name)
			values.Del("page")
			query.Del("action")
		case "_edit":
			query.Set("action", "edit")
		case "_new":
			query.Set("action", "new")
		case "_pages":
			values.Set("action", "pages")
			query.Del("action")
		}
	}
	for key, entries := range query {
		if !values.Has(key) {
			values[key] = entries
		}
	}
	destination.RawQuery = values.Encode()
	return destination.String()
}

// Route maps native page URLs to the independent browser application. Protocol,
// download and JSON handlers never call this; only template navigation does.
func Route(path string) string {
	path = strings.TrimSuffix(path, "/")
	switch strings.TrimSuffix(path, "/") {
	case "", "/":
		return "/projects"
	case "/user/sign_up":
		return "/register"
	case "/user/recover_account":
		return "/recover-account"
	case "/user/activate":
		return "/activate"
	case "/user/activate_email":
		return "/activate-email"
	case "/user/webauthn":
		return "/login/webauthn"
	case "/user/login/openid":
		return "/login/openid"
	case "/user/openid/connect":
		return "/login/openid/connect"
	case "/user/openid/register":
		return "/login/openid/register"
	case "/user/link_account":
		return "/login/link-account"
	case "/user/link_account_signin":
		return "/login/link-account"
	case "/user/link_account_signup":
		return "/login/link-account"
	case "/login/oauth/authorize":
		return "/oauth/authorize"
	case "/report_abuse":
		return "/report-abuse"
	case "/api/swagger":
		return "/help/api"
	case "/api/forgejo/swagger":
		return "/help/api/forgejo"
	case "/explore/code":
		return "/search"
	case "/milestones":
		return "/work/milestones"
	case "/notifications/subscriptions", "/notifications/watching":
		return path
	case "/user/login":
		return "/login"
	case "/user/two_factor":
		return "/login/two-factor"
	case "/user/two_factor/scratch":
		return "/login/recovery"
	case "/user/forgot_password":
		return "/forgot-password"
	case "/user/settings/change_password", "/user/change_password":
		return "/login/password"
	case "/user/settings":
		return "/account"
	case "/repo/migrate":
		return "/projects/import"
	case "/explore/users":
		return "/users"
	case "/org/create":
		return "/organizations/new"
	case "/explore/organizations":
		return "/organizations"
	case "/repo/create":
		return "/projects/new"
	case "/issues":
		return "/work/issues"
	case "/pulls":
		return "/work/merge-requests"
	case "/notifications":
		return "/notifications"
	case "/explore/repos":
		return "/projects?tab=explore"
	}
	// Native "actions" settings roots redirect to their runners page.
	if path == "/admin/actions" {
		return "/admin/actions/runners"
	}
	if path == "/admin" || strings.HasPrefix(path, "/admin/") {
		return path
	}
	if path == "/user/settings/actions" {
		return "/account/actions/runners"
	}
	if strings.HasPrefix(path, "/user/settings/") {
		dest := strings.Replace(path, "/user/settings/", "/account/", 1)
		dest = strings.Replace(dest, "/two_factor/", "/two-factor/", 1)
		return strings.Replace(dest, "/blocked_users", "/blocked", 1)
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 3 && parts[1] == "-" && parts[2] == "projects" {
		dest := "/users/" + url.PathEscape(unescape(parts[0])) + "/boards"
		if len(parts) > 3 {
			dest += "/" + strings.Join(parts[3:], "/")
		}
		return dest
	}
	if len(parts) >= 3 && parts[1] == "-" && parts[2] == "packages" {
		dest := "/packages/" + parts[0]
		if len(parts) > 3 {
			dest += "/" + strings.Join(parts[3:], "/")
		}
		return dest
	}
	if len(parts) >= 3 && parts[1] == "-" && parts[2] == "code" {
		return "/users/" + parts[0] + "/search"
	}
	if len(parts) >= 2 && parts[0] == "org" {
		tail := append([]string(nil), parts[1:]...)
		// Team dashboards: /org/{org}/{dashboard,issues,pulls,milestones}/{team}.
		teamPages := map[string]string{"dashboard": "activity", "issues": "issues", "pulls": "merge-requests", "milestones": "milestones"}
		if len(tail) > 2 && teamPages[tail[1]] != "" {
			return "/organizations/" + tail[0] + "/" + teamPages[tail[1]] + "?team=" + url.QueryEscape(unescape(tail[2]))
		}
		if len(tail) == 3 && tail[1] == "settings" && tail[2] == "actions" {
			return "/organizations/" + tail[0] + "/settings/actions/runners"
		}
		if len(tail) > 1 {
			switch tail[1] {
			case "dashboard":
				tail[1] = "activity"
			case "pulls":
				tail[1] = "merge-requests"
			case "code":
				tail[1] = "search"
			case "projects":
				tail[1] = "boards"
			}
		}
		return "/organizations/" + strings.Join(tail, "/")
	}
	if len(parts) == 1 && parts[0] != "user" && parts[0] != "admin" && parts[0] != "explore" && parts[0] != "repo" && parts[0] != "-" {
		return "/users/" + url.PathEscape(unescape(parts[0]))
	}
	if len(parts) >= 2 && parts[0] != "user" && parts[0] != "admin" && parts[0] != "explore" && parts[0] != "repo" && parts[0] != "-" && parts[1] != "-" {
		root := "/projects/" + url.PathEscape(unescape(parts[0])) + "/" + url.PathEscape(unescape(parts[1]))
		if len(parts) == 2 {
			return root
		}
		tail := append([]string(nil), parts[2:]...)
		switch tail[0] {
		case "flags":
			return root + "/settings/flags"
		case "_edit", "_new", "_upload", "_delete", "_diffpatch":
			if len(tail) >= 2 {
				operation := map[string]string{"_edit": "edit", "_new": "new", "_upload": "upload", "_delete": "delete", "_diffpatch": "patch"}[tail[0]]
				return root + "/" + operation + "?ref=" + url.QueryEscape(unescape(tail[1])) + "&path=" + url.QueryEscape(unescape(strings.Join(tail[2:], "/")))
			}
			return root
		case "cherry-pick", "_cherrypick":
			if len(tail) >= 2 {
				values := url.Values{"sha": {tail[1]}}
				if len(tail) >= 3 {
					values.Set("ref", unescape(strings.Join(tail[2:], "/")))
				}
				return root + "/cherry-pick?" + values.Encode()
			}
			return root
		case "search":
			if len(tail) >= 3 {
				return root + "/search?" + url.Values{"ref": {unescape(strings.Join(tail[2:], "/"))}, "type": {tail[1]}}.Encode()
			}
		case "find":
			// "Go to file": /find/{type}/{ref}.
			if len(tail) >= 3 {
				return root + "/find?" + url.Values{"ref": {unescape(strings.Join(tail[2:], "/"))}, "type": {tail[1]}}.Encode()
			}
			return root + "/find"
		case "settings":
			if len(tail) == 2 && tail[1] == "actions" {
				return root + "/settings/actions/runners"
			}
		case "activity":
			if len(tail) == 2 && activityPeriods[tail[1]] {
				return root + "/activity?period=" + tail[1]
			}
		case "releases", "packages", "actions", "commit", "branches", "tags", "graph", "stars", "watchers", "forks", "fork", "labels", "milestones":
		case "milestone":
			tail[0] = "milestones"
		case "wiki":
			if len(tail) > 1 && (tail[1] == "commit" || tail[1] == "search") {
				return root + "/" + strings.Join(tail, "/")
			}
			if len(tail) > 1 {
				return root + "/wiki?page=" + url.QueryEscape(strings.Join(tail[1:], "/"))
			}
			return root + "/wiki"
		case "commits", "src", "blame":
			if len(tail) >= 3 {
				dest := root
				if tail[0] == "commits" {
					dest += "/history"
				}
				if tail[0] == "blame" {
					dest += "/blame"
				}
				return dest + "?ref=" + url.QueryEscape(unescape(tail[2])) + "&path=" + url.QueryEscape(unescape(strings.Join(tail[3:], "/"))) + "&type=" + url.QueryEscape(tail[1])
			}
			return root
		case "issues":
		case "pulls":
			tail[0] = "merge-requests"
			if destination := pullTab(root, tail); destination != "" {
				return destination
			}
		case "projects":
			tail[0] = "boards"
			if len(tail) == 3 && tail[2] == "edit" {
				return root + "/boards/" + url.PathEscape(unescape(tail[1])) + "/settings"
			}
		case "compare":
			comparison := unescape(strings.Join(tail[1:], "/"))
			target, source, triple := strings.Cut(comparison, "...")
			if !triple {
				var direct bool
				target, source, direct = strings.Cut(comparison, "..")
				if direct {
					return root + "/compare?" + url.Values{"target": {target}, "source": {source}, "method": {".."}}.Encode()
				}
				target, source = "", comparison
			}
			values := url.Values{}
			if target != "" {
				values.Set("target_branch", target)
			}
			if project, branch, cross := strings.Cut(source, ":"); cross {
				if strings.Contains(project, "/") {
					values.Set("source_project", project)
				} else {
					values.Set("source_owner", project)
				}
				source = branch
			}
			if source != "" {
				values.Set("source_branch", source)
			}
			result := root + "/merge-requests/new"
			if len(values) > 0 {
				result += "?" + values.Encode()
			}
			return result
		default:
			return "/not-found?path=" + url.QueryEscape(path)
		}
		for i := range tail {
			tail[i] = url.PathEscape(unescape(tail[i]))
		}
		return root + "/" + strings.Join(tail, "/")
	}
	return "/not-found?path=" + url.QueryEscape(path)
}

var activityPeriods = map[string]bool{"daily": true, "halfweekly": true, "weekly": true, "monthly": true, "quarterly": true, "semiyearly": true, "yearly": true}

// pullTab maps /pulls/{n}/files[/{sha}|/{from}..{to}] and /pulls/{n}/commits[/{sha}]
// to merge request tabs. "commit" shows one commit; "to" without "from" shows
// the changes from the merge base up to that commit.
func pullTab(root string, tail []string) string {
	if len(tail) < 3 || len(tail) > 4 || strings.Trim(tail[1], "0123456789") != "" || tail[1] == "" {
		return ""
	}
	values := url.Values{}
	switch tail[2] {
	case "files":
		values.Set("tab", "changes")
		if len(tail) == 4 {
			if from, to, ok := strings.Cut(tail[3], ".."); ok {
				values.Set("from", from)
				values.Set("to", to)
			} else {
				values.Set("to", tail[3])
			}
		}
	case "commits":
		if len(tail) == 4 {
			values.Set("tab", "changes")
			values.Set("commit", tail[3])
		} else {
			values.Set("tab", "commits")
		}
	default:
		return ""
	}
	return root + "/merge-requests/" + tail[1] + "?" + values.Encode()
}

func unescape(value string) string {
	result, err := url.PathUnescape(value)
	if err != nil {
		return value
	}
	return result
}

// RouteRepositoryURL uses Forgejo's resolved reference to disambiguate branch
// names containing slashes from file paths. Only page-navigation calls this.
func RouteRepositoryURL(path, rawQuery, ref, treePath string) string {
	destination, _ := url.Parse(RouteURL(path, rawQuery))
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if destination == nil || len(parts) < 3 || ref == "" {
		return RouteURL(path, rawQuery)
	}
	switch parts[2] {
	case "src", "commits", "blame", "search", "_edit", "_new", "_upload", "_delete", "_diffpatch", "_cherrypick", "cherry-pick":
		values := destination.Query()
		// Native commit search: /commits/{type}/{ref}/search?q= (RefCommits).
		if parts[2] == "commits" && treePath == "search" {
			values.Del("path")
			values.Set("ref", ref)
			if all, _ := strconv.ParseBool(values.Get("all")); all || strings.EqualFold(values.Get("all"), "on") {
				values.Set("all", "true")
			} else {
				values.Del("all")
			}
			destination.RawQuery = values.Encode()
			return destination.String()
		}
		values.Set("ref", ref)
		if parts[2] != "search" && parts[2] != "cherry-pick" && parts[2] != "_cherrypick" {
			values.Set("path", treePath)
		}
		destination.RawQuery = values.Encode()
	}
	return destination.String()
}
