// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"fmt"
	"strings"

	issues_model "forgejo.org/models/issues"
	"forgejo.org/modules/log"
	"forgejo.org/modules/markup"
	"forgejo.org/modules/markup/markdown"
	"forgejo.org/services/context"
)

// Markup rendered by Forgejo travels next to the raw text: a field "X" gets
// "X_html" (sanitized HTML, exactly what native templates show) and, when the
// viewer may edit it, "X_edit" (the native update endpoint and content version
// used for task-list toggles). The browser falls back to its own renderer when
// "X_html" is absent.

// renderComment renders comment-style markdown like the native issue view.
func renderComment(ctx *context.Context, metas map[string]string, content string) string {
	if strings.TrimSpace(content) == "" {
		return ""
	}
	if metas == nil {
		metas = ctx.Repo.Repository.ComposeMetas(ctx)
	}
	rendered, err := markdown.RenderString(&markup.RenderContext{
		Links:   markup.Links{Base: ctx.Repo.RepoLink},
		Metas:   metas,
		GitRepo: ctx.Repo.GitRepo,
		Ctx:     ctx,
	}, content)
	if err != nil {
		log.Error("Render markdown for the SPA: %v", err)
		return ""
	}
	return string(rendered)
}

func markupEdit(url string, version int) map[string]any {
	return map[string]any{"url": url, "version": version}
}

func issueContentEdit(ctx *context.Context, issue *issues_model.Issue) map[string]any {
	kind := "issues"
	if issue.IsPull {
		kind = "pulls"
	}
	return markupEdit(fmt.Sprintf("%s/%s/%d/content", ctx.Repo.RepoLink, kind, issue.Index), issue.ContentVersion)
}

func commentContentEdit(ctx *context.Context, comment *issues_model.Comment) map[string]any {
	return markupEdit(fmt.Sprintf("%s/comments/%d", ctx.Repo.RepoLink, comment.ID), comment.ContentVersion)
}

// timelineMarkup adds rendered content to one page of timeline rows. Only
// comment types whose content native templates render as markdown are
// rendered; commit references are sanitized HTML like the native template.
func timelineMarkup(ctx *context.Context, rows []map[string]any, sources []*issues_model.Comment) {
	metas := ctx.Repo.Repository.ComposeMetas(ctx)
	for i, row := range rows {
		comment := sources[i]
		body, _ := row["body"].(string)
		if body == "" {
			continue
		}
		switch {
		case comment.Type == issues_model.CommentTypeCommitRef:
			row["body_html"] = markup.Sanitize(body)
		case comment.Type.HasContentSupport():
			row["body_html"] = renderComment(ctx, metas, body)
			if row["can_edit"] == true {
				row["body_edit"] = commentContentEdit(ctx, comment)
			}
		}
	}
}
