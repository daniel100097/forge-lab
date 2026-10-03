// SPDX-License-Identifier: GPL-3.0-or-later
package security

import (
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"net/http"
	"reflect"
)

func writeSecurityUI(ctx *context.Context, enroll bool) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	if ctx.Written() {
		return true
	}
	data := map[string]any{}
	if enroll {
		data = map[string]any{"secret": ctx.Data["TwofaSecret"], "qr": ctx.Data["QrUri"], "reenroll": ctx.Data["ReenrollTwofa"] == true}
	} else {
		links := make([]map[string]any, 0)
		value := reflect.ValueOf(ctx.Data["AccountLinks"])
		if value.IsValid() && value.Kind() == reflect.Map {
			iter := value.MapRange()
			for iter.Next() {
				links = append(links, spaui.Fields(iter.Key().Interface(), "ID", "Name"))
			}
		}
		data = map[string]any{"totp": ctx.Data["TOTPEnrolled"], "has_password": ctx.Doer.IsPasswordSet(), "can_manage_password": (ctx.Doer.IsLocal() || ctx.Doer.IsOAuth2()) && !user_model.IsFeatureDisabledWithLoginType(ctx.Doer, setting.UserFeatureManagePassword), "openid_enabled": setting.Service.EnableOpenIDSignIn, "two_factor_required": ctx.Doer.MustHaveTwoFactor(), "webauthn": spaui.Rows(ctx.Data["WebAuthnCredentials"], "ID", "Name", "CreatedUnix", "UpdatedUnix", "CloneWarning"), "links": links, "providers": ctx.Data["OrderedOAuth2Names"], "openids": spaui.Rows(ctx.Data["OpenIDs"], "ID", "URI", "Show")}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
