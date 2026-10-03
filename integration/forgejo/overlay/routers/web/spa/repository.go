// SPDX-License-Identifier: GPL-3.0-or-later

package spa

import (
	"io"
	"net/http"
	"path"
	"slices"
	"strings"
	"unicode/utf8"

	admin_model "forgejo.org/models/admin"
	asymkey_model "forgejo.org/models/asymkey"
	"forgejo.org/models/db"
	git_model "forgejo.org/models/git"
	issues_model "forgejo.org/models/issues"
	project_model "forgejo.org/models/project"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unit"
	"forgejo.org/modules/cache"
	"forgejo.org/modules/charset"
	"forgejo.org/modules/git"
	"forgejo.org/modules/lfs"
	"forgejo.org/modules/log"
	"forgejo.org/modules/markup"
	"forgejo.org/modules/optional"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/spaui"
	"forgejo.org/modules/typesniffer"
	"forgejo.org/modules/util"
	"forgejo.org/routers/web/shared/spaboards"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
	repo_service "forgejo.org/services/repository"
	"xorm.io/builder"
)

// Repository exposes selected fields, never the raw template context or model.
func Repository(ctx *context.Context) {
	r := ctx.Repo.Repository
	canRead := func(t unit.Type) bool { return !t.UnitGlobalDisabled() && ctx.Repo.CanRead(t) }
	data := map[string]any{
		"id": r.ID, "name": r.Name, "full_name": r.FullName(), "description": r.Description,
		"starred": ctx.IsSigned && repo_model.IsStaring(ctx, ctx.Doer.ID, r.ID), "signed_in": ctx.IsSigned,
		"private": r.IsPrivate, "archived": r.IsArchived, "empty": r.IsEmpty, "status": r.Status,
		"default_branch": r.DefaultBranch, "stars_count": r.NumStars, "forks_count": r.NumForks,
		"open_issues_count": r.NumOpenIssues(ctx), "open_pr_counter": r.NumOpenPulls(ctx),
		"link": r.Link(), "clone": r.CloneLink(),
		"units": map[string]bool{
			"code": canRead(unit.TypeCode), "issues": canRead(unit.TypeIssues),
			"pulls": canRead(unit.TypePullRequests), "projects": canRead(unit.TypeProjects),
			"actions": canRead(unit.TypeActions), "releases": canRead(unit.TypeReleases),
			"wiki": canRead(unit.TypeWiki), "packages": canRead(unit.TypePackages),
		},
		"permissions": map[string]bool{
			"admin": ctx.Repo.IsAdmin(), "write_code": ctx.Repo.CanWrite(unit.TypeCode),
			"write_projects": !r.IsArchived && ctx.Repo.CanWrite(unit.TypeProjects),
		},
	}
	if r.IsBeingCreated() {
		task, err := admin_model.GetMigratingTask(ctx, r.ID)
		if err == nil {
			data["migration"] = spaui.Selected(task, "status:Status", "message:Message", "started:StartTime", "finished:EndTime")
			if ctx.IsSigned && task.DoerID == ctx.Doer.ID {
				data["migration"].(map[string]any)["id"] = task.ID
			}
		}
	}
	if r.Status == repo_model.RepositoryPendingTransfer {
		data["transfer"] = spaui.Selected(ctx.Data["RepoTransfer"], "recipient:Recipient.Name")
		data["can_accept_transfer"] = ctx.Data["CanUserAcceptTransfer"]
	}
	repositoryDetails(ctx, data, canRead)
	ctx.JSON(http.StatusOK, data)
}

