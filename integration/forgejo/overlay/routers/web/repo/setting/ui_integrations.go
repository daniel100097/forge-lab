// SPDX-License-Identifier: GPL-3.0-or-later
package setting

import (
	"net/http"
	"strings"

	git_model "forgejo.org/models/git"
	webhook_model "forgejo.org/models/webhook"
	"forgejo.org/modules/git"
	"forgejo.org/modules/git/pipeline"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	webhook_service "forgejo.org/services/webhook"
)

// WriteWebhooksUI selects native settings data after the handler's permission checks.
func WriteWebhooksUI(ctx *context.Context, page string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"page": page, "type": ctx.Data["HookType"], "can_test": ctx.Repo.Repository != nil}
	providers := []string{}
	for _, handler := range webhook_service.List() {
		providers = append(providers, handler.Type())
	}
	data["providers"] = providers
	data["items"] = spaui.SelectedList(ctx.Data["Webhooks"], "id:ID", "url:URL", "type:Type", "active:IsActive", "last_status:LastStatus", "created:CreatedUnix")
	hook, _ := ctx.Data["Webhook"].(*webhook_model.Webhook)
	if value, ok := ctx.Data["Webhook"].(webhook_model.Webhook); ok {
		hook = &value
	}
	if hook != nil {
		h := spaui.Selected(hook, "id:ID", "payload_url:URL", "http_method:HTTPMethod", "content_type:ContentType", "secret:Secret", "active:IsActive", "type:Type")
		// These credentials are editable in the native hook form under the same admin check.
		authorization, err := hook.HeaderAuthorization()
		if err != nil {
			ctx.ServerError("HeaderAuthorization", err)
			return true
		}
		h["authorization_header"] = authorization
		h["access_token"] = strings.TrimPrefix(authorization, "Bearer ")
		h["events"] = spaui.Selected(hook.HookEvent, "push_only:PushOnly", "send_everything:SendEverything", "choose_events:ChooseEvents", "branch_filter:BranchFilter", "create:Create", "delete:Delete", "fork:Fork", "issues:Issues", "issue_assign:IssueAssign", "issue_label:IssueLabel", "issue_milestone:IssueMilestone", "issue_comment:IssueComment", "release:Release", "push:Push", "pull_request:PullRequest", "pull_request_assign:PullRequestAssign", "pull_request_label:PullRequestLabel", "pull_request_milestone:PullRequestMilestone", "pull_request_comment:PullRequestComment", "pull_request_review:PullRequestReview", "pull_request_sync:PullRequestSync", "pull_request_review_request:PullRequestReviewRequest", "wiki:Wiki", "repository:Repository", "package:Package", "action_failure:ActionRunFailure", "action_recover:ActionRunRecover", "action_success:ActionRunSuccess")
		data["hook"] = h
	}
	data["metadata"] = spaui.Selected(ctx.Data["HookMetadata"], "username:Username", "channel:Channel", "icon_url:IconURL", "color:Color", "homeserver_url:HomeserverURL", "room_id:Room", "message_type:MessageType", "api_token:APIToken", "package_url:PackageURL", "bot_token:BotToken", "chat_id:ChatID", "thread_id:ThreadID", "manifest_path:ManifestPath", "visibility:Visibility", "secrets:Secrets")
	history := []map[string]any{}
	if tasks, ok := ctx.Data["History"].([]*webhook_model.HookTask); ok {
		for _, task := range tasks {
			item := spaui.Selected(task, "id:ID", "uuid:UUID", "event:EventType", "delivered:IsDelivered", "success:IsSucceed", "time:Delivered", "status:ResponseInfo.Status", "response_body:ResponseInfo.Body")
			// The native delivery panel: request line, headers (Authorization is
			// redacted when recorded) and the sent body or the stored payload.
			if task.RequestInfo != nil {
				method := task.RequestInfo.HTTPMethod
				if method == "" {
					method = "POST"
				}
				body := task.RequestInfo.Body
				if body == "" {
					body = task.PayloadContent
				}
				item["request"] = map[string]any{"url": task.RequestInfo.URL, "method": method, "headers": task.RequestInfo.Headers}
				item["request_body"] = body
			}
			if task.ResponseInfo != nil {
				item["response"] = map[string]any{"status": task.ResponseInfo.Status, "headers": task.ResponseInfo.Headers}
			}
			history = append(history, item)
		}
	}
	data["history"] = history
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

