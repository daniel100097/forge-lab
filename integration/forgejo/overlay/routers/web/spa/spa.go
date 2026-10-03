// SPDX-License-Identifier: GPL-3.0-or-later

// Package spa hosts an independently built browser application within Forgejo.
// Its routes use Forgejo's normal web session and permission middleware.
package spa

import (
	"bytes"
	"embed"
	"html"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	auth_model "forgejo.org/models/auth"
	issues_model "forgejo.org/models/issues"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/translation"
	"forgejo.org/services/context"
)

//go:embed dist
var assets embed.FS

func Shell(ctx *context.Context) {
	content, err := assets.ReadFile("dist/index.html")
	if err != nil {
		ctx.ServerError("SPA assets", err)
		return
	}
	content = bytes.ReplaceAll(content, []byte("__FORGEJO_UI_BASE__"), []byte(html.EscapeString(setting.AppSubURL+"/-/ui/")))
	meta := shellMeta(ctx, ctx.Params("*"))
	if meta.OGURL == setting.AppURL {
		meta.OGURL = strings.TrimSuffix(setting.AppURL, "/") + ctx.Req.URL.EscapedPath()
	}
	content = renderMeta(ctx, content, meta)
	ctx.Resp.Header().Set("Content-Type", "text/html; charset=utf-8")
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.Resp.WriteHeader(http.StatusOK)
	if ctx.Req.Method != http.MethodHead {
		_, _ = ctx.Resp.Write(content)
	}
}

func Asset(ctx *context.Context) {
	name := ctx.Params("*")
	if !fs.ValidPath(name) || strings.HasPrefix(name, ".") {
		ctx.NotFound("", nil)
		return
	}
	content, err := assets.ReadFile("dist/assets/" + name)
	if err != nil {
		ctx.NotFound("", nil)
		return
	}
	ctx.Resp.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(ctx.Resp, ctx.Req, path.Base(name), time.Time{}, bytes.NewReader(content))
}

func Bootstrap(ctx *context.Context) {
	var user any
	state := "anonymous"
	if ctx.IsSigned {
		state = "ready"
		switch {
		case !ctx.Doer.IsActive:
			state = "inactive"
		case ctx.Doer.ProhibitLogin:
			state = "blocked"
		case ctx.Doer.MustChangePassword:
			state = "password_change"
		case ctx.Doer.MustHaveTwoFactor():
			has, err := auth_model.HasTwoFactorByUID(ctx, ctx.Doer.ID)
			if err != nil {
				ctx.ServerError("TwoFactor", err)
				return
			}
			if !has {
				state = "security_setup"
			}
		}
	}
	var stopwatch any
	if state == "ready" {
		user = map[string]any{
			"id": ctx.Doer.ID, "username": ctx.Doer.Name, "name": ctx.Doer.FullName,
			"avatar": ctx.Doer.AvatarLink(ctx), "admin": ctx.Doer.IsAdmin,
			"can_create_org": ctx.Doer.CanCreateOrganization(), "theme": ctx.Doer.Theme,
		}
		// The running time tracker shown in the native navbar (GetActiveStopwatch).
		if setting.Service.EnableTimetracking {
			if _, sw, issue, err := issues_model.HasUserStopwatch(ctx, ctx.Doer.ID); err == nil && sw != nil && sw.ID != 0 && issue != nil && issue.Repo != nil {
				stopwatch = map[string]any{
					"owner": issue.Repo.OwnerName, "repo": issue.Repo.Name, "index": issue.Index,
					"title": issue.Title, "pull": issue.IsPull, "seconds": sw.Seconds() + 1,
				}
			}
		}
	}
	// The locale resolved by Forgejo's middleware: ?lang, the lang cookie
	// (set from the user's preference at sign-in) or Accept-Language.
	languages := make([]map[string]string, 0, len(translation.AllLangs()))
	for _, lang := range translation.AllLangs() {
		languages = append(languages, map[string]string{"lang": lang.Lang, "name": lang.Name})
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{
		"contract": 1, "app_name": setting.AppName, "app_sub_url": setting.AppSubURL, "app_url": setting.AppURL,
		"user": user, "auth_state": state, "flash_error": ctx.Flash.ErrorMsg, "stopwatch": stopwatch,
		"locale": ctx.Locale.Language(), "languages": languages,
		"auth": map[string]bool{
			"internal_login":   setting.Service.EnableInternalSignIn,
			"captcha_required": setting.Service.EnableCaptcha && setting.Service.RequireCaptchaForLogin,
			"password_reset":   setting.MailService != nil,
			"require_sign_in":  setting.Service.RequireSignInView,
		},
	})
}

func NoCache(ctx *context.Context) {
	ctx.Resp.Header().Set("Cache-Control", "no-store")
}
