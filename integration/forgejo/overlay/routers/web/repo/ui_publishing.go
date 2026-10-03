package repo

import (
	"forgejo.org/models/unit"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
)

func uiRelease(ctx *context.Context, info *ReleaseInfo) any {
	release := info.Release
	fields := map[string]any{"body_html": string(release.RenderedNote)}
	assets := make([]any, 0, len(release.Attachments))
	apiRelease := convert.ToAPIRelease(ctx, ctx.Repo.Repository, release, false)
	for index, asset := range release.Attachments {
		assets = append(assets, spaui.WithFields(apiRelease.Attachments[index], map[string]any{"external_url": asset.ExternalURL}))
	}
	fields["assets"] = assets
	if ctx.Repo.CanRead(unit.TypeCode) {
		fields["sha"] = release.Sha1
		fields["target"] = release.TargetBehind
		fields["commits_since"] = release.NumCommitsBehind
		verification, err := verifyTagSignature(ctx, release)
		if err == nil && verification != nil {
			fields["signature"] = map[string]any{"verified": verification.Verified, "reason": ctx.Tr(verification.Reason)}
		}
	}
	if info.CommitStatus != nil {
		fields["status"] = info.CommitStatus.State
	}
	fields["hide_archive_links"] = release.HideArchiveLinks || release.IsDraft || !ctx.Repo.CanRead(unit.TypeCode) || ctx.Data["DisableDownloadSourceArchives"] == true
	return spaui.WithFields(apiRelease, fields)
}
