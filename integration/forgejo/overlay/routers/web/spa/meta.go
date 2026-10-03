// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	issues_model "forgejo.org/models/issues"
	"forgejo.org/models/organization"
	access_model "forgejo.org/models/perm/access"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/base"
	"forgejo.org/modules/card"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
)

// pageMeta mirrors templates/base/head_opengraph.tmpl for link previews of the
// server-rendered application shell.
type pageMeta struct {
	Title, Description                    string
	OGTitle, OGDescription, OGURL, OGType string
	ImageURL, ImageAlt                    string
	ImageWidth, ImageHeight               int
	SummaryCard                           bool
}

var (
	titlePattern       = regexp.MustCompile(`(?s)<title>.*?</title>`)
	descriptionPattern = regexp.MustCompile(`(?s)<meta\s+name="description"[^>]*>`)
	langPattern        = regexp.MustCompile(`<html lang="[^"]*">`)
)

func genericMeta() pageMeta {
	return pageMeta{
		Title: setting.AppDisplayName, Description: setting.UI.Meta.Description,
		OGTitle: setting.AppDisplayName, OGDescription: setting.UI.Meta.Description,
		OGURL: setting.AppURL, OGType: "website",
	}
}

// shellMeta derives preview metadata from the requested application path. Only
// objects the requester may read are described; everything else gets the
// instance's generic metadata, so private names never appear in the shell.
func shellMeta(ctx *context.Context, path string) pageMeta {
	meta := genericMeta()
	if setting.Service.RequireSignInView && !ctx.IsSigned {
		return meta
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if value, err := url.PathUnescape(part); err == nil {
			parts[i] = value
		}
	}
	switch {
	case len(parts) >= 3 && parts[0] == "projects":
		repoMeta(ctx, parts[1], parts[2], parts[3:], &meta)
	case len(parts) >= 2 && (parts[0] == "users" || parts[0] == "organizations") && parts[1] != "new" && parts[1] != "invite":
		ownerMeta(ctx, parts[1], &meta)
	}
	return meta
}

func ownerMeta(ctx *context.Context, name string, meta *pageMeta) {
	owner, err := user_model.GetUserByName(ctx, name)
	if err != nil || owner == nil {
		return
	}
	visible := false
	if owner.IsOrganization() {
		visible = organization.HasOrgOrUserVisible(ctx, owner, ctx.Doer)
	} else {
		visible = user_model.IsUserVisibleToViewer(ctx, owner, ctx.Doer)
	}
	if !visible {
		return
	}
	meta.Title = owner.DisplayName() + " - " + setting.AppDisplayName
	meta.OGTitle = owner.DisplayName()
	meta.OGType = "profile"
	meta.OGURL = owner.HTMLURL()
	meta.OGDescription = owner.Description
	meta.Description = owner.Description
	if meta.Description == "" {
		meta.Description = setting.UI.Meta.Description
	}
	meta.ImageURL = owner.AvatarLink(ctx)
}

