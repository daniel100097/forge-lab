import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  FileUp,
  GitBranch,
  GitCommitHorizontal,
  LockKeyhole,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import type { RepoContext } from "./App";
import {
  get,
  native,
  nativeForm,
  nativePage,
  request,
  type FormResult,
} from "./api";
import { EmptyState, Feedback, Pending, useTitle } from "./UI";
import { DiffView } from "./Diff";
import { SelectControl } from "./SelectControl";
import { registerNavigationGuard } from "./navigationGuard";

// Shared by the file editor and the file operation pages.
export const editorPage = "mx-auto max-w-[1280px]";
export const editorHeading = "mb-5 flex items-start justify-between gap-4";
export const editorHeadingTitle = "mb-2 text-2xl font-semibold";
export const editorHeadingPath =
  "flex flex-wrap items-center gap-2 text-sm text-muted max-md:text-[12px]";
export const editorTab =
  "-mb-px flex items-center gap-2 border-b-3 border-transparent py-3 text-sm font-semibold hover:text-primary aria-selected:border-b-primary";
export const newFilePath = "mb-4";
export const newFilePathInput =
  "w-full rounded border border-input bg-surface px-3 py-2 text-sm";
export const commitPanel = "mt-6 rounded-md border border-line";
export const commitPanelHeading =
  "flex items-center gap-2 border-b border-line bg-surface-subtle px-5 py-4 text-base font-semibold";
export const commitFields = "max-w-[840px] p-5 max-md:p-4";
export const commitField =
  "mb-4 flex flex-col items-stretch gap-2 text-sm font-semibold";
export const commitInput =
  "block w-full min-w-0 rounded border border-input bg-surface px-3 py-2 text-sm font-normal text-ink [box-shadow:0_1px_2px_rgb(0_0_0/4%)] focus:outline-2 focus:outline-offset-1 focus:outline-primary";
export const commitTextarea = `${commitInput} min-h-[92px] resize-y`;
export const commitDestination = "mb-4";
export const commitLegend = "mb-2 font-semibold";
export const commitDestinationOption = "mb-3 flex items-center gap-2";
export const commitCheckbox = "size-4 accent-primary";
export const checkLabel = "flex items-center gap-2 text-sm";
export const commitActions = "mt-5 flex items-center gap-2";

/**
 * Native commit form signing state: a lock when the commit will be signed,
 * otherwise an open lock with the reason (tooltip).
 */
export function CommitSigning({
  signing,
}: {
  signing?: { will_sign: boolean; message?: string } | null;
}) {
  const { t } = useTranslation("mergeRequests");
  if (!signing) return null;
  const label =
    signing.message ||
    t(signing.will_sign ? "commit.willSign" : "commit.willNotSign");
  const Icon = signing.will_sign ? LockKeyhole : UnlockKeyhole;
  return (
    <span
      className={`commit-signing inline-flex ${signing.will_sign ? "text-success" : "text-muted"}`}
      title={label}
      aria-label={label}
      role="img"
    >
      <Icon size={16} />
    </span>
  );
}

interface OperationData {
  path: string;
  branch: string;
  last_commit: string;
  can_commit: boolean;
  can_create_pull_request: boolean;
  new_branch_name: string;
  commit_mails: { id: number; email: string }[];
  default_commit_mail: string;
  upload_accepts: string;
  upload_max_files: number;
  upload_max_size_mb: number;
  signing?: { will_sign: boolean; message?: string } | null;
  commit_summary?: string;
  commit_message?: string;
  sha?: string;
}
const escapePath = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");
type Operation = "upload" | "delete" | "patch" | "cherry-pick" | "revert";
const operationTitles = (
  t: TFunction<"mergeRequests">,
): Record<Operation, string> => ({
  upload: t("operations.titles.upload"),
  delete: t("operations.titles.delete"),
  patch: t("operations.titles.patch"),
  "cherry-pick": t("operations.titles.cherryPick"),
  revert: t("operations.titles.revert"),
});

