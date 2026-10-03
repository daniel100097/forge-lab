import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  Info,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Trans, useTranslation } from "react-i18next";
import { get, nativePage, nativeText, type FormResult } from "./api";
import type { RepoContext } from "./App";
import { uiRoute } from "./routes";
import {
  Feedback,
  MarkdownEditor,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { DiffView } from "./Diff";
import { draftPrefix } from "./draft";
import {
  AttachmentPicker,
  submitWithAttachments,
} from "./DiscussionAttachments";
import { TemplateField, type FormField } from "./IssueTemplateFields";

const notice =
  "my-4 flex items-start gap-3 rounded border border-line bg-surface-subtle p-4";
const noticeIcon = "mt-0.5 shrink-0 text-primary";
const noticeText = "mt-1 text-sm";
const optionNote = "mt-1 pl-6 text-xs text-muted";
const metadataField =
  "grid min-w-0 grid-cols-[132px_minmax(0,1fr)] items-start gap-4 max-md:grid-cols-1 max-md:gap-2";
const metadataLabel = "pt-2 text-sm font-semibold max-md:pt-0";
const metadataSelect = "w-full max-w-[480px]";
const tabCount =
  "ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-hover px-1.5 py-px text-xs font-normal text-ink";
const comparisonEmpty = "px-4 py-8 text-center text-sm text-muted";
const branchColumn = "flex min-w-0 flex-col gap-3";
const branchHeading = "mb-1 text-lg font-semibold";
const branchCode = "rounded bg-surface-subtle px-1 py-0.5 text-xs break-all";
const textButton = "border-0 bg-transparent p-0 text-primary hover:underline";
const labelDot =
  "inline-block size-3 shrink-0 rounded-full border border-black/10";

interface Comparison {
  nothing_to_compare: boolean;
  allow_empty: boolean;
  no_file_changes: boolean;
  title: string;
  content: string;
  fields?: FormField[];
  template_file?: string;
  commit_count: number;
  commits_truncated: boolean;
  draft_prefixes: string[];
  commits: { sha: string; message: string; author: string; date: string }[];
  existing_pull?: { number: number; title: string };
  can_create: boolean;
  can_assign: boolean;
  can_assign_project: boolean;
  label_ids?: string;
  labels: { ID: number; Name: string; Color: string }[];
  assignees: { ID: number; Name: string; FullName: string }[];
  milestones: { ID: number; Name: string }[];
  projects: { ID: number; Title: string }[];
  attachments: boolean;
  can_allow_maintainer_edit: boolean;
  allow_maintainer_edit: boolean;
}

interface Metadata {
  scope: string;
  labels: string[];
  assignees: string[];
  milestone: string;
  project: string;
}

// Forgejo's native compare page supplies the same session/permission-checked
// data it uses for creating a pull request. The POST stays on that route too.
export function NewMergeRequestPage() {
  const { t } = useTranslation("mergeRequests");
  useTitle(t("create.title"));
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const [sourceProject, setSourceProject] = useState(
    params.get("source_project") || repository.full_name,
  );
  const [targetProject, setTargetProject] = useState(
    params.get("target_project") || repository.full_name,
  );
  const [source, setSource] = useState(
    params.get("source_branch") || params.get("source") || "",
  );
  const [target, setTarget] = useState(
    params.get("target_branch") ||
      params.get("target") ||
      repository.default_branch,
  );
  const [title, setTitle] = useState<string>();
  const [body, setBody] = useState<string>();
  const [draft, setDraft] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [templateDraft, setTemplateDraft] = useState<{
    scope: string;
    values: Record<string, string>;
  }>();
  const [metadata, setMetadata] = useState<Metadata>();
  const [maintainerEdit, setMaintainerEdit] = useState<{
    scope: string;
    value: boolean;
  }>();
  const [tab, setTab] = useState<"commits" | "changes">("commits");
  const navigate = useNavigate();
  const client = useQueryClient();
  const selectedSource =
    params.get("source_branch") || params.get("source") || "";
  const selectedTarget =
    params.get("target_branch") ||
    params.get("target") ||
    repository.default_branch;
  const selectedSourceProject =
    params.get("source_project") || repository.full_name;
  const selectedTargetProject =
    params.get("target_project") || repository.full_name;
  const projectPath = (name: string) =>
    `/${name.split("/").map(encodeURIComponent).join("/")}`;
  const sameBranch = sourceProject === targetProject && source === target;
  const details =
    params.get("step") === "create" &&
    !!selectedSource &&
    !!selectedTarget &&
    !params.get("source_owner");
  const compareHead =
    selectedSourceProject === selectedTargetProject
      ? encodeURIComponent(selectedSource)
      : `${selectedSourceProject.split("/").map(encodeURIComponent).join("/")}:${encodeURIComponent(selectedSource)}`;
  const nativeComparisonPath = `${projectPath(selectedTargetProject)}/compare/${encodeURIComponent(selectedTarget)}...${compareHead}`;
  const templateParams = new URLSearchParams(
    [...params].filter(
      ([key]) => key === "template" || key.startsWith("field:"),
    ),
  );
  const comparePath = `${nativeComparisonPath}${templateParams.size ? `?${templateParams}` : ""}`;
  const projects = useQuery({
    queryKey: ["pull-sources", path],
    queryFn: ({ signal }) =>
      get<{
        items: {
          full_name: string;
          default_branch: string;
          can_target: boolean;
        }[];
      }>(`/-/ui/data/repos${path}/pull-sources`, signal),
  });
  const sourceOwner = params.get("source_owner");
  const resolvedSource = sourceOwner
    ? projects.data?.items.find(
        (item) =>
          item.full_name.split("/")[0].toLowerCase() ===
          sourceOwner.toLowerCase(),
      )
    : undefined;
  useEffect(() => {
    // Forgejo's owner-only compare links can refer to a renamed fork. Resolve
    // the visible fork network instead of guessing its repository name.
    if (!sourceOwner || !resolvedSource) return;
    const next = new URLSearchParams(params);
    next.delete("source_owner");
    next.set("source_project", resolvedSource.full_name);
    setSourceProject(resolvedSource.full_name);
    setParams(next, { replace: true });
  }, [sourceOwner, resolvedSource, params, setParams]);
  const branches = useQuery({
    queryKey: ["branches", projectPath(sourceProject)],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(
        `${projectPath(sourceProject)}/branches/list`,
        signal,
      ),
  });
  const targetBranches = useQuery({
    queryKey: ["branches", projectPath(targetProject)],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(
        `${projectPath(targetProject)}/branches/list`,
        signal,
      ),
  });
  const comparison = useQuery({
    queryKey: ["new-merge-request", comparePath],
    queryFn: ({ signal }) => nativePage<Comparison>(comparePath, signal),
    enabled: details,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // Selections belong to the target repository; never carry label or user IDs
  // over when changing the target within a fork network.
  const selectedMetadata: Metadata =
    metadata?.scope === selectedTargetProject
      ? metadata
      : {
          scope: selectedTargetProject,
          labels: comparison.data?.label_ids?.split(",").filter(Boolean) || [],
          assignees: [],
          milestone: "0",
          project: "0",
        };
  const updateMetadata = (values: Partial<Metadata>) =>
    setMetadata({ ...selectedMetadata, ...values });
  const maintainerScope = `${selectedSourceProject}:${selectedTargetProject}`;
  const allowMaintainerEdit =
    maintainerEdit?.scope === maintainerScope
      ? maintainerEdit.value
      : comparison.data?.allow_maintainer_edit || false;
  const changes = useQuery({
    queryKey: ["new-merge-request-diff", comparePath],
    queryFn: ({ signal }) => nativeText(`${nativeComparisonPath}.diff`, signal),
    enabled:
      details &&
      !!comparison.data &&
      !comparison.data.no_file_changes &&
      !comparison.data.existing_pull,
  });
  const templateScope = `${selectedTargetProject}:${comparison.data?.template_file || ""}`;
  const templateValues = (form: HTMLFormElement) =>
    Object.fromEntries(
      Array.from(new FormData(form).entries()).filter(
        ([key, value]) =>
          key.startsWith("form-field-") && typeof value === "string",
      ),
    ) as Record<string, string>;
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fields = comparison.data?.template_file
        ? {
            ...templateValues(form),
            "template-file": comparison.data.template_file,
          }
        : {};
      // Recheck branches and permissions before uploading. The native POST
      // still validates the submitted metadata and remains the final authority.
      const current = await nativePage<Comparison>(comparePath);
      if (current.existing_pull || !current.can_create) {
        client.setQueryData(["new-merge-request", comparePath], current);
        throw new Error(
          current.existing_pull
            ? t("create.errors.alreadyCreated")
            : t("create.errors.unavailable"),
        );
      }
      const baseTitle = (title ?? comparison.data?.title ?? "").trim();
      const result = (await submitWithAttachments(
        projectPath(selectedTargetProject),
        comparePath,
        {
          ...fields,
          title:
            draft && !draftPrefix(baseTitle, comparison.data?.draft_prefixes)
              ? `${comparison.data!.draft_prefixes[0]} ${baseTitle}`
              : baseTitle,
          content: body ?? comparison.data?.content ?? "",
          label_ids: current.can_assign
            ? selectedMetadata.labels.join(",")
            : current.label_ids || "",
          ...(current.can_assign
            ? {
                assignee_ids: selectedMetadata.assignees.join(","),
                milestone_id: selectedMetadata.milestone,
                ...(current.can_assign_project
                  ? { project_id: selectedMetadata.project }
                  : {}),
              }
            : {}),
          ...(current.can_allow_maintainer_edit
            ? {
                allow_maintainer_edit: String(allowMaintainerEdit),
              }
            : {}),
        },
        current.attachments ? files : [],
      )) as FormResult;
      if (!result.redirect) throw new Error(t("create.errors.failed"));
      await client.invalidateQueries();
      navigate(uiRoute(result.redirect));
    },
  });
  const branchOptions = (branches.data?.results || []).map((value) => ({
    value,
    label: value,
  }));
  const fileCount = comparison.data?.no_file_changes
    ? 0
    : changes.data !== undefined
      ? changes.data.match(/^diff --git /gm)?.length || 0
      : undefined;
  const changeBranches = () => {
    if (formRef.current && comparison.data?.template_file)
      setTemplateDraft({
        scope: templateScope,
        values: templateValues(formRef.current),
      });
    setSource(selectedSource);
    setTarget(selectedTarget);
    setSourceProject(selectedSourceProject);
    setTargetProject(selectedTargetProject);
    setParams({
      ...Object.fromEntries(templateParams),
      source_project: selectedSourceProject,
      target_project: selectedTargetProject,
      source_branch: selectedSource,
      target_branch: selectedTarget,
    });
    create.reset();
  };

  if (repository.archived) {
    return (
      <section className="new-merge-request min-w-0 pt-1">
        <h1>{t("create.title")}</h1>
        <div className={notice}>
          <Info size={18} className={noticeIcon} />
          <p className={noticeText}>{t("create.archived")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="new-merge-request min-w-0 pt-1">
      <header className="mb-6 border-b border-line pb-4 max-md:mb-5">
        <h1 className="text-[23px] leading-8 font-semibold">
          {t("create.title")}
        </h1>
      </header>
      {!details ? (
        <form
          className="mr-branch-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (source && target && !sameBranch && !sourceOwner)
              setParams({
                ...Object.fromEntries(templateParams),
                source_project: sourceProject,
                target_project: targetProject,
                source_branch: source,
                target_branch: target,
                step: "create",
              });
          }}
        >
          <Feedback
            error={
              branches.error ||
              targetBranches.error ||
              projects.error ||
              (sourceOwner && projects.data && !resolvedSource
                ? new Error(t("create.errors.sourceMissing"))
                : undefined)
            }
          />
          <div className="grid grid-cols-2 gap-8 max-md:grid-cols-1 max-md:gap-6">
            <div className={branchColumn}>
              <h2 className={branchHeading}>{t("create.sourceBranch")}</h2>
              <SelectControl
                label={t("create.sourceProject")}
                className="w-full"
                value={sourceProject}
                searchable
                onValueChange={(name) => {
                  setSourceProject(name);
                  setSource("");
                }}
                options={(
                  projects.data?.items || [{ full_name: repository.full_name }]
                ).map((item) => ({
                  value: item.full_name,
                  label: item.full_name,
                }))}
              />
              <SelectControl
                label={t("create.sourceBranch")}
                className="w-full"
                name="head"
                value={source}
                onValueChange={setSource}
                options={branchOptions}
                searchable
                placeholder={t("create.selectSourceBranch")}
                searchPlaceholder={t("create.searchBranches")}
                icon={<GitBranch size={16} />}
                disabled={branches.isPending}
                required
              />
            </div>
            <div className={branchColumn}>
              <h2 className={branchHeading}>{t("create.targetBranch")}</h2>
              <SelectControl
                label={t("create.targetProject")}
                className="w-full"
                value={targetProject}
                searchable
                onValueChange={(name) => {
                  setTargetProject(name);
                  setTarget(
                    projects.data?.items.find((item) => item.full_name === name)
                      ?.default_branch || "",
                  );
                }}
                options={(
                  projects.data?.items.filter((item) => item.can_target) || [
                    { full_name: repository.full_name },
                  ]
                ).map((item) => ({
                  value: item.full_name,
                  label: item.full_name,
                }))}
              />
              <SelectControl
                label={t("create.targetBranch")}
                className="w-full"
                name="base"
                value={target}
                onValueChange={setTarget}
                options={
                  targetBranches.data?.results.length
                    ? targetBranches.data.results.map((value) => ({
                        value,
                        label: value,
                      }))
                    : [
                        {
                          value: repository.default_branch,
                          label: repository.default_branch,
                        },
                      ]
                }
                searchable
                searchPlaceholder={t("create.searchBranches")}
                icon={<GitBranch size={16} />}
                disabled={targetBranches.isPending}
                required
              />
            </div>
          </div>
          {source && sameBranch && (
            <div className={notice} role="status">
              <Info size={18} className={noticeIcon} />
              <p className={noticeText}>{t("create.sameBranch")}</p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2 max-md:items-stretch">
            <button
              className="button primary"
              disabled={
                !source ||
                !target ||
                sameBranch ||
                !!sourceOwner ||
                branches.isPending ||
                targetBranches.isPending
              }
            >
              {t("create.compare")}
            </button>
            <Link className="button" to=".." relative="path">
              {t("create.cancel")}
            </Link>
          </div>
        </form>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <span>
              <Trans
                t={t}
                i18nKey="create.fromInto"
                values={{
                  source: `${selectedSourceProject !== selectedTargetProject ? `${selectedSourceProject}:` : ""}${selectedSource}`,
                  target: `${selectedSourceProject !== selectedTargetProject ? `${selectedTargetProject}:` : ""}${selectedTarget}`,
                }}
                components={{
                  sourceBranch: <code className={branchCode} />,
                  targetBranch: <code className={branchCode} />,
                }}
              />
            </span>
            <button
              type="button"
              className={textButton}
              onClick={changeBranches}
            >
              {t("create.changeBranches")}
            </button>
          </div>
          {comparison.isPending ? (
            <Pending />
          ) : comparison.error ? (
            <Feedback error={comparison.error} />
          ) : (
            comparison.data &&
            (comparison.data.existing_pull ? (
              <div className={notice}>
                <Info size={18} className={noticeIcon} />
                <div>
                  <strong>{t("create.existing")}</strong>
                  <p className={noticeText}>
                    <Link
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      to={uiRoute(
                        `${projectPath(selectedTargetProject)}/pulls/${comparison.data.existing_pull.number}`,
                      )}
                    >
                      !{comparison.data.existing_pull.number} ·{" "}
                      {comparison.data.existing_pull.title}{" "}
                      <ArrowRight size={14} />
                    </Link>
                  </p>
                </div>
              </div>
            ) : comparison.data.nothing_to_compare &&
              !comparison.data.allow_empty ? (
              <div className={notice}>
                <Info size={18} className={noticeIcon} />
                <div>
                  <strong>{t("create.nothingToMerge.title")}</strong>
                  <p className={noticeText}>
                    {t("create.nothingToMerge.body")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <form
                  ref={formRef}
                  className="workspace-form max-w-[900px] gap-5 max-md:gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate(event.currentTarget);
                  }}
                >
                  <Feedback error={create.error} />
                  {comparison.data.nothing_to_compare && (
                    <div
                      className="m-0 flex items-start gap-3 rounded border border-line bg-surface-subtle p-4"
                      role="status"
                    >
                      <Info size={18} className={noticeIcon} />
                      <div>
                        <strong>{t("create.noChangesYet.title")}</strong>
                        <p className={noticeText}>
                          {t("create.noChangesYet.body")}
                        </p>
                      </div>
                    </div>
                  )}
                  <label className="gap-2">
                    {t("create.titleRequired")}
                    <input
                      name="title"
                      aria-label={t("create.titleLabel")}
                      required
                      maxLength={
                        draft
                          ? 254 -
                            (comparison.data.draft_prefixes[0]?.length || 0)
                          : 255
                      }
                      value={title ?? comparison.data.title}
                      onChange={(event) => setTitle(event.target.value)}
                      autoComplete="off"
                      autoFocus
                    />
                  </label>
                  {!!comparison.data.draft_prefixes.length && (
                    <div className="-mt-1">
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={
                            draft ||
                            !!draftPrefix(
                              title ?? comparison.data.title,
                              comparison.data.draft_prefixes,
                            )
                          }
                          onChange={(event) => {
                            setDraft(event.target.checked);
                            if (!event.target.checked) {
                              const current = title ?? comparison.data.title;
                              setTitle(
                                current
                                  .slice(
                                    draftPrefix(
                                      current,
                                      comparison.data.draft_prefixes,
                                    ).length,
                                  )
                                  .trimStart(),
                              );
                            }
                          }}
                        />
                        {t("create.markDraft")}
                      </label>
                      <p className={optionNote}>{t("create.draftHint")}</p>
                    </div>
                  )}
                  <div className="[&_.discussion-upload]:mt-2 [&_.discussion-upload>span]:min-w-0 [&_.discussion-upload>span]:break-all [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold">
                    <h2>{t("create.description")}</h2>
                    {comparison.data.fields?.length ? (
                      <div
                        className="flex flex-col gap-4 [&_label_textarea]:font-normal [&_label:not(.check-field)]:flex [&_label:not(.check-field)]:flex-col [&_label:not(.check-field)]:gap-2 [&_label:not(.check-field)]:text-sm [&_label:not(.check-field)]:font-semibold [&_label:not(.check-field)_input]:font-normal"
                        key={templateScope}
                      >
                        {comparison.data.fields.map((field) => (
                          <TemplateField
                            key={field.id}
                            field={field}
                            initialValues={
                              templateDraft?.scope === templateScope
                                ? templateDraft.values
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <MarkdownEditor
                        value={body ?? comparison.data.content}
                        onChange={setBody}
                        rows={10}
                      />
                    )}
                    {comparison.data.attachments && (
                      <AttachmentPicker files={files} onChange={setFiles} />
                    )}
                  </div>
                  {comparison.data.can_assign && (
                    <div className="flex flex-col gap-5">
                      <div className={metadataField}>
                        <span id="mr-assignees-label" className={metadataLabel}>
                          {t("create.assignees")}
                        </span>
                        <CreationMultiSelect
                          label={t("create.assignees")}
                          placeholder={t("create.unassigned")}
                          values={selectedMetadata.assignees}
                          onChange={(assignees) =>
                            updateMetadata({ assignees })
                          }
                          options={comparison.data.assignees.map((user) => ({
                            value: String(user.ID),
                            label: user.FullName || user.Name,
                            description: `@${user.Name}`,
                          }))}
                        />
                      </div>
                      <div className={metadataField}>
                        <span className={metadataLabel}>
                          {t("create.milestone")}
                        </span>
                        <SelectControl
                          label={t("create.milestone")}
                          className={metadataSelect}
                          searchable
                          value={selectedMetadata.milestone}
                          onValueChange={(milestone) =>
                            updateMetadata({ milestone })
                          }
                          options={[
                            { value: "0", label: t("create.noMilestone") },
                            ...comparison.data.milestones.map((milestone) => ({
                              value: String(milestone.ID),
                              label: milestone.Name,
                            })),
                          ]}
                        />
                      </div>
                      <div className={metadataField}>
                        <span className={metadataLabel}>
                          {t("create.labels")}
                        </span>
                        <CreationMultiSelect
                          label={t("create.labels")}
                          placeholder={t("create.noLabels")}
                          values={selectedMetadata.labels}
                          onChange={(labels) => updateMetadata({ labels })}
                          options={comparison.data.labels.map((label) => ({
                            value: String(label.ID),
                            label: label.Name,
                            color: label.Color,
                          }))}
                        />
                      </div>
                      {comparison.data.can_assign_project &&
                        comparison.data.projects.length > 0 && (
                          <div className={metadataField}>
                            <span className={metadataLabel}>
                              {t("create.board")}
                            </span>
                            <SelectControl
                              label={t("create.board")}
                              className={metadataSelect}
                              searchable
                              value={selectedMetadata.project}
                              onValueChange={(project) =>
                                updateMetadata({ project })
                              }
                              options={[
                                { value: "0", label: t("create.noBoard") },
                                ...comparison.data.projects.map((project) => ({
                                  value: String(project.ID),
                                  label: project.Title,
                                })),
                              ]}
                            />
                          </div>
                        )}
                    </div>
                  )}
                  {comparison.data.can_allow_maintainer_edit && (
                    <div>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={allowMaintainerEdit}
                          onChange={(event) =>
                            setMaintainerEdit({
                              scope: maintainerScope,
                              value: event.target.checked,
                            })
                          }
                        />
                        {t("create.allowMaintainerEdit")}
                      </label>
                      <p className={optionNote}>
                        {t("create.maintainerEditHint")}
                      </p>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    <button
                      className="button primary"
                      disabled={
                        create.isPending ||
                        !comparison.data.can_create ||
                        !(title ?? comparison.data.title).trim()
                      }
                    >
                      {create.isPending && (
                        <LoaderCircle size={16} className="animate-spin" />
                      )}
                      {create.isPending
                        ? t("create.creating")
                        : t("create.submit")}
                    </button>
                    <Link className="button" to=".." relative="path">
                      {t("create.cancel")}
                    </Link>
                  </div>
                  {!comparison.data.can_create && (
                    <div className="form-error" role="alert">
                      {t("create.noPermission")}
                    </div>
                  )}
                </form>
                <div className="mt-7 min-w-0">
                  <div
                    className="tabs mb-4"
                    role="tablist"
                    aria-label={t("create.comparison")}
                  >
                    <button
                      id="mr-create-commits-tab"
                      type="button"
                      role="tab"
                      aria-controls="mr-create-commits"
                      aria-selected={tab === "commits"}
                      className={tab === "commits" ? "active" : ""}
                      onClick={() => setTab("commits")}
                    >
                      {t("create.commitsTab")}{" "}
                      <span className={tabCount}>
                        {comparison.data.commit_count}
                      </span>
                    </button>
                    <button
                      id="mr-create-changes-tab"
                      type="button"
                      role="tab"
                      aria-controls="mr-create-changes"
                      aria-selected={tab === "changes"}
                      className={tab === "changes" ? "active" : ""}
                      onClick={() => setTab("changes")}
                    >
                      {t("create.changesTab")}{" "}
                      {fileCount !== undefined && (
                        <span className={tabCount}>{fileCount}</span>
                      )}
                    </button>
                  </div>
                  {tab === "commits" ? (
                    <div
                      id="mr-create-commits"
                      role="tabpanel"
                      aria-labelledby="mr-create-commits-tab"
                      className="overflow-hidden rounded border border-line"
                    >
                      {comparison.data.commits_truncated && (
                        <p className="border-b border-line px-4 py-3 text-sm text-muted">
                          {t("create.truncated", {
                            shown: comparison.data.commits.length,
                            total: comparison.data.commit_count,
                          })}
                        </p>
                      )}
                      {!comparison.data.commit_count && (
                        <div className={`rounded ${comparisonEmpty}`}>
                          {t("create.noCommits")}
                        </div>
                      )}
                      {comparison.data.commits.map((commit) => (
                        <div
                          className="mr-compare-commit flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                          key={commit.sha}
                        >
                          <GitCommitHorizontal
                            size={18}
                            className="shrink-0 text-muted"
                          />
                          <div className="min-w-0 flex-1">
                            <Link
                              to={uiRoute(
                                `${projectPath(selectedSourceProject)}/commit/${commit.sha}`,
                              )}
                            >
                              <strong className="block truncate text-sm font-semibold">
                                {commit.message.split("\n")[0]}
                              </strong>
                            </Link>
                            <p className="mt-1 text-xs text-muted">
                              {t("create.authored", {
                                author: commit.author,
                                date: relativeDate(commit.date),
                              })}
                            </p>
                          </div>
                          <Link
                            className="rounded border border-line px-2 py-1 text-xs text-muted max-md:hidden"
                            to={uiRoute(
                              `${projectPath(selectedSourceProject)}/commit/${commit.sha}`,
                            )}
                          >
                            <code>{commit.sha.slice(0, 8)}</code>
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      id="mr-create-changes"
                      role="tabpanel"
                      aria-labelledby="mr-create-changes-tab"
                    >
                      <Feedback error={changes.error} />
                      {comparison.data.no_file_changes ||
                      changes.data === "" ? (
                        <div
                          className={`rounded border border-line ${comparisonEmpty}`}
                        >
                          {t("create.noFileChanges")}
                        </div>
                      ) : changes.isPending ? (
                        <Pending />
                      ) : (
                        changes.data !== undefined && (
                          <DiffView text={changes.data} navigation />
                        )
                      )}
                    </div>
                  )}
                </div>
              </>
            ))
          )}
        </>
      )}
    </section>
  );
}

interface CreationOption {
  value: string;
  label: string;
  description?: string;
  color?: string;
}
function CreationMultiSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: CreationOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation("mergeRequests");
  const selected = options.filter((option) => values.includes(option.value));
  return (
    <div className="min-w-0">
      <Combobox.Root<CreationOption, true>
        multiple
        items={options}
        value={selected}
        onValueChange={(next) => onChange(next.map((option) => option.value))}
        isItemEqualToValue={(a, b) => a.value === b.value}
        itemToStringLabel={(option) => option.label}
        autoHighlight
      >
        <Combobox.Trigger
          className={`select-trigger ${metadataSelect}`}
          aria-label={label}
        >
          <span className="select-value">
            {selected.length
              ? selected.map((option) => option.label).join(", ")
              : placeholder}
          </span>
          <ChevronDown size={14} className="select-chevron" />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner
            className="dropdown-positioner"
            style={{ zIndex: 160 }}
            sideOffset={4}
            align="start"
            collisionPadding={12}
          >
            <Combobox.Popup className="dropdown-popup searchable-popup">
              <div className="dropdown-heading">{label}</div>
              <div className="dropdown-search">
                <Search size={16} />
                <Combobox.Input
                  aria-label={t("create.multiSelect.search", { label })}
                  placeholder={t("create.multiSelect.search", { label })}
                />
              </div>
              <Combobox.Empty className="dropdown-empty">
                {t("create.multiSelect.noMatches")}
              </Combobox.Empty>
              <Combobox.List className="dropdown-list">
                {(option: CreationOption) => (
                  <Combobox.Item
                    key={option.value}
                    value={option}
                    className="dropdown-option"
                  >
                    <span className="option-indicator">
                      <Combobox.ItemIndicator>
                        <Check size={16} />
                      </Combobox.ItemIndicator>
                    </span>
                    {option.color && (
                      <span
                        className={labelDot}
                        style={{
                          backgroundColor: `#${option.color.replace(/^#/, "")}`,
                        }}
                      />
                    )}
                    <span className="option-copy">
                      <span>{option.label}</span>
                      {option.description && (
                        <small>{option.description}</small>
                      )}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
              <div className="border-t border-line px-3 py-2 text-xs">
                <button
                  type="button"
                  className={textButton}
                  disabled={!selected.length}
                  onClick={() => onChange([])}
                >
                  {t("create.multiSelect.clear")}
                </button>
              </div>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={option.value}
              className="inline-flex max-w-full items-center gap-1.5 rounded border border-line bg-surface-subtle px-2 py-1 text-xs break-all"
            >
              {option.color && (
                <i
                  className={labelDot}
                  style={{
                    backgroundColor: `#${option.color.replace(/^#/, "")}`,
                  }}
                />
              )}
              {option.label}
              <button
                type="button"
                className="icon-button size-4 shrink-0 rounded p-0"
                aria-label={t("create.multiSelect.remove", {
                  label: option.label,
                })}
                onClick={() =>
                  onChange(values.filter((value) => value !== option.value))
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
