// SPDX-License-Identifier: GPL-3.0-or-later
package spa

import (
	"encoding/json"
	"fmt"
	"forgejo.org/models/db"
	issues_model "forgejo.org/models/issues"
	org_model "forgejo.org/models/organization"
	"forgejo.org/models/perm"
	access_model "forgejo.org/models/perm/access"
	project_model "forgejo.org/models/project"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
)

func reactionUI(ctx *context.Context, values issues_model.ReactionList) []map[string]any {
	result := make([]map[string]any, 0)
	grouped := map[string]map[string]any{}
	for _, reaction := range values {
		row, ok := grouped[reaction.Type]
		if !ok {
			row = map[string]any{"type": reaction.Type, "count": 0, "selected": false}
			grouped[reaction.Type] = row
			result = append(result, row)
		}
		row["count"] = row["count"].(int) + 1
		if ctx.IsSigned && reaction.UserID == ctx.Doer.ID {
			row["selected"] = true
		}
	}
	return result
}
func attachmentUI(repo *repo_model.Repository, values []*repo_model.Attachment) []any {
	result := make([]any, 0, len(values))
	for _, file := range values {
		result = append(result, convert.ToWebAttachment(repo, file))
	}
	return result
}
func visibleReferencedIssue(ctx *context.Context, id int64) (*issues_model.Issue, error) {
	issue, err := issues_model.GetIssueByID(ctx, id)
	if issues_model.IsErrIssueNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err = issue.LoadRepo(ctx); err != nil {
		return nil, err
	}
	permission, err := access_model.GetUserRepoPermission(ctx, issue.Repo, ctx.Doer)
	if err != nil {
		return nil, err
	}
	if !permission.CanReadIssuesOrPulls(issue.IsPull) {
		return nil, nil
	}
	return issue, nil
}