// Overview keeps the repository's Git statistics out of the shell's metadata
// request. Counts use real references and cached commit history; languages and
// storage are Forgejo's indexed repository statistics.
func Overview(ctx *context.Context) {
	r := ctx.Repo.Repository
	watch := repo_model.WatchNoneSelection
	if ctx.IsSigned {
		watch = repo_model.GetWatchSelection(ctx, ctx.Doer.ID, r.ID)
	}
	result := map[string]any{
		"avatar_url": r.AvatarLink(ctx), "created_at": r.CreatedUnix.AsTime(),
		"size_bytes": r.Size, "branch_count": 0, "tag_count": 0, "commit_count": 0,
		"languages": []any{}, "watching": watch.IsWatching(), "watchers_count": r.NumWatches,
		"watch_selection": map[string]bool{"issues": watch.Issues, "pulls": watch.PullRequests, "releases": watch.Releases},
	}
	topics, _, err := repo_model.FindTopics(ctx, &repo_model.FindTopicOptions{RepoID: r.ID})
	if err != nil {
		ctx.ServerError("FindTopics", err)
		return
	}
	result["topics"] = spaui.SelectedList(topics, "name:Name", "count:RepoCount")
	if !r.IsEmpty {
		_, branches, err := ctx.Repo.GitRepo.GetBranchNames(0, 1)
		if err != nil {
			ctx.ServerError("Branches", err)
			return
		}
		tags, err := ctx.Repo.GitRepo.WalkReferences(git.ObjectTag, 0, 1, func(_, _ string) error { return nil })
		if err != nil {
			ctx.ServerError("Tags", err)
			return
		}
		commit, err := ctx.Repo.GitRepo.GetBranchCommit(r.DefaultBranch)
		if err != nil {
			ctx.ServerError("DefaultBranch", err)
			return
		}
		count, err := cache.GetInt64(r.GetCommitsCountCacheKey(commit.ID.String(), false), commit.CommitsCount)
		if err != nil {
			ctx.ServerError("CommitCount", err)
			return
		}
		languages, err := repo_model.GetTopLanguageStats(ctx, r, 8)
		if err != nil {
			ctx.ServerError("LanguageStats", err)
			return
		}
		stats := make([]map[string]any, 0, len(languages))
		for _, language := range languages {
			stats = append(stats, map[string]any{"name": language.Language, "color": language.Color, "percentage": language.Percentage})
		}
		result["branch_count"], result["tag_count"], result["commit_count"], result["languages"] = branches, tags, count, stats
		result["recent_branches"] = recentlyPushedBranches(ctx)
	}
	ctx.JSON(http.StatusOK, result)
}

// Branches exposes a bounded page of real Git branches with the same protection
// rules used by the normal branch view. Native mutation handlers remain the
// authority for creation/deletion, including races and branch protection.
func Branches(ctx *context.Context) {
	r := ctx.Repo.Repository
	page := max(1, ctx.FormInt("page"))
	canCreate := ctx.IsSigned && ctx.Repo.CanWrite(unit.TypeCode) && !r.IsArchived && !r.IsMirror
	result := map[string]any{"items": []any{}, "total": 0, "page": page, "can_create": canCreate}
	if ctx.FormString("state") == "deleted" {
		branches, count, err := db.FindAndCount[git_model.Branch](ctx, git_model.FindBranchOptions{RepoID: r.ID, IsDeletedBranch: optional.Some(true), Keyword: ctx.FormString("q"), ListOptions: db.ListOptions{Page: page, PageSize: 30}})
		if err != nil {
			ctx.ServerError("DeletedBranches", err)
			return
		}
		if err := git_model.BranchList(branches).LoadDeletedBy(ctx); err != nil {
			ctx.ServerError("DeletedBy", err)
			return
		}
		items := make([]map[string]any, 0, len(branches))
		for _, branch := range branches {
			items = append(items, map[string]any{"id": branch.ID, "name": branch.Name, "deleted": true, "deleted_at": branch.DeletedUnix.AsTime(), "deleted_by": userSummary(ctx, branch.DeletedBy), "can_restore": canCreate, "commit": map[string]any{"sha": branch.CommitID, "message": branch.CommitMessage, "date": branch.CommitTime.AsTime()}})
		}
		result["items"], result["total"] = items, count
		ctx.JSON(http.StatusOK, result)
		return
	}
	if r.IsEmpty {
		ctx.JSON(http.StatusOK, result)
		return
	}
	names, _, err := ctx.Repo.GitRepo.GetBranchNames(0, 0)
	if err != nil {
		ctx.ServerError("Branches", err)
		return
	}
	rules, err := git_model.FindRepoProtectedBranchRules(ctx, r.ID)
	if err != nil {
		ctx.ServerError("BranchProtection", err)
		return
	}
	query := strings.ToLower(ctx.FormString("q"))
	names = slices.DeleteFunc(names, func(name string) bool { return !strings.Contains(strings.ToLower(name), query) })
	if at := slices.Index(names, r.DefaultBranch); at > 0 {
		names = append([]string{r.DefaultBranch}, append(names[:at], names[at+1:]...)...)
	}
	result["total"] = len(names)
	start := min((page-1)*30, len(names))
	items := make([]map[string]any, 0, 30)
	for _, name := range names[start:min(start+30, len(names))] {
		commit, err := ctx.Repo.GitRepo.GetBranchCommit(name)
		if err != nil {
			ctx.ServerError("BranchCommit", err)
			return
		}
		protected := rules.GetFirstMatched(name) != nil
		item := map[string]any{
			"name": name, "default": name == r.DefaultBranch, "protected": protected,
			"can_delete": canCreate && name != r.DefaultBranch && !protected,
			"commit":     commitInfo(commit),
		}
		branchDetails(ctx, item, name, commit.ID.String())
		if r.IsFork && canCreate {
			info, err := repo_service.GetSyncForkInfo(ctx, r, name)
			if err != nil {
				ctx.ServerError("SyncForkInfo", err)
				return
			}
			item["sync_allowed"], item["commits_behind"] = info.Allowed, info.CommitsBehind
		}
		items = append(items, item)
	}
	result["items"] = items
	ctx.JSON(http.StatusOK, result)
}

