// Copyright 2026 The Forgejo UI Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"net/http"
	"strconv"
	"strings"

	"forgejo.org/models/db"
	issues_model "forgejo.org/models/issues"
	access_model "forgejo.org/models/perm/access"
	project_model "forgejo.org/models/project"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	"forgejo.org/modules/optional"
	repo_module "forgejo.org/modules/repository"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
	"xorm.io/builder"
)

func issueUnits(ctx *context.Context) (bool, bool) {
	return !unit.TypeIssues.UnitGlobalDisabled() && ctx.Repo.CanRead(unit.TypeIssues),
		!unit.TypePullRequests.UnitGlobalDisabled() && ctx.Repo.CanRead(unit.TypePullRequests) && ctx.Repo.Repository.CanEnablePulls()
}

func issueManagementReader(ctx *context.Context) bool {
	issues, pulls := issueUnits(ctx)
	if !issues && !pulls {
		ctx.NotFound("Issue management", nil)
		return false
	}
	return true
}

func issueManagementWriter(ctx *context.Context) bool {
	return ctx.IsSigned && !ctx.Repo.Repository.IsArchived &&
		(ctx.Repo.CanWriteIssuesOrPulls(false) || ctx.Repo.CanWriteIssuesOrPulls(true))
}

func issueLabelData(label *issues_model.Label) map[string]any {
	return map[string]any{"id": label.ID, "name": label.Name, "description": label.Description,
		"color": label.Color, "exclusive": label.Exclusive, "archived": label.IsArchived(),
		"organization": label.OrgID != 0, "open_count": label.NumIssues - label.NumClosedIssues, "closed_count": label.NumClosedIssues}
}

func issueLabels(ctx *context.Context) ([]map[string]any, error) {
	labels, err := issues_model.GetLabelsByRepoID(ctx, ctx.Repo.Repository.ID, ctx.FormString("sort"), db.ListOptions{})
	if err != nil {
		return nil, err
	}
	if ctx.Repo.Owner.IsOrganization() {
		orgLabels, err := issues_model.GetLabelsByOrgID(ctx, ctx.Repo.Owner.ID, ctx.FormString("sort"), db.ListOptions{})
		if err != nil {
			return nil, err
		}
		labels = append(labels, orgLabels...)
	}
	result := make([]map[string]any, 0, len(labels))
	for _, label := range labels {
		row := issueLabelData(label)
		if label.OrgID != 0 {
			for _, closed := range []bool{false, true} {
				count, err := issues_model.CountIssues(ctx, &issues_model.IssuesOptions{RepoIDs: []int64{ctx.Repo.Repository.ID}, LabelIDs: []int64{label.ID}, IsClosed: optional.Some(closed)})
				if err != nil {
					return nil, err
				}
				if closed {
					row["closed_count"] = count
				} else {
					row["open_count"] = count
				}
			}
		}
		result = append(result, row)
	}
	return result, nil
}

