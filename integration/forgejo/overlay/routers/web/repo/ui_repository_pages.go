// SPDX-License-Identifier: GPL-3.0-or-later
package repo

import (
	"net/http"

	asymkey_model "forgejo.org/models/asymkey"
	git_model "forgejo.org/models/git"
	"forgejo.org/models/organization"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/git"
	code_indexer "forgejo.org/modules/indexer/code"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
	"forgejo.org/services/repository/gitgraph"
)

func writeSearchUI(ctx *context.Context, total int, results []*code_indexer.Result) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	items := make([]map[string]any, 0, len(results))
	for _, result := range results {
		lines := make([]map[string]any, 0, len(result.Lines))
		for _, line := range result.Lines {
			lines = append(lines, map[string]any{"number": line.Num, "html": line.FormattedContent})
		}
		item := map[string]any{"path": result.Filename, "sha": result.CommitID, "language": result.Language, "color": result.Color, "lines": lines}
		if !result.UpdatedUnix.IsZero() {
			item["updated_at"] = result.UpdatedUnix.AsTime()
		}
		items = append(items, item)
	}
	languages := make([]map[string]any, 0)
	if list, ok := ctx.Data["SearchResultLanguages"].([]*code_indexer.SearchResultLanguages); ok {
		for _, language := range list {
			languages = append(languages, map[string]any{"language": language.Language, "color": language.Color, "count": language.Count})
		}
	}
	ref := ""
	if !setting.Indexer.RepoIndexerEnabled {
		ref = ctx.Repo.RefName
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{
		"items": items, "total": total, "page_size": setting.UI.RepoSearchPagingNum, "mode": ctx.Data["CodeSearchMode"], "modes": ctx.Data["CodeSearchOptions"],
		"unavailable": ctx.Data["CodeIndexerUnavailable"] == true, "indexed": ctx.Data["CodeIndexerDisabled"] != true,
		"languages": languages, "keyword": ctx.Data["Keyword"], "language": ctx.Data["Language"], "path": ctx.Data["CodeSearchPath"], "ref": ref,
	})
	return true
}

func writeForkUI(ctx *context.Context) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	owners := make([]map[string]any, 0)
	if ctx.Data["CanForkToUser"] == true {
		owners = append(owners, map[string]any{"id": ctx.Doer.ID, "name": ctx.Doer.Name})
	}
	if orgs, ok := ctx.Data["Orgs"].([]*organization.Organization); ok {
		for _, org := range orgs {
			owners = append(owners, map[string]any{"id": org.ID, "name": org.Name})
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{"owners": owners, "can_fork": ctx.Data["CanForkRepo"] == true, "name": ctx.Data["repo_name"], "description": ctx.Data["description"], "private": ctx.Data["IsPrivate"], "branches": ctx.Data["Branches"]})
	return true
}

func writeBlameUI(ctx *context.Context, result *blameResult) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	items := make([]map[string]any, 0)
	if result != nil {
		for _, part := range result.Parts {
			commit, err := ctx.Repo.GitRepo.GetCommit(part.Sha)
			if err != nil {
				ctx.ServerError("BlameCommit", err)
				return true
			}
			items = append(items, map[string]any{"sha": part.Sha, "previous_sha": part.PreviousSha, "previous_path": part.PreviousPath, "lines": part.Lines, "message": commit.Summary(), "author": commit.Author.Name, "date": commit.Author.When})
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{
		"items": items, "path": ctx.Repo.TreePath, "ref": ctx.Repo.RefName, "commit_id": ctx.Repo.CommitID,
		"is_branch": ctx.Repo.IsViewBranch, "too_large": ctx.Data["IsFileTooLarge"] == true,
		"uses_ignore_revs": result != nil && result.UsesIgnoreRevs, "faulty_ignore_revs": result != nil && result.FaultyIgnoreRevsFile,
	})
	return true
}