// Tags reads tag metadata from Git and keeps annotated tag messages distinct
// from the commit summary. The listing includes tags without release records.
func Tags(ctx *context.Context) {
	r := ctx.Repo.Repository
	page := max(1, ctx.FormInt("page"))
	canCreate := ctx.IsSigned && ctx.Repo.CanWrite(unit.TypeCode) && !r.IsArchived && !r.IsMirror
	canReadReleases := !unit.TypeReleases.UnitGlobalDisabled() && ctx.Repo.CanRead(unit.TypeReleases)
	result := map[string]any{
		"items": []any{}, "total": 0, "page": page, "can_create": canCreate, "can_read_releases": canReadReleases,
		"can_create_release": canReadReleases && ctx.IsSigned && ctx.Repo.CanWrite(unit.TypeReleases) && !r.IsArchived,
	}
	if r.IsEmpty {
		ctx.JSON(http.StatusOK, result)
		return
	}
	tags, _, err := ctx.Repo.GitRepo.GetTagInfos(0, 0)
	if err != nil {
		ctx.ServerError("Tags", err)
		return
	}
	rules, err := git_model.GetProtectedTags(ctx, r.ID)
	if err != nil {
		ctx.ServerError("TagProtection", err)
		return
	}
	query := strings.ToLower(ctx.FormString("q"))
	tags = slices.DeleteFunc(tags, func(tag *git.Tag) bool { return !strings.Contains(strings.ToLower(tag.Name), query) })
	result["total"] = len(tags)
	start := min((page-1)*30, len(tags))
	items := make([]map[string]any, 0, 30)
	for _, tag := range tags[start:min(start+30, len(tags))] {
		releaseID := int64(0)
		isRelease, isDraft, isPrerelease := false, false, false
		if release, err := repo_model.GetRelease(ctx, r.ID, tag.Name); err == nil {
			releaseID = release.ID
			isRelease, isDraft, isPrerelease = !release.IsTag, release.IsDraft, release.IsPrerelease
		} else if !repo_model.IsErrReleaseNotExist(err) {
			ctx.ServerError("TagRecord", err)
			return
		}
		commit, err := ctx.Repo.GitRepo.GetTagCommit(tag.Name)
		if err != nil {
			ctx.ServerError("TagCommit", err)
			return
		}
		canDelete := false
		if canCreate {
			canDelete, err = git_model.IsUserAllowedToControlTag(ctx, rules, tag.Name, ctx.Doer.ID)
			if err != nil {
				ctx.ServerError("TagPermission", err)
				return
			}
		}
		message := ""
		if tag.Type != "commit" {
			message = tag.Message
		}
		item := map[string]any{
			"name": tag.Name, "sha": tag.ID.String(), "message": message,
			"author": tag.Tagger.Name, "date": tag.Tagger.When,
			"id": releaseID, "can_delete": canDelete && releaseID > 0, "commit": commitInfo(commit),
			"release": isRelease, "draft": isDraft, "prerelease": isPrerelease,
		}
		if tag.Signature != nil {
			item["signature"] = signatureDetails(ctx, asymkey_model.ParseTagWithSignature(ctx, ctx.Repo.GitRepo, tag))
		}
		items = append(items, item)
	}
	result["items"] = items
	ctx.JSON(http.StatusOK, result)
}

