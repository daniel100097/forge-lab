package spaboards

import (
	issues_model "forgejo.org/models/issues"
	project_model "forgejo.org/models/project"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/modules/optional"
	"forgejo.org/modules/spaui"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
)

func CardIssues(ctx *context.Context, issues issues_model.IssueList, cardType project_model.CardType) ([]any, error) {
	result := make([]any, 0, len(issues))
	for _, issue := range issues {
		fields := map[string]any{"tasks": issue.GetTasks(), "tasks_done": issue.GetTasksDone()}
		if cardType == project_model.CardTypeImagesAndText {
			images, err := repo_model.GetAttachmentsByIssueIDImagesLatest(ctx, issue.ID)
			if err != nil {
				return nil, err
			}
			if len(images) > 0 {
				fields["image"] = images[0].DownloadURL()
				fields["image_name"] = images[0].Name
			}
		}
		refs := make([]int64, 0)
		for _, comment := range issue.Comments {
			if comment.RefIssueID != 0 && comment.RefIsPull {
				refs = append(refs, comment.RefIssueID)
			}
		}
		linked := make([]map[string]any, 0)
		if len(refs) > 0 {
			pulls, err := issues_model.Issues(ctx, &issues_model.IssuesOptions{IssueIDs: refs, IsPull: optional.Some(true), User: ctx.Doer, AllPublic: !ctx.IsSigned})
			if err != nil {
				return nil, err
			}
			for _, pull := range pulls {
				if err := pull.LoadPullRequest(ctx); err != nil {
					return nil, err
				}
				if err := pull.LoadRepo(ctx); err != nil {
					return nil, err
				}
				linked = append(linked, map[string]any{"id": pull.ID, "number": pull.Index, "title": pull.Title, "url": pull.Link(), "state": pull.State(), "merged": pull.PullRequest.HasMerged})
			}
		}
		fields["linked_pulls"] = linked
		result = append(result, spaui.WithFields(convert.ToIssue(ctx, ctx.Doer, issue), fields))
	}
	return result, nil
}
