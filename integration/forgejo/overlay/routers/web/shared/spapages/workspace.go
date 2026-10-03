// Copyright 2026 The Forgejo UI Authors.
// SPDX-License-Identifier: MIT
package spapages

import (
	"fmt"

	activities_model "forgejo.org/models/activities"
	"forgejo.org/models/organization"
	"forgejo.org/models/quota"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/markup"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"net/http"
)

func person(ctx *context.Context, u *user_model.User) map[string]any {
	if u == nil {
		return nil
	}
	pronouns := u.Pronouns
	if u.KeepPronounsPrivate && (ctx.Doer == nil || ctx.Doer.ID != u.ID) {
		pronouns = ""
	}
	return map[string]any{"id": u.ID, "name": u.Name, "full_name": u.FullName, "avatar": u.AvatarLink(ctx), "description": u.Description, "location": u.Location, "website": u.Website, "pronouns": pronouns, "created_at": u.CreatedUnix.AsTime(), "organization": u.IsOrganization(), "visibility": u.Visibility}
}
func people(ctx *context.Context, input any) []map[string]any {
	var users []*user_model.User
	switch v := input.(type) {
	case []*user_model.User:
		users = v
	case user_model.UserList:
		users = v
	}
	items := make([]map[string]any, 0, len(users))
	for _, u := range users {
		items = append(items, person(ctx, u))
	}
	return items
}
func repositories(ctx *context.Context, input any) []map[string]any {
	var repos []*repo_model.Repository
	switch v := input.(type) {
	case []*repo_model.Repository:
		repos = v
	case repo_model.RepositoryList:
		repos = v
	}
	items := make([]map[string]any, 0, len(repos))
	for _, r := range repos {
		items = append(items, map[string]any{"id": r.ID, "name": r.Name, "full_name": r.FullName(), "description": r.Description, "private": r.IsPrivate, "stars": r.NumStars, "forks": r.NumForks, "updated_at": r.UpdatedUnix.AsTime()})
	}
	return items
}
func team(ctx *context.Context, t *organization.Team) map[string]any {
	if t == nil {
		return nil
	}
	permissions := map[int]int{}
	if t.ID != 0 {
		if err := t.LoadUnits(ctx); err != nil {
			ctx.ServerError("TeamUnits", err)
			return nil
		}
	}
	for _, u := range t.Units {
		permissions[int(u.Type)] = int(u.AccessMode)
	}
	return map[string]any{"id": t.ID, "name": t.Name, "description": t.Description, "permission": t.AccessMode.String(), "all_repositories": t.IncludesAllRepositories, "can_create_repositories": t.CanCreateOrgRepo, "members_count": t.NumMembers, "repositories_count": t.NumRepos, "owner_team": t.IsOwnerTeam(), "units": permissions, "members": people(ctx, t.Members), "repositories": repositories(ctx, t.Repos), "is_member": ctx.Doer != nil && t.IsMember(ctx, ctx.Doer.ID)}
}

