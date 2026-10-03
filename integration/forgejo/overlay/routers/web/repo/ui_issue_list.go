// SPDX-License-Identifier: GPL-3.0-or-later
package repo

import (
	"net/http"

	"forgejo.org/models/db"
	issues_model "forgejo.org/models/issues"
	"forgejo.org/modules/optional"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
	"xorm.io/builder"
)

// writeIssueListUI serializes the normal list only after its native unit,
// permission, indexer, filter and related-project lookups have completed.
func writeIssueListUI(ctx *context.Context, pulls bool) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	if ctx.Data["IssueIndexerUnavailable"] == true {
		ctx.JSON(http.StatusServiceUnavailable, map[string]string{"errorMessage": "Issue search is temporarily unavailable."})
		return true
	}
	items, _ := ctx.Data["Issues"].(issues_model.IssueList)
	pinned, _ := ctx.Data["PinnedIssues"].(issues_model.IssueList)
	stats, _ := ctx.Data["IssueStats"].(*issues_model.IssueStats)
	if stats == nil {
		stats = &issues_model.IssueStats{}
	}
	state, _ := ctx.Data["State"].(string)
	counts := map[string]int64{"open": stats.OpenCount, "closed": stats.ClosedCount, "all": stats.OpenCount + stats.ClosedCount}
	page := max(1, ctx.FormInt("page"))
	total := counts[state]
	if pulls {
		// Forgejo's closed list contains both merged and unmerged requests. Keep
		// GitLab's separate tabs without filtering a paginated browser result.
		closedOptions := issueListClosedOptions(ctx)
		keyword, _ := ctx.Data["Keyword"].(string)
		noMatches := false
		if keyword != "" {
			ids, _, err := issueIDsFromSearch(ctx, keyword, closedOptions)
			if err != nil {
				ctx.ServerError("IssueListSearch", err)
				return true
			}
			closedOptions.IssueIDs, noMatches = ids, len(ids) == 0
		}
		for _, merged := range []bool{true, false} {
			key := "closed"
			if merged {
				key = "merged"
			}
			closedOptions.RepoIDs = nil
			closedOptions.RepoCond = builder.Eq{"issue.repo_id": ctx.Repo.Repository.ID}.And(builder.In("issue.id", builder.Select("issue_id").From("pull_request").Where(builder.Eq{"base_repo_id": ctx.Repo.Repository.ID, "has_merged": merged})))
			if noMatches {
				counts[key] = 0
			} else {
				count, err := issues_model.CountIssues(ctx, closedOptions)
				if err != nil {
					ctx.ServerError("IssueListCount", err)
					return true
				}
				counts[key] = count
			}
			if state == "closed" && ctx.FormBool("merged") == merged {
				total = counts[key]
				if total == 0 {
					items = issues_model.IssueList{}
				} else {
					closedOptions.Paginator = &db.ListOptions{Page: page, PageSize: setting.UI.IssuePagingNum}
					var err error
					items, err = issues_model.Issues(ctx, closedOptions)
					closedOptions.Paginator = nil
					if err != nil {
						ctx.ServerError("IssueListClosed", err)
						return true
					}
					if err = items.LoadAttributes(ctx); err != nil {
						ctx.ServerError("IssueListAttributes", err)
						return true
					}
				}
			}
		}
	}
	canWrite := ctx.IsSigned && ctx.Repo.CanWriteIssuesOrPulls(pulls) && !ctx.Repo.Repository.IsArchived
	canCreate := ctx.IsSigned && !ctx.Repo.Repository.IsArchived
	if pulls {
		canCreate = canCreate && ctx.Repo.PullRequest.Allowed
	}
	labelOptions := make([]map[string]any, 0)
	if labels, ok := ctx.Data["Labels"].([]*issues_model.Label); ok {
		for _, label := range labels {
			labelOptions = append(labelOptions, map[string]any{"id": label.ID, "name": label.Name, "color": label.Color, "archived": label.IsArchived(), "exclusive": label.Exclusive})
		}
	}
	data := map[string]any{
		"items": convert.ToIssueList(ctx, ctx.Doer, items), "pinned": convert.ToIssueList(ctx, ctx.Doer, pinned),
		"counts": counts, "total": total, "page": page, "page_size": setting.UI.IssuePagingNum,
		"can_bulk": canWrite, "can_admin": ctx.Data["IsRepoAdmin"] == true && !ctx.Repo.Repository.IsArchived, "can_create": canCreate, "signed_in": ctx.IsSigned,
		"labels":       labelOptions,
		"milestones":   append(spaui.SelectedList(ctx.Data["OpenMilestones"], "id:ID", "name:Name"), spaui.SelectedList(ctx.Data["ClosedMilestones"], "id:ID", "name:Name")...),
		"projects":     append(spaui.SelectedList(ctx.Data["OpenProjects"], "id:ID", "name:Title"), spaui.SelectedList(ctx.Data["ClosedProjects"], "id:ID", "name:Title")...),
		"assignees":    spaui.SelectedList(ctx.Data["Assignees"], "id:ID", "name:Name", "full_name:FullName"),
		"tracked_time": ctx.Data["TotalTrackedTime"], "state": state, "sort": ctx.Data["SortType"],
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

func issueListClosedOptions(ctx *context.Context) *issues_model.IssuesOptions {
	labels, _ := ctx.Data["SelLabelIDs"].([]int64)
	sort, _ := ctx.Data["SortType"].(string)
	opts := &issues_model.IssuesOptions{RepoIDs: []int64{ctx.Repo.Repository.ID}, IsPull: optional.Some(true), IsClosed: optional.Some(true), LabelIDs: labels, SortType: sort, ProjectID: ctx.FormInt64("project"), AssigneeID: ctx.FormInt64("assignee"), PosterID: ctx.FormInt64("poster"), User: ctx.Doer}
	if milestone := ctx.FormInt64("milestone"); milestone != 0 {
		opts.MilestoneIDs = []int64{milestone}
	}
	if ctx.IsSigned {
		switch ctx.FormString("type") {
		case "created_by":
			opts.PosterID = ctx.Doer.ID
		case "assigned":
			opts.AssigneeID = ctx.Doer.ID
		case "mentioned":
			opts.MentionedID = ctx.Doer.ID
		case "review_requested":
			opts.ReviewRequestedID = ctx.Doer.ID
		case "reviewed_by":
			opts.ReviewedID = ctx.Doer.ID
		}
	}
	return opts
}
