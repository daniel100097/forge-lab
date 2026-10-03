// SPDX-License-Identifier: GPL-3.0-or-later
package spaui

import (
	"bytes"
	"encoding/json"
)

// WithFields returns value's JSON object form with extra presentation fields,
// e.g. Forgejo-rendered markup ("body_html") next to the raw text ("body").
// Empty extras are omitted; value is returned unchanged if it is not an object.
func WithFields(value any, extra map[string]any) any {
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var result map[string]any
	if decoder.Decode(&result) != nil || result == nil {
		return value
	}
	for key, field := range extra {
		if field == nil || field == "" {
			continue
		}
		result[key] = field
	}
	return result
}
