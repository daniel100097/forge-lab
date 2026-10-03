package repo

import (
	"encoding/json"

	"forgejo.org/modules/markup"
	"forgejo.org/modules/markup/markdown"
	"forgejo.org/services/context"
)

func writeRenderedIssueCreationUI(ctx *context.Context, choose bool) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	if fields := ctx.Data["Fields"]; fields != nil {
		encoded, err := json.Marshal(fields)
		if err != nil {
			ctx.ServerError("Issue template fields", err)
			return true
		}
		var values []map[string]any
		if err := json.Unmarshal(encoded, &values); err != nil {
			ctx.ServerError("Issue template fields", err)
			return true
		}
		for _, field := range values {
			attributes, ok := field["attributes"].(map[string]any)
			if !ok {
				continue
			}
			for _, key := range []string{"description", "value"} {
				if key == "value" && field["type"] != "markdown" {
					continue
				}
				text, ok := attributes[key].(string)
				if !ok || text == "" {
					continue
				}
				html, err := markdown.RenderString(&markup.RenderContext{Links: markup.Links{Base: ctx.Repo.RepoLink}, Metas: ctx.Repo.Repository.ComposeMetas(ctx), GitRepo: ctx.Repo.GitRepo, Ctx: ctx}, text)
				if err != nil {
					ctx.ServerError("Issue template markdown", err)
					return true
				}
				attributes[key+"_html"] = string(html)
			}
		}
		ctx.Data["Fields"] = values
	}
	return writeIssueCreationUI(ctx, choose)
}
