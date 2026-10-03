// SPDX-License-Identifier: GPL-3.0-or-later
package actions

import (
	"net/http"

	actions_model "forgejo.org/models/actions"
	"forgejo.org/models/shared/types"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
)

func runnerUI(r *actions_model.ActionRunner, owner, repo int64) map[string]any {
	data := spaui.Selected(r, "id:ID", "uuid:UUID", "name:Name", "description:Description", "version:Version", "labels:AgentLabels", "last_online:LastOnline", "last_active:LastActive", "created:Created", "ephemeral:Ephemeral")
	data["status"], data["editable"] = r.StatusName(), r.Editable(owner, repo)
	if r.Repo != nil || r.Owner != nil {
		data["scope"] = r.BelongsToOwnerName()
	} else if r.RepoID != 0 {
		data["scope"] = "Project"
	} else if r.OwnerID != 0 {
		data["scope"] = "Namespace"
	} else {
		data["scope"] = "Instance"
	}
	// BelongsToOwnerType dereferences the owner; only use it once attributes are loaded.
	switch {
	case r.RepoID != 0:
		data["owner_type"] = types.OwnerTypeRepository
		if r.Repo != nil {
			data["owner_name"] = r.Repo.FullName()
		}
	case r.OwnerID != 0 && r.Owner != nil:
		data["owner_type"], data["owner_name"] = string(r.BelongsToOwnerType()), r.Owner.Name
	case r.OwnerID == 0:
		data["owner_type"] = types.OwnerTypeSystemGlobal
	}
	return data
}

func runnerTasksUI(value any) []map[string]any {
	var tasks []*actions_model.ActionTask
	switch list := value.(type) {
	case []*actions_model.ActionTask:
		tasks = list
	case actions_model.TaskList:
		tasks = list
	}
	items := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		// The native task list links each row to its run, repository and commit.
		item := map[string]any{"id": task.ID, "status": task.Status, "commit_sha": task.CommitSHA, "started": task.Started.AsTime(), "stopped": task.Stopped.AsTime(), "is_stopped": task.IsStopped(), "run_link": task.GetRunLink(), "repo_name": task.GetRepoName(), "repo_link": task.GetRepoLink(), "commit_link": task.GetCommitLink()}
		if task.Job != nil {
			item["name"], item["run_id"] = task.Job.Name, task.Job.RunID
		}
		items = append(items, item)
	}
	return items
}

func writeRunnersUI(ctx *context.Context, owner, repo int64, page string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	if ctx.HasError() {
		return false
	}
	data := map[string]any{"page": page, "total": ctx.Data["Total"], "app_url": setting.AppURL, "admin_page": ctx.Data["PageIsAdmin"] == true}
	if runners, ok := ctx.Data["Runners"].([]*actions_model.ActionRunner); ok {
		items := make([]map[string]any, 0, len(runners))
		for _, runner := range runners {
			items = append(items, runnerUI(runner, owner, repo))
		}
		data["items"] = items
	}
	if runner, ok := ctx.Data["Runner"].(*actions_model.ActionRunner); ok {
		data["runner"] = runnerUI(runner, owner, repo)
		if page == "setup" {
			data["token"] = runner.Token
		}
	} else if runner, ok := ctx.Data["Runner"].(actions_model.ActionRunner); ok {
		data["runner"] = runnerUI(&runner, owner, repo)
		if page == "setup" {
			data["token"] = runner.Token
		}
	}
	if page == "list" {
		data["registration_token"] = ctx.Data["RegistrationToken"]
		data["keyword"], data["sort"] = ctx.Data["Keyword"], ctx.Data["SortType"]
	}
	if pager, ok := ctx.Data["Page"].(*context.Pagination); ok {
		data["page_size"] = pager.Paginater.PagingNum()
	}
	data["tasks"] = runnerTasksUI(ctx.Data["Tasks"])
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
