package spa

import (
	"fmt"
	"strings"

	git_model "forgejo.org/models/git"
	issues_model "forgejo.org/models/issues"
	access_model "forgejo.org/models/perm/access"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"

	"forgejo.org/modules/gitrepo"
	"forgejo.org/services/context"
	pull_service "forgejo.org/services/pull"
)

func pullMergeMetadata(ctx *context.Context, pr *issues_model.PullRequest, head string, protection *git_model.ProtectedBranch, blocked map[string]any) (map[string]any, error) {
	pr.BaseRepo = ctx.Repo.Repository
	if err := pr.LoadHeadRepo(ctx); err != nil {
		return nil, err
	}
	allowMerge, err := pull_service.IsUserAllowedToMerge(ctx, pr, ctx.Repo.Permission, ctx.Doer)
	if err != nil {
		return nil, err
	}
	allowMerge = allowMerge && !pr.BaseRepo.IsArchived
	cfg := pr.BaseRepo.MustGetUnit(ctx, unit.TypePullRequests).PullRequestsConfig()
	defaultStyle := cfg.GetDefaultMergeStyle()
	styleOrder := []repo_model.MergeStyle{repo_model.MergeStyleMerge, repo_model.MergeStyleRebase, repo_model.MergeStyleRebaseMerge, repo_model.MergeStyleSquash, repo_model.MergeStyleFastForwardOnly, repo_model.MergeStyleManuallyMerged}
	if !cfg.IsMergeStyleAllowed(defaultStyle) {
		for _, style := range styleOrder {
			if cfg.IsMergeStyleAllowed(style) {
				defaultStyle = style
				break
			}
		}
	}
	mergeTitle, mergeBody, err := pull_service.GetDefaultMergeMessage(ctx, ctx.Repo.GitRepo, pr, defaultStyle)
	if err != nil {
		return nil, err
	}
	squashTitle, squashBody, err := pull_service.GetDefaultMergeMessage(ctx, ctx.Repo.GitRepo, pr, repo_model.MergeStyleSquash)
	if err != nil {
		return nil, err
	}
	branchDeletable, headExists := false, false
	headBranchSHA := ""
	if pr.HeadRepo != nil {
		headRepo, closer, err := gitrepo.RepositoryFromContextOrOpen(ctx, pr.HeadRepo)
		if err != nil {
			return nil, err
		}
		defer closer.Close()
		headExists = headRepo.IsBranchExist(pr.HeadBranch)
		if pr.Flow != issues_model.PullRequestFlowGithub {
			headExists = ctx.Repo.GitRepo.IsReferenceExist(pr.GetGitRefName())
		}
		if headExists {
			if pr.Flow == issues_model.PullRequestFlowGithub {
				headBranchSHA, err = headRepo.GetBranchCommitID(pr.HeadBranch)
			} else {
				headBranchSHA = head
			}
			if err != nil {
				return nil, err
			}
		}
		if ctx.IsSigned && !pr.HeadRepo.IsArchived {
			permission, err := access_model.GetUserRepoPermission(ctx, pr.HeadRepo, ctx.Doer)
			if err != nil {
				return nil, err
			}
			protected, err := git_model.IsBranchProtected(ctx, pr.HeadRepoID, pr.HeadBranch)
			if err != nil {
				return nil, err
			}
			branchDeletable = permission.CanWrite(unit.TypeCode) && !protected && pr.HeadBranch != pr.HeadRepo.DefaultBranch && headRepo.IsBranchExist(pr.HeadBranch)
			if branchDeletable && pr.HasMerged {
				branchHead, err := headRepo.GetBranchCommitID(pr.HeadBranch)
				if err != nil {
					return nil, err
				}
				otherPull, err := issues_model.HasUnmergedPullRequestsByHeadInfo(ctx, pr.HeadRepoID, pr.HeadBranch)
				if err != nil {
					return nil, err
				}
				branchDeletable = branchHead == head && !otherPull
			}
		}
	}
	if headExists {
		squashBody = pull_service.GetSquashMergeCommitMessages(ctx, pr) + squashBody
	}
	noDependencies, err := issues_model.IssueNoDependenciesLeft(ctx, pr.Issue)
	if err != nil {
		return nil, err
	}
	blocked["dependencies"] = !noDependencies
	broken := head == "" || !headExists || !ctx.Repo.GitRepo.IsBranchExist(pr.BaseBranch) || (!pr.Issue.IsClosed && !pr.IsChecking() && headBranchSHA != head)
	blocked["broken"] = broken
	blocked["checking"] = pr.IsChecking()
	blocked["ancestor"] = pr.IsAncestor()
	blocked["empty"] = pr.IsEmpty()
	blocked["conflict"] = !pr.CanAutoMerge() && !pr.IsEmpty() && !pr.IsChecking() && !pr.IsAncestor()
	overridableBlocked := false
	for _, key := range []string{"approvals", "rejection", "review_requests", "outdated", "checks"} {
		if blocked[key] == true {
			overridableBlocked = true
		}
	}
	overridableBlocked = overridableBlocked || (protection != nil && len(pr.ChangedProtectedFiles) != 0)
	forceAllowed := ctx.IsSigned && ctx.Repo.IsAdmin() && (protection == nil || !protection.ApplyToAdmins)
	unsignedStyle := cfg.AllowManualMerge || (cfg.AllowFastForwardOnly && pr.CommitsBehind == 0)
	signingBlocked := blocked["require_signed"] == true && blocked["will_sign"] != true
	blocked["signing_all_styles"] = signingBlocked && !unsignedStyle
	active := !pr.HasMerged && !pr.Issue.IsClosed && !pr.IsWorkInProgress(ctx) && !pr.IsChecking()
	generalForm := active && !broken && !pr.IsAncestor() && len(pr.ConflictedFiles) == 0 && (pr.CanAutoMerge() || pr.IsEmpty())
	manualFallback := active && !pr.CanAutoMerge() && allowMerge && cfg.AllowManualMerge
	styles := make([]map[string]any, 0)
	for _, style := range styleOrder {
		if !pullMergeStyleEligible(cfg, style, signingBlocked, pr.CommitsBehind, generalForm, manualFallback) {
			continue
		}
		title, body := mergeTitle, mergeBody
		if style == repo_model.MergeStyleSquash {
			title, body = squashTitle, squashBody
		}
		hasMessage := style == repo_model.MergeStyleMerge || style == repo_model.MergeStyleRebaseMerge || style == repo_model.MergeStyleSquash
		manual := style == repo_model.MergeStyleManuallyMerged
		canNow := active && allowMerge && (manual || (generalForm && noDependencies && (!overridableBlocked || forceAllowed) && blocked["signing_all_styles"] != true))
		canSchedule := generalForm && allowMerge && !manual && noDependencies && blocked["signing_all_styles"] != true && (overridableBlocked || !canNow)
		styles = append(styles, map[string]any{"name": style, "title": title, "message": body, "has_message": hasMessage, "can_merge": canNow, "can_schedule": canSchedule})
	}
	showInstructions := true
	if protection != nil {
		protection.Repo = pr.BaseRepo
		showInstructions = ctx.Doer != nil && protection.CanUserPush(ctx, ctx.Doer)
	}
	instructions := make(map[string]string)
	if pr.HeadRepo != nil && !pr.HasMerged && !pr.Issue.IsClosed {
		quote := func(value string) string { return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'" }
		localBranch := pr.HeadBranch
		origin := "origin"
		if pr.HeadRepoID != pr.BaseRepoID {
			localBranch = pr.HeadRepo.OwnerName + "-" + pr.HeadBranch
			origin = quote(pr.HeadRepo.CloneLink().HTTPS)
		}
		fetchRef := pr.HeadBranch + ":" + localBranch
		if pr.Flow != issues_model.PullRequestFlowGithub {
			origin = "origin"
			fetchRef = fmt.Sprintf("+refs/pull/%d/head:%s", pr.Index, localBranch)
		}
		checkout := "git fetch -u " + origin + " " + quote(fetchRef) + "\ngit switch " + quote(localBranch)
		for _, style := range styleOrder {
			commands := checkout
			if showInstructions {
				if style == repo_model.MergeStyleRebase || style == repo_model.MergeStyleRebaseMerge {
					commands += "\ngit rebase " + quote(pr.BaseBranch)
				}
				commands += "\ngit switch " + quote(pr.BaseBranch) + "\ngit merge "
				switch style {
				case repo_model.MergeStyleMerge, repo_model.MergeStyleRebaseMerge:
					commands += "--no-ff "
				case repo_model.MergeStyleSquash:
					commands += "--squash "
				case repo_model.MergeStyleRebase, repo_model.MergeStyleFastForwardOnly:
					commands += "--ff-only "
				}
				commands += quote(localBranch) + "\ngit push origin " + quote(pr.BaseBranch)
			}
			instructions[string(style)] = commands
		}
	}
	return map[string]any{"allowed": allowMerge, "form_available": generalForm || manualFallback, "styles": styles, "default_style": defaultStyle,
		"can_force": forceAllowed && overridableBlocked && generalForm, "branch_deletable": branchDeletable,
		"default_delete_branch": cfg.DefaultDeleteBranchAfterMerge, "instructions": instructions,
		"show_merge_instructions": showInstructions, "autodetect_manual_merge": cfg.AutodetectManualMerge,
		"default_title": mergeTitle, "default_message": mergeBody}, nil
}

func pullMergeStyleEligible(cfg *repo_model.PullRequestsConfig, style repo_model.MergeStyle, signingBlocked bool, commitsBehind int, generalForm, manualFallback bool) bool {
	if !cfg.IsMergeStyleAllowed(style) {
		return false
	}
	if !generalForm {
		return manualFallback && style == repo_model.MergeStyleManuallyMerged
	}
	if style == repo_model.MergeStyleManuallyMerged {
		return true
	}
	if style == repo_model.MergeStyleFastForwardOnly {
		return commitsBehind == 0
	}
	return !signingBlocked
}
