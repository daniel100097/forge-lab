// SPDX-License-Identifier: GPL-3.0-or-later
package install

import (
	"html/template"
	"net/http"

	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
)

func InstallBootstrap(ctx *context.Context) {
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{"contract": 1, "install": true, "app_name": "Forgejo", "app_sub_url": setting.AppSubURL, "auth_state": "anonymous", "user": nil, "auth": map[string]bool{}})
}
func writeInstallUI(ctx *context.Context) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	data := map[string]any{"database_types": ctx.Data["DbTypeNames"], "database_type": ctx.Data["CurDbType"], "password_algorithms": ctx.Data["PasswordHashAlgorithms"]}
	fields := map[string]any{}
	for _, key := range []string{"db_host", "db_user", "db_name", "db_path", "db_schema", "ssl_mode", "app_name", "app_slogan", "repo_root_path", "lfs_root_path", "run_user", "domain", "ssh_port", "http_port", "app_url", "log_root_path", "smtp_addr", "smtp_port", "smtp_from", "smtp_user", "register_confirm", "mail_notify", "offline_mode", "disable_gravatar", "enable_federated_avatar", "enable_open_id_sign_in", "enable_open_id_sign_up", "disable_registration", "allow_only_external_registration", "enable_captcha", "require_sign_in_view", "default_keep_email_private", "default_allow_create_organization", "default_enable_timetracking", "enable_update_checker", "no_reply_address", "password_algorithm"} {
		fields[key] = ctx.Data[key]
	}
	data["fields"] = fields
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}

// writeInstallReinstallUI reports that the database was used by Forgejo before,
// so the SPA can ask for the three native re-installation confirmations.
func writeInstallReinstallUI(ctx *context.Context, message template.HTML) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.Written() {
		return false
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusUnprocessableEntity, map[string]any{"errorMessage": string(message), "reinstall_required": true})
	return true
}