type entry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Type      string `json:"type"`
	Commit    any    `json:"commit,omitempty"`
	Symlink   bool   `json:"symlink,omitempty"`
	Submodule any    `json:"submodule,omitempty"`
}

// Tree bounds blob and LFS previews like the native view (MaxDisplayFileSize);
// larger files retain native media/download URLs. Text in other encodings is
// converted to UTF-8 like the native file view.
func Tree(ctx *context.Context) {
	r := ctx.Repo.Repository
	if r.IsEmpty {
		ctx.JSON(http.StatusOK, map[string]any{"empty": true, "entries": []entry{}})
		return
	}
	ref := ctx.FormString("ref")
	if ref == "" {
		ref = r.DefaultBranch
	}
	p := ctx.FormString("path")
	if p != "" && (!fsPath(p) || path.Clean(p) != p) {
		ctx.JSON(http.StatusBadRequest, map[string]string{"message": "Invalid repository path"})
		return
	}
	commit, err := ctx.Repo.GitRepo.GetCommit(ref)
	if err != nil {
		ctx.NotFound("ref", nil)
		return
	}
	item, err := commit.GetTreeEntryByPath(p)
	if err != nil {
		ctx.NotFound("path", nil)
		return
	}
	refType := "commit"
	switch {
	case ctx.Repo.GitRepo.IsBranchExist(ref):
		refType = "branch"
	case ctx.Repo.GitRepo.IsTagExist(ref):
		refType = "tag"
	}
	result := map[string]any{
		"empty": false, "ref": ref, "ref_type": refType, "path": p, "sha": commit.ID.String(),
		"commit": map[string]any{"message": commit.Summary(), "author": commit.Author.Name, "date": commit.Author.When},
	}
	if item.IsDir() {
		tree := &commit.Tree
		if p != "" {
			tree, err = commit.SubTree(p)
			if err != nil {
				ctx.NotFound("tree", nil)
				return
			}
		}
		items, err := tree.ListEntries()
		if err != nil {
			ctx.ServerError("ListEntries", err)
			return
		}
		entries := make([]entry, 0, len(items))
		infos, _, err := items.GetCommitsInfo(ctx, commit, p)
		if err != nil {
			ctx.ServerError("GetCommitsInfo", err)
			return
		}
		for _, info := range infos {
			item := info.Entry
			e := entry{Name: item.Name(), Path: path.Join(p, item.Name()), Type: item.Type(), Commit: commitInfo(info.Commit), Symlink: item.IsLink()}
			if item.IsSubmodule() {
				e.Submodule = map[string]any{"url": info.Submodule.ResolveUpstreamURL(r.HTMLURL()), "commit": item.ID.String()}
			}
			entries = append(entries, e)
		}
		slices.SortFunc(entries, func(a, b entry) int {
			if (a.Type == "tree") != (b.Type == "tree") {
				if a.Type == "tree" {
					return -1
				}
				return 1
			}
			return strings.Compare(a.Name, b.Name)
		})
		result["entries"] = entries
		if subfolder, readme := readmeIn(ctx, items, p == ""); readme != nil {
			result["readme"] = path.Join(p, subfolder, readme.Name())
		}
	} else if item.IsSubmodule() {
		result["submodule"] = item.ID.String()
		if submodule, err := commit.GetSubmodule(p, item); err == nil {
			result["submodule_url"] = submodule.ResolveUpstreamURL(r.HTMLURL())
		}
	} else {
		blob := item.Blob()
		result["size"] = blob.Size()
		result["markup"] = markup.Type(p)
		maxPreview := setting.UI.MaxDisplayFileSize
		reader, err := blob.DataAsync()
		if err != nil {
			ctx.ServerError("Blob", err)
			return
		}
		defer reader.Close()
		data, err := io.ReadAll(io.LimitReader(reader, maxPreview+1))
		if err != nil {
			ctx.ServerError("Blob", err)
			return
		}
		isLFS := false
		if setting.LFS.StartServer && len(data) <= 1024 {
			pointer, pointerErr := lfs.ReadPointerFromBuffer(data)
			if pointerErr == nil && pointer.IsValid() {
				isLFS = true
				_, metaErr := git_model.GetLFSMetaObjectByOid(ctx, r.ID, pointer.Oid)
				result["lfs"] = map[string]any{"oid": pointer.Oid, "size": pointer.Size, "available": metaErr == nil}
				result["size"] = pointer.Size
				if metaErr == nil {
					object, readErr := lfs.ReadMetaObject(pointer)
					if readErr != nil {
						result["lfs"].(map[string]any)["available"] = false
					} else {
						data, readErr = io.ReadAll(io.LimitReader(object, maxPreview+1))
						object.Close()
						if readErr != nil {
							ctx.ServerError("LFS object", readErr)
							return
						}
					}
				}
			}
		}
		head := data
		if len(head) > 1024 {
			head = head[:1024]
		}
		fileDetails(ctx, result, commit, item, p, head)
		sniffed := typesniffer.DetectContentType(head, item.Name())
		missingLFS := isLFS && result["lfs"].(map[string]any)["available"] == false
		textual := data != nil && (missingLFS || sniffed.IsRepresentableAsText()) && !strings.ContainsRune(string(head), 0)
		switch {
		case data == nil:
		case len(data) > int(maxPreview):
			result["too_large"] = true
		case !textual:
			result["binary"] = true
		default:
			if !utf8.Valid(data) {
				data = charset.ToUTF8WithFallback(data, charset.ConvertOpts{})
				result["converted"] = true
			}
			result["content"] = string(data)
			if markup.Type(p) != "" {
				result["content_html"] = renderDocument(ctx, commit, ref, p, string(data))
			}
			locked := false
			if lock, ok := result["lfs_lock"].(map[string]any); ok {
				locked = lock["mine"] != true
			}
			result["editable"] = !isLFS && !locked && ctx.IsSigned && ctx.Repo.CanWrite(unit.TypeCode) && !r.IsArchived && r.CanEnableEditor() && !item.IsLink() && blob.Size() < setting.UI.MaxDisplayFileSize && ctx.Repo.GitRepo.IsBranchExist(ref)
		}
	}
	ctx.JSON(http.StatusOK, result)
}

