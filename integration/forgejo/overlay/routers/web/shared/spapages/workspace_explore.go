package spapages

import (
	"fmt"
	repo_model "forgejo.org/models/repo"
	"forgejo.org/services/context"
	"net/http"
)

func ExploreRepositories(ctx *context.Context) bool {
	if ctx.Req.Header.Get("X-Forgejo-UI") != "1" {
		return false
	}
	items := make([]map[string]any, 0)
	if repositories, ok := ctx.Data["Repos"].([]*repo_model.Repository); ok {
		for _, repository := range repositories {
			items = append(items, map[string]any{"repository": map[string]any{"id": repository.ID, "name": repository.Name, "full_name": repository.FullName(), "description": repository.Description, "private": repository.IsPrivate, "archived": repository.IsArchived, "stars_count": repository.NumStars, "forks_count": repository.NumForks, "updated_at": repository.UpdatedUnix.AsTime(), "topics": repository.Topics, "link": repository.Link()}})
		}
	}
	ctx.Resp.Header().Set("Cache-Control", "no-store")
	ctx.Resp.Header().Set("X-Total-Count", fmt.Sprint(ctx.Data["Total"]))
	ctx.JSON(http.StatusOK, map[string]any{"ok": true, "data": items, "only_show_relevant": ctx.Data["OnlyShowRelevant"]})
	return true
}
