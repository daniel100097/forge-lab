import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror, { EditorState, EditorView } from "@uiw/react-codemirror";
import { indentUnit } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { createTwoFilesPatch } from "diff";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeft,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  WrapText,
} from "lucide-react";
import type { RepoContext } from "./App";
import { native, nativeForm, nativePage } from "./api";
import { DiffView } from "./Diff";
import { EmptyState, Feedback, Markdown, Pending, useTitle } from "./UI";
import { SelectControl } from "./SelectControl";
import { registerNavigationGuard } from "./navigationGuard";
import {
  CommitSigning,
  checkLabel,
  commitActions,
  commitCheckbox,
  commitDestination,
  commitDestinationOption,
  commitField,
  commitFields,
  commitInput,
  commitLegend,
  commitPanel,
  commitPanelHeading,
  commitTextarea,
  editorHeading,
  editorHeadingPath,
  editorHeadingTitle,
  editorPage,
  editorTab,
  newFilePath,
  newFilePathInput,
} from "./FileOperations";

interface EditorData {
  content: string;
  path: string;
  branch: string;
  last_commit: string;
  can_commit: boolean;
  can_create_pull_request: boolean;
  new_branch_name: string;
  commit_mails: { id: number; email: string }[];
  default_commit_mail: string;
  signing?: { will_sign: boolean; message?: string } | null;
  /** The .editorconfig definition for this file (JSON), or "null". */
  editorconfig?: string;
  preview_extensions?: string;
  line_wrap_extensions?: string;
}
interface EditorConfig {
  indent_style?: "tab" | "space";
  indent_size?: number | "tab";
  tab_width?: number;
  max_line_length?: number;
}
function parseEditorConfig(value?: string): EditorConfig | null {
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== "object") return null;
    // Forgejo serializes the definition's values as strings.
    const number = (input: unknown) =>
      Number(input) > 0 ? Number(input) : undefined;
    return {
      indent_style:
        parsed.indent_style === "tab" || parsed.indent_style === "space"
          ? parsed.indent_style
          : undefined,
      indent_size:
        parsed.indent_size === "tab" ? "tab" : number(parsed.indent_size),
      tab_width: number(parsed.tab_width),
      max_line_length: number(parsed.max_line_length),
    };
  } catch {
    return null;
  }
}
const extensionOf = (name: string) => {
  const base = name.split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};