// renderDocument renders a repository markdown file like the native file view,
// resolving relative links against the browsed branch, tag or commit.
func renderDocument(ctx *context.Context, commit *git.Commit, ref, treePath, content string) string {
	branchPath := "commit/" + util.PathEscapeSegments(commit.ID.String())
	switch {
	case ctx.Repo.GitRepo.IsBranchExist(ref):
		branchPath = "branch/" + util.PathEscapeSegments(ref)
	case ctx.Repo.GitRepo.IsTagExist(ref):
		branchPath = "tag/" + util.PathEscapeSegments(ref)
	}
	var buf strings.Builder
	if err := markup.Render(&markup.RenderContext{
		Ctx:          ctx,
		RelativePath: treePath,
		Links: markup.Links{
			Base:       ctx.Repo.RepoLink,
			BranchPath: branchPath,
			TreePath:   path.Dir(treePath),
		},
		Metas:   ctx.Repo.Repository.ComposeDocumentMetas(ctx),
		GitRepo: ctx.Repo.GitRepo,
	}, strings.NewReader(content), &buf); err != nil {
		log.Error("Render repository document for the SPA: %v", err)
		return ""
	}
	return buf.String()
}

func fsPath(p string) bool {
	return !strings.HasPrefix(p, "/") && !strings.Contains(p, "\x00") && p != ".." && !strings.HasPrefix(p, "../")
}

