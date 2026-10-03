// SPDX-License-Identifier: GPL-3.0-or-later
package spaadmin

import (
	"net/http"
	"reflect"
	"strings"
	"time"

	"forgejo.org/models/moderation"
	packages_model "forgejo.org/models/packages"
	"forgejo.org/modules/base"
	"forgejo.org/modules/process"
	"forgejo.org/modules/queue"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
	"forgejo.org/services/cron"
	moderation_service "forgejo.org/services/moderation"
	webhook_service "forgejo.org/services/webhook"
)

// Field selection is intentional: never marshal administrator data maps,
// authentication models, user records, or complete server configuration.
func Pick(input any, fields string) map[string]any {
	out := map[string]any{}
	for _, path := range strings.Fields(fields) {
		value := reflect.ValueOf(input)
		for _, name := range strings.Split(path, ".") {
			for value.IsValid() && (value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface) {
				if value.IsNil() {
					value = reflect.Value{}
					break
				}
				value = value.Elem()
			}
			if !value.IsValid() || value.Kind() != reflect.Struct {
				value = reflect.Value{}
				break
			}
			value = value.FieldByName(name)
		}
		if !value.IsValid() || !value.CanInterface() {
			continue
		}
		if stamp, ok := value.Interface().(time.Time); ok {
			out[path] = stamp
			continue
		}
		switch value.Kind() {
		case reflect.String:
			out[path] = value.String()
		case reflect.Bool:
			out[path] = value.Bool()
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			out[path] = value.Int()
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			out[path] = value.Uint()
		case reflect.Float32, reflect.Float64:
			out[path] = value.Float()
		}
	}
	return out
}
func Rows(input any, fields string) []map[string]any {
	out := make([]map[string]any, 0)
	value := reflect.ValueOf(input)
	if !value.IsValid() || value.Kind() != reflect.Slice {
		return out
	}
	for i := 0; i < value.Len(); i++ {
		out = append(out, Pick(value.Index(i).Interface(), fields))
	}
	return out
}

const userFields = "ID Name FullName Email IsActive IsAdmin IsRestricted ProhibitLogin LoginType LoginSource LoginName Website Location Language Pronouns MaxRepoCreation AllowGitHook AllowImportLocal AllowCreateOrganization Visibility KeepEmailPrivate UseCustomAvatar AvatarEmail Type NumRepos NumMembers CreatedUnix LastLoginUnix MustChangePassword"
const repoFields = "ID Name OwnerName Owner.Name Description IsPrivate IsArchived IsMirror NumWatches NumStars NumForks NumIssues Size GitSize LFSSize CreatedUnix UpdatedUnix"