// The "browse" link of the upload drop zone wraps the hidden file input.
function BrowseFiles({
  children,
  label,
  accept,
  onFiles,
}: {
  children?: ReactNode;
  label: string;
  accept?: string;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label className="relative cursor-pointer text-primary hover:underline">
      {children}
      <input
        className="absolute inset-0 w-full cursor-pointer opacity-0"
        type="file"
        multiple
        accept={accept}
        aria-label={label}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </label>
  );
}

export function FileOperationsPage({ operation }: { operation: Operation }) {
  const { t } = useTranslation("mergeRequests");
  const context = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const ref = params.get("ref") || context.repository.default_branch;
  const path = params.get("path") || "";
  const sha = params.get("sha") || "";
  const commitOperation = operation === "cherry-pick" || operation === "revert";
  const endpoint = commitOperation
    ? `${context.path}/_cherrypick/${encodeURIComponent(sha)}/${escapePath(ref)}?cherry-pick-type=${operation}`
    : `${context.path}/_${operation === "patch" ? "diffpatch" : operation}/${escapePath(ref)}/${escapePath(path)}`;
  const branches = useQuery({
    queryKey: ["branches", context.path],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(`${context.path}/branches/list`, signal),
    enabled: commitOperation,
  });
  const eligible =
    !!context.repository.permissions?.write_code &&
    !context.repository.archived &&
    (operation !== "delete" || !!path) &&
    (!commitOperation || /^[a-f0-9]{40,64}$/.test(sha));
  const query = useQuery({
    queryKey: ["file-operation", context.path, operation, ref, path, sha],
    queryFn: ({ signal }) => nativePage<OperationData>(endpoint, signal),
    enabled: eligible,
    refetchOnWindowFocus: false,
  });
  useTitle(
    t("operations.documentTitle", {
      operation: operationTitles(t)[operation],
      project: context.repository.name,
    }),
  );
  if (!eligible)
    return (
      <EmptyState title={t("operations.readOnly.title")}>
        {t("operations.readOnly.body")}
      </EmptyState>
    );
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  return (
    <>
      {commitOperation && (
        <div className="mx-auto mb-5 max-w-[1184px]">
          <label className="max-w-sm">
            {t("commit.targetBranch")}
            <SelectControl
              label={t("commit.targetBranch")}
              value={ref}
              searchable
              onValueChange={(value) => {
                const next = new URLSearchParams(params);
                next.set("ref", value);
                setParams(next);
              }}
              options={[
                ...new Set([ref, ...(branches.data?.results ?? [])]),
              ].map((value) => ({ value, label: value }))}
            />
          </label>
        </div>
      )}
      <FileOperation
        key={`${operation}:${ref}:${path}`}
        operation={operation}
        data={query.data}
        context={context}
        endpoint={endpoint}
      />
    </>
  );
}