// IssueLabels exposes selected label fields, including inherited organization
// labels. Mutations remain on the native /labels routes.
func IssueLabels(ctx *context.Context) {
	if !issueManagementReader(ctx) {
		return
	}
	labels, err := issueLabels(ctx)
	if err != nil {
		ctx.ServerError("Labels", err)
		return
	}
	templates := make([]map[string]string, 0, len(repo_module.LabelTemplateFiles))
	for _, item := range repo_module.LabelTemplateFiles {
		templates = append(templates, map[string]string{"name": item.DisplayName, "description": item.Description})
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": labels, "templates": templates, "can_write": issueManagementWriter(ctx)})
}

func milestoneData(item *issues_model.Milestone) map[string]any {
	return map[string]any{"id": item.ID, "title": item.Name, "description": item.Content,
		"closed": item.IsClosed, "due_date": item.DeadlineString, "total": item.NumIssues,
		"completed": item.NumClosedIssues, "progress": item.Completeness, "open_count": item.NumOpenIssues, "closed_count": item.NumClosedIssues, "overdue": item.IsOverdue,
		"created_at": item.CreatedUnix.AsTime(), "updated_at": item.UpdatedUnix.AsTime()}
}

func IssueMilestones(ctx *context.Context) {
	if !issueManagementReader(ctx) {
		return
	}
	closed := optional.Some(ctx.FormString("state") == "closed")
	if ctx.FormString("state") == "all" {
		closed = optional.None[bool]()
	}
	items, total, err := db.FindAndCount[issues_model.Milestone](ctx, issues_model.FindMilestoneOptions{
		ListOptions: db.ListOptions{Page: max(1, ctx.FormInt("page")), PageSize: 30},
		RepoID:      ctx.Repo.Repository.ID, IsClosed: closed, SortType: ctx.FormString("sort"), Name: ctx.FormTrim("q"),
	})
	if err != nil {
		ctx.ServerError("Milestones", err)
		return
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		row := milestoneData(item)
		row["description_html"] = renderComment(ctx, nil, item.Content)
		result = append(result, row)
	}
	stats, err := issues_model.GetMilestonesStatsByRepoCondAndKw(ctx, builder.Eq{"id": ctx.Repo.Repository.ID}, ctx.FormTrim("q"))
	if err != nil {
		ctx.ServerError("Milestone statistics", err)
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": result, "total": total, "can_write": issueManagementWriter(ctx), "open_count": stats.OpenCount, "closed_count": stats.ClosedCount})
}

func IssueMilestone(ctx *context.Context) {
	if !issueManagementReader(ctx) {
		return
	}
	item, err := issues_model.GetMilestoneByRepoID(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":id"))
	if err != nil {
		ctx.NotFoundOrServerError("Milestone", issues_model.IsErrMilestoneNotExist, err)
		return
	}
	opts := &issues_model.IssuesOptions{Paginator: &db.ListOptions{Page: max(1, ctx.FormInt("page")), PageSize: 30},
		RepoIDs: []int64{ctx.Repo.Repository.ID}, MilestoneIDs: []int64{item.ID}, SortType: ctx.FormString("sort"),
		AssigneeID: ctx.FormInt64("assignee"), PosterID: ctx.FormInt64("poster"), IsClosed: optional.Some(ctx.FormString("state") == "closed")}
	for _, value := range strings.Split(ctx.FormString("labels"), ",") {
		if labelID, err := strconv.ParseInt(value, 10, 64); err == nil {
			opts.LabelIDs = append(opts.LabelIDs, labelID)
		}
	}
	canIssues, canPulls := issueUnits(ctx)
	if !canIssues {
		opts.IsPull = optional.Some(true)
	}
	if !canPulls {
		opts.IsPull = optional.Some(false)
	}
	if ctx.FormString("state") == "all" {
		opts.IsClosed = optional.None[bool]()
	}
	items, err := issues_model.Issues(ctx, opts)
	if err != nil {
		ctx.ServerError("Milestone issues", err)
		return
	}
	total, err := issues_model.CountIssues(ctx, opts)
	if err != nil {
		ctx.ServerError("Milestone count", err)
		return
	}
	milestone := milestoneData(item)
	milestone["description_html"] = renderComment(ctx, nil, item.Content)
	statsOpts := *opts
	statsOpts.IsClosed = optional.None[bool]()
	stats, err := issues_model.GetIssueStats(ctx, &statsOpts)
	if err != nil {
		ctx.ServerError("Milestone issue statistics", err)
		return
	}
	labels, err := issueLabels(ctx)
	if err != nil {
		ctx.ServerError("Milestone labels", err)
		return
	}
	assignees, err := repo_model.GetRepoAssignees(ctx, ctx.Repo.Repository)
	if err != nil {
		ctx.ServerError("Milestone assignees", err)
		return
	}
	users := make([]map[string]any, 0, len(assignees))
	for _, user := range assignees {
		users = append(users, map[string]any{"id": user.ID, "name": user.Name})
	}
	authorOpts := *opts
	authorOpts.Paginator = nil
	authorOpts.IsClosed = optional.None[bool]()
	authorOpts.LabelIDs = nil
	authorOpts.PosterID = 0
	authorOpts.AssigneeID = 0
	authorItems, err := issues_model.Issues(ctx, &authorOpts)
	if err != nil {
		ctx.ServerError("Milestone authors", err)
		return
	}
	if err := authorItems.LoadPosters(ctx); err != nil {
		ctx.ServerError("Milestone authors", err)
		return
	}
	authors := make([]map[string]any, 0)
	seen := make(map[int64]bool)
	for _, issue := range authorItems {
		if issue.Poster != nil && !seen[issue.PosterID] {
			authors = append(authors, map[string]any{"id": issue.PosterID, "name": issue.Poster.Name})
			seen[issue.PosterID] = true
		}
	}
	ctx.JSON(http.StatusOK, map[string]any{"milestone": milestone,
		"items": convert.ToIssueList(ctx, ctx.Doer, items), "total": total, "can_write": issueManagementWriter(ctx),
		"labels": labels, "assignees": users, "authors": authors, "open_count": stats.OpenCount, "closed_count": stats.ClosedCount,
		"can_create_issue": ctx.IsSigned && canIssues && !ctx.Repo.Repository.IsArchived})
}

// IssueMetadata uses the issue's own unit and filters cross-project dependencies
// through the native permission service before returning their title or URL.
func IssueMetadata(ctx *context.Context) {
	item, err := issues_model.GetIssueWithAttrsByIndex(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":index"))
	if err != nil {
		ctx.NotFoundOrServerError("Issue", issues_model.IsErrIssueNotExist, err)
		return
	}
	canIssues, canPulls := issueUnits(ctx)
	if item.IsPull != (ctx.Params(":kind") == "pulls") || (item.IsPull && !canPulls) || (!item.IsPull && !canIssues) {
		ctx.NotFound("Issue", nil)
		return
	}
	labels, err := issueLabels(ctx)
	if err != nil {
		ctx.ServerError("Labels", err)
		return
	}
	milestones, err := db.Find[issues_model.Milestone](ctx, issues_model.FindMilestoneOptions{RepoID: ctx.Repo.Repository.ID})
	if err != nil {
		ctx.ServerError("Milestones", err)
		return
	}
	ms := make([]map[string]any, 0, len(milestones))
	for _, milestone := range milestones {
		ms = append(ms, milestoneData(milestone))
	}
	assignees, err := repo_model.GetRepoAssignees(ctx, ctx.Repo.Repository)
	if err != nil {
		ctx.ServerError("Assignees", err)
		return
	}
	users := make([]map[string]any, 0, len(assignees))
	for _, user := range assignees {
		valid, err := access_model.CanBeAssigned(ctx, user, ctx.Repo.Repository, item.IsPull)
		if err != nil {
			ctx.ServerError("Assignee permission", err)
			return
		}
		if valid {
			users = append(users, map[string]any{"id": user.ID, "name": user.Name, "avatar": user.AvatarLink(ctx)})
		}
	}
	canManage := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWriteIssuesOrPulls(item.IsPull)
	timeEnabled := ctx.Repo.Repository.IsTimetrackerEnabled(ctx)
	canTrack := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanUseTimetracker(ctx, item, ctx.Doer)
	times := make([]map[string]any, 0)
	var seconds int64
	if timeEnabled {
		tracked, err := issues_model.GetTrackedTimes(ctx, &issues_model.FindTrackedTimesOptions{IssueID: item.ID})
		if err != nil {
			ctx.ServerError("Tracked time", err)
			return
		}
		if err := tracked.LoadAttributes(ctx); err != nil {
			ctx.ServerError("Tracked users", err)
			return
		}
		for _, trackedTime := range tracked {
			seconds += trackedTime.Time
			times = append(times, map[string]any{"id": trackedTime.ID, "seconds": trackedTime.Time,
				"user": trackedTime.User.Name, "created_at": trackedTime.Created,
				"can_delete": canTrack && (ctx.Doer.ID == trackedTime.UserID || ctx.IsUserSiteAdmin())})
		}
	}
	dependencies := make([]map[string]any, 0)
	if ctx.Repo.Repository.IsDependenciesEnabled(ctx) {
		blocked, err := item.BlockedByDependencies(ctx, db.ListOptions{})
		if err != nil {
			ctx.ServerError("Blocked dependencies", err)
			return
		}
		blocking, err := item.BlockingDependencies(ctx)
		if err != nil {
			ctx.ServerError("Blocking dependencies", err)
			return
		}
		for _, group := range []struct {
			kind  string
			items []*issues_model.DependencyInfo
		}{{"blockedBy", blocked}, {"blocking", blocking}} {
			for _, dep := range group.items {
				permission, err := access_model.GetUserRepoPermission(ctx, dep.Issue.Repo, ctx.Doer)
				if err != nil {
					ctx.ServerError("Dependency permission", err)
					return
				}
				if !permission.CanReadIssuesOrPulls(dep.IsPull) {
					continue
				}
				if err := dep.Issue.Repo.LoadOwner(ctx); err != nil {
					ctx.ServerError("Dependency owner", err)
					return
				}
				dependencies = append(dependencies, map[string]any{"id": dep.Issue.ID, "number": dep.Index, "title": dep.Title,
					"closed": dep.IsClosed, "pull": dep.IsPull, "repository": dep.Issue.Repo.FullName(), "kind": group.kind})
			}
		}
	}
	labelIDs := make([]int64, 0, len(item.Labels))
	for _, label := range item.Labels {
		labelIDs = append(labelIDs, label.ID)
	}
	assigneeIDs := make([]int64, 0, len(item.Assignees))
	for _, user := range item.Assignees {
		assigneeIDs = append(assigneeIDs, user.ID)
	}
	dueDate := ""
	if !item.DeadlineUnix.IsZero() {
		dueDate = item.DeadlineUnix.FormatDate()
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"issue_id": item.ID, "content_version": item.ContentVersion, "label_ids": labelIDs, "assignee_ids": assigneeIDs, "milestone_id": item.MilestoneID,
		"due_date": dueDate, "labels": labels, "assignees": users, "milestones": ms, "can_manage": canManage,
		"time_enabled": timeEnabled, "can_track": canTrack, "times": times, "seconds": seconds,
		"stopwatch":            ctx.IsSigned && issues_model.StopwatchExists(ctx, ctx.Doer.ID, item.ID),
		"dependencies_enabled": ctx.Repo.Repository.IsDependenciesEnabled(ctx), "dependencies": dependencies,
		"can_manage_dependencies": canManage && ctx.Repo.CanCreateIssueDependencies(ctx, ctx.Doer, item.IsPull),
	})
}

func BoardConfiguration(ctx *context.Context) {
	if unit.TypeProjects.UnitGlobalDisabled() || !ctx.Repo.CanRead(unit.TypeProjects) {
		ctx.NotFound("Board", nil)
		return
	}
	item, err := project_model.GetProjectForRepoByID(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":id"))
	if err != nil {
		ctx.NotFound("Board", nil)
		return
	}
	columns, err := item.GetColumns(ctx)
	if err != nil {
		ctx.ServerError("Board columns", err)
		return
	}
	result := make([]map[string]any, 0, len(columns))
	for _, column := range columns {
		result = append(result, map[string]any{"id": column.ID, "title": column.Title, "color": column.Color, "default": column.Default})
	}
	ctx.JSON(http.StatusOK, map[string]any{"project": projectInfo(item), "card_type": item.CardType,
		"columns": result, "can_write": ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWrite(unit.TypeProjects)})
}
