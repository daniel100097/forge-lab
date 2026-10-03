// SPDX-License-Identifier: GPL-3.0-or-later
package spa

import (
	"net/http"
	"time"

	activities_model "forgejo.org/models/activities"
	"forgejo.org/models/db"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/services/context"
)

// RepositoryPeople uses the native list helpers, including their private-fork
// visibility checks, and exposes presentation fields rather than user models.
func RepositoryPeople(ctx *context.Context) {
	r := ctx.Repo.Repository
	page := max(1, ctx.FormInt("page"))
	opts := db.ListOptions{Page: page, PageSize: 30}
	items := make([]map[string]any, 0)
	total := r.NumStars
	if ctx.Params(":people") == "forks" {
		forks, count, err := repo_model.GetForks(ctx, r, ctx.Doer, opts)
		if err != nil {
			ctx.ServerError("Forks", err)
			return
		}
		for _, fork := range forks {
			if err := fork.LoadOwner(ctx); err != nil {
				ctx.ServerError("ForkOwner", err)
				return
			}
			items = append(items, map[string]any{"id": fork.ID, "name": fork.Name, "full_name": fork.FullName(), "description": fork.Description, "avatar_url": fork.AvatarLink(ctx), "private": fork.IsPrivate, "updated_at": fork.UpdatedUnix.AsTime()})
		}
		ctx.JSON(http.StatusOK, map[string]any{"items": items, "total": count, "page": page})
		return
	}
	var users []*user_model.User
	var err error
	if ctx.Params(":people") == "watchers" {
		users, err = repo_model.GetRepoWatchers(ctx, r.ID, opts)
		total = r.NumWatches
	} else {
		users, err = repo_model.GetStargazers(ctx, r, opts)
	}
	if err != nil {
		ctx.ServerError("RepositoryUsers", err)
		return
	}
	for _, user := range users {
		items = append(items, map[string]any{"id": user.ID, "username": user.Name, "name": user.DisplayName(), "avatar_url": user.AvatarLink(ctx)})
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": items, "total": total, "page": page})
}

func RepositoryActivity(ctx *context.Context) {
	r := ctx.Repo.Repository
	now := time.Now()
	period := ctx.FormString("period")
	from := now.Add(-7 * 24 * time.Hour)
	switch period {
	case "daily":
		from = now.Add(-24 * time.Hour)
	case "halfweekly":
		from = now.Add(-72 * time.Hour)
	case "monthly":
		from = now.AddDate(0, -1, 0)
	case "quarterly":
		from = now.AddDate(0, -3, 0)
	case "semiyearly":
		from = now.AddDate(0, -6, 0)
	case "yearly":
		from = now.AddDate(-1, 0, 0)
	default:
		period = "weekly"
	}
	canRead := func(u unit.Type) bool { return !u.UnitGlobalDisabled() && ctx.Repo.CanRead(u) }
	stats, err := activities_model.GetActivityStats(ctx, r, from, canRead(unit.TypeReleases), canRead(unit.TypeIssues), canRead(unit.TypePullRequests), canRead(unit.TypeCode) && !r.IsEmpty)
	if err != nil {
		ctx.ServerError("Activity", err)
		return
	}
	items := make([]map[string]any, 0)
	for _, issue := range stats.OpenedIssues {
		items = append(items, map[string]any{"kind": "issue", "event": "opened", "number": issue.Index, "title": issue.Title, "date": issue.CreatedUnix.AsTime()})
	}
	for _, issue := range stats.ClosedIssues {
		items = append(items, map[string]any{"kind": "issue", "event": "closed", "number": issue.Index, "title": issue.Title, "date": issue.ClosedUnix.AsTime()})
	}
	for _, pull := range stats.MergedPRs {
		if pull.Issue != nil {
			items = append(items, map[string]any{"kind": "pull", "event": "merged", "number": pull.Issue.Index, "title": pull.Issue.Title, "date": pull.MergedUnix.AsTime()})
		}
	}
	for _, pull := range stats.OpenedPRs {
		if pull.Issue != nil {
			items = append(items, map[string]any{"kind": "pull", "event": "opened", "number": pull.Issue.Index, "title": pull.Issue.Title, "date": pull.Issue.CreatedUnix.AsTime()})
		}
	}
	authors := []*activities_model.ActivityAuthorData{}
	if canRead(unit.TypeCode) && !r.IsEmpty {
		authors, err = activities_model.GetActivityStatsTopAuthors(ctx, r, from, 10)
		if err != nil {
			ctx.ServerError("ActivityAuthors", err)
			return
		}
	}
	// Published releases and unresolved conversations, as on the native page.
	released := make([]map[string]any, 0, len(stats.PublishedReleases))
	for _, release := range stats.PublishedReleases {
		released = append(released, map[string]any{"tag": release.TagName, "title": release.Title, "tag_only": release.IsTag, "prerelease": release.IsPrerelease, "date": release.CreatedUnix.AsTime()})
	}
	unresolved := make([]map[string]any, 0, len(stats.UnresolvedIssues))
	for _, issue := range stats.UnresolvedIssues {
		unresolved = append(unresolved, map[string]any{"number": issue.Index, "title": issue.Title, "pull": issue.IsPull, "date": issue.UpdatedUnix.AsTime()})
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"period": period, "from": from, "until": now, "items": items, "authors": authors, "opened_issues": len(stats.OpenedIssues), "closed_issues": len(stats.ClosedIssues), "opened_pulls": len(stats.OpenedPRs), "merged_pulls": len(stats.MergedPRs), "releases": len(stats.PublishedReleases), "commits": stats.Code.CommitCount, "contributors": stats.Code.AuthorCount, "changed_files": stats.Code.ChangedFiles, "additions": stats.Code.Additions, "deletions": stats.Code.Deletions,
		"commits_all_branches": stats.Code.CommitCountInAllBranches, "released": released, "unresolved": unresolved,
		"release_authors": stats.PublishedReleaseAuthorCount, "merged_pull_authors": stats.MergedPRAuthorCount, "opened_pull_authors": stats.OpenedPRAuthorCount,
		"closed_issue_authors": stats.ClosedIssueAuthorCount, "opened_issue_authors": stats.OpenedIssueAuthorCount,
		"can_read": map[string]bool{"code": canRead(unit.TypeCode), "issues": canRead(unit.TypeIssues), "pulls": canRead(unit.TypePullRequests), "releases": canRead(unit.TypeReleases)},
	})
}