// issueTimeline follows native visibility for cross-references, dependencies and
// unpublished reviews. Counts and pagination include only visible entries.
func issueTimeline(ctx *context.Context, issue *issues_model.Issue) ([]map[string]any, int, int, error) {
	comments := issue.Comments
	if err := comments.LoadReactions(ctx, ctx.Repo.Repository); err != nil {
		return nil, 0, 0, err
	}
	result := make([]map[string]any, 0, len(comments))
	sources := make([]*issues_model.Comment, 0, len(comments))
	canManage := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWriteIssuesOrPulls(issue.IsPull)
	threadRoots := make(map[int64]bool)
	anchorID := ctx.FormInt64("comment_id")
	if issue.IsPull {
		if err := issue.LoadPullRequest(ctx); err != nil {
			return nil, 0, 0, err
		}
		head, err := ctx.Repo.GitRepo.GetRefCommitID(issue.PullRequest.GetGitRefName())
		if err == nil {
			conversations, err := issues_model.FetchCodeConversations(ctx, issue, ctx.Doer, true, head)
			if err != nil {
				return nil, 0, 0, err
			}
			for _, lines := range conversations {
				for _, groups := range lines {
					for _, entries := range groups {
						if len(entries) > 0 {
							threadRoots[entries[0].ID] = true
							for _, entry := range entries {
								if entry.ID == anchorID && (entry.Review == nil || entry.Review.Type != issues_model.ReviewTypePending) {
									anchorID = entries[0].ID
									break
								}
							}
						}
					}
				}
			}
		}
	}
	for _, c := range comments {
		if c.Type == issues_model.CommentTypeAggregator || (c.Type == issues_model.CommentTypeCode && !threadRoots[c.ID]) {
			continue
		}
		if c.ReviewID != 0 {
			if err := c.LoadReview(ctx); err != nil && !issues_model.IsErrReviewNotExist(err) {
				return nil, 0, 0, err
			}
		}
		if c.Review != nil && c.Review.Type == issues_model.ReviewTypePending {
			continue
		}
		if issues_model.CommentTypeIsRef(c.Type) && c.RefRepoID != 0 && c.RefRepoID != issue.RepoID {
			repo, err := repo_model.GetRepositoryByID(ctx, c.RefRepoID)
			if repo_model.IsErrRepoNotExist(err) {
				continue
			}
			if err != nil {
				return nil, 0, 0, err
			}
			permission, err := access_model.GetUserRepoPermission(ctx, repo, ctx.Doer)
			if err != nil {
				return nil, 0, 0, err
			}
			if !permission.CanReadIssuesOrPulls(c.RefIsPull) {
				continue
			}
		}
		var reference *issues_model.Issue
		if c.RefIssueID != 0 {
			var err error
			reference, err = visibleReferencedIssue(ctx, c.RefIssueID)
			if err != nil {
				return nil, 0, 0, err
			}
			if reference == nil {
				continue
			}
		}
		if c.DependentIssueID != 0 {
			var err error
			reference, err = visibleReferencedIssue(ctx, c.DependentIssueID)
			if err != nil {
				return nil, 0, 0, err
			}
			if reference == nil {
				continue
			}
		}
		user, avatar := c.OriginalAuthor, ""
		if c.Poster != nil {
			user = c.Poster.Name
			avatar = c.Poster.AvatarLink(ctx)
		}
		row := map[string]any{"id": c.ID, "type": c.Type, "event": c.Type.String(), "body": c.Content, "content_version": c.ContentVersion, "created_at": c.CreatedUnix.AsTime(), "user": map[string]any{"login": user, "avatar_url": avatar}, "old_title": c.OldTitle, "new_title": c.NewTitle, "old_ref": c.OldRef, "new_ref": c.NewRef, "can_edit": c.Type.HasContentSupport() && ctx.IsSigned && !ctx.Repo.Repository.IsArchived && (canManage || c.PosterID == ctx.Doer.ID || ctx.IsUserSiteAdmin()), "reactions": reactionUI(ctx, c.Reactions), "attachments": attachmentUI(ctx.Repo.Repository, c.Attachments)}
		row["can_report"] = c.Type.HasContentSupport() && ctx.IsSigned && setting.Moderation.Enabled && c.PosterID != ctx.Doer.ID
		if c.Type == issues_model.CommentTypeCode {
			row["thread_id"] = c.ID
		}
		if c.Review != nil {
			row["review_type"] = c.Review.Type
		}
		if c.LabelID != 0 {
			if err := c.LoadLabel(ctx); err != nil {
				return nil, 0, 0, err
			}
			if c.Label != nil {
				row["label"] = c.Label.Name
				row["removed"] = c.Content != "1"
				row["body"] = ""
			}
		}
		if c.Type == issues_model.CommentTypePullRequestPush {
			row["body"] = ""
			var push issues_model.PushActionContent
			if json.Unmarshal([]byte(c.Content), &push) == nil {
				row["commits"] = push.CommitIDs
				row["force_push"] = push.IsForcePush
			}
		}
		if c.Type == issues_model.CommentTypeProject {
			if err := c.LoadProject(ctx); err != nil {
				return nil, 0, 0, err
			}
			if c.Project != nil {
				row["project"] = c.Project.Title
			}
			if c.OldProject != nil {
				row["old_project"] = c.OldProject.Title
			}
		}
		if c.Milestone != nil {
			row["milestone"] = c.Milestone.Name
		}
		if c.OldMilestone != nil {
			row["old_milestone"] = c.OldMilestone.Name
		}
		if (c.Type == issues_model.CommentTypeAssignees || c.Type == issues_model.CommentTypeReviewRequest) && c.Assignee != nil {
			row["assignee"] = c.Assignee.Name
			row["removed"] = c.RemovedAssignee
		}
		if reference != nil {
			row["reference"] = map[string]any{"title": reference.Title, "url": reference.Link(), "number": reference.Index}
		}
		result = append(result, row)
		sources = append(sources, c)
	}
	count := len(result)
	visibleIDs := make([]int64, len(sources))
	for index, source := range sources {
		visibleIDs[index] = source.ID
	}
	page := spaui.TimelinePage(visibleIDs, ctx.FormInt("page"), anchorID)
	start := min((page-1)*50, count)
	end := min(start+50, count)
	timelineMarkup(ctx, result[start:end], sources[start:end])
	return result[start:end], count, page, nil
}
func issueLifecycle(ctx *context.Context, issue *issues_model.Issue) (map[string]any, error) {
	canManage := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWriteIssuesOrPulls(issue.IsPull)
	result := map[string]any{"locked": issue.IsLocked, "pinned": issue.IsPinned(), "can_manage": canManage, "can_admin": ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.IsAdmin(), "can_react": ctx.IsSigned && !ctx.Repo.Repository.IsArchived, "reaction_options": setting.UI.Reactions, "reactions": reactionUI(ctx, issue.Reactions), "lock_reasons": setting.Repository.Issue.LockReasons, "attachments_enabled": setting.Attachment.Enabled, "attachments": attachmentUI(ctx.Repo.Repository, issue.Attachments), "reference": issue.Ref, "can_edit_ref": !issue.IsPull && ctx.IsSigned && !ctx.Repo.Repository.IsArchived && (canManage || issue.PosterID == ctx.Doer.ID)}
	if ctx.IsSigned {
		watching, err := issues_model.CheckIssueWatch(ctx, ctx.Doer, issue)
		if err != nil {
			return nil, err
		}
		result["watching"] = watching
	}
	projects := make([]map[string]any, 0)
	if !unit.TypeProjects.UnitGlobalDisabled() {
		var values []*project_model.Project
		if ctx.Repo.CanRead(unit.TypeProjects) {
			var err error
			values, err = db.Find[project_model.Project](ctx, project_model.SearchOptions{RepoID: issue.RepoID, Type: project_model.TypeRepository})
			if err != nil {
				return nil, err
			}
		}
		ownerRead := ctx.IsSigned && ctx.Doer.ID == ctx.Repo.Owner.ID
		kind := project_model.TypeIndividual
		if ctx.Repo.Owner.IsOrganization() {
			kind = project_model.TypeOrganization
			ownerRead = (*org_model.Organization)(ctx.Repo.Owner).UnitPermission(ctx, ctx.Doer, unit.TypeProjects) >= perm.AccessModeRead
		}
		if ownerRead {
			owners, err := db.Find[project_model.Project](ctx, project_model.SearchOptions{OwnerID: ctx.Repo.Owner.ID, Type: kind})
			if err != nil {
				return nil, err
			}
			values = append(values, owners...)
		}
		if err := issue.LoadProject(ctx); err != nil {
			return nil, err
		}
		for _, p := range values {
			projects = append(projects, map[string]any{"id": p.ID, "title": p.Title, "closed": p.IsClosed, "url": p.Link(ctx)})
			if issue.Project != nil && p.ID == issue.Project.ID {
				result["project_id"] = p.ID
			}
		}
	}
	result["projects"] = projects
	participants := make([]map[string]any, 0)
	seen := make(map[int64]bool)
	if err := issue.LoadPoster(ctx); err != nil {
		return nil, err
	}
	if err := issue.LoadComments(ctx); err != nil {
		return nil, err
	}
	if err := issue.Comments.LoadPosters(ctx); err != nil {
		return nil, err
	}
	if err := issue.Comments.LoadReviews(ctx); err != nil {
		return nil, err
	}
	for _, person := range append([]*user_model.User{issue.Poster}, issueParticipantUsers(issue.Comments)...) {
		if person != nil && !seen[person.ID] && person.ID > 0 {
			seen[person.ID] = true
			participants = append(participants, map[string]any{"login": person.Name, "avatar_url": person.AvatarLink(ctx), "url": person.HomeLink()})
		}
	}
	result["participants"] = participants
	return result, nil
}
func issueParticipantUsers(comments issues_model.CommentList) []*user_model.User {
	users := make([]*user_model.User, 0)
	for _, comment := range comments {
		if (comment.Type == issues_model.CommentTypeComment || comment.Type == issues_model.CommentTypeReview || comment.Type == issues_model.CommentTypePullRequestPush || comment.Type.HasContentSupport()) && (comment.Review == nil || comment.Review.Type != issues_model.ReviewTypePending) {
			users = append(users, comment.Poster)
		}
	}
	return users
}
func issueLifecycleError(ctx *context.Context, err error) bool {
	if err != nil {
		ctx.ServerError("Issue lifecycle", fmt.Errorf("load issue presentation: %w", err))
		return true
	}
	return false
}
