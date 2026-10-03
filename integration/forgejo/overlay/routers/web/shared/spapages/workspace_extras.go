// Copyright 2026 The Forgejo UI Authors.
// SPDX-License-Identifier: MIT
package spapages

import (
	issues_model "forgejo.org/models/issues"
	"forgejo.org/models/moderation"
	project_model "forgejo.org/models/project"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/modules/git"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/modules/structs"
	"forgejo.org/routers/web/shared/spaboards"
	"forgejo.org/services/context"
	"net/http"
)

func CreationOptions(ctx *context.Context) map[string]any {
	formats := make([]string, 0)
	for _, format := range git.SupportedObjectFormats {
		formats = append(formats, format.Name())
	}
	return map[string]any{"gitignores": ctx.Data["Gitignores"], "licenses": ctx.Data["Licenses"], "readmes": ctx.Data["Readmes"], "label_templates": ctx.Data["LabelTemplateFiles"], "object_formats": formats, "can_edit_git_hooks": ctx.Doer.CanEditGitHook()}
}

func Extras(ctx *context.Context, kind string, total int) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	data := map[string]any{"kind": kind, "total": total, "page_size": setting.UI.IssuePagingNum}
	if ctx.ContextUser != nil {
		data["profile"] = person(ctx, ctx.ContextUser)
	}
	switch kind {
	case "boards":
		projects, _ := ctx.Data["Projects"].([]*project_model.Project)
		openCounts, _ := ctx.Data["NumOpenIssuesInProject"].(map[int64]int)
		closedCounts, _ := ctx.Data["NumClosedIssuesInProject"].(map[int64]int)
		rows := make([]map[string]any, 0, len(projects))
		for _, project := range projects {
			row := spaui.Selected(project, "id:ID", "title:Title", "description:Description", "closed:IsClosed", "card_type:CardType")
			row["description_html"] = workspaceDescription(ctx, project.Description)
			row["open_count"] = openCounts[project.ID]
			row["closed_count"] = closedCounts[project.ID]
			rows = append(rows, row)
		}
		data["items"] = rows
		data["open_count"] = ctx.Data["OpenCount"]
		data["closed_count"] = ctx.Data["ClosedCount"]
		data["can_write"] = ctx.Data["CanWriteProjects"]
	case "board-form":
		data["title"] = ctx.Data["title"]
		data["description"] = ctx.Data["content"]
		data["card_type"] = ctx.Data["card_type"]
		data["can_write"] = ctx.Data["CanWriteProjects"]
		templates := make([]map[string]any, 0)
		for _, template := range project_model.GetTemplateConfigs() {
			templates = append(templates, map[string]any{"id": template.TemplateType, "name": ctx.Locale.TrString(template.Translation)})
		}
		data["templates"] = templates
	case "board":
		data["project"] = spaui.Selected(ctx.Data["Project"], "id:ID", "title:Title", "description:Description", "closed:IsClosed", "card_type:CardType")
		if project, ok := ctx.Data["Project"].(*project_model.Project); ok {
			data["project"].(map[string]any)["description_html"] = workspaceDescription(ctx, project.Description)
		}
		data["can_write"] = ctx.Data["CanWriteProjects"]
		columns := make([]map[string]any, 0)
		issues, _ := ctx.Data["IssuesMap"].(map[int64]issues_model.IssueList)
		project, _ := ctx.Data["Project"].(*project_model.Project)
		if values, ok := ctx.Data["Columns"].(project_model.ColumnList); ok {
			for _, column := range values {
				item := spaui.Selected(column, "id:ID", "title:Title", "color:Color", "default:Default")
				cards, err := spaboards.CardIssues(ctx, issues[column.ID], project.CardType)
				if err != nil {
					ctx.ServerError("Board cards", err)
					return true
				}
				item["issues"] = cards
				columns = append(columns, item)
			}
		}
		data["columns"] = columns
		attachments := map[int64][]map[string]any{}
		if values, ok := ctx.Data["issuesAttachmentMap"].(map[int64][]*repo_model.Attachment); ok {
			for id, files := range values {
				for _, file := range files {
					attachments[id] = append(attachments[id], map[string]any{"name": file.Name, "url": file.DownloadURL()})
				}
			}
		}
		data["attachments"] = attachments
	case "report":
		data["content_id"] = ctx.Data["ContentID"]
		data["content_type"] = ctx.Data["ContentType"]
		categories := make([]map[string]any, 0)
		for _, category := range moderation.GetAbuseCategoriesList() {
			categories = append(categories, map[string]any{"id": category.Value, "name": ctx.Locale.TrString(category.TranslationKey)})
		}
		data["categories"] = categories
	case "migration":
		services := make([]map[string]any, 0)
		for _, service := range append([]structs.GitServiceType{structs.PlainGitService}, structs.SupportedFullGitService...) {
			features := []string{}
			switch service {
			case structs.PlainGitService:
			case structs.OneDevService, structs.CodebaseService, structs.PagureService:
				features = []string{"issues", "pull_requests", "labels", "milestones"}
			default:
				features = []string{"wiki", "issues", "pull_requests", "labels", "milestones", "releases"}
			}
			token := service.TokenAuth() || service == structs.GogsService || service == structs.PagureService
			services = append(services, map[string]any{"id": service, "name": service.Title(), "token_auth": token, "features": features})
		}
		data["services"] = services
		data["lfs"] = setting.LFS.StartServer
		data["mirrors"] = !setting.Mirror.DisableNewPull
		data["forced_private"] = setting.Repository.ForcePrivate
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