func writeGraphUI(ctx *context.Context, graph *gitgraph.Graph, total int64, pageSize int) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	items := make([]map[string]any, 0)
	for _, item := range graph.Commits {
		if item.Rev == "" {
			continue
		}
		refs := make([]map[string]string, 0, len(item.Refs))
		for _, ref := range item.Refs {
			refs = append(refs, map[string]string{"name": ref.Name, "short": ref.ShortName(), "group": ref.RefGroup()})
		}
		entry := map[string]any{"sha": item.Rev, "message": item.Subject, "date": item.Date, "author": item.Commit.Author.Name, "parents": append([]string{}, item.ParentHashes...), "refs": refs, "column": item.Column, "row": item.Row, "flow": item.Flow}
		if item.Status != nil {
			entry["status"] = item.Status.State
		}
		if item.Verification != nil && item.Verification.Reason != asymkey_model.NotSigned {
			entry["verified"] = item.Verification.Verified
		}
		items = append(items, entry)
	}
	// The native graph page offers every branch and tag for its filter.
	references := make([]map[string]string, 0)
	if refs, err := ctx.Repo.GitRepo.GetRefs(); err == nil {
		for _, ref := range refs {
			if group := ref.RefGroup(); group == "heads" || group == "tags" {
				references = append(references, map[string]string{"name": ref.Name, "short": ref.ShortName(), "group": group})
			}
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, map[string]any{"items": items, "total": total, "page_size": pageSize, "refs": references})
	return true
}

// writeCommitUI exposes the commit header of the native commit page: message,
// author and committer accounts, parents, CI statuses, the full signature
// verification and the Git note.
func writeCommitUI(ctx *context.Context, commit *git.Commit, verification *asymkey_model.ObjectVerification, statuses []*git_model.CommitStatus, parents []string) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	checks := make([]map[string]any, 0, len(statuses))
	for _, status := range statuses {
		checks = append(checks, map[string]any{"context": status.Context, "state": status.State, "description": status.Description, "target_url": status.TargetURL})
	}
	user := func(u *user_model.User) map[string]any {
		if u == nil || u.ID <= 0 {
			return nil
		}
		return map[string]any{"name": u.Name, "display_name": u.GetDisplayName(), "avatar_url": u.AvatarLink(ctx)}
	}
	signature := map[string]any{"signed": commit.Signature != nil, "verified": verification.Verified, "warning": verification.Warning, "reason": ctx.Locale.TrString(verification.Reason), "trust": verification.TrustStatus, "email": verification.SigningEmail}
	if verification.SigningUser != nil {
		signature["signer"] = map[string]any{"id": verification.SigningUser.ID, "name": verification.SigningUser.Name, "display_name": verification.SigningUser.GetDisplayName(), "avatar_url": verification.SigningUser.AvatarLink(ctx)}
	}
	if verification.SigningKey != nil && verification.SigningKey.KeyID != "" {
		signature["key_id"] = verification.SigningKey.PaddedKeyID()
	}
	if verification.SigningSSHKey != nil && verification.SigningSSHKey.Fingerprint != "" {
		signature["ssh_fingerprint"] = verification.SigningSSHKey.Fingerprint
	}
	author, _ := ctx.Data["Author"].(*user_model.User)
	response := map[string]any{
		"sha": commit.ID.String(), "message": commit.Message(), "author": commit.Author.Name, "author_email": commit.Author.Email, "authored_at": commit.Author.When,
		"author_user": user(author), "committer": commit.Committer.Name, "committer_email": commit.Committer.Email, "committed_at": commit.Committer.When,
		"committer_user": user(verification.CommittingUser), "parents": parents,
		"note": ctx.Data["NoteRaw"], "statuses": checks, "signature": signature,
	}
	if note, ok := ctx.Data["NoteCommit"].(*git.Commit); ok && note != nil {
		noteAuthor, _ := ctx.Data["NoteAuthor"].(*user_model.User)
		response["note_author"] = map[string]any{"name": note.Author.Name, "date": note.Author.When, "user": user(noteAuthor)}
	}
	ctx.JSON(http.StatusOK, response)
	return true
}

// uiCommitSigning tells the SPA editors whether the commit will be signed,
// like the lock icon and tooltip of the native commit form.
func uiCommitSigning(ctx *context.Context) map[string]any {
	rights, ok := ctx.Data["CanCommitToBranch"].(context.CanCommitToBranchResults)
	if !ok {
		return nil
	}
	result := map[string]any{"will_sign": rights.WillSign, "require_signed": rights.RequireSigned, "user_can_push": rights.UserCanPush}
	if rights.WillSign {
		result["message"] = ctx.Locale.TrString("repo.signing.will_sign", rights.SigningKey)
	} else if rights.WontSignReason != "" {
		result["message"] = ctx.Locale.TrString("repo.signing.wont_sign." + rights.WontSignReason)
	}
	return result
}