function FileOperation({
  operation,
  data,
  context,
  endpoint,
}: {
  operation: Operation;
  data: OperationData;
  context: RepoContext;
  endpoint: string;
}) {
  const { t, i18n } = useTranslation("mergeRequests");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState<Error | null>(null);
  const [directory, setDirectory] = useState(data.path);
  const [summary, setSummary] = useState(
    (
      data.commit_summary ||
      (operation === "delete"
        ? t("operations.deleteSummary", { path: data.path })
        : operationTitles(t)[operation])
    ).slice(0, 100),
  );
  const [description, setDescription] = useState(data.commit_message || "");
  const [patch, setPatch] = useState("");
  const [previewPatch, setPreviewPatch] = useState(false);
  const [choice, setChoice] = useState(
    data.can_commit ? "direct" : "commit-to-new-branch",
  );
  const [newBranch, setNewBranch] = useState(data.new_branch_name);
  const [startMerge, setStartMerge] = useState(true);
  const [signoff, setSignoff] = useState(false);
  const [email, setEmail] = useState(
    String(
      data.commit_mails.find((mail) => mail.email === data.default_commit_mail)
        ?.id ??
        data.commit_mails[0]?.id ??
        -1,
    ),
  );
  const [progress, setProgress] = useState("");
  const allowExit = useRef(false);
  const root = `/projects/${context.repository.full_name.split("/").map(encodeURIComponent).join("/")}`;
  const dirty = files.length > 0 || !!patch;
  const parentPath =
    operation === "delete"
      ? data.path.split("/").slice(0, -1).join("/")
      : data.path;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!allowExit.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leave = (event: MouseEvent) => {
      if (
        allowExit.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.href === location.href
      )
        return;
      if (!window.confirm(t("operations.discard"))) {
        event.preventDefault();
        event.stopPropagation();
      } else allowExit.current = true;
    };
    const historyIndex = window.history.state?.idx;
    let restoring = false;
    const back = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      if (allowExit.current) return;
      if (window.confirm(t("operations.discard"))) {
        allowExit.current = true;
        return;
      }
      const offset = historyIndex - event.state?.idx;
      if (Number.isFinite(offset) && offset !== 0) {
        // Restore the browser history entry before React Router handles it.
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(offset);
      }
    };
    window.addEventListener("beforeunload", unload);
    const removeGuard = registerNavigationGuard(back);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      removeGuard();
      document.removeEventListener("click", leave, true);
    };
  }, [dirty, t]);
  const selectFiles = (incoming: File[]) => {
    const selected = [...files];
    for (const file of incoming) {
      if (
        data.upload_max_size_mb > 0 &&
        file.size > data.upload_max_size_mb * 1024 * 1024
      ) {
        setSelectionError(
          new Error(
            t("operations.upload.tooLarge", {
              name: file.name,
              size: data.upload_max_size_mb,
            }),
          ),
        );
        return;
      }
      if (selected.some((existing) => existing.name === file.name)) {
        setSelectionError(
          new Error(t("operations.upload.duplicate", { name: file.name })),
        );
        return;
      }
      selected.push(file);
    }
    if (data.upload_max_files > 0 && selected.length > data.upload_max_files) {
      setSelectionError(
        new Error(
          t("operations.upload.tooMany", { count: data.upload_max_files }),
        ),
      );
      return;
    }
    setFiles(selected);
    setSelectionError(null);
  };
  const removeUpload = async (uuid: string) => {
    const response = await fetch(native(`${context.path}/upload-remove`), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-Forgejo-UI": "1",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ file: uuid }),
    });
    if (!response.ok) throw new Error(t("operations.upload.removeFailed"));
  };
  const save = useMutation({
    mutationFn: async () => {
      const values = {
        tree_path:
          operation === "upload"
            ? directory
            : operation === "patch"
              ? "patch"
              : data.path,
        last_commit: data.last_commit,
        commit_summary: summary,
        commit_message: description,
        commit_choice: choice,
        new_branch_name: choice === "direct" ? "" : newBranch.trim(),
        commit_mail_id: email,
        ...(signoff ? { signoff: "on" } : {}),
        ...(operation === "patch" ? { content: patch } : {}),
        ...(operation === "revert" ? { revert: "on" } : {}),
      };
      if (operation !== "upload") {
        const result = await nativeForm(endpoint, values);
        if (!result.redirect) throw new Error(t("operations.commitFailed"));
        return result;
      }
      const temporary: string[] = [];
      try {
        for (const [index, file] of files.entries()) {
          setProgress(
            t("operations.upload.progress", {
              current: index + 1,
              total: files.length,
              name: file.name,
            }),
          );
          const body = new FormData();
          body.append("file", file);
          const result = await request<{ uuid: string }>(
            `${context.path}/upload-file`,
            { method: "POST", headers: { "X-Forgejo-UI": "1" }, body },
          );
          temporary.push(result.data.uuid);
        }
        setProgress(t("operations.upload.creatingCommit"));
        const body = new URLSearchParams(values);
        temporary.forEach((uuid, index) => {
          body.append("files", uuid);
          body.append(`files_fullpath[${uuid}]`, files[index].name);
        });
        const result = await request<FormResult>(endpoint, {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        if (!result.data.redirect)
          throw new Error(t("operations.upload.failed"));
        return result.data;
      } catch (error) {
        await Promise.allSettled(temporary.map(removeUpload));
        throw error;
      } finally {
        setProgress("");
      }
    },
    onSuccess: async () => {
      allowExit.current = true;
      await Promise.all(
        ["tree", "branches", "commits", "repo-overview", "file-editor"].map(
          (key) => client.invalidateQueries({ queryKey: [key, context.path] }),
        ),
      );
      const branch = choice === "direct" ? data.branch : newBranch.trim();
      navigate(
        choice !== "direct" && startMerge && data.can_create_pull_request
          ? `${root}/merge-requests/new?${new URLSearchParams({ source_branch: branch, target_branch: data.branch, step: "create" })}`
          : `${root}?${new URLSearchParams({ ref: branch, path: operation === "upload" ? directory : parentPath })}`,
      );
    },
  });
  const cancel = () => {
    if (!dirty || window.confirm(t("operations.discard"))) {
      allowExit.current = true;
      navigate(
        `${root}?${new URLSearchParams({ ref: data.branch, path: operation === "delete" ? data.path : parentPath })}`,
      );
    }
  };
  return (
    <div className={editorPage}>
      <div className={editorHeading}>
        <div>
          <h1 className={editorHeadingTitle}>
            {operationTitles(t)[operation]}
          </h1>
          <p className={editorHeadingPath}>
            <GitBranch size={14} />
            <strong>{data.branch}</strong>
            <span>/</span>
            <span>{data.path || context.repository.name}</span>
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {operation === "upload" ? (
          <section aria-label={t("operations.titles.upload")}>
            <label className={newFilePath}>
              {t("operations.upload.directory")}
              <input
                className={newFilePathInput}
                maxLength={500}
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder={t("operations.upload.root")}
              />
            </label>
            <div
              className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-line bg-surface-subtle p-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                selectFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <FileUp size={32} className="text-muted" />
              <h2 className="text-base font-semibold">
                <Trans
                  t={t}
                  i18nKey="operations.upload.drop"
                  components={{
                    browse: (
                      <BrowseFiles
                        label={t("operations.upload.choose")}
                        accept={data.upload_accepts || undefined}
                        onFiles={selectFiles}
                      />
                    ),
                  }}
                />
              </h2>
              <p className="text-sm text-muted">
                {t("operations.upload.limits", {
                  count: data.upload_max_files,
                  size: data.upload_max_size_mb,
                })}
              </p>
            </div>
            <p className="text-xs text-muted mt-3">
              {t("operations.upload.replaceHint")}
            </p>
            {files.length > 0 && (
              <ul className="file-upload-list mt-4 divide-y divide-line rounded border border-line">
                {files.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center gap-3 px-4 py-2 text-sm"
                  >
                    <FileUp size={16} />
                    <strong className="min-w-0 flex-1 truncate font-normal">
                      {file.name}
                    </strong>
                    <span className="shrink-0 text-muted">
                      {t("operations.upload.size", {
                        size: new Intl.NumberFormat(i18n.language, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                          useGrouping: false,
                        }).format(file.size / 1024),
                      })}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("operations.upload.remove", {
                        name: file.name,
                      })}
                      disabled={save.isPending}
                      onClick={() =>
                        setFiles(files.filter((entry) => entry !== file))
                      }
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Feedback error={selectionError} />
          </section>
        ) : operation === "patch" ? (
          <section className="patch-editor rounded-md border border-line p-4">
            <div
              className="mb-4 flex gap-5 border-b border-line"
              role="tablist"
              aria-label={t("operations.patch.view")}
            >
              <button
                type="button"
                role="tab"
                className={editorTab}
                aria-selected={!previewPatch}
                onClick={() => setPreviewPatch(false)}
              >
                {t("operations.patch.tab")}
              </button>
              <button
                type="button"
                role="tab"
                className={editorTab}
                aria-selected={previewPatch}
                onClick={() => setPreviewPatch(true)}
              >
                {t("operations.patch.preview")}
              </button>
            </div>
            {previewPatch ? (
              <DiffView text={patch} />
            ) : (
              <label>
                {t("operations.patch.content")}
                <textarea
                  className="min-h-72 rounded-md border border-line bg-code p-3 font-mono text-xs"
                  required
                  rows={16}
                  value={patch}
                  onChange={(event) => setPatch(event.target.value)}
                  placeholder={t("operations.patch.placeholder")}
                />
              </label>
            )}
          </section>
        ) : operation === "delete" ? (
          <div className="file-delete-notice mb-6 flex items-start gap-3 rounded-md border border-danger bg-danger-bg p-4 text-sm text-danger">
            <Trash2 size={20} className="shrink-0" />
            <div>
              <strong>
                {t("operations.delete.title", { path: data.path })}
              </strong>
              <p className="mt-2 leading-5">{t("operations.delete.body")}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-line bg-surface-subtle p-4 text-sm">
            <GitCommitHorizontal size={20} className="shrink-0" />
            <p>
              <Trans
                t={t}
                i18nKey={
                  operation === "revert"
                    ? "operations.commitIntro.revert"
                    : "operations.commitIntro.cherryPick"
                }
                values={{ sha: data.sha?.slice(0, 8), branch: data.branch }}
                components={{ sha: <code />, branch: <strong /> }}
              />
            </p>
          </div>
        )}
        <section className={commitPanel}>
          <h2 className={commitPanelHeading}>
            <GitCommitHorizontal size={20} />
            {t(data.signing?.will_sign ? "commit.titleSigned" : "commit.title")}
            <CommitSigning signing={data.signing} />
          </h2>
          <div className={commitFields}>
            <label className={commitField}>
              {t("commit.message")}
              <input
                className={commitInput}
                required
                maxLength={100}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <label className={commitField}>
              {t("commit.extendedDescription")}{" "}
              <textarea
                className={commitTextarea}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("commit.descriptionPlaceholder")}
              />
            </label>
            <fieldset className={commitDestination}>
              <legend className={commitLegend}>
                {t("commit.targetBranch")}
              </legend>
              {data.can_commit ? (
                <label className={commitDestinationOption}>
                  <input
                    className={commitCheckbox}
                    type="radio"
                    name="destination"
                    checked={choice === "direct"}
                    onChange={() => setChoice("direct")}
                  />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="commit.commitTo"
                      values={{ branch: data.branch }}
                      components={{ branch: <strong /> }}
                    />
                  </span>
                </label>
              ) : (
                <p className="text-muted">{t("commit.protected")}</p>
              )}
              <label className={commitDestinationOption}>
                <input
                  className={commitCheckbox}
                  type="radio"
                  name="destination"
                  checked={choice !== "direct"}
                  onChange={() => setChoice("commit-to-new-branch")}
                />
                <span>{t("commit.newBranch")}</span>
              </label>
              {choice !== "direct" && (
                <div className="ml-6">
                  <label className={commitField}>
                    {t("commit.newBranchName")}
                    <input
                      className={commitInput}
                      required
                      maxLength={100}
                      value={newBranch}
                      onChange={(event) => setNewBranch(event.target.value)}
                    />
                  </label>
                  {data.can_create_pull_request && (
                    <label className={checkLabel}>
                      <input
                        className={commitCheckbox}
                        type="checkbox"
                        checked={startMerge}
                        onChange={(event) =>
                          setStartMerge(event.target.checked)
                        }
                      />
                      {t("commit.startMergeRequest")}
                    </label>
                  )}
                </div>
              )}
            </fieldset>
            <label className={commitField}>
              {t("commit.email")}
              <SelectControl
                label={t("commit.email")}
                className="w-full font-normal"
                value={email}
                onValueChange={setEmail}
                options={data.commit_mails.map((mail) => ({
                  value: String(mail.id),
                  label: mail.email,
                }))}
              />
            </label>
            <label className={checkLabel}>
              <input
                className={commitCheckbox}
                type="checkbox"
                checked={signoff}
                onChange={(event) => setSignoff(event.target.checked)}
              />
              {t("commit.signoff")}
            </label>
            <Feedback error={save.error} />
            {progress && (
              <p role="status" className="text-sm text-muted">
                {progress}
              </p>
            )}
            <div className={commitActions}>
              <button
                className={`button ${operation === "delete" ? "border-[#c91c00] bg-[#c91c00] text-white" : "primary"}`}
                disabled={
                  save.isPending ||
                  (operation === "upload" && !files.length) ||
                  (operation === "patch" && !patch.trim())
                }
              >
                {save.isPending
                  ? t("commit.committing")
                  : operation === "delete"
                    ? t("operations.titles.delete")
                    : t("commit.submit")}
              </button>
              <button
                type="button"
                className="button"
                disabled={save.isPending}
                onClick={cancel}
              >
                {t("commit.cancel")}
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
