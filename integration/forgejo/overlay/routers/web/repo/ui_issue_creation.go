// SPDX-License-Identifier: GPL-3.0-or-later
package repo

import (
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"net/http"
)

// writeIssueCreationUI runs after the native template and permission checks.
func writeIssueCreationUI(ctx *context.Context, choose bool) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	data := map[string]any{
		"templates": ctx.Data["IssueTemplates"], "config": ctx.Data["IssueConfig"],
		"has_templates": ctx.Data["NewIssueChooseTemplate"], "fields": ctx.Data["Fields"],
		"template_file": ctx.Data["TemplateFile"], "template_title": ctx.Data["IssueTemplateTitle"],
		"template_body": ctx.Data["IssueTemplate"], "title": ctx.Data["TitleQuery"], "body": ctx.Data["BodyQuery"],
		"reference": ctx.Data["Reference"], "label_ids": ctx.Data["label_ids"],
		"can_assign":  ctx.Data["HasIssuesOrPullsWritePermission"],
		"labels":      append(spaui.Rows(ctx.Data["Labels"], "ID", "Name", "Color"), spaui.Rows(ctx.Data["OrgLabels"], "ID", "Name", "Color")...),
		"milestones":  spaui.Rows(ctx.Data["OpenMilestones"], "ID", "Name"),
		"projects":    spaui.Rows(ctx.Data["OpenProjects"], "ID", "Title"),
		"assignees":   spaui.Rows(ctx.Data["Assignees"], "ID", "Name", "FullName"),
		"attachments": setting.Attachment.Enabled,
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
