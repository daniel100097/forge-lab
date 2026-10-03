// SPDX-License-Identifier: GPL-3.0-or-later
package spaui

import "reflect"

// Fields selects an explicit, compile-time allowlist of presentation fields.
// Callers never pass names from requests; private model fields stay on the server.
func Fields(input any, names ...string) map[string]any {
	value := reflect.ValueOf(input)
	for value.IsValid() && (value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface) {
		if value.IsNil() {
			return map[string]any{}
		}
		value = value.Elem()
	}
	result := make(map[string]any, len(names))
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return result
	}
	for _, name := range names {
		field := value.FieldByName(name)
		if field.IsValid() && field.CanInterface() {
			result[name] = field.Interface()
		}
	}
	return result
}

func Rows(input any, names ...string) []map[string]any {
	value := reflect.ValueOf(input)
	result := make([]map[string]any, 0)
	if !value.IsValid() || value.Kind() != reflect.Slice {
		return result
	}
	for i := 0; i < value.Len(); i++ {
		result = append(result, Fields(value.Index(i).Interface(), names...))
	}
	return result
}
