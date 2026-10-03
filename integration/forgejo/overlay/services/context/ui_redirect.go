// SPDX-License-Identifier: GPL-3.0-or-later
package context

import "net/http"

// Redirect retains native form failures for the separate browser application.
// A flash error followed by navigation must never appear to be a successful save.
func (ctx *Context) Redirect(location string, status ...int) {
	if ctx.Req.Header.Get("X-Forgejo-UI") == "1" && ctx.Flash != nil && ctx.Flash.ErrorMsg != "" {
		ctx.Resp.Header().Set("Cache-Control", "no-store")
		ctx.JSON(http.StatusUnprocessableEntity, map[string]string{"errorMessage": ctx.Flash.ErrorMsg})
		return
	}
	ctx.Base.Redirect(location, status...)
}
