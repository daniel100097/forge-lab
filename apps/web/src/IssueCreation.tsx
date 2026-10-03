import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import type { RepoContext } from "./App";
import { nativeForm, nativePage, request, type FormResult } from "./api";
import { uiRoute } from "./routes";
import { Feedback, MarkdownEditor, Pending, useTitle } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  MultiChoice,
  TemplateField,
  type FormField,
} from "./IssueTemplateFields";
interface CreationData {
  templates?: { name: string; about: string; file_name: string }[];
  config?: {
    blank_issues_enabled: boolean;
    contact_links: { name: string; url: string; about: string }[];
  };
  has_templates: boolean;
  fields?: FormField[];
  template_file?: string;
  template_title?: string;
  template_body?: string;
  title?: string;
  body?: string;
  reference?: string;
  label_ids?: string;
  can_assign: boolean;
  attachments: boolean;
  labels: { ID: number; Name: string; Color: string }[];
  milestones: { ID: number; Name: string }[];
  projects: { ID: number; Title: string }[];
  assignees: { ID: number; Name: string; FullName: string }[];
}
const formPanel =
  "mt-4 max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4";
const row =
  "flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0";
const rowText = "mt-1 text-xs break-all text-muted";
export function IssueCreationPage() {
  const { t } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>(),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]);
  const [showTemplates, setShowTemplates] = useState(
    !params.get("template") && !params.has("blank"),
  );
  const endpoint = `${path}/issues/new?${params}`;
  const query = useQuery({
    queryKey: ["issue-create", endpoint],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const { data } = await request<CreationData & { redirect?: string }>(
        endpoint,
        { headers: { "X-Forgejo-UI": "1" }, signal },
      );
      if (data.redirect?.includes("/issues/new/choose"))
        return {
          ...(await nativePage<CreationData>(
            `${path}/issues/new/choose?${params}`,
            signal,
          )),
          has_templates: true,
        };
      if (data.redirect) throw new Error(t("create.signIn"));
      return data;
    },
  });
  const templates = useQuery({
    queryKey: ["issue-templates", path],
    queryFn: ({ signal }) =>
      nativePage<CreationData>(`${path}/issues/new/choose`, signal),
    enabled: !!query.data?.has_templates && showTemplates,
  });
  useEffect(() => {
    setBody(
      query.data?.body || params.get("body") || query.data?.template_body || "",
    );
  }, [query.data]);
  useEffect(() => {
    setShowTemplates(!params.has("template") && !params.has("blank"));
  }, [params.get("template"), params.get("blank")]);
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form),
        fields = new URLSearchParams(),
        uploads: string[] = [];
      values.forEach((v, k) => {
        if (typeof v === "string") fields.append(k, v);
      });
      if (params.get("project_id"))
        fields.set("project_id", params.get("project_id")!);
      try {
        for (const file of files) {
          const upload = new FormData();
          upload.set("file", file);
          const result = await request<{ uuid: string }>(
            `${path}/issues/attachments`,
            { method: "POST", body: upload, headers: { "X-Forgejo-UI": "1" } },
          );
          uploads.push(result.data.uuid);
          fields.append("files", result.data.uuid);
        }
        const result = await request<FormResult>(`${path}/issues/new`, {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: fields,
        });
        if (!result.data.redirect) throw new Error(t("create.failed"));
        await client.invalidateQueries();
        navigate(uiRoute(result.data.redirect));
      } catch (error) {
        await Promise.allSettled(
          uploads.map((file) =>
            nativeForm(`${path}/issues/attachments/remove`, { file }),
          ),
        );
        throw error;
      }
    },
  });
  useTitle(t("create.title"));
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!;
  if (data.has_templates && showTemplates)
    return (
      <div className={formPanel}>
        <h1>{t("create.title")}</h1>
        <p className="text-sm text-muted">{t("create.chooseIntro")}</p>
        <Feedback error={templates.error} />
        {templates.isPending ? (
          <Pending />
        ) : (
          <div>
            {templates.data?.templates?.map((template) => (
              <article className={row} key={template.file_name}>
                <div className="min-w-0 flex-1">
                  <h3>{template.name}</h3>
                  <p className={rowText}>{template.about}</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("template", template.file_name);
                    next.delete("blank");
                    setParams(next);
                  }}
                >
                  {t("create.useTemplate")}
                </button>
              </article>
            ))}
            {templates.data?.config?.contact_links?.map((link) => (
              <article className={row} key={link.url}>
                <div className="min-w-0 flex-1">
                  <h3>{link.name}</h3>
                  <p className={rowText}>{link.about}</p>
                </div>
                <a
                  className="button"
                  href={/^https?:\/\//.test(link.url) ? link.url : "#"}
                  rel="noopener noreferrer"
                >
                  {t("create.openLink")}
                </a>
              </article>
            ))}
            {templates.data?.config?.blank_issues_enabled && (
              <button
                className="button mt-4"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("blank", "true");
                  setParams(next);
                }}
              >
                {t("create.blank")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  return (
    <div className={formPanel}>
      <div className="mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3">
        <h1 className="max-md:text-[22px]">{t("create.title")}</h1>
        {data.has_templates && (
          <button className="button" onClick={() => setShowTemplates(true)}>
            {t("create.chooseTemplate")}
          </button>
        )}
      </div>
      <form
        key={endpoint}
        className="workspace-form mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(e.currentTarget);
        }}
      >
        <Feedback error={create.error} />
        <label>
          {t("create.titleLabel")}
          <input
            name="title"
            required
            maxLength={255}
            defaultValue={data.title || data.template_title || ""}
            placeholder={t("create.titlePlaceholder")}
          />
        </label>
        {data.fields?.length ? (
          <>
            <input
              type="hidden"
              name="template-file"
              value={data.template_file || ""}
            />
            {data.fields.map((field) => (
              <TemplateField key={field.id} field={field} />
            ))}
          </>
        ) : (
          <MarkdownEditor
            value={body}
            onChange={setBody}
            label={t("create.description")}
            placeholder={t("create.descriptionPlaceholder")}
          />
        )}
        {data.attachments && (
          <div>
            <label className="button self-start">
              <Paperclip size={15} />
              {t("attachments.attach")}
              <input
                type="file"
                className="sr-only"
                aria-label={t("attachments.attach")}
                multiple
                onChange={(e) =>
                  setFiles([...files, ...Array.from(e.target.files || [])])
                }
              />
            </label>
            {files.map((file, i) => (
              <div className={row} key={`${file.name}-${i}`}>
                <span>
                  {file.name} · {Math.ceil(file.size / 1024)} KB
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("attachments.remove", { name: file.name })}
                  onClick={() => setFiles(files.filter((_, at) => at !== i))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!data.can_assign && data.label_ids && (
          <input type="hidden" name="label_ids" value={data.label_ids} />
        )}
        {data.can_assign && (
          <details className="grid grid-cols-[minmax(150px,1fr)_minmax(0,2fr)] gap-10 border-t border-line py-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6">
            <summary>{t("create.metadata")}</summary>
            <MultiChoice
              name="label_ids"
              title={t("create.labels")}
              options={data.labels.map((l) => ({
                value: String(l.ID),
                label: l.Name,
              }))}
              selected={data.label_ids?.split(",")}
            />
            <MultiChoice
              name="assignee_ids"
              title={t("create.assignees")}
              options={data.assignees.map((u) => ({
                value: String(u.ID),
                label: u.FullName || u.Name,
              }))}
            />
            <SelectControl
              label={t("create.milestone")}
              name="milestone_id"
              defaultValue={params.get("milestone") || "0"}
              options={[
                { value: "0", label: t("create.noMilestone") },
                ...data.milestones.map((m) => ({
                  value: String(m.ID),
                  label: m.Name,
                })),
              ]}
            />
            <SelectControl
              label={t("create.board")}
              name="project_id"
              defaultValue={
                params.get("project_id") || params.get("project") || "0"
              }
              options={[
                { value: "0", label: t("create.noBoard") },
                ...data.projects.map((p) => ({
                  value: String(p.ID),
                  label: p.Title,
                })),
              ]}
            />
            <label>
              {t("create.reference")}
              <input
                name="ref"
                defaultValue={data.reference || ""}
                placeholder="refs/heads/main"
              />
            </label>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className="button primary" disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.submit")}
          </button>
          <Link className="button" to={`/projects${path}/issues`}>
            {t("create.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