// Issues applies the same repository/unit middleware as the native views.
func Issues(ctx *context.Context) {
	isPull := ctx.Params(":kind") == "pulls"
	required := unit.TypeIssues
	if isPull {
		required = unit.TypePullRequests
	}
	if required.UnitGlobalDisabled() || !ctx.Repo.CanRead(required) {
		ctx.NotFound("", nil)
		return
	}
	page := max(1, ctx.FormInt("page"))
	opts := &issues_model.IssuesOptions{
		Paginator: &db.ListOptions{Page: page, PageSize: 30},
		RepoIDs:   []int64{ctx.Repo.Repository.ID},
		IsPull:    optional.Some(isPull), IsClosed: optional.Some(ctx.FormString("state") == "closed"),
		SortType: ctx.FormString("sort"), User: ctx.Doer,
	}
	if opts.SortType == "" {
		opts.SortType = "recentupdate"
	}
	if ctx.FormString("state") == "all" {
		opts.IsClosed = optional.None[bool]()
	}
	if state := ctx.FormString("state"); isPull && (state == "merged" || state == "closed") {
		// Keep repository scoping inside the condition when separating merged
		// requests from requests closed without merging. Pagination and counts
		// use this same condition.
		opts.IsClosed = optional.Some(true)
		opts.RepoIDs = nil
		opts.RepoCond = builder.Eq{"issue.repo_id": ctx.Repo.Repository.ID}.And(
			builder.In("issue.id", builder.Select("issue_id").From("pull_request").Where(
				builder.Eq{"base_repo_id": ctx.Repo.Repository.ID, "has_merged": state == "merged"})))
	}
	items, err := issues_model.Issues(ctx, opts)
	if err != nil {
		ctx.ServerError("Issues", err)
		return
	}
	count, err := issues_model.CountIssues(ctx, opts)
	if err != nil {
		ctx.ServerError("CountIssues", err)
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": convert.ToIssueList(ctx, ctx.Doer, items), "total": count, "page": page})
}

func Projects(ctx *context.Context) {
	if unit.TypeProjects.UnitGlobalDisabled() || !ctx.Repo.CanRead(unit.TypeProjects) {
		ctx.NotFound("Boards", nil)
		return
	}
	items, count, err := db.FindAndCount[project_model.Project](ctx, project_model.SearchOptions{
		ListOptions: db.ListOptions{Page: max(1, ctx.FormInt("page")), PageSize: 30},
		RepoID:      ctx.Repo.Repository.ID, Type: project_model.TypeRepository,
		IsClosed: optional.Some(ctx.FormString("state") == "closed"),
		OrderBy:  project_model.GetSearchOrderByBySortType(ctx.FormString("sort")), Title: ctx.FormTrim("q"),
	})
	if err != nil {
		ctx.ServerError("Projects", err)
		return
	}
	result := make([]map[string]any, 0, len(items))
	openCounts, err := issues_model.NumIssuesInProjects(ctx, items, ctx.Doer, nil, optional.Some(false))
	if err != nil {
		ctx.ServerError("Board open issue counts", err)
		return
	}
	closedCounts, err := issues_model.NumIssuesInProjects(ctx, items, ctx.Doer, nil, optional.Some(true))
	if err != nil {
		ctx.ServerError("Board closed issue counts", err)
		return
	}
	for _, item := range items {
		row := projectInfo(item)
		row["open_count"] = openCounts[item.ID]
		row["closed_count"] = closedCounts[item.ID]
		result = append(result, row)
	}
	ctx.JSON(http.StatusOK, map[string]any{"items": result, "total": count, "open_count": ctx.Repo.Repository.NumOpenProjects, "closed_count": ctx.Repo.Repository.NumClosedProjects, "can_write": ctx.IsSigned && !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWrite(unit.TypeProjects)})
}

func projectInfo(p *project_model.Project) map[string]any {
	return map[string]any{"id": p.ID, "title": p.Title, "description": p.Description, "closed": p.IsClosed, "card_type": p.CardType}
}

func Project(ctx *context.Context) {
	if unit.TypeProjects.UnitGlobalDisabled() || !ctx.Repo.CanRead(unit.TypeProjects) {
		ctx.NotFound("Board", nil)
		return
	}
	p, err := project_model.GetProjectForRepoByID(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":id"))
	if err != nil {
		ctx.NotFound("project", nil)
		return
	}
	columns, err := p.GetColumns(ctx)
	if err != nil {
		ctx.ServerError("Columns", err)
		return
	}
	items, err := issues_model.LoadIssuesFromColumnList(ctx, columns, ctx.Doer, nil, optional.None[bool]())
	if err != nil {
		ctx.ServerError("ProjectIssues", err)
		return
	}
	result := make([]map[string]any, 0, len(columns))
	for _, column := range columns {
		cards, err := spaboards.CardIssues(ctx, items[column.ID], p.CardType)
		if err != nil {
			ctx.ServerError("Board cards", err)
			return
		}
		result = append(result, map[string]any{
			"id": column.ID, "title": column.Title, "color": column.Color,
			"issues": cards, "default": column.Default,
		})
	}
	ctx.JSON(http.StatusOK, map[string]any{"project": projectInfo(p), "columns": result, "can_write": !ctx.Repo.Repository.IsArchived && ctx.Repo.CanWrite(unit.TypeProjects)})
}

