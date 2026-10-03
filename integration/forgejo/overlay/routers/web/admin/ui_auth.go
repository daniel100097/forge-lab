// SPDX-License-Identifier: GPL-3.0-or-later
package admin

import (
	"forgejo.org/models/auth"
	"forgejo.org/modules/base"
	"forgejo.org/routers/web/shared/spaadmin"
	"forgejo.org/services/auth/source/ldap"
	"forgejo.org/services/auth/source/oauth2"
	"forgejo.org/services/auth/source/smtp"
	"forgejo.org/services/context"
	"forgejo.org/services/forms"
	"strings"
)

func writeAdminAuthUI(ctx *context.Context, page base.TplName) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	types := make([]map[string]any, 0)
	for _, source := range authSources {
		types = append(types, map[string]any{"value": source.Type, "label": source.Name})
	}
	ctx.Data["SPAAuthTypes"] = types
	providers := make([]string, 0)
	for _, provider := range oauth2.GetSupportedOAuth2Providers() {
		providers = append(providers, provider.Name())
	}
	ctx.Data["SPAAuthProviders"] = providers
	ctx.Data["SPASMTPAuths"] = smtp.Authenticators
	fields := map[string]any{"Type": 2, "IsActive": true, "IsSyncEnabled": true, "SMTPAuth": "PLAIN", "SMTPPort": 587, "Port": 389}
	if source, ok := ctx.Data["Source"].(*auth.Source); ok {
		fields = spaadmin.Pick(source, "ID Type Name IsActive IsSyncEnabled")
		switch source.Type {
		case auth.LDAP, auth.DLDAP:
			for key, value := range spaadmin.Pick(source.Cfg, "Host Port SecurityProtocol SkipVerify BindDN UserDN UserBase DefaultDomainName AttributeUsername AttributeName AttributeSurname AttributeMail AttributesInBind AttributeSSHPublicKey AttributeAvatar SearchPageSize Filter GroupsEnabled GroupDN GroupFilter GroupMemberUID GroupTeamMap GroupTeamMapRemoval UserUID AdminFilter RestrictedFilter AllowDeactivateAll SkipLocalTwoFA") {
				fields[key] = value
			}
			if cfg, ok := source.Cfg.(*ldap.Source); ok {
				fields["UsePagedSearch"] = cfg.SearchPageSize > 0
			}
		case auth.SMTP:
			mapping := map[string]string{"SMTPAuth": "Auth", "SMTPHost": "Host", "SMTPPort": "Port", "AllowedDomains": "AllowedDomains", "ForceSMTPS": "ForceSMTPS", "SkipVerify": "SkipVerify", "HeloHostname": "HeloHostname", "DisableHelo": "DisableHelo", "SkipLocalTwoFA": "SkipLocalTwoFA"}
			for key, sourceKey := range mapping {
				for _, value := range spaadmin.Pick(source.Cfg, sourceKey) {
					fields[key] = value
				}
			}
		case auth.PAM:
			for key, sourceKey := range map[string]string{"PAMServiceName": "ServiceName", "PAMEmailDomain": "EmailDomain"} {
				for _, value := range spaadmin.Pick(source.Cfg, sourceKey) {
					fields[key] = value
				}
			}
		case auth.OAuth2:
			mapping := map[string]string{"Oauth2Provider": "Provider", "Oauth2Key": "ClientID", "Oauth2IconURL": "IconURL", "OpenIDConnectAutoDiscoveryURL": "OpenIDConnectAutoDiscoveryURL", "SkipLocalTwoFA": "SkipLocalTwoFA", "AllowUsernameChange": "AllowUsernameChange"}
			for _, key := range strings.Fields("AttributeSSHPublicKey RequiredClaimName RequiredClaimValue GroupClaimName RestrictedGroup AdminGroup GroupTeamMap GroupTeamMapRemoval DynGroupMaps DynGroupMapsRemoval QuotaGroupClaimName QuotaGroupMap QuotaGroupMapRemoval") {
				mapping["Oauth2"+key] = key
			}
			for key, sourceKey := range mapping {
				for _, value := range spaadmin.Pick(source.Cfg, sourceKey) {
					fields[key] = value
				}
			}
			if cfg, ok := source.Cfg.(*oauth2.Source); ok {
				fields["Oauth2Scopes"] = strings.Join(cfg.Scopes, ",")
				fields["Oauth2UseCustomURL"] = cfg.CustomURLMapping != nil
				if cfg.CustomURLMapping != nil {
					for key, value := range spaadmin.Pick(cfg.CustomURLMapping, "TokenURL AuthURL ProfileURL EmailURL Tenant") {
						fields["Oauth2"+key] = value
					}
				}
			}
		}
	}
	ctx.Data["SPAAuthFields"] = fields
	return spaadmin.Write(ctx, page)
}

// Empty secret inputs mean keep the configured value when using the SPA. The
// secret is never sent to the browser as a hidden or masked input.
func keepAdminAuthSecrets(ctx *context.Context, source *auth.Source, form *forms.AuthenticationForm) {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return
	}
	if cfg, ok := source.Cfg.(*ldap.Source); ok && form.BindPassword == "" {
		form.BindPassword = cfg.BindPassword
	}
	if cfg, ok := source.Cfg.(*oauth2.Source); ok && form.Oauth2Secret == "" {
		form.Oauth2Secret = cfg.ClientSecret
	}
}
