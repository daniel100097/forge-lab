import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SelectControl } from "./SelectControl";
import { RenderedMarkup } from "./RenderedMarkup";
import { useOutletContext } from "react-router-dom";
import type { RepoContext } from "./App";

export interface FormField {
  id: string;
  type: string;
  visible?: string[];
  attributes: {
    label?: string;
    description?: string;
    description_html?: string;
    value?: string;
    value_html?: string;
    placeholder?: string;
    multiple?: boolean;
    default?: number | number[];
    options?: (
      string | { label: string; required?: boolean; visible?: string[] }
    )[];
  };
  validations: { required?: boolean; is_number?: boolean; regex?: string };
}
export function MultiChoice({
  name,
  title,
  options,
  selected = [],
  required = false,
}: {
  name: string;
  title: string;
  options: { value: string; label: string }[];
  selected?: string[];
  required?: boolean;
}) {
  const [values, setValues] = useState(selected);
  return (
    <fieldset className="my-4">
      <legend className="font-semibold mb-2">{title}</legend>
      <input type="hidden" name={name} value={values.join(",")} />
      {options.map((o) => (
        <label key={o.value} className="check-field">
          <input
            type="checkbox"
            required={required && values.length === 0}
            checked={values.includes(o.value)}
            onChange={(e) =>
              setValues(
                e.target.checked
                  ? [...values, o.value]
                  : values.filter((v) => v !== o.value),
              )
            }
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
export function TemplateField({
  field: f,
  initialValues,
}: {
  field: FormField;
  initialValues?: Record<string, string>;
}) {
  const { t } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>();
  const a = f.attributes || {},
    v = f.validations || {},
    name = `form-field-${f.id}`,
    label = a.label || f.id;
  if (f.type === "markdown")
    return f.visible?.length &&
      !f.visible.includes("form") ? null : a.value_html ? (
      <RenderedMarkup html={a.value_html} raw={a.value || ""} context={path} />
    ) : (
      <p>{a.value || ""}</p>
    );
  const hidden = !!f.visible?.length && !f.visible.includes("form");
  return (
    <div hidden={hidden}>
      {f.type === "checkboxes" ? (
        <fieldset>
          <legend>{label}</legend>
          {a.options?.map((o, i) => {
            const item = typeof o === "string" ? { label: o } : o;
            if (item.visible?.length && !item.visible.includes("form"))
              return null;
            return (
              <label key={i} className="check-field">
                <input
                  type="checkbox"
                  name={`${name}-${i}`}
                  defaultChecked={initialValues?.[`${name}-${i}`] === "on"}
                  required={!hidden && item.required}
                />
                {item.label}
              </label>
            );
          })}
        </fieldset>
      ) : f.type === "dropdown" ? (
        a.multiple ? (
          <MultiChoice
            name={name}
            title={label}
            required={!hidden && v.required}
            options={(a.options || []).map((o, i) => ({
              value: String(i),
              label: String(o),
            }))}
            selected={
              initialValues
                ? initialValues[name]?.split(",").filter(Boolean) || []
                : Array.isArray(a.default)
                  ? a.default.map(String)
                  : a.default === undefined
                    ? []
                    : [String(a.default)]
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{label}</span>
            <SelectControl
              name={name}
              label={label}
              required={!hidden && v.required}
              defaultValue={initialValues?.[name] ?? String(a.default ?? "")}
              options={[
                { value: "", label: t("templateFields.selectOption") },
                ...(a.options || []).map((o, i) => ({
                  value: String(i),
                  label: String(o),
                })),
              ]}
            />
          </div>
        )
      ) : (
        <label>
          {label}
          {f.type === "textarea" ? (
            <textarea
              aria-label={label}
              name={name}
              rows={6}
              required={!hidden && v.required}
              defaultValue={initialValues?.[name] ?? a.value ?? ""}
              placeholder={a.placeholder}
            />
          ) : (
            <input
              name={name}
              type={v.is_number ? "number" : "text"}
              required={!hidden && v.required}
              pattern={v.regex}
              defaultValue={initialValues?.[name] ?? a.value ?? ""}
              placeholder={a.placeholder}
            />
          )}
        </label>
      )}
      {a.description && (
        <div className="mt-1 text-sm text-muted">
          {a.description_html ? (
            <RenderedMarkup
              html={a.description_html}
              raw={a.description}
              context={path}
            />
          ) : (
            <p>{a.description}</p>
          )}
        </div>
      )}
    </div>
  );
}