// Issue mirrors the native issue-info permission checks and adds paginated
// discussion data. Native comment/status actions remain authoritative.
func Issue(ctx *context.Context) {
	item, err := issues_model.GetIssueWithAttrsByIndex(ctx, ctx.Repo.Repository.ID, ctx.ParamsInt64(":index"))
	if err != nil {
		ctx.NotFoundOrServerError("Issue", issues_model.IsErrIssueNotExist, err)
		return
	}
	required := unit.TypeIssues
	if item.IsPull {
		required = unit.TypePullRequests
	}
	if item.IsPull != (ctx.Params(":kind") == "pulls") || required.UnitGlobalDisabled() ||
		!ctx.Repo.CanRead(required) || (item.IsPull && !ctx.Repo.Repository.CanEnablePulls()) {
		ctx.NotFound("Issue", nil)
		return
	}
	result, count, page, err := issueTimeline(ctx, item)
	if issueLifecycleError(ctx, err) {
		return
	}
	lifecycle, err := issueLifecycle(ctx, item)
	if issueLifecycleError(ctx, err) {
		return
	}
	var pull any
	styles := make([]string, 0)
	if item.IsPull {
		if err := item.LoadPullRequest(ctx); err != nil {
			ctx.ServerError("PullRequest", err)
			return
		}
		pull = convert.ToAPIPullRequest(ctx, item.PullRequest, ctx.Doer)
		cfg := ctx.Repo.Repository.MustGetUnit(ctx, unit.TypePullRequests).PullRequestsConfig()
		for _, style := range []repo_model.MergeStyle{repo_model.MergeStyleMerge, repo_model.MergeStyleSquash, repo_model.MergeStyleRebase, repo_model.MergeStyleRebaseMerge, repo_model.MergeStyleFastForwardOnly} {
			if cfg.IsMergeStyleAllowed(style) {
				styles = append(styles, string(style))
			}
		}
	}
	canEdit := ctx.IsSigned && !ctx.Repo.Repository.IsArchived && (item.PosterID == ctx.Doer.ID || ctx.Repo.CanWrite(required))
	issueMarkup := map[string]any{"body_html": renderComment(ctx, nil, item.Content)}
	if canEdit {
		issueMarkup["body_edit"] = issueContentEdit(ctx, item)
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"pull": pull, "merge_styles": styles,
		"can_merge": ctx.IsSigned && ctx.Repo.CanWrite(unit.TypeCode) && !ctx.Repo.Repository.IsArchived,
		"issue":     spaui.WithFields(convert.ToIssue(ctx, ctx.Doer, item), issueMarkup), "comments": result, "total_comments": count, "lifecycle": lifecycle,
		"page":           page,
		"can_comment":    ctx.IsSigned && !ctx.Repo.Repository.IsArchived && (!item.IsLocked || ctx.Repo.CanWriteIssuesOrPulls(item.IsPull) || ctx.IsUserSiteAdmin()),
		"draft_prefixes": setting.Repository.PullRequest.WorkInProgressPrefixes,
		"can_edit":       canEdit,
		"can_report":     ctx.IsSigned && setting.Moderation.Enabled && item.PosterID != ctx.Doer.ID,
		"can_change_status": ctx.IsSigned && (!item.IsPull || !item.PullRequest.HasMerged) && !ctx.Repo.Repository.IsArchived &&
			(item.PosterID == ctx.Doer.ID || ctx.Repo.CanWrite(required)),
	})
}

