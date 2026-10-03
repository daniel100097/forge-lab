// Copyright 2026 The Forgejo UI Authors.
// SPDX-License-Identifier: MIT
package spapages

import (
	activities_model "forgejo.org/models/activities"
	issues_model "forgejo.org/models/issues"
	repo_model "forgejo.org/models/repo"
	code_indexer "forgejo.org/modules/indexer/code"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
	"net/http"
)

// Activity serializes values already selected and permission-filtered by the
// native dashboard, notification, and code-search handlers.
func Activity(ctx *context.Context, kind string, total int) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"kind": kind, "total": total, "page_size": setting.UI.IssuePagingNum}
	if ctx.ContextUser != nil {
		data["profile"] = person(ctx, ctx.ContextUser)
	}
	if ctx.Org != nil {
		data["teams"] = spaui.SelectedList(ctx.Org.Teams, "id:ID", "name:Name")
	}
	data["organizations"] = spaui.SelectedList(ctx.Data["Orgs"], "id:ID", "name:Name")
	switch kind {
	case "dashboard":
		data["page_size"] = setting.UI.FeedPagingNum
		data["heatmap"] = ctx.Data["HeatmapData"]
		data["contributions"] = ctx.Data["HeatmapTotalContributions"]
		items := make([]map[string]any, 0)
		if actions, ok := ctx.Data["Feeds"].(activities_model.ActionList); ok {
			for _, a := range actions {
				if a.Repo != nil {
					items = append(items, map[string]any{"id": a.ID, "type": a.OpType, "actor": a.GetActUserName(ctx), "repository": a.Repo.FullName(), "ref": a.RefName, "content": a.Content, "created_at": a.CreatedUnix.AsTime()})
				}
			}
		}
		data["items"] = items
	case "issues", "subscriptions":
		items, _ := ctx.Data["Issues"].(issues_model.IssueList)
		data["items"] = convert.ToIssueList(ctx, ctx.Doer, items)
		data["projects"] = spaui.SelectedList(ctx.Data["Projects"], "id:ID", "title:Title")
		data["type"] = ctx.Data["ViewType"]
		data["stats"] = spaui.Selected(ctx.Data["IssueStats"], "open:OpenCount", "closed:ClosedCount")
	case "watching":
		data["items"] = repositories(ctx, ctx.Data["Repos"])
		data["page_size"] = setting.UI.User.RepoPagingNum
	case "milestones":
		data["items"] = spaui.SelectedList(ctx.Data["Milestones"], "id:ID", "title:Name", "description:Content", "description_html:RenderedContent", "closed:IsClosed", "repository_owner:Repo.OwnerName", "repository:Repo.Name", "deadline:DeadlineUnix", "issues:NumIssues", "closed_issues:NumClosedIssues")
		data["repositories"] = repositories(ctx, ctx.Data["Repos"])
		data["stats"] = spaui.Selected(ctx.Data["MilestoneStats"], "open:OpenCount", "closed:ClosedCount")
	case "code-disabled":
		data["enabled"] = false
	case "code":
		data["enabled"] = true
		data["unavailable"] = ctx.Data["CodeIndexerUnavailable"] == true
		data["page_size"] = setting.UI.RepoSearchPagingNum
		data["mode"] = ctx.Data["CodeSearchMode"]
		data["modes"] = ctx.Data["CodeSearchOptions"]
		data["languages"] = spaui.SelectedList(ctx.Data["SearchResultLanguages"], "name:Language", "count:Count")
		repos, _ := ctx.Data["RepoMaps"].(map[int64]*repo_model.Repository)
		items := make([]map[string]any, 0)
		if results, ok := ctx.Data["SearchResults"].(code_indexer.Results); ok {
			for _, result := range results {
				repo := repos[result.RepoID]
				if repo == nil {
					continue
				}
				lines := make([]map[string]any, 0, len(result.Lines))
				for _, line := range result.Lines {
					lines = append(lines, map[string]any{"number": line.Num, "html": line.FormattedContent})
				}
				items = append(items, map[string]any{"repository": repo.FullName(), "path": result.Filename, "sha": result.CommitID, "language": result.Language, "lines": lines})
			}
		}
		data["items"] = items
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
