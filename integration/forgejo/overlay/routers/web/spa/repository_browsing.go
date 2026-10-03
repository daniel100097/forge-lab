// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"bytes"
	"image"
	"net/http"
	"path"
	"strings"
	"unicode"

	asymkey_model "forgejo.org/models/asymkey"
	"forgejo.org/models/db"
	git_model "forgejo.org/models/git"
	issues_model "forgejo.org/models/issues"
	access_model "forgejo.org/models/perm/access"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/base"
	"forgejo.org/modules/charset"
	"forgejo.org/modules/git"
	"forgejo.org/modules/gitrepo"
	"forgejo.org/modules/highlight"
	"forgejo.org/modules/log"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/typesniffer"
	"forgejo.org/modules/util"
	"forgejo.org/services/context"
	"forgejo.org/services/gitdiff"
	mirror_service "forgejo.org/services/mirror"
	files_service "forgejo.org/services/repository/files"

	_ "image/gif"  // image dimensions in the file view (like the native view)
	_ "image/jpeg" // image dimensions in the file view
	_ "image/png"  // image dimensions in the file view
)

// repositoryDetails adds what the native repository header and home page show
// besides the basic metadata: origin (fork, mirror, template), website, feed
// and report links, the configured "Open with" applications and the code
// search mode.
func repositoryDetails(ctx *context.Context, data map[string]any, canRead func(unit.Type) bool) {
	r := ctx.Repo.Repository
	data["website"] = r.Website
	data["is_template"] = r.IsTemplate
	data["is_mirror"] = r.IsMirror
	data["object_format"] = r.ObjectFormatName
	data["feeds"] = setting.Other.EnableFeed
	data["archive_downloads"] = !setting.Repository.DisableDownloadSourceArchives
	data["code_indexer"] = setting.Indexer.RepoIndexerEnabled
	data["upload_enabled"] = setting.Repository.Upload.Enabled
	data["can_report"] = ctx.IsSigned && setting.Moderation.Enabled && !ctx.Repo.IsAdmin()
	data["can_create_branch"] = ctx.IsSigned && ctx.Repo.CanCreateBranch() && !r.IsArchived
	apps := setting.Config().Repository.OpenWithEditorApps.Value(ctx)
	if len(apps) == 0 {
		apps = setting.DefaultOpenWithEditorApps()
	}
	openWith := make([]map[string]string, 0, len(apps))
	for _, app := range apps {
		openWith = append(openWith, map[string]string{"name": app.DisplayName, "url": app.OpenURL})
	}
	data["open_with"] = openWith
	if r.IsFork {
		if err := r.GetBaseRepo(ctx); err == nil && r.BaseRepo != nil {
			data["fork_parent"] = map[string]any{"full_name": r.BaseRepo.FullName()}
		}
	}
	if r.IsGenerated() {
		if template := r.TemplateRepo(ctx); template != nil {
			data["template_repo"] = map[string]any{"full_name": template.FullName()}
		}
	}
	if mirror, ok := ctx.Data["PullMirror"].(*repo_model.Mirror); ok && mirror != nil {
		info := map[string]any{"address": ""}
		if address, err := mirror_service.DecryptOrRecoverRemoteAddress(ctx, mirror); err == nil {
			address.User = nil
			info["address"] = address.String()
		} else {
			log.Error("DecryptOrRecoverRemoteAddress: %v", err)
		}
		if mirror.UpdatedUnix > 0 {
			info["updated_at"] = mirror.UpdatedUnix.AsTime()
		}
		data["mirror"] = info
	}
	external := map[string]string{}
	if canRead(unit.TypeExternalTracker) {
		if u, err := r.GetUnit(ctx, unit.TypeExternalTracker); err == nil {
			external["issues"] = u.ExternalTrackerConfig().ExternalTrackerURL
		}
	}
	if canRead(unit.TypeExternalWiki) {
		if u, err := r.GetUnit(ctx, unit.TypeExternalWiki); err == nil {
			external["wiki"] = u.ExternalWikiConfig().ExternalWikiURL
		}
	}
	data["external"] = external
}