func commitInfo(c *git.Commit) any {
	if c == nil {
		return nil
	}
	return map[string]any{"sha": c.ID.String(), "message": c.Summary(), "author": c.Author.Name, "date": c.Author.When}
}

// Commits uses the assigned repository and code-reader middleware.
func Commits(ctx *context.Context) {
	ref := ctx.FormString("ref")
	if ref == "" {
		ref = ctx.Repo.Repository.DefaultBranch
	}
	if ctx.Repo.Repository.IsEmpty {
		ctx.JSON(http.StatusOK, map[string]any{"items": []any{}, "total": 0})
		return
	}
	commit, err := ctx.Repo.GitRepo.GetCommit(ref)
	if err != nil {
		ctx.NotFound("ref", nil)
		return
	}
	file := ctx.FormString("path")
	if file != "" && (!fsPath(file) || path.Clean(file) != file) {
		ctx.JSON(http.StatusBadRequest, map[string]string{"message": "Invalid repository path"})
		return
	}
	page := max(1, ctx.FormInt("page"))
	pageSize := 30
	var commits []*git.Commit
	var total int64
	if file != "" {
		pageSize = setting.Git.CommitsRangeSize
		commits, err = ctx.Repo.GitRepo.CommitsByFileAndRange(git.CommitsByFileAndRangeOptions{Revision: commit.ID.String(), File: file, Page: page, PageSize: pageSize})
		if err == nil {
			total, err = ctx.Repo.GitRepo.FileCommitsCount(commit.ID.String(), file)
		}
	} else if keyword := ctx.FormString("q"); keyword != "" {
		commits, err = commit.SearchCommits(git.NewSearchCommitsOptions(keyword, ctx.FormBool("all")))
		total = int64(len(commits))
		start := min((page-1)*pageSize, len(commits))
		commits = commits[start:min(start+pageSize, len(commits))]
	} else {
		commits, err = commit.CommitsByRange(page, pageSize, "")
		if err == nil {
			total, err = commit.CommitsCount()
		}
	}
	if err != nil {
		ctx.ServerError("Commits", err)
		return
	}
	result := map[string]any{"items": commitList(ctx, commits), "total": total, "page_size": pageSize}
	if file != "" && len(commits) > 0 {
		// Like the native file history: offer the history of the previous
		// name when the oldest commit on this page renamed the file.
		oldest := commits[len(commits)-1]
		if renames, err := git.GetCommitFileRenames(ctx, ctx.Repo.GitRepo.Path, oldest.ID.String()); err == nil {
			for _, rename := range renames {
				if rename[1] == file {
					result["renamed_from"] = map[string]any{"path": rename[0], "commit": oldest.ID.String()}
					break
				}
			}
		}
	}
	ctx.JSON(http.StatusOK, result)
}

// commitList adds the native commit list details: signature, CI status,
// the author's account and the tags pointing at each commit.
func commitList(ctx *context.Context, commits []*git.Commit) []any {
	r := ctx.Repo.Repository
	ids := make([]string, 0, len(commits))
	for _, c := range commits {
		ids = append(ids, c.ID.String())
	}
	tags, err := repo_model.FindTagsByCommitIDs(ctx, r.ID, ids...)
	if err != nil {
		log.Error("FindTagsByCommitIDs: %v", err)
	}
	items := make([]any, 0, len(commits))
	for _, c := range git_model.ParseCommitsWithStatus(ctx, commits, r) {
		item := map[string]any{
			"sha": c.ID.String(), "message": c.Summary(), "body": strings.TrimSpace(strings.TrimPrefix(c.Message(), c.Summary())),
			"author": c.Author.Name, "date": c.Author.When, "parents": c.ParentCount(),
			"user": userSummary(ctx, c.User), "signature": signatureDetails(ctx, c.Verification),
		}
		if c.Committer != nil {
			item["committed_at"] = c.Committer.When
		}
		if summary := statusSummary(c.Statuses); summary != nil {
			item["status"] = summary
		}
		if list := tags[c.ID.String()]; len(list) > 0 {
			names := make([]map[string]any, 0, len(list))
			for _, tag := range list {
				names = append(names, map[string]any{"name": tag.TagName, "release": !tag.IsTag})
			}
			item["tags"] = names
		}
		items = append(items, item)
	}
	return items
}