const listed = (list: string | undefined, name: string) =>
  !!extensionOf(name) &&
  (list ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(extensionOf(name));
const escapePath = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");
const subscribeTheme = (changed: () => void) => {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
};

export function FileEditorPage({ create = false }: { create?: boolean }) {
  const { t } = useTranslation("mergeRequests");
  const context = useOutletContext<RepoContext>();
  const [params] = useSearchParams();
  const ref = params.get("ref") || context.repository.default_branch;
  const file = params.get("path") || "";
  const endpoint = `${context.path}/${create ? "_new" : "_edit"}/${escapePath(ref)}/${escapePath(file)}`;
  const eligible =
    (create || !!file) &&
    !!context.repository.permissions?.write_code &&
    !context.repository.archived;
  const editor = useQuery({
    queryKey: ["file-editor", context.path, ref, file, create],
    queryFn: ({ signal }) => nativePage<EditorData>(endpoint, signal),
    enabled: eligible,
    refetchOnWindowFocus: false,
  });
  useTitle(
    create
      ? t("editor.documentTitle.create", { project: context.repository.name })
      : t("editor.documentTitle.edit", {
          file,
          project: context.repository.name,
        }),
  );
  if (!eligible)
    return (
      <EmptyState title={t("editor.readOnly.title")}>
        {t("editor.readOnly.body")}
      </EmptyState>
    );
  if (editor.isPending) return <Pending />;
  if (editor.error)
    return (
      <>
        <Feedback error={editor.error} />
        <EmptyState title={t("editor.notEditable.title")}>
          {t("editor.notEditable.body")}
        </EmptyState>
      </>
    );
  return (
    <FileEditor
      key={`${context.path}:${ref}:${file}`}
      data={{ ...editor.data, content: editor.data.content ?? "" }}
      create={create}
      initialName={params.get("filename") ?? ""}
      endpoint={endpoint}
      context={context}
    />
  );
}

function FileEditor({
  data,
  endpoint,
  context,
  create = false,
  initialName = "",
}: {
  create?: boolean;
  initialName?: string;
  data: EditorData;
  endpoint: string;
  context: RepoContext;
}) {
  const { t } = useTranslation("mergeRequests");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [content, setContent] = useState(data.content);
  const [filePath, setFilePath] = useState(
    create ? [data.path, initialName].filter(Boolean).join("/") : data.path,
  );
  const [tab, setTab] = useState<"edit" | "render" | "preview">("edit");
  // Native editors wrap lines of these file types (LINE_WRAP_EXTENSIONS).
  const [wrap, setWrap] = useState(() =>
    listed(data.line_wrap_extensions, data.path),
  );
  const editorconfig = useMemo(
    () => parseEditorConfig(data.editorconfig),
    [data.editorconfig],
  );
  const [summary, setSummary] = useState(
    (create
      ? initialName
        ? t("editor.defaultSummary.add", { name: initialName })
        : t("editor.defaultSummary.addNew")
      : t("editor.defaultSummary.update", { name: data.path })
    ).slice(0, 100),
  );
  const [description, setDescription] = useState("");
  const [branchChoice, setBranchChoice] = useState(
    data.can_commit ? "direct" : "commit-to-new-branch",
  );
  const [newBranch, setNewBranch] = useState(data.new_branch_name);
  const [startMerge, setStartMerge] = useState(true);
  const [email, setEmail] = useState(
    String(
      data.commit_mails.find((m) => m.email === data.default_commit_mail)?.id ??
        data.commit_mails[0]?.id ??
        -1,
    ),
  );
  const [signoff, setSignoff] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const dirty =
    content !== data.content ||
    (create ? !!filePath.trim() : filePath !== data.path);
  const allowExit = useRef(false);
  const root = `/projects/${context.repository.full_name.split("/").map(encodeURIComponent).join("/")}`;
  const viewPath = `${root}?${new URLSearchParams({ ref: data.branch, path: data.path })}`;
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme === "dark",
  );
  const extensions = useMemo(() => {
    const ext = filePath.split(".").at(-1)?.toLowerCase();
    const language = /^(jsx?|tsx?)$/.test(ext || "")
      ? javascript({ jsx: true, typescript: ext?.startsWith("ts") })
      : /^(md|markdown)$/.test(ext || "")
        ? markdown()
        : ext === "json"
          ? json()
          : ext === "css"
            ? css()
            : /^(html?|vue|svelte)$/.test(ext || "")
              ? html()
              : ext === "py"
                ? python()
                : /^(yaml|yml)$/.test(ext || "")
                  ? yaml()
                  : null;
    // .editorconfig: indentation style and width (like the native editor).
    const size =
      typeof editorconfig?.indent_size === "number"
        ? editorconfig.indent_size
        : undefined;
    const tabWidth = editorconfig?.tab_width || size;
    const indentation = editorconfig?.indent_style
      ? [
          indentUnit.of(
            editorconfig.indent_style === "tab"
              ? "\t"
              : " ".repeat(size || tabWidth || 4),
          ),
        ]
      : [];
    return [
      EditorView.contentAttributes.of({
        "aria-label": t("editor.fileContent"),
        "aria-multiline": "true",
      }),
      ...(language ? [language] : []),
      ...(wrap ? [EditorView.lineWrapping] : []),
      ...(tabWidth ? [EditorState.tabSize.of(tabWidth)] : []),
      ...indentation,
    ];
  }, [filePath, wrap, t, editorconfig]);
  const previewable = listed(data.preview_extensions, filePath);
  const rendered = useQuery({
    queryKey: ["file-editor-render", context.path, filePath, content],
    queryFn: async ({ signal }) => {
      const response = await fetch(native(`${context.path}/markup`), {
        method: "POST",
        credentials: "same-origin",
        signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          mode: "file",
          context: native(context.path),
          file_path: filePath,
          branch_path: `branch/${data.branch}`,
          text: content,
        }),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error(t("editor.renderFailed"));
      return response.text();
    },
    enabled: tab === "render" && previewable,
    staleTime: 60_000,
  });
  const diff = useMemo(
    () =>
      tab === "preview" && dirty
        ? createTwoFilesPatch(
            create ? "/dev/null" : data.path,
            filePath,
            data.content,
            content,
            undefined,
            undefined,
            { context: 3 },
          ).replace(
            /^Index:.*\n=+\n/,
            `diff --git a/${create ? filePath : data.path} b/${filePath}\n`,
          )
        : "",
    [tab, dirty, data.path, filePath, data.content, content, create],
  );

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
      if (!window.confirm(t("editor.discard"))) {
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
      if (window.confirm(t("editor.discard"))) {
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

  const save = useMutation({
    mutationFn: async () => {
      const result = await nativeForm(endpoint, {
        tree_path: filePath,
        content,
        last_commit: data.last_commit,
        commit_summary: summary,
        commit_message: description,
        commit_choice: branchChoice,
        new_branch_name: branchChoice === "direct" ? "" : newBranch.trim(),
        commit_mail_id: email,
        ...(signoff ? { signoff: "on" } : {}),
      });
      if (!result.redirect) throw new Error(t("editor.commitFailed"));
      return result;
    },
    onSuccess: async () => {
      allowExit.current = true;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["tree", context.path] }),
        client.invalidateQueries({ queryKey: ["branches", context.path] }),
        client.invalidateQueries({ queryKey: ["commits", context.path] }),
        client.invalidateQueries({ queryKey: ["file-editor", context.path] }),
        client.invalidateQueries({ queryKey: ["repo-overview", context.path] }),
      ]);
      const branch = branchChoice === "direct" ? data.branch : newBranch.trim();
      navigate(
        branchChoice !== "direct" && startMerge && data.can_create_pull_request
          ? `${root}/merge-requests/new?${new URLSearchParams({ source_branch: branch, target_branch: data.branch, step: "create" })}`
          : `${root}?${new URLSearchParams({ ref: branch, path: filePath })}`,
      );
    },
  });
  const cancel = () => {
    if (!dirty || window.confirm(t("editor.discard"))) {
      allowExit.current = true;
      navigate(viewPath);
    }
  };
  return (
    <div className={editorPage}>
      <div className={editorHeading}>
        <div>
          <h1 className={editorHeadingTitle}>
            {create ? t("editor.newFile") : t("editor.editFile")}
          </h1>
          <p className={editorHeadingPath}>
            <GitBranch size={14} />
            <strong>{data.branch}</strong>
            <span>/</span>
            <span>{data.path}</span>
          </p>
        </div>
        <button className="button" onClick={cancel}>
          <ArrowLeft size={15} />
          {t("commit.cancel")}
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className={newFilePath}>
          {t("editor.fileName")}
          <input
            className={newFilePathInput}
            autoFocus={create}
            required
            maxLength={500}
            value={filePath}
            onChange={(event) => setFilePath(event.target.value)}
            placeholder={t("editor.fileNamePlaceholder")}
          />
        </label>
        <section
          className="overflow-hidden rounded-md border border-line bg-surface [&_.cm-activeLine]:bg-hover! [&_.cm-activeLineGutter]:bg-hover! [&_.cm-content]:[padding:12px_0]! [&_.cm-content]:caret-ink! [&_.cm-cursor]:border-l-ink! [&_.cm-editor]:bg-surface! [&_.cm-editor]:text-sm! [&_.cm-editor]:text-ink! [&_.cm-focused]:[outline:none]! [&_.cm-gutters]:border-line! [&_.cm-gutters]:bg-surface-subtle! [&_.cm-gutters]:text-muted! [&_.cm-line]:pr-4! [&_.cm-line]:pl-3! [&_.cm-scroller]:font-mono! [&_.cm-scroller]:leading-[1.65]! dark:[&_.cm-activeLine]:bg-[#27262c]! dark:[&_.cm-activeLineGutter]:bg-[#27262c]!"
          aria-label={t("editor.section")}
        >
          <div className="flex items-center justify-between border-b border-line px-3">
            <div
              className="flex gap-5"
              role="tablist"
              aria-label={t("editor.view")}
            >
              <button
                type="button"
                role="tab"
                className={editorTab}
                aria-selected={tab === "edit"}
                onClick={() => setTab("edit")}
              >
                {t("editor.edit")}
              </button>
              {previewable && (
                <button
                  type="button"
                  role="tab"
                  className={editorTab}
                  aria-selected={tab === "render"}
                  onClick={() => setTab("render")}
                >
                  {t("editor.preview")}
                </button>
              )}
              <button
                type="button"
                role="tab"
                className={editorTab}
                aria-selected={tab === "preview"}
                onClick={() => setTab("preview")}
              >
                {t("editor.previewChanges")}
                {dirty && <span className="counter">1</span>}
              </button>
            </div>
            <button
              type="button"
              className="icon-button aria-pressed:bg-selected aria-pressed:text-primary"
              aria-label={t("editor.wrapLines")}
              aria-pressed={wrap}
              onClick={() => setWrap(!wrap)}
            >
              <WrapText size={17} />
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-line bg-surface-subtle px-4 py-3 text-sm max-md:px-3">
            <FileCode2 size={16} />
            <strong className="font-mono text-xs wrap-anywhere">
              {filePath || t("editor.untitled")}
            </strong>
            {dirty && (
              <span className="ml-auto shrink-0 text-xs text-muted max-md:text-[10px]">
                {t("editor.unsaved")}
              </span>
            )}
          </div>
          {tab === "edit" ? (
            <CodeMirror
              value={content}
              onChange={setContent}
              theme={dark ? "dark" : "light"}
              extensions={extensions}
              height="460px"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                autocompletion: true,
              }}
              onUpdate={(update) => {
                if (update.selectionSet || update.docChanged) {
                  const head = update.state.selection.main.head;
                  const line = update.state.doc.lineAt(head);
                  setPosition({
                    line: line.number,
                    column: head - line.from + 1,
                  });
                }
              }}
            />
          ) : tab === "render" ? (
            <div className="file-editor-rendered max-h-[660px] min-h-[460px] overflow-auto p-6 max-md:p-3">
              {rendered.isPending ? (
                <Pending />
              ) : rendered.error ? (
                <Feedback error={rendered.error} />
              ) : (
                <Markdown html={rendered.data || " "}>{content}</Markdown>
              )}
            </div>
          ) : (
            <div className="file-editor-preview max-h-[660px] min-h-[460px] overflow-auto p-3 max-md:p-0">
              {dirty ? (
                <DiffView text={diff} />
              ) : (
                <EmptyState title={t("editor.noChanges.title")}>
                  {t("editor.noChanges.body")}
                </EmptyState>
              )}
            </div>
          )}
          <div className="flex justify-end gap-5 border-t border-line bg-surface-subtle px-4 py-1 text-xs text-muted">
            <span>
              {t("editor.position", {
                line: position.line,
                column: position.column,
              })}
            </span>
            {editorconfig?.indent_style && (
              <span title={t("editor.editorconfigHint")}>
                {editorconfig.indent_style === "tab"
                  ? t("editor.indentTabs", {
                      count:
                        editorconfig.tab_width ||
                        (typeof editorconfig.indent_size === "number"
                          ? editorconfig.indent_size
                          : 4),
                    })
                  : t("editor.indentSpaces", {
                      count:
                        typeof editorconfig.indent_size === "number"
                          ? editorconfig.indent_size
                          : editorconfig.tab_width || 4,
                    })}
              </span>
            )}
            <span>UTF-8</span>
            <span>
              {t("editor.lineCount", { count: content.split("\n").length })}
            </span>
          </div>
        </section>
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
              <span>
                {t("commit.extendedDescription")}{" "}
                <span className="text-muted font-normal">
                  {t("commit.optional")}
                </span>
              </span>
              <textarea
                className={commitTextarea}
                rows={3}
                placeholder={t("commit.descriptionPlaceholder")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
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
                    name="commit-destination"
                    checked={branchChoice === "direct"}
                    onChange={() => setBranchChoice("direct")}
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
                  name="commit-destination"
                  checked={branchChoice !== "direct"}
                  onChange={() => setBranchChoice("commit-to-new-branch")}
                />
                <span>{t("commit.newBranch")}</span>
              </label>
              {branchChoice !== "direct" && (
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
            <div className={commitActions}>
              <button
                className="button primary"
                type="submit"
                disabled={
                  !dirty ||
                  save.isPending ||
                  (branchChoice !== "direct" && !newBranch.trim())
                }
              >
                {save.isPending ? t("commit.committing") : t("commit.submit")}
              </button>
              <button
                className="button"
                type="button"
                onClick={cancel}
                disabled={save.isPending}
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