// recentlyPushedBranches mirrors the native home page banner: branches the
// viewer pushed recently to this repository (or to their fork of it) that have
// no merge request yet and share history with the default branch.
func recentlyPushedBranches(ctx *context.Context) []map[string]any {
	result := make([]map[string]any, 0)
	r := ctx.Repo.Repository
	if !ctx.IsSigned || r.IsArchived || r.IsMirror {
		return result
	}
	if err := r.GetBaseRepo(ctx); err != nil {
		return result
	}
	if !(r.AllowsPulls(ctx) || (r.BaseRepo != nil && r.BaseRepo.AllowsPulls(ctx))) {
		return result
	}
	branches, err := git_model.FindRecentlyPushedNewBranches(ctx, r.ID, ctx.Doer.ID, r.DefaultBranch)
	if err != nil {
		log.Error("FindRecentlyPushedNewBranches: %v", err)
		return result
	}
	if !r.IsFork {
		if fork := repo_model.GetForkedRepo(ctx, ctx.Doer.ID, r.ID); fork != nil {
			forkBranches, err := git_model.FindRecentlyPushedNewBranches(ctx, fork.ID, ctx.Doer.ID, fork.DefaultBranch)
			if err == nil {
				branches = append(branches, forkBranches...)
			}
		}
	}
	for _, branch := range branches {
		repo, err := branch.GetRepo(ctx)
		if err != nil {
			continue
		}
		related := func() bool {
			gitRepo, err := gitrepo.OpenRepository(ctx, repo)
			if err != nil {
				return false
			}
			defer gitRepo.Close()
			head, err := gitRepo.GetCommit(branch.CommitID)
			if err != nil {
				return false
			}
			defaultBranch, err := gitrepo.GetDefaultBranch(ctx, repo)
			if err != nil {
				return false
			}
			defaultHead, err := gitRepo.GetCommit(defaultBranch)
			if err != nil {
				return false
			}
			ok, err := head.HasPreviousCommit(defaultHead.ID)
			return err == nil && ok
		}()
		if !related {
			continue
		}
		name := branch.Name
		if repo.ID != r.ID {
			name = repo.FullName() + ":" + branch.Name
		}
		result = append(result, map[string]any{
			"name": name, "branch": branch.Name, "repository": repo.FullName(),
			"commit_time": branch.CommitTime.AsTime(),
			"compare":     r.ComposeBranchCompareURL(r.BaseRepo, name),
		})
	}
	return result
}

// signatureDetails exposes a commit or tag verification like the native
// signature row: trust state, signer, key and the localized reason.
func signatureDetails(ctx *context.Context, v *asymkey_model.ObjectVerification) map[string]any {
	if v == nil || v.Reason == asymkey_model.NotSigned {
		return nil
	}
	info := map[string]any{
		"verified": v.Verified, "warning": v.Warning, "trust": v.TrustStatus,
		"reason": ctx.Locale.TrString(v.Reason), "email": v.SigningEmail,
	}
	if v.SigningUser != nil {
		info["signer"] = map[string]any{
			"id": v.SigningUser.ID, "name": v.SigningUser.Name, "display_name": v.SigningUser.GetDisplayName(),
			"avatar_url": v.SigningUser.AvatarLink(ctx),
		}
	}
	if v.SigningKey != nil && v.SigningKey.KeyID != "" {
		info["key_id"] = v.SigningKey.PaddedKeyID()
	}
	if v.SigningSSHKey != nil && v.SigningSSHKey.Fingerprint != "" {
		info["ssh_fingerprint"] = v.SigningSSHKey.Fingerprint
	}
	return info
}