// Workspace selects public display fields only after the native handler has
// applied its visibility, membership, and owner rules. Mutation routes are unchanged.
func Workspace(ctx *context.Context, kind string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"viewer_admin": ctx.IsUserSiteAdmin(), "federation_enabled": setting.Federation.Enabled, "feeds_enabled": setting.Other.EnableFeed, "packages_enabled": setting.Packages.Enabled, "kind": kind, "page": max(1, ctx.FormInt("page")), "page_size": setting.UI.User.RepoPagingNum, "total": ctx.Data["Total"]}
	if ctx.ContextUser != nil {
		data["profile"] = person(ctx, ctx.ContextUser)
	}
	if ctx.Doer != nil {
		data["viewer_id"] = ctx.Doer.ID
	}
	switch kind {
	case "org-invite":
		org, _ := ctx.Data["Organization"].(*organization.Organization)
		current, _ := ctx.Data["Team"].(*organization.Team)
		inviter, _ := ctx.Data["Inviter"].(*user_model.User)
		if org != nil {
			data["profile"] = person(ctx, org.AsUser())
		}
		data["team"] = team(ctx, current)
		data["inviter"] = person(ctx, inviter)
	case "profile":
		data["moderation_enabled"] = setting.Moderation.Enabled
		data["description_html"] = ctx.Data["RenderedDescription"]
		if ctx.Data["ShowUserEmail"] == true {
			data["email"] = ctx.ContextUser.Email
		}
		openIDs := make([]map[string]any, 0)
		if values, ok := ctx.Data["OpenIDs"].([]*user_model.UserOpenID); ok {
			for _, identity := range values {
				if identity.Show {
					openIDs = append(openIDs, map[string]any{"uri": identity.URI})
				}
			}
		}
		data["open_ids"] = openIDs
		orgs := make([]map[string]any, 0)
		if values, ok := ctx.Data["Orgs"].([]*organization.Organization); ok {
			for _, org := range values {
				if organization.HasOrgOrUserVisible(ctx, org.AsUser(), ctx.Doer) {
					orgs = append(orgs, person(ctx, org.AsUser()))
				}
			}
		}
		data["organizations"] = orgs
		data["badges"] = spaui.SelectedList(ctx.Data["Badges"], "image:ImageURL", "description:Description")
		federated := make([]map[string]any, 0)
		if values, ok := ctx.Data["FollowingFeeds"].([]*activities_model.FederatedUserActivity); ok && ctx.Doer != nil && ctx.Doer.ID == ctx.ContextUser.ID && setting.Federation.Enabled {
			for _, entry := range values {
				federated = append(federated, map[string]any{"id": entry.ID, "actor": entry.ActorURI, "html": markup.Sanitize(entry.NoteContent), "source": entry.NoteURL, "created_at": entry.Created.AsTime()})
			}
		}
		data["federated_activity"] = federated
		data["tab"] = ctx.Data["TabName"]
		if ctx.Data["TabName"] == "activity" {
			data["page_size"] = setting.UI.FeedPagingNum
		}
		data["items"] = repositories(ctx, ctx.Data["Repos"])
		data["readme"] = ctx.Data["SPAProfileReadme"]
		data["readme_html"] = profileReadmeHTML(ctx)
		data["people"] = people(ctx, ctx.Data["Cards"])
		data["followers"] = ctx.Data["NumFollowers"]
		data["following"] = ctx.Data["NumFollowing"]
		data["is_following"] = ctx.Data["IsFollowing"]
		data["is_blocked"] = ctx.Data["IsBlocked"]
		data["readme"] = ctx.Data["SPAProfileReadme"]
		data["readme_html"] = profileReadmeHTML(ctx)
		data["heatmap"] = ctx.Data["HeatmapData"]
		data["contributions"] = ctx.Data["HeatmapTotalContributions"]
		feeds := make([]map[string]any, 0)
		if actions, ok := ctx.Data["Feeds"].(activities_model.ActionList); ok {
			for _, a := range actions {
				if a.Repo == nil {
					continue
				}
				feeds = append(feeds, map[string]any{"id": a.ID, "type": a.OpType, "repository": a.Repo.FullName(), "ref": a.RefName, "content": a.Content, "created_at": a.CreatedUnix.AsTime()})
			}
		}
		data["activity"] = feeds
	case "users":
		data["people"] = people(ctx, ctx.Data["Users"])
		data["page_size"] = setting.UI.ExplorePagingNum
	case "org-new":
		data["visibility"] = setting.Service.DefaultOrgVisibilityMode
	case "repo-new":
		owners := make([]map[string]any, 0)
		if ctx.Doer.CanCreateRepo() {
			owners = append(owners, map[string]any{"id": ctx.Doer.ID, "name": ctx.Doer.Name, "organization": false})
		}
		if orgs, ok := ctx.Data["Orgs"].([]*organization.Organization); ok {
			for _, org := range orgs {
				owners = append(owners, map[string]any{"id": org.ID, "name": org.Name, "organization": true})
			}
		}
		data["owners"] = owners
		data["default_branch"] = setting.Repository.DefaultBranch
		data["forced_private"] = setting.Repository.ForcePrivate
		for key, value := range CreationOptions(ctx) {
			data[key] = value
		}
	default:
		if ctx.Org == nil || ctx.Org.Organization == nil {
			return false
		}
		org := ctx.Org.Organization
		data["profile"] = person(ctx, org.AsUser())
		data["is_owner"] = ctx.Org.IsOwner
		data["is_member"] = ctx.Org.IsMember
		data["is_team_member"] = ctx.Org.IsTeamMember
		data["moderation_enabled"] = setting.Moderation.Enabled
		data["is_following"] = ctx.Doer != nil && user_model.IsFollowing(ctx, ctx.Doer.ID, org.ID)
		data["description_html"] = workspaceDescription(ctx, org.Description)
		if ctx.Org.IsOwner {
			data["settings_features"] = map[string]bool{
				"webhooks":     !setting.DisableWebhooks,
				"applications": setting.OAuth2.Enabled,
				"packages":     setting.Packages.Enabled,
				"actions":      setting.Actions.Enabled,
				"storage":      setting.Quota.Enabled,
			}
			data["members_two_factor"] = ctx.Data["MembersTwoFaStatus"]
		}
		data["items"] = repositories(ctx, ctx.Data["Repos"])
		data["readme"] = ctx.Data["SPAProfileReadme"]
		data["readme_html"] = profileReadmeHTML(ctx)
		if kind == "org" || kind == "org-members" {
			data["people"] = people(ctx, ctx.Data["Members"])
			data["public_members"] = ctx.Data["MembersIsPublicMember"]
			data["owner_members"] = ctx.Data["MembersIsUserOrgOwner"]
			data["invite_required"] = setting.Service.AddMembersByInvitations
		}
		teams := make([]map[string]any, 0)
		if values, ok := ctx.Data["Teams"].([]*organization.Team); ok && (kind != "org-members" || ctx.Org.IsOwner) {
			for _, t := range values {
				teams = append(teams, team(ctx, t))
			}
		}
		data["teams"] = teams
		if ctx.Written() {
			return true
		}
		current := ctx.Org.Team
		if value, ok := ctx.Data["Team"].(*organization.Team); ok {
			current = value
		}
		data["team"] = team(ctx, current)
		if ctx.Written() {
			return true
		}
		units := make([]map[string]any, 0)
		for _, typ := range unit.AllRepoUnitTypes {
			if !typ.UnitGlobalDisabled() {
				units = append(units, map[string]any{"id": int(typ), "name": ctx.Locale.TrString(unit.Units[typ].NameKey), "readonly": typ == unit.TypeExternalTracker || typ == unit.TypeExternalWiki})
			}
		}
		data["available_units"] = units
		if kind == "org-members" || kind == "team-members" {
			data["page_size"] = setting.UI.MembersPagingNum
		}
		if current != nil {
			if kind == "team-members" {
				data["total"] = current.NumMembers
			}
			if kind == "team-repositories" {
				data["total"] = current.NumRepos
			}
		}
		if kind == "team-members" && ctx.Org.IsOwner {
			invites := make([]map[string]any, 0)
			if values, ok := ctx.Data["Invites"].([]*organization.TeamInvite); ok {
				for _, invite := range values {
					invites = append(invites, map[string]any{"id": invite.ID, "email": invite.Email, "user": person(ctx, invite.InvitedUser), "created_at": invite.CreatedUnix.AsTime()})
				}
			}
			data["invites"] = invites
			data["email_invites"] = ctx.Data["IsEmailInviteEnabled"]
			data["invite_required"] = setting.Service.AddMembersByInvitations
		}
		if kind == "org-settings" {
			data["settings"] = map[string]any{"name": org.Name, "full_name": org.FullName, "email": org.Email, "description": org.Description, "website": org.Website, "location": org.Location, "visibility": org.Visibility, "repo_admin_change_team_access": org.RepoAdminChangeTeamAccess, "max_repo_creation": org.MaxRepoCreation}
		}
		if kind == "org-blocked" {
			data["people"] = people(ctx, ctx.Data["BlockedUsers"])
		}
		if kind == "org-labels" {
			data["labels"] = spaui.Rows(ctx.Data["Labels"], "ID", "Name", "Description", "Color", "Exclusive", "ArchivedUnix")
			data["templates"] = ctx.Data["LabelTemplateFiles"]
		}
		if kind == "org-applications" {
			data["applications"] = spaui.Rows(ctx.Data["Applications"], "ID", "Name", "ClientID", "RedirectURIs", "ConfidentialClient", "CreatedUnix")
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

func Storage(ctx *context.Context) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"enabled": setting.Quota.Enabled}
	if used, ok := ctx.Data["SizeUsed"].(*quota.Used); ok {
		items := make([]map[string]any, 0)
		for subject := quota.LimitSubjectFirst; subject <= quota.LimitSubjectLast; subject++ {
			items = append(items, map[string]any{"subject": subject.String(), "used": used.CalculateFor(subject)})
		}
		data["items"] = items
		groups := make([]map[string]any, 0)
		if values, ok := ctx.Data["QuotaGroups"].(quota.GroupList); ok {
			for _, group := range values {
				rules := make([]map[string]any, 0)
				for _, rule := range group.Rules {
					subjects := make([]string, 0)
					for _, subject := range rule.Subjects {
						subjects = append(subjects, subject.String())
					}
					rules = append(rules, map[string]any{"name": rule.Name, "limit": rule.Limit, "used": rule.Sum(*used), "subjects": subjects})
				}
				groups = append(groups, map[string]any{"name": group.Name, "rules": rules})
			}
		}
		data["groups"] = groups
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

// profileReadmeHTML is the profile README as rendered by the native handler,
// sent next to the raw "readme" for the SPA's markup renderer.
func profileReadmeHTML(ctx *context.Context) any {
	if ctx.Data["SPAProfileReadme"] == nil || ctx.Data["ProfileReadme"] == nil {
		return nil
	}
	return fmt.Sprint(ctx.Data["ProfileReadme"])
}
