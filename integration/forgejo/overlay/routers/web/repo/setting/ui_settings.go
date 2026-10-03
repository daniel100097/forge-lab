// SPDX-License-Identifier: GPL-3.0-or-later
package setting

import (
	"net/http"

	"forgejo.org/models/organization"
	"forgejo.org/models/perm"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	mirror_service "forgejo.org/services/mirror"
)

// Unit identifiers in the order the native collaboration page lists a team's sections.
var teamUnitTypes = []unit.Type{unit.TypeCode, unit.TypeIssues, unit.TypePullRequests, unit.TypeReleases, unit.TypeWiki, unit.TypeExternalWiki, unit.TypeExternalTracker, unit.TypeProjects, unit.TypePackages, unit.TypeActions}

var branchRuleFields = []string{"id:ID", "rule_name:RuleName", "can_push:CanPush", "enable_whitelist:EnableWhitelist", "whitelist_user_ids:WhitelistUserIDs", "whitelist_team_ids:WhitelistTeamIDs", "whitelist_deploy_keys:WhitelistDeployKeys", "enable_merge_whitelist:EnableMergeWhitelist", "merge_whitelist_user_ids:MergeWhitelistUserIDs", "merge_whitelist_team_ids:MergeWhitelistTeamIDs", "enable_status_check:EnableStatusCheck", "status_check_contexts:StatusCheckContexts", "required_approvals:RequiredApprovals", "enable_approvals_whitelist:EnableApprovalsWhitelist", "approvals_whitelist_user_ids:ApprovalsWhitelistUserIDs", "approvals_whitelist_team_ids:ApprovalsWhitelistTeamIDs", "block_on_rejected_reviews:BlockOnRejectedReviews", "block_on_official_review_requests:BlockOnOfficialReviewRequests", "block_on_outdated_branch:BlockOnOutdatedBranch", "dismiss_stale_approvals:DismissStaleApprovals", "ignore_stale_approvals:IgnoreStaleApprovals", "require_signed_commits:RequireSignedCommits", "protected_file_patterns:ProtectedFilePatterns", "unprotected_file_patterns:UnprotectedFilePatterns", "apply_to_admins:ApplyToAdmins"}

