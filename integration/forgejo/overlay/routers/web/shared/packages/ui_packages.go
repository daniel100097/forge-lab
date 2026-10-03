// SPDX-License-Identifier: GPL-3.0-or-later
package packages

import (
	"net/http"
	"reflect"
	"strings"

	packages_model "forgejo.org/models/packages"
	access_model "forgejo.org/models/perm/access"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/modules/markup"
	"forgejo.org/modules/markup/markdown"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
)

// WriteUI returns selected presentation fields only after each normal package
// page handler has performed its owner/repository/package permission checks.
func WriteUI(ctx *context.Context, page string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	if ctx.Written() {
		return true
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	if ctx.HasError() || ctx.Data["Err_Type"] == true {
		message := ctx.GetErrMsg()
		if message == "" {
			message = "A cleanup rule already exists for this package type."
		}
		ctx.JSON(http.StatusUnprocessableEntity, map[string]any{"error": message})
		return true
	}
	types := make([]map[string]string, 0)
	for _, kind := range packages_model.TypeList {
		types = append(types, map[string]string{"value": string(kind), "label": kind.Name()})
	}
	result := map[string]any{"page": page, "types": types, "total": ctx.Data["Total"], "page_size": setting.UI.PackagesPagingNum, "can_write": ctx.Data["CanWritePackages"] == true, "sign_mail": ctx.Data["SignMail"], "registry_host": setting.Packages.RegistryHost, "cargo_index": ctx.Data["CargoIndexExists"] == true}
	items := make([]map[string]any, 0)
	if pds, ok := ctx.Data["PackageDescriptors"].([]*packages_model.PackageDescriptor); ok {
		for _, pd := range pds {
			items = append(items, packageUI(ctx, pd))
		}
	}
	result["items"] = items
	if pd, ok := ctx.Data["PackageDescriptor"].(*packages_model.PackageDescriptor); ok {
		item := packageUI(ctx, pd)
		if metadata, ok := item["metadata"].(map[string]any); ok {
			for _, key := range []string{"Branches", "Repositories", "Architectures", "Distributions", "Components", "Groups"} {
				if values, ok := ctx.Data[key].([]string); ok {
					metadata["Repository"+key] = values
				}
			}
		}
		result["package"] = item
	}
	versions := make([]map[string]any, 0)
	if pvs, ok := ctx.Data["LatestVersions"].([]*packages_model.PackageVersion); ok {
		for _, pv := range pvs {
			versions = append(versions, map[string]any{"version": pv.Version, "created_at": pv.CreatedUnix.AsTime()})
		}
	}
	result["versions"] = versions
	result["version_count"] = ctx.Data["TotalVersionCount"]
	repos := make([]map[string]any, 0)
	if values, ok := ctx.Data["Repos"].(repo_model.RepositoryList); ok {
		for _, repo := range values {
			permission, err := access_model.GetUserRepoPermission(ctx, repo, ctx.Doer)
			if err != nil {
				ctx.ServerError("Package repository permission", err)
				return true
			}
			if !permission.HasAccess() {
				continue
			}
			repos = append(repos, map[string]any{"id": repo.ID, "name": repo.Name})
		}
	}
	result["repositories"] = repos
	rules := make([]map[string]any, 0)
	if values, ok := ctx.Data["CleanupRules"].([]*packages_model.PackageCleanupRule); ok {
		for _, rule := range values {
			rules = append(rules, ruleUI(rule))
		}
	}
	result["rules"] = rules
	if rule, ok := ctx.Data["CleanupRule"].(*packages_model.PackageCleanupRule); ok {
		result["rule"] = ruleUI(rule)
	}
	preview := make([]map[string]any, 0)
	if pds, ok := ctx.Data["VersionsToRemove"].([]*packages_model.PackageDescriptor); ok {
		for _, pd := range pds {
			preview = append(preview, packageUI(ctx, pd))
		}
	}
	result["preview"] = preview
	ctx.JSON(http.StatusOK, result)
	return true
}
func ruleUI(rule *packages_model.PackageCleanupRule) map[string]any {
	return map[string]any{"id": rule.ID, "enabled": rule.Enabled, "type": rule.Type, "keep_count": rule.KeepCount, "keep_pattern": rule.KeepPattern, "remove_days": rule.RemoveDays, "remove_pattern": rule.RemovePattern, "match_full_name": rule.MatchFullName}
}
func packageUI(ctx *context.Context, pd *packages_model.PackageDescriptor) map[string]any {
	item := map[string]any{"id": pd.Package.ID, "name": pd.Package.Name, "type": pd.Package.Type, "owner": pd.Owner.Name}
	if pd.Version == nil {
		return item
	}
	item["version"] = pd.Version.Version
	item["version_id"] = pd.Version.ID
	item["created_at"] = pd.Version.CreatedUnix.AsTime()
	item["downloads"] = pd.Version.DownloadCount
	item["size"] = pd.CalculateBlobSize()
	if pd.Creator != nil {
		item["creator"] = pd.Creator.Name
	}
	if pd.Repository != nil {
		permission, err := access_model.GetUserRepoPermission(ctx, pd.Repository, ctx.Doer)
		if err == nil && permission.HasAccess() {
			item["repository"] = pd.Owner.Name + "/" + pd.Repository.Name
			item["repository_id"] = pd.Package.RepoID
		}
	}
	files := make([]map[string]any, 0)
	for _, file := range pd.Files {
		files = append(files, map[string]any{"id": file.File.ID, "name": file.File.Name, "size": file.Blob.Size, "sha256": file.Blob.HashSHA256, "digest": file.Properties.GetByName("container.digest")})
	}
	item["files"] = files
	// Only public presentation fields used by native package templates are
	// selected from registry metadata. User and repository models stay private.
	metadata := map[string]any{}
	value := reflect.ValueOf(pd.Metadata)
	if value.IsValid() && value.Kind() == reflect.Pointer && !value.IsNil() {
		value = value.Elem()
	}
	if value.IsValid() && value.Kind() == reflect.Struct {
		for _, key := range strings.Fields("Description LongDescription Title ReleaseNotes Readme License Licenses Homepage ProjectURL RepositoryURL DocumentationURL Author Authors Scope Backup CheckDepends Comments Conflicts Depends Groups Imports LinkingTo MakeDepends Metadata OptDepends Provides Replaces Require RequireDev RequiredRubyVersion RequiredRubygemsVersion RequiresPython RuntimeDependencies Suggests Annotations Dependencies DevelopmentDependencies PeerDependencies OptionalDependencies BundleDependencies Keywords Manifests ImageLayers Labels Type IsTagged GroupID ArtifactID Classifier Packaging Architecture Platform Distribution Version Summary Build Number Channel") {
			field := value.FieldByName(key)
			if field.IsValid() && field.CanInterface() {
				metadata[key] = field.Interface()
			}
		}
	}
	metadata["CondaName"] = pd.PackageProperties.GetByName("conda.name")
	metadata["CondaChannel"] = pd.PackageProperties.GetByName("conda.channel")
	tags := make([]string, 0)
	for _, property := range pd.VersionProperties {
		if property.Name == "npm.tag" {
			tags = append(tags, property.Value)
		}
	}
	item["dist_tags"] = tags
	for _, key := range []string{"Readme", "Description", "Summary"} {
		if content, ok := metadata[key].(string); ok && content != "" {
			rendered, err := markdown.RenderString(&markup.RenderContext{Ctx: ctx, Links: markup.Links{Base: pd.PackageWebLink()}}, content)
			if err == nil {
				item["description_html"] = string(rendered)
			}
			break
		}
	}
	item["metadata"] = metadata
	return item
}
