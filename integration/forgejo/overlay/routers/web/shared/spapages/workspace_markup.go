package spapages

import (
	"forgejo.org/modules/markup"
	"forgejo.org/modules/markup/markdown"
	"forgejo.org/services/context"
)

func workspaceDescription(ctx *context.Context, content string) string {
	if content == "" {
		return ""
	}
	rendered, err := markdown.RenderString(&markup.RenderContext{Ctx: ctx, Metas: map[string]string{"mode": "document"}}, content)
	if err != nil {
		ctx.ServerError("RenderWorkspaceDescription", err)
		return ""
	}
	return string(rendered)
}
