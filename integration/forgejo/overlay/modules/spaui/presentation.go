// SPDX-License-Identifier: GPL-3.0-or-later
package spaui

import (
	"reflect"
	"strings"
	"time"
)

// Selected copies only explicitly named presentation fields. Callers supply
// constant json_name:GoField allowlists; model/context objects are never dumped.
// Dot paths allow selecting a related object's public identifier without
// exposing its credentials, private profile fields, or other model internals.
func Selected(value any, fields ...string) map[string]any {
	result := make(map[string]any, len(fields))
	for _, field := range fields {
		key, name, found := strings.Cut(field, ":")
		if !found {
			name = key
		}
		v := reflect.ValueOf(value)
		for _, part := range strings.Split(name, ".") {
			for v.IsValid() && (v.Kind() == reflect.Pointer || v.Kind() == reflect.Interface) {
				v = v.Elem()
			}
			if !v.IsValid() || v.Kind() != reflect.Struct {
				v = reflect.Value{}
				break
			}
			v = v.FieldByName(part)
		}
		if !v.IsValid() || !v.CanInterface() {
			continue
		}
		if timestamp, ok := v.Interface().(interface{ AsTime() time.Time }); ok {
			result[key] = timestamp.AsTime()
			continue
		}
		result[key] = v.Interface()
	}
	return result
}

func SelectedList(value any, fields ...string) []map[string]any {
	result := make([]map[string]any, 0)
	v := reflect.ValueOf(value)
	for v.IsValid() && (v.Kind() == reflect.Pointer || v.Kind() == reflect.Interface) {
		v = v.Elem()
	}
	if !v.IsValid() || (v.Kind() != reflect.Slice && v.Kind() != reflect.Array) {
		return result
	}
	for i := 0; i < v.Len(); i++ {
		result = append(result, Selected(v.Index(i).Interface(), fields...))
	}
	return result
}