func queueUI(id int64, q queue.ManagedWorkerPoolQueue) map[string]any {
	return map[string]any{"ID": id, "Name": q.GetName(), "Type": q.GetType(), "Items": q.GetQueueItemNumber(), "Workers": q.GetWorkerNumber(), "ActiveWorkers": q.GetWorkerActiveNumber(), "MaxWorkers": q.GetWorkerMaxNumber()}
}
func Write(ctx *context.Context, page base.TplName) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || !strings.HasPrefix(string(page), "admin/") {
		return false
	}
	if !ctx.IsUserSiteAdmin() {
		ctx.Error(http.StatusForbidden)
		return true
	}
	if ctx.HasError() {
		ctx.JSON(http.StatusUnprocessableEntity, map[string]string{"error": ctx.GetErrMsg()})
		return true
	}
	if ctx.Written() {
		return true
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	data := map[string]any{"page": page, "title": ctx.Data["Title"], "page_size": setting.UI.Admin.UserPagingNum, "total": ctx.Data["Total"], "PackagesEnabled": setting.Packages.Enabled, "ActionsEnabled": setting.Actions.Enabled, "ModerationEnabled": setting.Moderation.Enabled, "FederationEnabled": setting.Federation.Enabled, "OAuth2Enabled": setting.OAuth2.Enabled, "SelfCheckEnabled": setting.Database.Type.IsMySQL()}
	if pager, ok := ctx.Data["Page"].(*context.Pagination); ok {
		data["page_size"] = pager.Paginater.PagingNum()
		data["total"] = pager.Paginater.Total()
	}
	if data["total"] == nil {
		data["total"] = ctx.Data["TotalCount"]
	}
	for _, key := range strings.Fields("CanSendEmail TwoFactorEnabled DisableGravatar DisableRegularOrgCreation DisableMigrations ReposTotal EmailsTotal OrgsTotal NeedMajorUpdate NeedMinorUpdate RemoteVersion UpdateCheckerError GoroutineCount ProcessCount DatabaseType DatabaseCheckHasProblems DatabaseCheckCollationMismatch DatabaseCheckCollationCaseInsensitive CacheSlow ContentReference ContentURL PosterURL TotalBlobSize TotalUnreferencedBlobSize") {
		if v, ok := ctx.Data[key]; ok {
			switch v.(type) {
			case string, bool, int, int64, uint64:
				data[key] = v
			}
		}
	}
	data["Users"] = Rows(ctx.Data["Users"], userFields)
	if statuses, ok := ctx.Data["UsersTwoFaStatus"].(map[int64]bool); ok {
		for _, row := range data["Users"].([]map[string]any) {
			if id, ok := row["ID"].(int64); ok {
				row["TwoFactorEnabled"] = statuses[id]
			}
		}
	}
	data["LoginSource"] = Pick(ctx.Data["LoginSource"], "ID Name Type")
	data["User"] = Pick(ctx.Data["User"], userFields)
	data["Repos"] = Rows(ctx.Data["Repos"], repoFields)
	data["Emails"] = Rows(ctx.Data["Emails"], "ID UID Email IsActivated IsPrimary Name FullName CanChange User.Name")
	data["Sources"] = Rows(ctx.Data["Sources"], "ID Name Type IsActive IsSyncEnabled CreatedUnix UpdatedUnix")
	data["Source"] = Pick(ctx.Data["Source"], "ID Name Type IsActive IsSyncEnabled CreatedUnix UpdatedUnix")
	data["Notices"] = Rows(ctx.Data["Notices"], "ID Type Description CreatedUnix")
	data["Packages"] = Rows(ctx.Data["PackageDescriptors"], "Package.ID Package.Name Package.Type Version.ID Version.Version Version.DownloadCount Version.CreatedUnix Owner.Name Creator.Name Repository.Name Repository.OwnerName")
	if descriptors, ok := ctx.Data["PackageDescriptors"].([]*packages_model.PackageDescriptor); ok {
		rows := data["Packages"].([]map[string]any)
		for index, descriptor := range descriptors {
			rows[index]["Size"] = descriptor.CalculateBlobSize()
		}
	}
	packageTypes := make([]map[string]string, 0)
	for _, kind := range packages_model.TypeList {
		packageTypes = append(packageTypes, map[string]string{"value": string(kind), "label": kind.Name()})
	}
	data["PackageTypes"] = packageTypes
	data["Hosts"] = Rows(ctx.Data["Hosts"], "ID HostFqdn HostPort HostSchema NodeInfo.SoftwareName NodeInfo.SoftwareVersion LatestActivity Created Updated")
	data["Host"] = Pick(ctx.Data["Host"], "ID HostFqdn HostPort HostSchema NodeInfo.SoftwareName NodeInfo.SoftwareVersion LatestActivity Created Updated")
	data["Reports"] = Rows(ctx.Data["Reports"], "ID Status ReporterID ContentType ContentID Category Remarks ContentReference CreatedUnix ResolvedUnix ReporterName ReportedTimes ShadowCopyDate")
	data["SysStatus"] = Pick(ctx.Data["SysStatus"], "StartTime NumGoroutine MemAllocated MemTotal MemSys Lookups MemMallocs MemFrees HeapAlloc HeapSys HeapIdle HeapInuse HeapReleased HeapObjects StackInuse StackSys MSpanInuse MSpanSys MCacheInuse MCacheSys BuckHashSys GCSys OtherSys NextGC LastGCTime PauseTotalNs PauseNs NumGC")
	if ops, ok := ctx.Data["Entries"].([]string); ok {
		items := make([]map[string]string, 0)
		for _, op := range ops {
			items = append(items, map[string]string{"Name": op, "Label": string(ctx.Tr("admin.dashboard." + op))})
		}
		data["Operations"] = items
	} else {
		data["Tasks"] = Rows(ctx.Data["Entries"], "Name Spec Next Prev ExecTimes Status")
		if tasks, ok := ctx.Data["Entries"].(cron.TaskTable); ok {
			rows := data["Tasks"].([]map[string]any)
			for index, task := range tasks {
				rows[index]["LastMessage"] = task.FormatLastMessage(ctx.Locale)
			}
		}
	}
	if dirs, ok := ctx.Data["Dirs"].([]string); ok {
		data["Dirs"] = dirs
	}
	if stats, ok := ctx.Data["Stats"].(map[string]any); ok {
		out := map[string]any{}
		for key, v := range stats {
			switch v.(type) {
			case int, int64, uint64:
				out[key] = v
			}
		}
		data["Stats"] = out
	}
	if queues, ok := ctx.Data["Queues"].(map[int64]queue.ManagedWorkerPoolQueue); ok {
		items := make([]map[string]any, 0)
		for id, q := range queues {
			items = append(items, queueUI(id, q))
		}
		data["Queues"] = items
	}
	if q, ok := ctx.Data["Queue"].(queue.ManagedWorkerPoolQueue); ok {
		data["Queue"] = queueUI(ctx.ParamsInt64("qid"), q)
	}
	if values, ok := ctx.Data["ProcessStacks"].([]*process.Process); ok {
		data["ProcessStacks"] = processRows(values)
	}
	if string(page) == "admin/self_check" {
		result := Pick(ctx.Data["DatabaseCheckResult"], "DatabaseCollation ExpectedCollation")
		result["DatabaseType"] = string(setting.Database.Type)
		for _, key := range []string{"DatabaseCheckHasProblems", "DatabaseCheckCollationMismatch", "DatabaseCheckCollationCaseInsensitive", "DatabaseCheckInconsistentCollationColumns", "CacheSlow"} {
			if value, ok := ctx.Data[key]; ok {
				result[key] = value
			}
		}
		if err, ok := ctx.Data["CacheError"].(error); ok {
			result["CacheError"] = err.Error()
		}
		data["Config"] = result
	}
	if reports, ok := ctx.Data["Reports"].([]*moderation.AbuseReportDetailed); ok {
		snapshots := map[int64][]moderation.ShadowCopyField{}
		for _, report := range reports {
			if fields := moderation_service.GetShadowCopyMap(ctx, report); len(fields) > 0 {
				snapshots[report.ID] = fields
			}
		}
		data["ReportSnapshots"] = snapshots
	}
	if string(page) == "admin/config" {
		config := map[string]any{}
		for _, key := range strings.Fields("AppUrl AppBuiltWith Domain OfflineMode GlobalTwoFactorRequirement RunUser RunMode AppDataPath RepoRootPath CustomRootPath LogRootPath ScriptType ReverseProxyAuthUser ReverseProxyAuthEmail MailerEnabled CacheAdapter CacheInterval CacheItemTTL LogSQL") {
			if v, ok := ctx.Data[key]; ok {
				switch v.(type) {
				case string, bool, int, int64:
					config[key] = v
				}
			}
		}
		for key, fields := range map[string]string{"SSH": "Disabled Domain Port ListenHost ListenPort StartBuiltinServer MinimumKeySizes", "LFS": "StartServer ContentPath MaxFileSize", "DbCfg": "Type Host Name User Path SSLMode", "Service": "DisableRegistration RegisterEmailConfirm RequireSignInView EnableNotifyMail DefaultKeepEmailPrivate DefaultAllowCreateOrganization DefaultUserVisibility DefaultOrgVisibility AllowOnlyExternalRegistration AllowOnlyInternalRegistration ShowRegistrationButton EnableCaptcha EnableOpenIDSignIn EnableOpenIDSignUp ActiveCodeLives ResetPwdCodeLives AllowDotsInUsernames EnableTimetracking DefaultEnableTimetracking DefaultAllowOnlyContributorsToTrackTime DefaultEnableDependencies NoReplyAddress", "Webhook": "QueueLength DeliverTimeout SkipTLSVerify AllowedHostList", "Mailer": "Protocol SMTPAddr SMTPPort From User SendmailPath", "SessionConfig": "Provider CookieName CookiePath Gclifetime Maxlifetime Secure Domain SameSite", "Git": "GCArgs MaxGitDiffLines MaxGitDiffLineCharacters MaxGitDiffFiles DisableDiffHighlight Timeout.Default Timeout.Migrate Timeout.Mirror Timeout.Clone Timeout.Pull Timeout.GC", "Picture": "DisableGravatar EnableFederatedAvatar", "Moderation": "Enabled", "Federation": "Enabled ShareUserStatistics MaxSize"} {
			config[key] = Pick(ctx.Data[key], fields)
		}
		config["Picture"] = map[string]any{"DisableGravatar": setting.Config().Picture.DisableGravatar.Value(ctx), "EnableFederatedAvatar": setting.Config().Picture.EnableFederatedAvatar.Value(ctx)}
		config["Cache"] = map[string]any{"Adapter": ctx.Data["CacheAdapter"], "Interval": ctx.Data["CacheInterval"], "TTL": ctx.Data["CacheItemTTL"]}
		loggers := make(map[string]any)
		if values, ok := ctx.Data["Loggers"].(map[string]any); ok {
			for name, value := range values {
				if fields, ok := value.(map[string]any); ok {
					writers := make(map[string]any)
					if values, ok := fields["EventWriters"].(map[string]any); ok {
						for writerName, value := range values {
							if options, ok := value.(map[string]any); ok {
								safe := make(map[string]any)
								for _, key := range []string{"WriterType", "Level", "BufferLen", "Colorize", "Flags", "StacktraceLevel"} {
									if value, ok := options[key]; ok {
										safe[key] = value
									}
								}
								writers[writerName] = safe
							}
						}
					}
					loggers[name] = map[string]any{"IsEnabled": fields["IsEnabled"], "EventWriters": writers}
				}
			}
		}
		config["Logger"] = loggers
		data["Config"] = config
	}
	if string(page) == "admin/config_settings" {
		data["DynamicConfig"] = map[string]any{"picture.disable_gravatar": setting.Config().Picture.DisableGravatar.Value(ctx), "picture.enable_federated_avatar": setting.Config().Picture.EnableFederatedAvatar.Value(ctx), "repository.open_with_editor_apps": setting.Config().Repository.OpenWithEditorApps.Value(ctx).ToTextareaString()}
		data["DefaultEditorApps"] = ctx.Data["DefaultOpenWithEditorAppsString"]
	}
	if string(page) == "admin/hooks" {
		for key, resultKey := range map[string]string{"DefaultWebhooks": "DefaultHooks", "SystemWebhooks": "SystemHooks"} {
			if nested, ok := ctx.Data[key].(map[string]any); ok {
				data[resultKey] = Rows(nested["Webhooks"], "ID URL Type IsActive LastStatus")
			}
		}
		providers := make([]string, 0)
		for _, handler := range webhook_service.List() {
			providers = append(providers, string(handler.Type()))
		}
		data["WebhookProviders"] = providers
	}
	if string(page) == "admin/applications/list" {
		apps := make([]map[string]any, 0)
		for _, row := range Rows(ctx.Data["Applications"], "ID Name ClientID") {
			apps = append(apps, map[string]any{"id": row["ID"], "name": row["Name"], "client_id": row["ClientID"]})
		}
		data["applications"] = apps
	}

	// Auth editing data is prepared with an explicit form mapping in admin code.
	if fields, ok := ctx.Data["SPAAuthFields"].(map[string]any); ok {
		data["AuthFields"] = fields
	}
	if types, ok := ctx.Data["SPAAuthTypes"].([]map[string]any); ok {
		data["AuthTypes"] = types
	}
	if providers, ok := ctx.Data["SPAAuthProviders"].([]string); ok {
		data["AuthProviders"] = providers
	}
	if authenticators, ok := ctx.Data["SPASMTPAuths"].([]string); ok {
		data["SMTPAuths"] = authenticators
	}
	ctx.JSON(http.StatusOK, data)
	return true
}

func processRows(values []*process.Process) []map[string]any {
	out := make([]map[string]any, 0)
	for _, p := range values {
		row := Pick(p, "PID ParentPID Description Start Type")
		stacks := make([]map[string]any, 0)
		for _, stack := range p.Stacks {
			value := Pick(stack, "Count Description")
			value["Entries"] = Rows(stack.Entry, "Function File Line")
			stacks = append(stacks, value)
		}
		row["Stacks"] = stacks
		row["Children"] = processRows(p.Children)
		out = append(out, row)
	}
	return out
}
