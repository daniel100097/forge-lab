package repo

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"

	issues_model "forgejo.org/models/issues"
	"forgejo.org/services/context"
	pull_service "forgejo.org/services/pull"
)

type issueListResponse struct {
	context.ResponseWriter
	body   bytes.Buffer
	status int
}

func (response *issueListResponse) WriteHeader(status int) {
	if response.status == 0 {
		response.status = status
	}
}

func (response *issueListResponse) Write(content []byte) (int, error) {
	if response.status == 0 {
		response.status = http.StatusOK
	}
	return response.body.Write(content)
}

func (response *issueListResponse) Status() int        { return response.status }
func (response *issueListResponse) WrittenStatus() int { return response.status }
func (response *issueListResponse) Size() int          { return response.body.Len() }

func writeDetailedIssueListUI(ctx *context.Context, pulls bool) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	original := ctx.Resp
	response := &issueListResponse{ResponseWriter: original}
	ctx.Resp = response
	handled := writeIssueListUI(ctx, pulls)
	ctx.Resp = original
	if !handled {
		return false
	}
	if response.status != http.StatusOK {
		original.WriteHeader(response.status)
		_, _ = original.Write(response.body.Bytes())
		return true
	}
	var data map[string]json.RawMessage
	if err := json.Unmarshal(response.body.Bytes(), &data); err != nil {
		ctx.ServerError("Issue list response", err)
		return true
	}
	ids := make([]int64, 0)
	for _, key := range []string{"items", "pinned"} {
		var rows []struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(data[key], &rows); err != nil {
			ctx.ServerError("Issue list rows", err)
			return true
		}
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
	}
	details := make(map[string]any)
	if len(ids) > 0 {
		issues, err := issues_model.GetIssuesByIDs(ctx, ids, true)
		if err != nil {
			ctx.ServerError("Issue list details", err)
			return true
		}
		if err = issues.LoadAttributes(ctx); err != nil {
			ctx.ServerError("Issue list attributes", err)
			return true
		}
		approvals, err := issues.GetApprovalCounts(ctx)
		if err != nil {
			ctx.ServerError("Issue list reviews", err)
			return true
		}
		_, statuses, err := pull_service.GetIssuesAllCommitStatus(ctx, issues)
		if err != nil {
			ctx.ServerError("Issue list statuses", err)
			return true
		}
		for _, issue := range issues {
			row := map[string]any{"tasks": issue.GetTasks(), "tasks_done": issue.GetTasksDone(), "tracked_time": issue.TotalTrackedTime, "overdue": issue.IsOverdue(), "approvals": int64(0), "changes_requested": int64(0)}
			if issue.PullRequest != nil {
				row["target_branch"] = issue.PullRequest.BaseBranch
			}
			if status := statuses[issue.ID]; status != nil {
				row["status"] = status.State
				row["status_url"] = status.TargetURL
			}
			if issue.Project != nil {
				row["project"] = map[string]any{"title": issue.Project.Title, "url": issue.Project.Link(ctx)}
			}
			for _, count := range approvals[issue.ID] {
				if count.Type == issues_model.ReviewTypeApprove {
					row["approvals"] = count.Count
				}
				if count.Type == issues_model.ReviewTypeReject {
					row["changes_requested"] = count.Count
				}
			}
			details[strconv.FormatInt(issue.ID, 10)] = row
		}
	}
	encoded, err := json.Marshal(details)
	if err != nil {
		ctx.ServerError("Issue list metadata", err)
		return true
	}
	data["row_details"] = encoded
	ctx.JSON(http.StatusOK, data)
	return true
}