func repoMeta(ctx *context.Context, ownerName, repoName string, tail []string, meta *pageMeta) {
	repo, err := repo_model.GetRepositoryByOwnerAndName(ctx, ownerName, repoName)
	if err != nil || repo == nil {
		return
	}
	perm, err := access_model.GetUserRepoPermission(ctx, repo, ctx.Doer)
	if err != nil || !perm.HasAccess() {
		return
	}
	fullName := repo.FullName()
	repoTitle := fullName
	if repo.Description != "" {
		repoTitle += ": " + repo.Description
	}
	meta.Title = repoTitle + " - " + setting.AppDisplayName
	meta.Description = repo.Name
	if repo.Description != "" {
		meta.Description += " - " + repo.Description
	}
	meta.OGTitle = repo.Name
	meta.OGURL = repo.HTMLURL()
	meta.OGType = "object"
	meta.OGDescription = repo.Description
	meta.ImageURL = repo.SummaryCardURL()
	meta.ImageWidth, meta.ImageHeight = card.DefaultSize()
	meta.SummaryCard = true
	if repo.Description == "" {
		meta.ImageAlt = ctx.Locale.TrString("repo.summary_card_alt", fullName)
	} else {
		meta.ImageAlt = ctx.Locale.TrString("og.repo.summary_card.alt_description", fullName, repo.Description)
	}
	if len(tail) < 2 {
		return
	}
	switch tail[0] {
	case "issues", "merge-requests":
		index, err := strconv.ParseInt(tail[1], 10, 64)
		if err != nil {
			return
		}
		isPull := tail[0] == "merge-requests"
		issue, err := issues_model.GetIssueByIndex(ctx, repo.ID, index)
		if err != nil || issue.IsPull != isPull || !perm.CanReadIssuesOrPulls(isPull) {
			return
		}
		issue.Repo = repo
		meta.Title = fmt.Sprintf("#%d - %s - %s - %s", issue.Index, issue.Title, fullName, setting.AppDisplayName)
		meta.OGTitle = issue.Title
		meta.OGURL = issue.HTMLURL()
		meta.OGType = "website"
		meta.OGDescription = issue.Content
		meta.ImageURL = issue.SummaryCardURL()
		meta.ImageWidth, meta.ImageHeight = 0, 0
		meta.ImageAlt = ctx.Locale.TrString("repo.issues.summary_card_alt", issue.Title, fullName)
	case "releases":
		if len(tail) < 3 || tail[1] != "tag" || !perm.CanRead(unit.TypeReleases) {
			return
		}
		release, err := repo_model.GetRelease(ctx, repo.ID, strings.Join(tail[2:], "/"))
		if err != nil || (release.IsDraft && !perm.CanWrite(unit.TypeReleases)) {
			return
		}
		release.Repo = repo
		meta.Title = release.DisplayName() + " - " + fullName + " - " + setting.AppDisplayName
		meta.OGTitle = fmt.Sprintf("%s - %s", release.DisplayName(), fullName)
		meta.OGURL = release.HTMLURL()
		meta.OGType = "website"
		meta.OGDescription = base.EllipsisString(release.Note, 300)
		meta.ImageURL = release.SummaryCardURL()
		meta.ImageWidth, meta.ImageHeight = 0, 0
		meta.ImageAlt = ctx.Locale.TrString("repo.release.summary_card_alt", release.DisplayName(), fullName)
	}
}

// renderMeta replaces the static title and description of index.html.
func renderMeta(ctx *context.Context, content []byte, meta pageMeta) []byte {
	attr := html.EscapeString
	var head strings.Builder
	head.WriteString("<title>" + attr(meta.Title) + "</title>\n")
	head.WriteString(`    <meta name="description" content="` + attr(meta.Description) + `" />` + "\n")
	head.WriteString(`    <meta property="og:title" content="` + attr(meta.OGTitle) + `" />` + "\n")
	if meta.OGDescription != "" {
		head.WriteString(`    <meta property="og:description" content="` + attr(base.EllipsisString(meta.OGDescription, 300)) + `" />` + "\n")
	}
	head.WriteString(`    <meta property="og:url" content="` + attr(meta.OGURL) + `" />` + "\n")
	head.WriteString(`    <meta property="og:type" content="` + attr(meta.OGType) + `" />` + "\n")
	image := meta.ImageURL
	if image == "" {
		image = setting.StaticURLPrefix + "/assets/img/logo.png"
		if !strings.HasPrefix(image, "http") {
			image = strings.TrimSuffix(setting.AppURL, "/") + strings.TrimPrefix(image, setting.AppSubURL)
		}
	}
	head.WriteString(`    <meta property="og:image" content="` + attr(image) + `" />` + "\n")
	if meta.ImageWidth > 0 && meta.ImageHeight > 0 {
		head.WriteString(fmt.Sprintf(`    <meta property="og:image:width" content="%d" />`+"\n", meta.ImageWidth))
		head.WriteString(fmt.Sprintf(`    <meta property="og:image:height" content="%d" />`+"\n", meta.ImageHeight))
	}
	if meta.ImageAlt != "" {
		head.WriteString(`    <meta property="og:image:alt" content="` + attr(meta.ImageAlt) + `" />` + "\n")
	}
	head.WriteString(`    <meta property="og:site_name" content="` + attr(setting.AppDisplayName) + `" />` + "\n")
	cardType := "summary"
	if meta.SummaryCard || strings.Contains(meta.ImageURL, "summary-card") {
		cardType = "summary_large_image"
	}
	head.WriteString(`    <meta name="twitter:card" content="` + cardType + `" />`)
	content = descriptionPattern.ReplaceAll(content, nil)
	replaced := false
	content = titlePattern.ReplaceAllFunc(content, func([]byte) []byte {
		if replaced {
			return nil
		}
		replaced = true
		return []byte(head.String())
	})
	return langPattern.ReplaceAll(content, []byte(`<html lang="`+attr(ctx.Locale.Language())+`">`))
}