func writeSettingsUI(ctx *context.Context, section string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"section": section}
	switch section {
	case "general":
		r := ctx.Repo.Repository
		data["repo_name"], data["description"], data["website"], data["private"], data["template"] = r.Name, r.Description, r.Website, r.IsPrivate, r.IsTemplate
		repository := spaui.Selected(r, "id:ID", "name:Name", "description:Description", "website:Website", "private:IsPrivate", "template:IsTemplate", "archived:IsArchived", "mirror:IsMirror", "fork:IsFork", "default_branch:DefaultBranch", "trust_model:TrustModel", "empty:IsEmpty", "status:Status", "health_check:IsFsckEnabled", "size:Size", "git_size:GitSize", "lfs_size:LFSSize", "num_forks:NumForks", "num_stars:NumStars")
		repository["trust_model"] = r.TrustModel.String()
		repository["default_wiki_branch"] = r.GetWikiBranchName()
		data["repository"] = repository
		data["force_private"] = setting.Repository.ForcePrivate
		data["owner"] = ctx.Repo.IsOwner()
		data["admin"] = ctx.Doer.IsAdmin
		data["avatar_url"] = r.AvatarLink(ctx)
		data["mirrors_enabled"] = setting.Mirror.Enabled
		data["push_mirrors_enabled"] = !setting.Mirror.DisableNewPush
		data["minimum_mirror_interval"] = setting.Mirror.MinInterval.String()
		data["default_mirror_interval"] = setting.Mirror.DefaultInterval.String()
		data["signing_key_available"] = ctx.Data["SigningKeyAvailable"]
		data["code_indexer_enabled"] = setting.Indexer.RepoIndexerEnabled
		data["git_hooks_enabled"] = ctx.Doer.CanEditGitHook()
		data["ssh_mirroring_enabled"] = ctx.Data["CanUseSSHMirroring"]
		data["lfs_enabled"] = setting.LFS.StartServer
		data["federation_enabled"] = setting.Federation.Enabled
		data["following_repos"] = ctx.Data["FollowingRepos"]
		data["transfer"] = spaui.Selected(ctx.Data["RepoTransfer"], "id:ID", "recipient:Recipient.Name")
		// Native visibility conditions of the settings navigation, mirror section and danger zone.
		data["ap_actor_id"] = r.APActorID()
		data["pull_mirrors_enabled"] = !setting.Mirror.DisableNewPull
		data["code_enabled"] = r.UnitEnabled(ctx, unit.TypeCode)
		data["wiki_readable"] = ctx.Repo.CanRead(unit.TypeWiki)
		data["default_wiki_branch_name"] = setting.Repository.DefaultBranch
		data["can_convert_fork"] = r.IsFork && r.Owner != nil && r.Owner.CanCreateRepo()
		data["actions_enabled"] = setting.Actions.Enabled && !unit.TypeActions.UnitGlobalDisabled() && ctx.Repo.CanRead(unit.TypeActions)
		data["webhooks_enabled"] = !setting.DisableWebhooks
		data["flags_enabled"] = setting.Repository.EnableFlags && ctx.Doer.IsAdmin
		if status, ok := ctx.Data["CodeIndexerStatus"].(*repo_model.RepoIndexerStatus); ok && status != nil {
			data["code_indexer_commit"] = status.CommitSha
		}
		if status, ok := ctx.Data["StatsIndexerStatus"].(*repo_model.RepoIndexerStatus); ok && status != nil {
			data["stats_indexer_commit"] = status.CommitSha
		}
		_, pullMirror := ctx.Data["PullMirror"].(*repo_model.Mirror)
		data["pull_mirror_broken"] = r.IsMirror && !pullMirror
		if mirror, ok := ctx.Data["PullMirror"].(*repo_model.Mirror); ok {
			details := spaui.Selected(mirror, "interval:Interval", "enable_prune:EnablePrune", "lfs:LFS", "lfs_endpoint:LFSEndpoint", "updated:UpdatedUnix")
			address, err := mirror_service.DecryptOrRecoverRemoteAddress(ctx, mirror)
			if err != nil {
				ctx.ServerError("MirrorAddress", err)
				return true
			}
			if address.User != nil {
				details["username"] = address.User.Username()
			}
			address.User = nil
			details["address"] = address.String()
			data["pull_mirror"] = details
		}

		data["push_mirrors"] = spaui.SelectedList(ctx.Data["PushMirrors"], "id:ID", "remote_name:RemoteName", "sync_on_commit:SyncOnCommit", "interval:Interval", "last_update:LastUpdateUnix", "last_error:LastError", "branch_filter:BranchFilter", "address:RemoteAddress", "public_key:PublicKey")
	case "members":
		r := ctx.Repo.Repository
		members := []map[string]any{}
		if collaborators, ok := ctx.Data["Collaborators"].([]*repo_model.Collaborator); ok {
			for _, c := range collaborators {
				member := spaui.Selected(c, "id:User.ID", "username:User.Name", "name:User.FullName", "mode:Collaboration.Mode")
				member["avatar_url"] = c.AvatarLink(ctx)
				members = append(members, member)
			}
		}
		data["members"] = members
		teams := []map[string]any{}
		if list, ok := ctx.Data["Teams"].(organization.TeamList); ok {
			for _, team := range list {
				item := spaui.Selected(team, "id:ID", "name:Name", "lower_name:LowerName", "description:Description", "mode:AccessMode", "includes_all:IncludesAllRepositories")
				// Like the native page, list the sections of read/write teams that are enabled for this repository.
				if team.AccessMode == perm.AccessModeRead || team.AccessMode == perm.AccessModeWrite {
					units := []string{}
					for _, t := range teamUnitTypes {
						if r.UnitEnabled(ctx, t) && team.UnitEnabled(ctx, t) {
							units = append(units, unit.Units[t].Name)
						}
					}
					item["units"] = units
				}
				teams = append(teams, item)
			}
		}
		data["teams"] = teams
		data["organization"] = ctx.Repo.Owner.IsOrganization()
		data["owner"] = ctx.Repo.Owner.Name
		data["can_change_teams"] = ctx.Repo.IsOwner() || ctx.Repo.Owner.RepoAdminChangeTeamAccess
	case "branches":
		data["archived"] = ctx.Repo.Repository.IsArchived
		data["rules"] = spaui.SelectedList(ctx.Data["ProtectedBranches"], branchRuleFields...)
		data["branches"] = ctx.Data["Branches"]
		data["default_branch"] = ctx.Repo.Repository.DefaultBranch
	case "branch-rule":
		data["rule"] = spaui.Selected(ctx.Data["Rule"], branchRuleFields...)
		data["users"] = spaui.SelectedList(ctx.Data["Users"], "id:ID", "name:Name")
		data["teams"] = spaui.SelectedList(ctx.Data["Teams"], "id:ID", "name:Name")
		data["recent_status_checks"] = ctx.Data["recent_status_checks"]
	case "tags":
		data["archived"] = ctx.Repo.Repository.IsArchived
		data["organization"] = ctx.Repo.Owner.IsOrganization()
		data["owner"] = ctx.Repo.Owner.Name
		data["rules"] = spaui.SelectedList(ctx.Data["ProtectedTags"], "id:ID", "name_pattern:NamePattern", "allowlist_user_ids:AllowlistUserIDs", "allowlist_team_ids:AllowlistTeamIDs")
		data["users"] = spaui.SelectedList(ctx.Data["Users"], "id:ID", "name:Name", "full_name:FullName")
		data["teams"] = spaui.SelectedList(ctx.Data["Teams"], "id:ID", "name:Name", "lower_name:LowerName")
	case "keys":
		data["items"] = spaui.SelectedList(ctx.Data["Deploykeys"], "id:ID", "name:Name", "fingerprint:Fingerprint", "mode:Mode", "created:CreatedUnix", "updated:UpdatedUnix", "has_used:HasUsed", "recent:HasRecentActivity")
		data["disabled"] = setting.SSH.Disabled
	case "secrets":
		// Deliberately omit Data: even encrypted secret values never leave Forgejo.
		data["items"] = spaui.SelectedList(ctx.Data["Secrets"], "id:ID", "name:Name", "created:CreatedUnix", "updated:UpdatedUnix")
	case "variables":
		data["items"] = spaui.SelectedList(ctx.Data["Variables"], "id:ID", "name:Name", "data:Data", "created:CreatedUnix", "updated:UpdatedUnix")
	case "units":
		r := ctx.Repo.Repository
		enabled := map[string]bool{}
		available := map[string]bool{}
		for name, t := range map[string]unit.Type{"code": unit.TypeCode, "issues": unit.TypeIssues, "pulls": unit.TypePullRequests, "wiki": unit.TypeWiki, "external_wiki": unit.TypeExternalWiki, "external_tracker": unit.TypeExternalTracker, "releases": unit.TypeReleases, "projects": unit.TypeProjects, "packages": unit.TypePackages, "actions": unit.TypeActions} {
			enabled[name] = r.UnitEnabled(ctx, t)
			available[name] = !t.UnitGlobalDisabled()
		}
		data["enabled"], data["available"] = enabled, available
		data["issues"] = spaui.Selected(r.MustGetUnit(ctx, unit.TypeIssues).IssuesConfig(), "enable_timetracker:EnableTimetracker", "allow_only_contributors_to_track_time:AllowOnlyContributorsToTrackTime", "enable_issue_dependencies:EnableDependencies", "enable_close_issues_via_commit_in_any_branch:EnableCloseIssuesViaCommitInAnyBranch")
		data["pulls"] = spaui.Selected(r.MustGetUnit(ctx, unit.TypePullRequests).PullRequestsConfig(), "pulls_ignore_whitespace:IgnoreWhitespaceConflicts", "pulls_allow_merge:AllowMerge", "pulls_allow_rebase:AllowRebase", "pulls_allow_rebase_merge:AllowRebaseMerge", "pulls_allow_squash:AllowSquash", "pulls_allow_fast_forward_only:AllowFastForwardOnly", "pulls_allow_manual_merge:AllowManualMerge", "pulls_default_merge_style:DefaultMergeStyle", "pulls_default_update_style:DefaultUpdateStyle", "enable_autodetect_manual_merge:AutodetectManualMerge", "pulls_allow_rebase_update:AllowRebaseUpdate", "default_delete_branch_after_merge:DefaultDeleteBranchAfterMerge", "default_allow_maintainer_edit:DefaultAllowMaintainerEdit")
		data["external_wiki_url"] = r.MustGetUnit(ctx, unit.TypeExternalWiki).ExternalWikiConfig().ExternalWikiURL
		data["external_tracker"] = spaui.Selected(r.MustGetUnit(ctx, unit.TypeExternalTracker).ExternalTrackerConfig(), "external_tracker_url:ExternalTrackerURL", "tracker_url_format:ExternalTrackerFormat", "tracker_issue_style:ExternalTrackerStyle", "external_tracker_regexp_pattern:ExternalTrackerRegexpPattern")
		data["globally_writeable_wiki"] = r.MustGetUnit(ctx, unit.TypeWiki).DefaultPermissions == repo_model.UnitAccessModeWrite
		data["enable_close_issues_via_commit_in_any_branch"] = r.CloseIssuesViaCommitInAnyBranch
		// Native unit form conditions: mirrors have no merge request settings, and
		// instance-wide switches hide Actions and time tracking.
		data["mirror"] = r.IsMirror
		data["private"] = r.IsPrivate
		data["actions_enabled"] = setting.Actions.Enabled
		data["timetracking_enabled"] = setting.Service.EnableTimetracking
		data["packages_visibility_warning"] = r.IsPrivate && r.Owner != nil && r.Owner.Visibility.IsPublic()
		data["owner_name"] = r.OwnerName
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

// Preserve native permission and validation failures as structured responses.
func writeAccessModeUI(ctx *context.Context, err error) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	if err != nil {
		ctx.JSON(http.StatusUnprocessableEntity, map[string]string{"errorMessage": err.Error()})
	} else {
		ctx.JSON(http.StatusOK, map[string]bool{"ok": true})
	}
	return true
}