func userSummary(ctx *context.Context, u *user_model.User) map[string]any {
	if u == nil || u.ID <= 0 {
		return nil
	}
	return map[string]any{"name": u.Name, "display_name": u.GetDisplayName(), "avatar_url": u.AvatarLink(ctx)}
}

func statusSummary(statuses []*git_model.CommitStatus) map[string]any {
	if len(statuses) == 0 {
		return nil
	}
	checks := make([]map[string]any, 0, len(statuses))
	for _, status := range statuses {
		checks = append(checks, map[string]any{"context": status.Context, "state": status.State, "description": status.Description, "target_url": status.TargetURL})
	}
	return map[string]any{"state": git_model.CalcCommitStatus(statuses).State, "checks": checks}
}

// branchDetails adds the native branch list columns: divergence from the
// default branch, the latest merge request, the commit status and the pusher.
func branchDetails(ctx *context.Context, item map[string]any, name, sha string) {
	r := ctx.Repo.Repository
	if name != r.DefaultBranch {
		if divergence, err := files_service.CountDivergingCommits(ctx, r, git.BranchPrefix+name); err == nil {
			item["ahead"], item["behind"] = divergence.Ahead, divergence.Behind
		}
	}
	if statuses, _, err := git_model.GetLatestCommitStatus(ctx, r.ID, sha, db.ListOptionsAll); err == nil {
		if summary := statusSummary(statuses); summary != nil {
			item["status"] = summary
		}
	}
	if branch, err := git_model.GetBranch(ctx, r.ID, name); err == nil {
		if err := (git_model.BranchList{branch}).LoadPusher(ctx); err == nil {
			item["pusher"] = userSummary(ctx, branch.Pusher)
		}
	}
	pr, err := issues_model.GetLatestPullRequestByHeadInfo(ctx, r.ID, name)
	if err != nil || pr == nil {
		return
	}
	if err := pr.LoadIssue(ctx); err != nil {
		return
	}
	if err := pr.LoadBaseRepo(ctx); err != nil {
		return
	}
	permission, err := access_model.GetUserRepoPermission(ctx, pr.BaseRepo, ctx.Doer)
	if err != nil || !permission.CanRead(unit.TypePullRequests) {
		return
	}
	state := "open"
	if pr.HasMerged {
		state = "merged"
	} else if pr.Issue.IsClosed {
		state = "closed"
	}
	item["pull"] = map[string]any{"number": pr.Issue.Index, "title": pr.Issue.Title, "state": state, "repository": pr.BaseRepo.FullName(), "same_repository": pr.BaseRepoID == r.ID}
}

