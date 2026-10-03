// SPDX-License-Identifier: GPL-3.0-or-later
package spa

import (
	"net/http"
	"sort"

	actions_model "forgejo.org/models/actions"
	"forgejo.org/models/db"
	git_model "forgejo.org/models/git"
	issues_model "forgejo.org/models/issues"
	org_model "forgejo.org/models/organization"
	"forgejo.org/models/perm"
	access_model "forgejo.org/models/perm/access"
	pull_model "forgejo.org/models/pull"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	"forgejo.org/modules/git"

	"forgejo.org/modules/setting"
	actions_service "forgejo.org/services/actions"
	asymkey_service "forgejo.org/services/asymkey"
	"forgejo.org/services/context"
	"forgejo.org/services/gitdiff"
	issue_service "forgejo.org/services/issue"
	pull_service "forgejo.org/services/pull"

	"github.com/gobwas/glob"
)

// PullSources returns the visible fork network. Each entry is checked for code
// access; hidden/private sibling forks never appear in the source picker.
func PullSources(ctx *context.Context) {
	_, canPulls := issueUnits(ctx)
	if !canPulls {
		ctx.NotFound("Merge request", nil)
		return
	}
	base := ctx.Repo.Repository
	if base.ForkID != 0 {
		parent, err := repo_model.GetRepositoryByID(ctx, base.ForkID)
		if err == nil {
			permission, err := access_model.GetUserRepoPermission(ctx, parent, ctx.Doer)
			if err != nil {
				ctx.ServerError("Fork parent permission", err)
				return
			}
			if permission.CanRead(unit.TypeCode) {
				base = parent
			}
		}
	}
	forks, _, err := repo_model.GetForks(ctx, base, ctx.Doer, db.ListOptions{})
	if err != nil {
		ctx.ServerError("Fork network", err)
		return
	}
	candidates := append([]*repo_model.Repository{ctx.Repo.Repository, base}, forks...)
	seen := make(map[int64]bool)
	items := make([]map[string]any, 0)
	for _, candidate := range candidates {
		if seen[candidate.ID] {
			continue
		}
		seen[candidate.ID] = true
		permission, err := access_model.GetUserRepoPermission(ctx, candidate, ctx.Doer)
		if err != nil {
			ctx.ServerError("Fork permission", err)
			return
		}
		if !permission.CanRead(unit.TypeCode) {
			continue
		}
		if err := candidate.LoadOwner(ctx); err != nil {
			ctx.ServerError("Fork owner", err)
			return
		}
		items = append(items, map[string]any{"full_name": candidate.FullName(), "default_branch": candidate.DefaultBranch,
			"can_target": permission.CanRead(unit.TypePullRequests) && candidate.CanEnablePulls() && !candidate.IsArchived})
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": items})
}

// PullReviewData supplies reviews and code conversations without exposing other
// users' unpublished review drafts. All writes use Forgejo's native handlers.
func PullReviewData(ctx *context.Context) {
	_, canPulls := issueUnits(ctx)
	if !canPulls {
		ctx.NotFound("Merge request", nil)
		return
	}
	issue, err := issues_model.GetIssueWithAttrsByIndex(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":index"))
	if err != nil {
		ctx.NotFoundOrServerError("Merge request", issues_model.IsErrIssueNotExist, err)
		return
	}
	if !issue.IsPull {
		ctx.NotFound("Merge request", nil)
		return
	}
	if err := issue.LoadPullRequest(ctx); err != nil {
		ctx.ServerError("Pull request", err)
		return
	}
	pr := issue.PullRequest
	pr.Issue = issue
	pr.BaseRepo = ctx.Repo.Repository
	issue.Repo = ctx.Repo.Repository
	head, err := ctx.Repo.GitRepo.GetRefCommitID(pr.GetGitRefName())
	if err != nil && !git.IsErrNotExist(err) {
		ctx.ServerError("Pull head", err)
		return
	}
	viewHead, viewBase := head, pr.MergeBase
	if ctx.FormString("from") != "" || ctx.FormString("to") != "" {
		commits, _, err := pull_service.GetPullCommits(ctx, issue)
		if err != nil {
			ctx.ServerError("Review commit range", err)
			return
		}
		allowed := map[string]bool{head: true, pr.MergeBase: true}
		for _, commit := range commits {
			allowed[commit.ID] = true
		}
		if to := ctx.FormString("to"); to != "" {
			if !allowed[to] {
				ctx.NotFound("Review commit", nil)
				return
			}
			viewHead = to
			for position, commit := range commits {
				if commit.ID == to && position+1 < len(commits) {
					viewBase = commits[position+1].ID
					break
				}
			}
		}
		if from := ctx.FormString("from"); from != "" {
			if !allowed[from] {
				ctx.NotFound("Review start commit", nil)
				return
			}
			viewBase = from
		}
	}
	if ctx.FormString("format") == "diff" {
		ctx.Resp.Header().Set("Content-Type", "text/plain; charset=utf-8")
		command := git.NewCommand(ctx, "diff", "-p", "--full-index", "--no-ext-diff", "--no-color").
			AddArguments(gitdiff.GetWhitespaceFlag(ctx.FormString("whitespace"))...).
			AddDynamicArguments(viewBase, viewHead).AddDashesAndList()
		if err := command.Run(&git.RunOpts{Dir: ctx.Repo.GitRepo.Path, Stdout: ctx.Resp}); err != nil {
			ctx.ServerError("Review diff", err)
		}
		return
	}
	type position struct {
		path string
		line int64
	}
	positions := make(map[int64]position)
	conversations, err := issues_model.FetchCodeConversations(ctx, issue, ctx.Doer, true, viewHead)
	if err != nil {
		ctx.ServerError("Code conversations", err)
		return
	}
	for path, lines := range conversations {
		for line, groups := range lines {
			for _, comments := range groups {
				if len(comments) > 0 {
					positions[comments[0].ID] = position{path, line}
				}
			}
		}
	}
	reviews, err := issues_model.FindReviews(ctx, issues_model.FindReviewOptions{IssueID: issue.ID})
	if err != nil {
		ctx.ServerError("Reviews", err)
		return
	}
	if err := reviews.LoadReviewers(ctx); err != nil {
		ctx.ServerError("Reviewers", err)
		return
	}
	if err := reviews.LoadReviewersTeams(ctx); err != nil {
		ctx.ServerError("Reviewer teams", err)
		return
	}
	result := make([]map[string]any, 0)
	threads := make([]map[string]any, 0)
	pendingCount := 0
	for _, review := range reviews {
		pending := review.Type == issues_model.ReviewTypePending
		if pending && (!ctx.IsSigned || review.ReviewerID != ctx.Doer.ID) {
			continue
		}
		name, avatar, reviewerID := review.OriginalAuthor, "", review.ReviewerID
		if review.Reviewer != nil {
			name = review.Reviewer.Name
			avatar = review.Reviewer.AvatarLink(ctx)
		}
		if review.ReviewerTeam != nil {
			name = review.ReviewerTeam.Name
			reviewerID = -review.ReviewerTeamID
		}
		result = append(result, map[string]any{"id": review.ID, "type": review.Type, "reviewer_id": reviewerID,
			"reviewer": name, "avatar": avatar, "content": review.Content, "commit": review.CommitID,
			"dismissed": review.Dismissed, "stale": review.Stale, "official": review.Official, "created_at": review.CreatedUnix.AsTime()})
		if err := review.LoadCodeComments(ctx); err != nil {
			ctx.ServerError("Review comments", err)
			return
		}
		for path, byLine := range review.CodeComments {
			for line, comments := range byLine {
				if len(comments) == 0 {
					continue
				}
				entries := make([]map[string]any, 0, len(comments))
				for _, comment := range comments {
					if pending {
						pendingCount++
					}
					name, avatar := "Ghost", ""
					if comment.Poster != nil {
						name = comment.Poster.Name
						avatar = comment.Poster.AvatarLink(ctx)
					}
					canEditComment := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && (comment.PosterID == ctx.Doer.ID || ctx.Repo.IsAdmin())
					if err := comment.LoadReactions(ctx, ctx.Repo.Repository); err != nil {
						ctx.ServerError("Review reactions", err)
						return
					}
					commentRow := map[string]any{"id": comment.ID, "body": comment.Content,
						"user": name, "avatar": avatar, "created_at": comment.CreatedUnix.AsTime(), "content_version": comment.ContentVersion,
						"can_edit": canEditComment, "body_html": string(comment.RenderedContent), "reactions": reactionUI(ctx, comment.Reactions)}
					commentRow["can_report"] = ctx.IsSigned && setting.Moderation.Enabled && comment.PosterID != ctx.Doer.ID
					if canEditComment {
						commentRow["body_edit"] = commentContentEdit(ctx, comment)
					}
					entries = append(entries, commentRow)
				}
				first := comments[0]
				displayPath, displayLine := path, line
				mapped, hasPosition := positions[first.ID]
				if hasPosition {
					displayPath, displayLine = mapped.path, mapped.line
				}
				threads = append(threads, map[string]any{"id": first.ID, "review_id": review.ID, "path": displayPath, "line": displayLine,
					"resolved": first.ResolveDoerID != 0, "outdated": first.Invalidated || !hasPosition, "pending": pending, "comments": entries, "patch": first.Patch})
			}
		}
	}
	sort.Slice(threads, func(i, j int) bool { return threads[i]["id"].(int64) < threads[j]["id"].(int64) })
	canComment := ctx.IsSigned && !ctx.Repo.Repository.IsArchived
	canMark, canRequest, canEdit := false, false, false
	canEditHead := false
	canMergeUpdate, canRebaseUpdate, canCleanup := false, false, false
	viewed := make(map[string]string)
	if ctx.IsSigned {
		canMark, err = issues_model.CanMarkConversation(ctx, issue, ctx.Doer)
		if err != nil {
			ctx.ServerError("Conversation permission", err)
			return
		}
		canRequest = issue_service.CanDoerChangeReviewRequests(ctx, ctx.Doer, ctx.Repo.Repository, issue)
		canEdit = issue.PosterID == ctx.Doer.ID || ctx.Repo.CanWriteIssuesOrPulls(true)
		state, _, err := pull_model.GetReviewState(ctx, ctx.Doer.ID, pr.ID, head)
		if err != nil {
			ctx.ServerError("Viewed files", err)
			return
		}
		for path, value := range state.UpdatedFiles {
			viewed[path] = value.String()
		}
		if err := pr.LoadHeadRepo(ctx); err == nil && pr.HeadRepo != nil {
			headPerm, err := access_model.GetUserRepoPermission(ctx, pr.HeadRepo, ctx.Doer)
			if err != nil {
				ctx.ServerError("Head permission", err)
				return
			}
			pr.BaseRepo = ctx.Repo.Repository
			canEditHead = !pr.HasMerged && !pr.HeadRepo.IsArchived && pr.HeadRepo.CanEnableEditor() && pr.Flow != issues_model.PullRequestFlowAGit && issues_model.CanMaintainerWriteToBranch(ctx, headPerm, pr.HeadBranch, ctx.Doer, access_model.GetUserRepoPermission)
			if canEditHead {
				headProtection, err := git_model.GetFirstMatchProtectedBranchRule(ctx, pr.HeadRepoID, pr.HeadBranch)
				if err != nil {
					ctx.ServerError("Head branch protection", err)
					return
				}
				canEditHead = headProtection == nil || headProtection.CanUserPush(ctx, ctx.Doer)
			}
			if !issue.IsClosed && !pr.HasMerged {
				canMergeUpdate, canRebaseUpdate, err = pull_service.IsUserAllowedToUpdate(ctx, pr, ctx.Doer, headPerm, ctx.Repo.Permission)
				if err != nil {
					ctx.ServerError("Branch update permission", err)
					return
				}
			}

		}
	}
	candidates := make([]map[string]any, 0)
	if canRequest && canComment {
		users, err := repo_model.GetReviewers(ctx, ctx.Repo.Repository, ctx.Doer.ID, issue.PosterID)
		if err != nil {
			ctx.ServerError("Review candidates", err)
			return
		}
		for _, user := range users {
			if user.ID == issue.PosterID {
				continue
			}
			permission, err := access_model.GetUserRepoPermission(ctx, ctx.Repo.Repository, user)
			if err != nil {
				ctx.ServerError("Reviewer access", err)
				return
			}
			if permission.CanRead(unit.TypePullRequests) {
				candidates = append(candidates, map[string]any{"id": user.ID, "name": user.Name, "avatar": user.AvatarLink(ctx)})
			}
		}
		if ctx.Repo.Owner.IsOrganization() {
			teams, err := org_model.GetTeamsWithAccessToRepo(ctx, ctx.Repo.Owner.ID, ctx.Repo.Repository.ID, perm.AccessModeRead)
			if err != nil {
				ctx.ServerError("Reviewer teams", err)
				return
			}
			for _, team := range teams {
				if team.UnitEnabled(ctx, unit.TypePullRequests) {
					candidates = append(candidates, map[string]any{"id": -team.ID, "name": team.Name + " (team)"})
				}
			}
		}
	}
	scheduled, _, err := pull_model.GetScheduledMergeByPullID(ctx, pr.ID)
	if err != nil {
		ctx.ServerError("Scheduled merge", err)
		return
	}
	statuses, _, err := git_model.GetLatestCommitStatus(ctx, issue.RepoID, head, db.ListOptionsAll)
	if err != nil {
		ctx.ServerError("Commit statuses", err)
		return
	}
	protection, err := git_model.GetFirstMatchProtectedBranchRule(ctx, issue.RepoID, pr.BaseBranch)
	if err != nil {
		ctx.ServerError("Branch protection", err)
		return
	}
	checks := make([]map[string]any, 0, len(statuses))
	required := make(map[string]bool)
	missing := make([]string, 0)
	if protection != nil && protection.EnableStatusCheck {
		for _, pattern := range protection.StatusCheckContexts {
			matcher, compileErr := glob.Compile(pattern)
			found := false
			for _, status := range statuses {
				if status.Context == pattern || (compileErr == nil && matcher.Match(status.Context)) {
					required[status.Context] = true
					found = true
				}
			}
			if !found {
				missing = append(missing, pattern)
			}
		}
	}
	blocked := make(map[string]any)
	blocked["conflicted_files"] = pr.ConflictedFiles
	if protection != nil {
		blocked["protected_files"] = pr.ChangedProtectedFiles
		blocked["approvals"] = !issues_model.HasEnoughApprovals(ctx, protection, pr)
		blocked["rejection"] = issues_model.MergeBlockedByRejectedReview(ctx, protection, pr)
		blocked["review_requests"] = issues_model.MergeBlockedByOfficialReviewRequests(ctx, protection, pr)
		blocked["outdated"] = issues_model.MergeBlockedByOutdatedBranch(protection, pr)
		blocked["granted_approvals"] = issues_model.GetGrantedApprovalsCount(ctx, protection, pr)
		blocked["required_approvals"] = protection.RequiredApprovals
		blocked["require_signed"] = protection.RequireSignedCommits
	}
	{
		if ctx.Doer == nil {
			blocked["signing_reason"] = "not_signed_in"
		} else {
			sign, key, _, signErr := asymkey_service.SignMerge(ctx, pr, ctx.Doer, ctx.Repo.Repository.RepoPath(), pr.BaseBranch, pr.GetGitRefName())
			blocked["will_sign"] = sign
			blocked["signing_key"] = key
			if signErr != nil {
				if asymkey_service.IsErrWontSign(signErr) {
					blocked["signing_reason"] = signErr.(*asymkey_service.ErrWontSign).Reason
				} else {
					blocked["signing_reason"] = "error"
				}
			}
		}
	}
	if protection != nil && protection.EnableStatusCheck {
		blocked["checks"] = !pull_service.MergeRequiredContextsCommitStatus(statuses, protection.StatusCheckContexts).IsSuccess()
	}
	if reason, ok := blocked["signing_reason"].(string); ok {
		blocked["signing_reason_text"] = ctx.Tr("repo.signing.wont_sign." + reason)
	}
	mergeMetadata, err := pullMergeMetadata(ctx, pr, head, protection, blocked)
	if err != nil {
		ctx.ServerError("Merge options", err)
		return
	}
	canCleanup = canComment && (pr.HasMerged || issue.IsClosed) && mergeMetadata["branch_deletable"] == true
	state := ""
	if summary := git_model.CalcCommitStatus(statuses); summary != nil {
		state = string(summary.State)
	}
	for _, status := range statuses {
		checks = append(checks, map[string]any{"context": status.Context, "description": status.Description,
			"state": status.State, "target_url": status.TargetURL, "required": required[status.Context]})
	}
	if len(missing) > 0 {
		state = "pending"
	}
	var actionsTrust map[string]any
	if !unit.TypeActions.UnitGlobalDisabled() && ctx.Repo.CanRead(unit.TypeActions) {
		trust, err := actions_service.GetPullRequestPosterIsTrustedWithActions(ctx, pr)
		if err != nil {
			ctx.ServerError("Workflow trust", err)
			return
		}
		approval, err := actions_model.HasRunThatNeedApproval(ctx, issue.RepoID, pr.ID)
		if err != nil {
			ctx.ServerError("Workflow approval", err)
			return
		}
		actionsTrust = map[string]any{"state": trust, "needs_approval": approval,
			"can_delegate": ctx.IsSigned && !ctx.Repo.Repository.IsArchived && context.CheckRepoDelegateActionTrust(ctx)}
	}
	lifecycle, err := issueLifecycle(ctx, issue)
	if err != nil {
		ctx.ServerError("Review lifecycle", err)
		return
	}
	headRepoName := ""
	if pr.HeadRepo != nil {
		headRepoName = pr.HeadRepo.FullName()
	}
	ctx.JSON(http.StatusOK, map[string]any{"issue_id": issue.ID, "head_sha": head, "base_sha": pr.MergeBase, "lifecycle": lifecycle,
		"can_edit_head": canEditHead, "head_repo": headRepoName, "head_branch": pr.HeadBranch,
		"view_head_sha": viewHead, "view_base_sha": viewBase,
		"status_checks": checks, "missing_checks": missing, "status_state": state,
		"blocked": blocked, "merge": mergeMetadata,
		"actions_trust": actionsTrust, "reviews": result, "threads": threads, "pending_count": pendingCount, "viewed_files": viewed,
		"can_comment": canComment, "can_approve": canComment && issue.PosterID != ctx.Doer.ID && !issue.IsClosed,
		"can_resolve": canMark && canComment, "can_request": canRequest && canComment && !issue.IsClosed,
		"can_dismiss": canComment && ctx.Repo.IsAdmin() && !issue.IsClosed, "reviewer_options": candidates,
		"can_edit": canEdit && canComment && !pr.HasMerged, "can_update_merge": canComment && canMergeUpdate,
		"can_update_rebase": canComment && canRebaseUpdate, "can_cleanup": canComment && canCleanup,
		"auto_merge": scheduled, "checking": pr.IsChecking(), "can_auto_merge": pr.CanAutoMerge() || pr.IsEmpty(), "allow_maintainer_edit": pr.AllowMaintainerEdit, "closed": issue.IsClosed, "merged": pr.HasMerged})
}