func writeRepositoryStorageUI(ctx *context.Context, section string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	data := map[string]any{"section": section, "total": ctx.Data["Total"], "page_size": setting.UI.ExplorePagingNum}
	switch section {
	case "git-hooks":
		items := []map[string]any{}
		if hooks, ok := ctx.Data["Hooks"].([]*git.Hook); ok {
			for _, hook := range hooks {
				items = append(items, map[string]any{"name": hook.Name(), "active": hook.IsActive})
			}
		}
		data["items"] = items
	case "git-hook":
		if hook, ok := ctx.Data["Hook"].(*git.Hook); ok {
			data["hook"] = map[string]any{"name": hook.Name(), "active": hook.IsActive, "content": hook.Content, "sample": hook.Sample}
		}
	case "lfs":
		data["items"] = spaui.SelectedList(ctx.Data["LFSFiles"], "id:ID", "oid:Oid", "size:Size", "created:CreatedUnix", "existing:Existing")
	case "lfs-locks":
		items := []map[string]any{}
		// Native lock rows mark paths missing from the default branch and paths
		// without the lockable attribute; both lists exist only when locks do.
		linkable, _ := ctx.Data["Linkable"].([]bool)
		lockables, _ := ctx.Data["Lockables"].([]bool)
		if locks, ok := ctx.Data["LFSLocks"].(git_model.LFSLockList); ok {
			for i, lock := range locks {
				item := spaui.Selected(lock, "id:ID", "path:Path", "owner:Owner.Name", "created:Created")
				if lock.Owner != nil {
					item["owner_display"] = lock.Owner.DisplayName()
				}
				if i < len(linkable) {
					item["linkable"] = linkable[i]
				}
				if i < len(lockables) {
					item["lockable"] = lockables[i]
				}
				items = append(items, item)
			}
		}
		data["items"] = items
		data["default_branch"] = ctx.Repo.Repository.DefaultBranch
	case "lfs-file":
		data["file"] = spaui.Selected(ctx.Data["LFSFile"], "id:ID", "oid:Oid", "size:Size", "created:CreatedUnix")
		for _, key := range []string{"RawFileLink", "IsTextFile", "IsImageFile", "IsPDFFile", "IsVideoFile", "IsAudioFile", "IsFileTooLarge", "FileContent", "Is3DModelFile", "IsGLBFile", "IsSTLFile", "IsGLTFFile", "IsOBJFile", "Is3MFFile"} {
			data[key] = ctx.Data[key]
		}
		data["RawFileLink"] = ctx.Repo.RepoLink + "/settings/lfs/show/" + ctx.Params("oid") + "?raw=1"
	case "lfs-find":
		data["oid"], data["size"] = ctx.Data["Oid"], ctx.Data["Size"]
		items := []map[string]any{}
		if results, ok := ctx.Data["Results"].([]*pipeline.LFSResult); ok {
			for _, result := range results {
				item := spaui.Selected(result, "name:Name", "sha:SHA", "summary:Summary", "branch:BranchName", "when:When")
				parents := []string{}
				for _, parent := range result.ParentHashes {
					parents = append(parents, parent.String())
				}
				item["parents"] = parents
				items = append(items, item)
			}
		}
		data["items"] = items
	case "lfs-pointers":
		data["items"] = spaui.SelectedList(ctx.Data["Pointers"], "sha:SHA", "oid:Oid", "size:Size", "exists:Exists", "in_repo:InRepo", "associatable:Associatable", "accessible:Accessible")
		data["total"], data["associated"], data["missing"], data["associatable"] = ctx.Data["NumPointers"], ctx.Data["NumAssociated"], ctx.Data["NumNoExist"], ctx.Data["NumAssociatable"]
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
