// SPDX-License-Identifier: GPL-3.0-or-later
package auth

import (
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/auth/source/oauth2"
	"forgejo.org/services/context"
	"net/http"
	"strings"
)

func writeAuthUI(ctx *context.Context, page string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" || ctx.HasError() || ctx.Flash.ErrorMsg != "" {
		return false
	}
	if !strings.HasPrefix(page, "user/auth/") {
		return false
	}
	providers := make([]map[string]string, 0)
	if values, ok := ctx.Data["OAuth2Providers"].([]oauth2.Provider); ok {
		for _, p := range values {
			providers = append(providers, map[string]string{"name": p.DisplayName(), "type": p.Name()})
		}
	}
	data := map[string]any{"page": page, "providers": providers, "registration_enabled": !setting.Service.DisableRegistration, "internal_registration": !setting.Service.AllowOnlyExternalRegistration, "internal_login": setting.Service.EnableInternalSignIn, "openid_enabled": setting.Service.EnableOpenIDSignIn, "password_min_length": setting.MinPasswordLength}
	for _, name := range []string{"DisableRegistration", "DisableRegistrationReason", "DisablePassword", "IsResetSent", "IsResetDisable", "ResendLimited", "ManualActivationOnly", "IsSendRegisterMail", "Email", "NeedsPassword", "IsCodeInvalid", "IsPasswordInvalid", "ServiceNotEnabled", "HasTwoFactor", "has_two_factor", "scratch_code", "user_email", "OpenID", "user_name", "email", "user_exists", "Code", "RedirectURI", "State", "Scope", "Nonce", "AllowOnlyInternalRegistration", "IsActivatePage", "ActiveCodeLives"} {
		data[name] = ctx.Data[name]
	}
	// The activation page names the signed-in (inactive) account like the native template.
	if ctx.Doer != nil {
		data["signed_user"] = map[string]any{"name": ctx.Doer.Name, "email": ctx.Doer.Email}
	}
	// OAuth2 authorization failures without a redirect URI (user/auth/grant_error).
	if authErr, ok := ctx.Data["Error"].(AuthorizeError); ok {
		data["grant_error"] = map[string]any{"code": string(authErr.ErrorCode), "description": authErr.ErrorDescription}
	}
	data["application"] = spaui.Fields(ctx.Data["Application"], "Name", "ClientID")
	data["captcha"] = map[string]any{"enabled": ctx.Data["EnableCaptcha"] == true, "type": ctx.Data["CaptchaType"], "id": ctx.Data["Captcha"], "recaptcha_url": ctx.Data["RecaptchaURL"], "recaptcha_key": ctx.Data["RecaptchaSitekey"], "hcaptcha_key": ctx.Data["HcaptchaSitekey"], "mcaptcha_url": ctx.Data["McaptchaURL"], "mcaptcha_key": ctx.Data["McaptchaSitekey"], "turnstile_key": ctx.Data["CfTurnstileSitekey"]}
	data["reset_sent"] = ctx.Data["IsResetSent"] == true
	data["resend_limited"] = ctx.Data["ResendLimited"] == true
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, data)
	return true
}
