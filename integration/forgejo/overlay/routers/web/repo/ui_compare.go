// SPDX-License-Identifier: GPL-3.0-or-later
package repo

import (
	"net/http"

	issues_model "forgejo.org/models/issues"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/routers/common"
	"forgejo.org/services/context"
)

// writeCompareUI exposes only presentation data after the normal compare
// handler has resolved repository permissions and both Git references.
func writeCompareUI(ctx *context.Context, ci *common.CompareInfo, existing *issues_model.PullRequest) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	commits := make([]any, 0)
	for i, commit := range ci.CompareInfo.Commits {
		if i >= 250 {
			break
		}
		item := map[string]any{"sha": commit.ID.String(), "message": commit.Summary()}
		if commit.Author != nil {
			item["author"] = commit.Author.Name
			item["date"] = commit.Author.When
		}
		commits = append(commits, item)
	}
	title, _ := ctx.Data["title"].(string)
	if templateTitle, ok := ctx.Data[issueTemplateTitleKey].(string); ok && templateTitle != "" {
		title = templateTitle
	}
	if title == "" {
		title = ci.HeadBranch
	}
	content, _ := ctx.Data["content"].(string)
	if template, ok := ctx.Data[pullRequestTemplateKey].(string); ok && template != "" {
		content = template
	}
	nothing := ctx.Data["IsNothingToCompare"] == true
	response := map[string]any{
		"title": title, "content": content,
		"fields": ctx.Data["Fields"], "template_file": ctx.Data["TemplateFile"],
		"nothing_to_compare": nothing,
		"allow_empty":        ctx.Data["AllowEmptyPr"] == true,
		"no_file_changes":    nothing || ctx.Data["DiffNotAvailable"] == true,
		"can_create":         ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanRead(unit.TypePullRequests) && ctx.Repo.Repository.CanEnablePulls() && ctx.Data["PageIsComparePull"] == true && existing == nil && (!nothing || ctx.Data["AllowEmptyPr"] == true),
		"commits":            commits, "commit_count": len(ci.CompareInfo.Commits),
		"commits_truncated": len(ci.CompareInfo.Commits) > len(commits),
		"base_sha":          ci.CompareInfo.BaseCommitID, "head_sha": ci.CompareInfo.HeadCommitID,
		"draft_prefixes": setting.Repository.PullRequest.WorkInProgressPrefixes,
		// These are the target repository's native form options, populated by
		// RetrieveRepoMetas and setTemplateIfExists after permission checks.
		"can_assign":                ctx.Data["HasIssuesOrPullsWritePermission"] == true,
		"label_ids":                 ctx.Data["label_ids"],
		"labels":                    append(spaui.Rows(ctx.Data["Labels"], "ID", "Name", "Color"), spaui.Rows(ctx.Data["OrgLabels"], "ID", "Name", "Color")...),
		"assignees":                 spaui.Rows(ctx.Data["Assignees"], "ID", "Name", "FullName"),
		"milestones":                spaui.Rows(ctx.Data["OpenMilestones"], "ID", "Name"),
		"projects":                  spaui.Rows(ctx.Data["OpenProjects"], "ID", "Title"),
		"can_assign_project":        ctx.Data["IsProjectsEnabled"] == true,
		"attachments":               setting.Attachment.Enabled,
		"can_allow_maintainer_edit": ci.HeadRepo.ID != ctx.Repo.Repository.ID && ctx.Data["CanWriteToHeadRepo"] == true,
		"allow_maintainer_edit":     ctx.Data["AllowMaintainerEdit"] == true,
	}
	if existing != nil && existing.Issue != nil {
		response["existing_pull"] = map[string]any{"number": existing.Issue.Index, "title": existing.Issue.Title}
	}
	// The native compare page's reference pickers: branches and tags of the
	// base and head repositories, and the head repositories it offers (this
	// repository, the viewer's fork and the fork's parent).
	response["base_branch"], response["head_branch"] = ci.BaseBranch, ci.HeadBranch
	response["head_repository"] = ci.HeadRepo.FullName()
	response["direct_comparison"] = ci.DirectComparison
	response["base_branches"], response["base_tags"] = ctx.Data["Branches"], ctx.Data["Tags"]
	response["head_branches"], response["head_tags"] = ctx.Data["HeadBranches"], ctx.Data["HeadTags"]
	repositories := []string{ctx.Repo.Repository.FullName()}
	for _, key := range []string{"OwnForkRepo", "RootRepo"} {
		if other, ok := ctx.Data[key].(*repo_model.Repository); ok && other != nil {
			repositories = append(repositories, other.FullName())
		}
	}
	if ci.HeadRepo.ID != ctx.Repo.Repository.ID {
		repositories = append(repositories, ci.HeadRepo.FullName())
	}
	response["head_repositories"] = repositories
	ctx.JSON(http.StatusOK, response)
	return true
}
