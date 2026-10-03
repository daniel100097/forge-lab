// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"net/http"

	issues_model "forgejo.org/models/issues"
	"forgejo.org/models/organization"
	repo_model "forgejo.org/models/repo"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/emoji"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
)

// Mentions returns the @mention candidates native issue pages provide to the
// markdown editor (window.config.mentionValues): the issue's participants, the
// repository's assignable users and the organization teams the viewer may
// mention (handleTeamMentions).
func Mentions(ctx *context.Context) {
	users := make([]map[string]any, 0)
	seen := map[int64]bool{}
	add := func(list []*user_model.User) {
		for _, u := range list {
			if u == nil || seen[u.ID] {
				continue
			}
			seen[u.ID] = true
			users = append(users, map[string]any{"name": u.Name, "full_name": u.FullName, "avatar": u.AvatarLink(ctx)})
		}
	}
	add([]*user_model.User{ctx.Doer})
	if index := ctx.FormInt64("issue"); index > 0 {
		issue, err := issues_model.GetIssueByIndex(ctx, ctx.Repo.Repository.ID, index)
		if err == nil && ctx.Repo.CanReadIssuesOrPulls(issue.IsPull) {
			ids, err := issues_model.GetParticipantsIDsByIssueID(ctx, issue.ID)
			if err != nil {
				ctx.ServerError("Participants", err)
				return
			}
			ids = append([]int64{issue.PosterID}, ids...)
			participants, err := user_model.GetUsersByIDs(ctx, ids)
			if err != nil {
				ctx.ServerError("Participants", err)
				return
			}
			add(participants)
		}
	}
	assignees, err := repo_model.GetRepoAssignees(ctx, ctx.Repo.Repository)
	if err != nil {
		ctx.ServerError("Assignees", err)
		return
	}
	add(assignees)
	teams := make([]map[string]any, 0)
	if ctx.Repo.Owner.IsOrganization() {
		org := organization.OrgFromUser(ctx.Repo.Owner)
		isAdmin := ctx.Doer.IsAdmin
		if !isAdmin {
			if isAdmin, err = org.IsOwnedBy(ctx, ctx.Doer.ID); err != nil {
				ctx.ServerError("IsOwnedBy", err)
				return
			}
		}
		var list []*organization.Team
		if isAdmin {
			list, err = org.LoadTeams(ctx)
		} else {
			list, err = org.GetUserTeams(ctx, ctx.Doer.ID)
		}
		if err != nil {
			ctx.ServerError("Teams", err)
			return
		}
		for _, team := range list {
			teams = append(teams, map[string]any{"name": ctx.Repo.Owner.Name + "/" + team.Name, "avatar": ctx.Repo.Owner.AvatarLink(ctx)})
		}
	}
	ctx.JSON(http.StatusOK, map[string]any{"users": users, "teams": teams})
}

// Emoji lists the aliases Forgejo's markdown renderer replaces, for the
// editor's ":" suggestions: [alias, emoji] for gemoji and [alias, "", image]
// for the instance's custom emoji.
func Emoji(ctx *context.Context) {
	items := make([][]string, 0, len(emoji.GemojiData)+len(setting.UI.CustomEmojis))
	for _, name := range setting.UI.CustomEmojis {
		items = append(items, []string{name, "", setting.StaticURLPrefix + "/assets/img/emoji/" + name + ".png"})
	}
	for _, e := range emoji.GemojiData {
		for _, alias := range e.Aliases {
			items = append(items, []string{alias, e.Emoji})
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "private, max-age=86400")
	ctx.JSON(http.StatusOK, items)
}
