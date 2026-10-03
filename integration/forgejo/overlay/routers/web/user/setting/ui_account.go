// SPDX-License-Identifier: GPL-3.0-or-later
package setting

import (
	"html/template"
	"net/http"

	asymkey_model "forgejo.org/models/asymkey"
	auth_model "forgejo.org/models/auth"
	"forgejo.org/models/organization"
	repo_model "forgejo.org/models/repo"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
)

func writeAccountUI(ctx *context.Context, page string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	if ctx.Written() {
		return true
	}
	data := map[string]any{}
	switch page {
	case "account":
		data = map[string]any{"emails": spaui.Rows(ctx.Data["Emails"], "ID", "Email", "IsPrimary", "IsActivated", "CanBePrimary"), "can_add_email": ctx.Data["CanAddEmails"], "notification_preference": ctx.Doer.EmailNotificationsPreference, "disabled_features": ctx.Data["UserDisabledFeatures"], "has_password": ctx.Doer.IsPasswordSet()}
		// Native account page flags (templates/user/settings/account.tmpl).
		data["disabled"] = disabledFeaturesUI(ctx)
		data["enable_notify_mail"] = setting.Service.EnableNotifyMail
		data["activations_pending"] = ctx.Data["ActivationsPending"] == true
		data["delete_with_comments"] = ctx.Data["UserDeleteWithComments"] == true
		data["delete_with_comments_max_time"] = ctx.Data["UserDeleteWithCommentsMaxTime"]
		data["is_admin"] = ctx.Doer.IsAdmin
	case "keys":
		data = map[string]any{"keys": sshKeysUI(ctx.Data["Keys"], ctx.Data["ExternalKeys"]), "gpg": gpgKeysUI(ctx.Data["GPGKeys"]), "principals": sshKeysUI(ctx.Data["Principals"], nil), "token_to_sign": ctx.Data["TokenToSign"], "ssh_disabled": ctx.Data["DisableSSH"], "allow_principals": ctx.Data["AllowPrincipals"], "disabled_features": ctx.Data["UserDisabledFeatures"]}
		// ssh-keygen -Y sign uses the instance domain as its namespace (models/asymkey/ssh_key_verify.go).
		data["domain"] = setting.Domain
		data["disabled"] = disabledFeaturesUI(ctx)
	case "applications":
		tokens := make([]map[string]any, 0)
		if entries, ok := ctx.Data["TokensWithResources"].([]*TokenWithResources); ok {
			for _, entry := range entries {
				token := spaui.Fields(entry.Token, "ID", "Name", "Scope", "CreatedUnix", "UpdatedUnix", "ResourceAllRepos")
				token["repositories"] = spaui.Rows(entry.Repositories, "ID", "OwnerName", "Name")
				tokens = append(tokens, token)
			}
		}
		grants := make([]map[string]any, 0)
		if values, ok := ctx.Data["Grants"].([]*auth_model.OAuth2Grant); ok {
			for _, grant := range values {
				row := spaui.Fields(grant, "ID", "ApplicationID", "Scope", "CreatedUnix")
				row["ApplicationName"] = ""
				if grant.Application != nil {
					row["ApplicationName"] = grant.Application.Name
				}
				grants = append(grants, row)
			}
		}
		data = map[string]any{"tokens": tokens, "oauth_enabled": ctx.Data["EnableOAuth2"], "applications": spaui.Rows(ctx.Data["Applications"], "ID", "Name", "ClientID", "RedirectURIs", "ConfidentialClient", "CreatedUnix"), "grants": grants}
	case "token_new":
		data = map[string]any{"categories": ctx.Data["Categories"], "repositories": spaui.Rows(ctx.Data["Repos"], "ID", "Name", "OwnerName", "IsPrivate"), "selected_repositories": spaui.Rows(ctx.Data["SelectedRepos"], "ID", "Name", "OwnerName", "IsPrivate"), "page": accountPagination(ctx, "Page")}
	case "oauth":
		app, _ := ctx.Data["App"].(*auth_model.OAuth2Application)
		data = map[string]any{"application": spaui.Fields(app, "ID", "Name", "ClientID", "RedirectURIs", "ConfidentialClient", "CreatedUnix"), "client_secret": ctx.Data["ClientSecret"]}
	case "organizations":
		items := make([]map[string]any, 0)
		if orgs, ok := ctx.Data["Orgs"].([]*organization.Organization); ok {
			for _, org := range orgs {
				row := spaui.Fields(org, "ID", "Name", "FullName", "Description", "Visibility")
				row["Avatar"] = org.AvatarLink(ctx)
				items = append(items, row)
			}
		}
		data = map[string]any{"items": items, "page": accountPagination(ctx, "Page"), "can_create_org": ctx.Doer.CanCreateOrganization()}
	case "repositories":
		items := spaui.Rows(ctx.Data["Repos"], "ID", "Name", "OwnerName", "IsPrivate", "IsFork")
		if repos, ok := ctx.Data["ReposMap"].(map[string]*repo_model.Repository); ok {
			for _, r := range repos {
				items = append(items, spaui.Fields(r, "ID", "Name", "OwnerName", "IsPrivate", "IsFork"))
			}
		}
		data = map[string]any{"items": items, "directories": ctx.Data["Dirs"], "allow_adopt": ctx.Data["allowAdopt"], "allow_delete": ctx.Data["allowDelete"], "page": accountPagination(ctx, "Page")}
	case "integrations":
		data = map[string]any{"items": spaui.Rows(ctx.Data["AuthorizedIntegrations"], "ID", "Name", "Description", "UI", "Issuer", "Audience", "Scope", "ResourceAllRepos", "CreatedUnix", "UpdatedUnix")}
	case "integration_edit":
		data = map[string]any{"form": spaui.Fields(ctx.Data["Form"], "Name", "Description", "Audience", "Resource", "SelectedRepo", "ScopeAll", "Scope", "Issuer", "ClaimRules", "SourceRepo", "WorkflowFile", "GitRef", "Event"), "categories": ctx.Data["Categories"], "repositories": spaui.Rows(ctx.Data["Repos"], "Name", "OwnerName", "IsPrivate"), "selected_repositories": spaui.Rows(ctx.Data["SelectedRepos"], "Name", "OwnerName", "IsPrivate"), "action_repositories": spaui.Rows(ctx.Data["ActionsRepos"], "Name", "OwnerName", "IsPrivate"), "page": accountPagination(ctx, "Page"), "action_page": accountPagination(ctx, "ActionsPage"), "is_new": ctx.Data["IsNew"] == true}
		if source, ok := ctx.Data["SourceRepo"].(*repo_model.Repository); ok {
			data["source_repository"] = spaui.Fields(source, "Name", "OwnerName", "IsPrivate")
		}
	case "blocked":
		data = map[string]any{"users": spaui.Rows(ctx.Data["BlockedUsers"], "ID", "Name", "FullName")}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

// accountPagination describes one of the native pagers, including the page and
// total that the repository pickers need for their search results.
func accountPagination(ctx *context.Context, name string) map[string]any {
	if p, ok := ctx.Data[name].(*context.Pagination); ok {
		return map[string]any{"HasNext": p.Paginater.HasNext(), "HasPrevious": p.Paginater.HasPrevious(), "Current": p.Paginater.Current(), "TotalPages": p.Paginater.TotalPages(), "Total": p.Paginater.Total()}
	}
	return map[string]any{}
}

func disabledFeaturesUI(ctx *context.Context) []string {
	values := user_model.DisabledFeaturesWithLoginType(ctx.Doer).Values()
	if values == nil {
		return []string{}
	}
	return values
}

// sshKeysUI lists public keys with the dates and usage shown by the native key
// list. External reports keys managed by an authentication source.
func sshKeysUI(input, external any) []map[string]any {
	rows := make([]map[string]any, 0)
	keys, _ := input.([]*asymkey_model.PublicKey)
	managed, _ := external.([]bool)
	for i, key := range keys {
		row := spaui.Fields(key, "ID", "Name", "Fingerprint", "Content", "CreatedUnix", "UpdatedUnix", "Verified", "HasUsed", "HasRecentActivity")
		row["OmitEmail"] = key.OmitEmail()
		row["External"] = i < len(managed) && managed[i]
		rows = append(rows, row)
	}
	return rows
}

// gpgKeysUI lists GPG keys with matched identities, subkeys and expiry like
// templates/user/settings/keys_gpg.tmpl.
func gpgKeysUI(input any) []map[string]any {
	rows := make([]map[string]any, 0)
	keys, _ := input.([]*asymkey_model.GPGKey)
	for _, key := range keys {
		row := spaui.Fields(key, "ID", "KeyID", "PrimaryKeyID", "Content", "CreatedUnix", "AddedUnix", "ExpiredUnix", "Verified")
		row["PaddedKeyID"] = key.PaddedKeyID()
		emails := make([]string, 0, len(key.Emails))
		for _, email := range key.Emails {
			if email != nil {
				emails = append(emails, email.Email)
			}
		}
		row["Emails"] = emails
		subkeys := make([]string, 0, len(key.SubsKey))
		for _, sub := range key.SubsKey {
			if sub != nil {
				subkeys = append(subkeys, sub.PaddedKeyID())
			}
		}
		row["SubKeys"] = subkeys
		rows = append(rows, row)
	}
	return rows
}

// writeKeySignatureUI returns the token-signing step that the native GPG form
// shows when a key needs a signature (no matching email or an invalid signature).
func writeKeySignatureUI(ctx *context.Context, message template.HTML) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.Written() {
		return false
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{
		"signature_required": map[string]any{
			"message": string(message), "key_id": ctx.Data["KeyID"], "padded_key_id": ctx.Data["PaddedKeyID"],
			"token_to_sign": ctx.Data["TokenToSign"],
		},
	})
	return true
}

// profileSettingsUI adds the native profile page options (profile.tmpl) and the
// settings navigation flags (navbar.tmpl) to the profile data.
func profileSettingsUI(ctx *context.Context) map[string]any {
	u := ctx.Doer
	return map[string]any{
		"cooldown_period":   setting.Service.UsernameCooldownPeriod,
		"disable_gravatar":  ctx.Data["DisableGravatar"] == true,
		"use_custom_avatar": u.UseCustomAvatar, "avatar_email": u.AvatarEmail, "avatar": u.AvatarLinkWithSize(ctx, 160),
		"max_avatar_file_size": setting.Avatar.MaxFileSize, "max_avatar_width": setting.Avatar.MaxWidth, "max_avatar_height": setting.Avatar.MaxHeight,
		"placeholder_email": u.GetPlaceholderEmail(), "common_pronouns": ctx.Data["CommonPronouns"],
		"nav": accountNavUI(ctx),
	}
}

func accountNavUI(ctx *context.Context) map[string]any {
	disabled := user_model.DisabledFeaturesWithLoginType(ctx.Doer)
	return map[string]any{
		"actions": setting.Actions.Enabled, "packages": setting.Packages.Enabled, "webhooks": !setting.DisableWebhooks,
		"quota": setting.Quota.Enabled, "oauth2": setting.OAuth2.Enabled,
		"ssh_keys":   !disabled.Contains(setting.UserFeatureManageSSHKeys),
		"gpg_keys":   !disabled.Contains(setting.UserFeatureManageGPGKeys),
		"principals": setting.SSH.AuthorizedPrincipalsEnabled,
	}
}

// appearanceThemesUI lists the themes users may choose (settings.UI.Themes) with
// their localized names, like the native appearance page.
func appearanceThemesUI(ctx *context.Context) []map[string]string {
	themes := make([]map[string]string, 0, len(setting.UI.Themes))
	for _, theme := range setting.UI.Themes {
		name := theme
		if key := "themes.names." + theme; ctx.Locale.HasKey(key) {
			name = ctx.Locale.TrString(key)
		}
		themes = append(themes, map[string]string{"id": theme, "name": name})
	}
	return themes
}