// escapeTables gives the browser what Forgejo's escape streamer uses to mark
// invisible and ambiguous characters (modules/charset) for the viewer's
// locale, so client-rendered code, blame and diffs get the same warnings.
func EscapeTables(ctx *context.Context) {
	ranges := func(table *unicode.RangeTable) [][3]uint32 {
		out := make([][3]uint32, 0, len(table.R16)+len(table.R32))
		for _, r := range table.R16 {
			out = append(out, [3]uint32{uint32(r.Lo), uint32(r.Hi), uint32(r.Stride)})
		}
		for _, r := range table.R32 {
			out = append(out, [3]uint32{r.Lo, r.Hi, r.Stride})
		}
		return out
	}
	seen := map[rune]bool{}
	ambiguous := make([][2]rune, 0, 2048)
	for _, table := range charset.AmbiguousTablesForLocale(ctx.Locale) {
		if table == nil {
			continue
		}
		for i, r := range table.Confusable {
			if !seen[r] && i < len(table.With) {
				seen[r] = true
				ambiguous = append(ambiguous, [2]rune{r, table.With[i]})
			}
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "private, max-age=86400")
	ctx.JSON(http.StatusOK, map[string]any{
		"enabled": setting.UI.AmbiguousUnicodeDetection, "skip": setting.UI.SkipEscapeContexts,
		"invisible": ranges(charset.InvisibleRanges), "ambiguous": ambiguous,
	})
}

// CodeDiff streams a unified diff with full blob IDs (so the browser can load
// more context lines from /raw/blob/{id}) and the native whitespace options.
// "commit" diffs a commit against its first parent; "base"/"head" diff two
// commits of this repository.
func CodeDiff(ctx *context.Context) {
	if ctx.Repo.Repository.IsEmpty {
		ctx.NotFound("Empty", nil)
		return
	}
	gitRepo := ctx.Repo.GitRepo
	var base, head string
	if sha := ctx.FormString("commit"); sha != "" {
		commit, err := gitRepo.GetCommit(sha)
		if err != nil {
			ctx.NotFound("Commit", nil)
			return
		}
		head = commit.ID.String()
		if commit.ParentCount() > 0 {
			parent, err := commit.ParentID(0)
			if err != nil {
				ctx.NotFound("Parent", nil)
				return
			}
			base = parent.String()
		} else {
			base = commit.ID.Type().EmptyTree().String()
		}
	} else {
		baseCommit, err := gitRepo.GetCommit(ctx.FormString("base"))
		if err != nil {
			ctx.NotFound("Base", nil)
			return
		}
		headCommit, err := gitRepo.GetCommit(ctx.FormString("head"))
		if err != nil {
			ctx.NotFound("Head", nil)
			return
		}
		base, head = baseCommit.ID.String(), headCommit.ID.String()
	}
	files := make([]string, 0)
	for _, file := range ctx.FormStrings("file") {
		if file != "" && fsPath(file) && path.Clean(file) == file {
			files = append(files, file)
		}
	}
	ctx.Resp.Header().Set("Content-Type", "text/plain; charset=utf-8")
	command := git.NewCommand(ctx, "diff", "-p", "-M", "--full-index", "--no-ext-diff", "--no-color").
		AddArguments(gitdiff.GetWhitespaceFlag(ctx.FormString("whitespace"))...).
		AddDynamicArguments(base, head).AddDashesAndList(files...)
	if err := command.Run(&git.RunOpts{Dir: gitRepo.Path, Stdout: ctx.Resp}); err != nil {
		log.Error("SPA diff: %v", err)
	}
}

// readmeIn locates the README of a directory like the native view
// (FindReadmeFileInEntries): localized Markdown first, then Org, text and no
// extension; at the repository root also docs/, .forgejo/, .gitea/, .github/.
func readmeIn(ctx *context.Context, entries git.Entries, root bool) (string, *git.TreeEntry) {
	language := strings.ToLower(ctx.Locale.Language())
	localized := func(ext string) []string {
		if language == "" {
			return []string{ext}
		}
		code := "." + language
		if dash := strings.Index(code, "-"); dash > 0 {
			return []string{code + ext, strings.ReplaceAll(code, "-", "_") + ext, code[:dash] + ext, "_" + code[1:dash] + ext, ext}
		}
		return []string{code + ext, ext}
	}
	exts := append(append(localized(".md"), localized(".org")...), ".txt", "")
	found := make([]*git.TreeEntry, len(exts))
	docs := make([]*git.TreeEntry, 3)
	for _, entry := range entries {
		if entry.IsDir() {
			if !root {
				continue
			}
			switch strings.ToLower(entry.Name()) {
			case "docs":
				if entry.Name() == "docs" || docs[0] == nil {
					docs[0] = entry
				}
			case ".forgejo", ".gitea":
				if entry.Name() == ".forgejo" || docs[1] == nil {
					docs[1] = entry
				}
			case ".github":
				if entry.Name() == ".github" || docs[2] == nil {
					docs[2] = entry
				}
			}
			continue
		}
		if i, ok := util.IsReadmeFileExtension(entry.Name(), exts...); ok {
			if found[i] == nil || base.NaturalSortLess(found[i].Name(), entry.Blob().Name()) {
				if entry.IsLink() {
					target, err := entry.FollowLinks()
					if err == nil && target != nil && (target.IsExecutable() || target.IsRegular()) {
						found[i] = entry
					}
				} else if entry.IsRegular() || entry.IsExecutable() {
					found[i] = entry
				}
			}
		}
	}
	for _, entry := range found {
		if entry != nil {
			return "", entry
		}
	}
	if root {
		for _, dir := range docs {
			if dir == nil || dir.Tree() == nil {
				continue
			}
			children, err := dir.Tree().ListEntries()
			if err != nil {
				continue
			}
			if _, entry := readmeIn(ctx, children, false); entry != nil {
				return dir.Name(), entry
			}
		}
	}
	return "", nil
}

// fileDetails adds the native file header information (file_info.tmpl and
// view_file.tmpl): symlink target, executable bit, language, vendored and
// generated attributes, LFS lock and image dimensions.
func fileDetails(ctx *context.Context, result map[string]any, commit *git.Commit, entry *git.TreeEntry, treePath string, head []byte) {
	r := ctx.Repo.Repository
	result["executable"] = entry.IsExecutable()
	if entry.IsLink() {
		result["symlink"] = true
		if target, err := entry.FollowLinks(); err == nil {
			if targetPath, err := target.Path(); err == nil {
				result["symlink_target"] = targetPath
			}
		}
	}
	if len(head) > 0 {
		sniffed := typesniffer.DetectContentType(head, entry.Name())
		if sniffed.IsRepresentableAsText() && !sniffed.IsSvgImage() {
			if _, lexer, err := highlight.File(entry.Name(), "", head); err == nil && lexer != "" {
				result["language"] = lexer
			}
		}
		if sniffed.IsImage() && !sniffed.IsSvgImage() {
			if config, _, err := image.DecodeConfig(bytes.NewReader(head)); err == nil {
				result["image_size"] = []int{config.Width, config.Height}
			}
		}
	}
	if attrs, err := ctx.Repo.GitRepo.GitAttributes(commit.ID.String(), treePath, "linguist-vendored", "linguist-generated", "linguist-language", "gitlab-language"); err == nil {
		result["vendored"] = attrs["linguist-vendored"].Bool().ValueOrZeroValue()
		result["generated"] = attrs["linguist-generated"].Bool().ValueOrZeroValue()
		if language := attrs["linguist-language"].String(); language != "" && language != "unspecified" {
			result["language"] = language
		} else if language := attrs["gitlab-language"].String(); language != "" && language != "unspecified" {
			if idx := strings.IndexByte(language, '?'); idx >= 0 {
				language = language[:idx]
			}
			result["language"] = language
		}
	}
	if lock, err := git_model.GetTreePathLock(ctx, r.ID, treePath); err == nil && lock != nil {
		owner, err := user_model.GetUserByID(ctx, lock.OwnerID)
		if err == nil {
			result["lfs_lock"] = map[string]any{"owner": owner.Name, "mine": ctx.IsSigned && ctx.Doer.ID == owner.ID, "created_at": lock.Created}
		}
	}
	// Native view: tab width from .editorconfig (TabSizeClass).
	if ec, _, err := ctx.Repo.GetEditorconfig(commit); err == nil && ec != nil {
		if def, err := ec.GetDefinitionForFilename(entry.Name()); err == nil && def.TabWidth >= 1 && def.TabWidth <= 16 {
			result["tab_size"] = def.TabWidth
		}
	}
	if base.IsCitationFile(entry) {
		result["citation"] = true
	}
	if treePath == ".editorconfig" {
		if _, warning, err := ctx.Repo.GetEditorconfig(commit); err != nil {
			result["file_error"] = strings.TrimSpace(err.Error())
		} else if warning != nil {
			result["file_warning"] = strings.TrimSpace(warning.Error())
		}
	}
}
