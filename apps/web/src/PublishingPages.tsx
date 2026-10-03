import { wikiPath } from "./wikiPath";
import { useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Download,
  File,
  GitCommitHorizontal,
  History,
  Package,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  get,
  native,
  nativeForm,
  nativePage,
  nativeText,
  request,
  type FormResult,
} from "./api";
import type { RepoContext } from "./App";
import {
  EmptyState,
  Feedback,
  Markdown,
  MarkdownEditor,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { ActionMenu, MenuAction, MenuDownload, MenuLink } from "./ActionMenu";
import { DiffView } from "./Diff";
import { uiRoute } from "./routes";
import { RefSwitcher, escapeSegments } from "./RefSwitcher";
import { ReleaseMetadata, type ReleaseMetadataData } from "./ReleaseMetadata";

const headingClass =
  "mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
const headingTitleClass = "max-md:text-[22px]";
const actionsClass = "flex flex-wrap items-center gap-2";
const downloadClass =
  "flex items-center gap-3 border-b border-line px-4 py-3 text-primary last:border-0 hover:bg-canvas";
const assetClass =
  "flex items-center gap-3 rounded border border-line px-3 py-2";
const editorSectionClass = "flex flex-col gap-4 border-b border-line pb-6";

export interface ReleaseData extends ReleaseMetadataData {
  body_html?: string;
  id: number;
  name: string;
  tag_name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  hide_archive_links: boolean;
  published_at: string;
  tarball_url: string;
  zipball_url: string;
  assets: {
    id: number;
    uuid: string;
    name: string;
    size: number;
    browser_download_url: string;
    download_count?: number;
    external_url?: string;
  }[];
}
export function LatestReleasePage() {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const query = useQuery({
    queryKey: ["release-latest", path],
    queryFn: () => nativeForm(`${path}/releases/latest`),
  });
  useTitle(t("releases.latestTitle"));
  if (query.data?.redirect)
    return <Navigate to={uiRoute(query.data.redirect)} replace />;
  return (
    <>
      <Feedback error={query.error} />
      {query.isPending && <Pending />}
    </>
  );
}

export function ReleasePage() {
  const { t, i18n } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const tag = useParams()["*"] || "";
  const query = useQuery({
    queryKey: ["release", path, tag],
    queryFn: ({ signal }) =>
      nativePage<{ item: ReleaseData; can_write: boolean }>(
        `${path}/releases/tag/${tag.split("/").map(encodeURIComponent).join("/")}`,
        signal,
      ),
  });
  const client = useQueryClient(),
    navigate = useNavigate();
  const remove = useMutation({
    mutationFn: async () => {
      await nativeForm(`${path}/releases/delete`, {
        id: String(query.data!.item.id),
      });
      await client.invalidateQueries({ queryKey: ["releases", path] });
      navigate(`/projects${path}/releases`);
    },
  });
  useTitle(t("releases.documentTitle", { tag }));
  const r = query.data?.item;
  return (
    <>
      <div className={headingClass}>
        <div>
          <Link
            className="text-sm text-primary"
            to={`/projects${path}/releases`}
          >
            {t("releases.releases")}
          </Link>
          <h1 className={headingTitleClass}>{r?.name || tag}</h1>
        </div>
        {query.data?.can_write && (
          <div className={actionsClass}>
            <Link
              className="button"
              to={`/projects${path}/releases/edit/${encodeURIComponent(tag)}`}
            >
              {t("releases.edit")}
            </Link>
            <ActionMenu
              label={t("releases.actions")}
              trigger={t("releases.actionsTrigger")}
            >
              <MenuAction
                onClick={() => {
                  if (window.confirm(t("releases.confirmDelete", { tag })))
                    remove.mutate();
                }}
              >
                {t("releases.delete")}
              </MenuAction>
            </ActionMenu>
          </div>
        )}
      </div>
      <Feedback error={query.error || remove.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        r && (
          <article className="release-detail max-w-5xl py-4">
            <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="badge">{r.tag_name}</span>
              {r.draft && <span className="badge">{t("releases.draft")}</span>}
              {r.prerelease && (
                <span className="badge">{t("releases.prerelease")}</span>
              )}
              <span>
                {t("releases.released", {
                  date: relativeDate(r.published_at),
                })}
              </span>
            </div>
            <ReleaseMetadata release={r} path={path} />
            <Markdown
              html={r.body_html}
              basePath={`${path}/src/tag/${escapeSegments(tag)}/`}
            >
              {r.body || t("releases.noNotes")}
            </Markdown>
            <h2 className="mt-8 mb-3">{t("releases.assets")}</h2>
            <div className="overflow-hidden rounded-lg border border-line">
              {!r.hide_archive_links && (
                <>
                  <a className={downloadClass} href={r.zipball_url}>
                    <Download size={16} />
                    {t("releases.sourceZip")} ·{" "}
                    {t("releases.downloads", {
                      count: r.archive_download_count?.zip || 0,
                    })}
                  </a>
                  <a className={downloadClass} href={r.tarball_url}>
                    <Download size={16} />
                    {t("releases.sourceTar")} ·{" "}
                    {t("releases.downloads", {
                      count: r.archive_download_count?.tar_gz || 0,
                    })}
                  </a>
                </>
              )}
              {r.assets.map((a) => (
                <a
                  key={a.id}
                  className={downloadClass}
                  href={a.browser_download_url}
                >
                  <Package size={16} />
                  {a.name}
                  <small className="ml-auto text-muted">
                    {t("releases.downloads", { count: a.download_count || 0 })}{" "}
                    · {formatSize(a.size, i18n.language)}
                  </small>
                </a>
              ))}
            </div>
          </article>
        )
      )}
    </>
  );
}
/** One decimal place in the UI language, e.g. "1.5 MiB" or "1,5 MiB". */
const formatSize = (size: number, language: string) => {
  const decimal = (value: number) =>
    new Intl.NumberFormat(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(value);
  return size >= 1048576
    ? `${decimal(size / 1048576)} MiB`
    : size >= 1024
      ? `${decimal(size / 1024)} KiB`
      : `${size} B`;
};
export function ReleaseEditorPage({ edit = false }: { edit?: boolean }) {
  const { t } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const tag = useParams()["*"] || "";
  const [params] = useSearchParams();
  const query = useQuery({
    queryKey: ["release-edit", path, tag, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<{
        item: ReleaseData;
        target: string;
        attachments_enabled: boolean;
        disable_archives: boolean;
        tag_name?: string;
        title?: string;
        content?: string;
        hide_archive_links?: boolean;
      }>(
        edit
          ? `${path}/releases/edit/${escapeSegments(tag)}`
          : `${path}/releases/new?${params}`,
        signal,
      ),
  });
  useTitle(t(edit ? "releases.editor.editTitle" : "releases.editor.newTitle"));
  return (
    <>
      <div className={headingClass}>
        <h1 className={headingTitleClass}>
          {t(edit ? "releases.editor.editTitle" : "releases.editor.newTitle")}
        </h1>
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        (!edit || query.data) && (
          <ReleaseEditor
            key={`${tag}:${params.toString()}:${query.data?.item?.id || "new"}`}
            path={path}
            branch={query.data?.target || repository.default_branch}
            release={query.data?.item}
            defaults={query.data}
          />
        )
      )}
    </>
  );
}
function ReleaseEditor({
  path,
  branch,
  release,
  defaults,
}: {
  path: string;
  branch: string;
  release?: ReleaseData;
  defaults?: {
    attachments_enabled: boolean;
    disable_archives: boolean;
    tag_name?: string;
    title?: string;
    content?: string;
    hide_archive_links?: boolean;
  };
}) {
  const { t, i18n } = useTranslation("repository");
  const [params] = useSearchParams();
  const [target, setTarget] = useState(branch);
  const [external, setExternal] = useState<number[]>([]);
  const [body, setBody] = useState(release?.body || defaults?.content || ""),
    [files, setFiles] = useState<File[]>([]),
    [removed, setRemoved] = useState<number[]>([]);
  const navigate = useNavigate(),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: async ({
      form,
      tagOnly,
    }: {
      form: HTMLFormElement;
      tagOnly: boolean;
    }) => {
      const fields = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string") fields.append(k, v);
      });
      fields.set("content", body);
      if (tagOnly) fields.set("tag_only", "1");
      const uploads: string[] = [];
      try {
        for (const file of files) {
          const upload = new FormData();
          upload.set("file", file);
          const result = await request<{ uuid: string }>(
            `${path}/releases/attachments`,
            { method: "POST", body: upload, headers: { "X-Forgejo-UI": "1" } },
          );
          uploads.push(result.data.uuid);
          fields.append("files", result.data.uuid);
        }
        for (const id of removed) {
          const asset = release?.assets.find((a) => a.id === id);
          if (asset?.uuid) fields.set(`attachment-del-${asset.uuid}`, "true");
        }
        const endpoint = release
          ? `${path}/releases/edit/${escapeSegments(release.tag_name)}`
          : `${path}/releases/new`;
        const { data } = await request<FormResult>(endpoint, {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: fields,
        });
        if (!data.redirect) throw new Error(t("releases.editor.notSaved"));
        await client.invalidateQueries({ queryKey: ["releases", path] });
        await client.invalidateQueries({ queryKey: ["release", path] });
        navigate(`/projects${path}/releases`);
      } catch (error) {
        await Promise.allSettled(
          uploads.map((file) =>
            nativeForm(`${path}/releases/attachments/remove`, { file }),
          ),
        );
        throw error;
      }
    },
  });
  return (
    <form
      className="workspace-form max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          form: e.currentTarget,
          tagOnly:
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute("name") ===
            "tag_only",
        });
      }}
    >
      <div className={editorSectionClass}>
        <h2>{t("releases.editor.details")}</h2>
        <p className="-mt-2 text-muted">{t("releases.editor.intro")}</p>
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr]">
          <label>
            {t("releases.editor.tagName")}
            <input
              name="tag_name"
              defaultValue={
                release?.tag_name ||
                defaults?.tag_name ||
                params.get("tag") ||
                ""
              }
              readOnly={!!release}
              required
              placeholder="v1.0.0"
            />
          </label>
          {!release && (
            <div className="flex flex-col gap-2">
              <span>{t("releases.editor.target")}</span>
              <input type="hidden" name="tag_target" value={target} />
              <RefSwitcher
                path={path}
                value={target}
                onSelect={setTarget}
                showTags={false}
                label={t("releases.editor.target")}
              />
              <input
                aria-label={t("releases.editor.commitTarget")}
                placeholder={t("releases.editor.commitTarget")}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
            </div>
          )}
        </div>
        <label>
          {t("releases.editor.title")}
          <input
            name="title"
            defaultValue={release?.name || defaults?.title}
            required={!!release}
            placeholder={t("releases.editor.titlePlaceholder")}
          />
        </label>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          label={t("releases.editor.notes")}
          placeholder={t("releases.editor.notesPlaceholder")}
          rows={12}
        />
      </div>
      <div className={editorSectionClass}>
        <h2>{t("releases.editor.assets")}</h2>
        {external.map((identifier) => (
          <div className="flex flex-wrap items-center gap-2" key={identifier}>
            <input
              className="min-w-0 flex-1"
              aria-label={t("releases.editor.assetName")}
              placeholder={t("releases.editor.assetName")}
              name={`attachment-new-name-${identifier}`}
              required
            />
            <input
              className="min-w-0 flex-1"
              aria-label={t("releases.editor.assetUrl")}
              placeholder={t("releases.editor.assetUrl")}
              name={`attachment-new-exturl-${identifier}`}
              type="url"
              required
            />
            <button
              type="button"
              className="button"
              onClick={() =>
                setExternal(external.filter((value) => value !== identifier))
              }
            >
              {t("releases.editor.removeExternal")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button self-start"
          onClick={() => setExternal([...external, Date.now()])}
        >
          {t("releases.editor.addExternal")}
        </button>
        <p className="-mt-2 text-muted">{t("releases.editor.assetsIntro")}</p>
        {release?.assets
          .filter((a) => !removed.includes(a.id))
          .map((a) => (
            <div className={assetClass} key={a.id}>
              <File size={16} />
              <input
                aria-label={t("releases.editor.assetName")}
                name={`attachment-edit-name-${a.uuid}`}
                defaultValue={a.name}
                required
              />
              {a.external_url && (
                <input
                  aria-label={t("releases.editor.assetUrl")}
                  name={`attachment-edit-exturl-${a.uuid}`}
                  defaultValue={a.external_url}
                  type="url"
                  required
                />
              )}
              <button
                type="button"
                className="icon-button ml-auto"
                aria-label={t("releases.editor.removeAsset", { name: a.name })}
                onClick={() => setRemoved([...removed, a.id])}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        {defaults?.attachments_enabled !== false && (
          <label className="relative flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line p-6 text-muted hover:bg-canvas">
            <Plus size={22} />
            <span>{t("releases.editor.addAssets")}</span>
            <input
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              type="file"
              multiple
              aria-label={t("releases.editor.assetsLabel")}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
        )}
        {files.map((file, i) => (
          <div className={assetClass} key={i}>
            <File size={16} />
            {file.name}
            <small className="ml-auto text-muted">
              {formatSize(file.size, i18n.language)}
            </small>
          </div>
        ))}
      </div>
      <div className={editorSectionClass}>
        {!release && (
          <label className="check-field">
            <input type="checkbox" name="add_tag_msg" />
            {t("releases.editor.addTagMessage")}
          </label>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            name="prerelease"
            value="on"
            defaultChecked={release?.prerelease}
          />
          {t("releases.editor.prerelease")}
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            name="draft"
            value="true"
            defaultChecked={release?.draft}
          />
          {t("releases.editor.draft")}
        </label>
        {!defaults?.disable_archives && (
          <label className="check-field">
            <input
              type="checkbox"
              name="hide_archive_links"
              value="on"
              defaultChecked={
                release?.hide_archive_links ?? defaults?.hide_archive_links
              }
            />
            {t("releases.editor.hideArchives")}
          </label>
        )}
      </div>
      <Feedback error={save.error} />
      <div className={actionsClass}>
        {!release && (
          <button
            className="button"
            name="tag_only"
            value="1"
            disabled={save.isPending}
          >
            {t("releases.editor.tagOnly")}
          </button>
        )}
        <button className="button primary" disabled={save.isPending}>
          {save.isPending
            ? t("shared.saving")
            : release
              ? t("releases.editor.saveChanges")
              : t("releases.editor.create")}
        </button>
        <Link className="button" to={`/projects${path}/releases`}>
          {t("shared.cancel")}
        </Link>
      </div>
    </form>
  );
}

export function WikiHistoryPage() {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const name = params.get("name") || "Home",
    page = Number(params.get("page")) || 1;
  const query = useQuery({
    queryKey: ["wiki-history", path, name, page],
    queryFn: ({ signal }) =>
      nativePage<{
        items: { sha: string; message: string; author: string; date: string }[];
        total: number;
        page_size: number;
      }>(
        `${path}/wiki/${wikiPath(name)}?action=_revision&page=${page}`,
        signal,
      ),
  });
  useTitle(t("wiki.historyDocumentTitle", { name }));
  return (
    <>
      <div className={headingClass}>
        <div>
          <Link
            to={`/projects${path}/wiki?${new URLSearchParams({ page: name })}`}
            className="text-primary"
          >
            {name}
          </Link>
          <h1 className={headingTitleClass}>{t("wiki.pageHistory")}</h1>
        </div>
        <History size={22} />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data?.items.map((c) => (
          <article
            className="publish-history flex items-center gap-4 border-b border-line py-4"
            key={c.sha}
          >
            <GitCommitHorizontal size={18} />
            <div>
              <Link
                to={`/projects${path}/wiki?${new URLSearchParams({ page: name, revision: c.sha })}`}
              >
                <strong>{c.message}</strong>
              </Link>
              <p className="mt-1 text-xs text-muted">
                {c.author} · {relativeDate(c.date)}
              </p>
            </div>
            <Link
              className="button font-mono"
              to={`/projects${path}/wiki/commit/${c.sha}`}
              aria-label={t("wiki.viewChanges", { sha: c.sha.slice(0, 8) })}
            >
              {c.sha.slice(0, 8)}
            </Link>
          </article>
        ))
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={query.data.page_size}
          onPage={(p) => setParams({ name, page: String(p) })}
        />
      )}
    </>
  );
}
export function WikiCommitPage() {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const sha = useParams().sha || "";
  const [parallel, setParallel] = useState(false);
  const query = useQuery({
    queryKey: ["wiki-commit", path, sha],
    queryFn: ({ signal }) =>
      nativeText(`${path}/wiki/commit/${encodeURIComponent(sha)}.diff`, signal),
  });
  useTitle(t("wiki.commitDocumentTitle", { sha: sha.slice(0, 8) }));
  return (
    <>
      <div className={headingClass}>
        <div>
          <Link className="text-primary" to={`/projects${path}/wiki`}>
            {t("wiki.wiki")}
          </Link>
          <h1 className={headingTitleClass}>{t("wiki.changes")}</h1>
          <code>{sha.slice(0, 12)}</code>
        </div>
        <div className={actionsClass}>
          <SelectControl
            label={t("wiki.diffLayout")}
            value={parallel ? "split" : "unified"}
            options={[
              { value: "unified", label: t("wiki.inline") },
              { value: "split", label: t("wiki.sideBySide") },
            ]}
            onValueChange={(value) => setParallel(value === "split")}
          />
          <a
            className="button"
            href={native(`${path}/wiki/commit/${sha}.patch`)}
            download
          >
            {t("wiki.downloadPatch")}
          </a>
        </div>
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <DiffView text={query.data} navigation parallel={parallel} />
        )
      )}
    </>
  );
}
export function WikiSearchPage() {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams(),
    q = params.get("q") || "";
  const query = useQuery({
    queryKey: ["wiki-search", path, q],
    queryFn: ({ signal }) =>
      nativePage<{
        items: {
          title: string;
          path: string;
          lines: string[];
          numbers: number[];
        }[];
      }>(`${path}/wiki/search?q=${encodeURIComponent(q)}`, signal),
    enabled: !!q,
  });
  useTitle(t("wiki.searchTitle"));
  return (
    <>
      <div className={headingClass}>
        <h1 className={headingTitleClass}>{t("wiki.searchTitle")}</h1>
        <Link className="button" to={`/projects${path}/wiki`}>
          {t("wiki.home")}
        </Link>
      </div>
      <form
        className="my-4 flex items-center justify-between gap-3 max-md:gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({
            q: String(new FormData(e.currentTarget).get("q") || ""),
          });
        }}
      >
        <label className="filter-input">
          <Search size={16} />
          <input
            aria-label={t("wiki.searchLabel")}
            name="q"
            defaultValue={q}
            placeholder={t("wiki.searchPlaceholder")}
            required
          />
        </label>
        <button className="button primary">{t("shared.search")}</button>
      </form>
      <Feedback error={query.error} />
      {q && query.isPending ? (
        <Pending />
      ) : (
        query.data?.items.map((item) => (
          <article
            className="my-4 overflow-hidden rounded-lg border border-line"
            key={item.path}
          >
            <Link
              className="flex items-center gap-2 border-b border-line p-3 font-semibold text-primary"
              to={`/projects${path}/wiki?${new URLSearchParams({ page: item.path })}`}
            >
              <BookOpen size={16} />
              {item.title}
            </Link>
            <pre className="overflow-auto p-4 text-sm">
              {item.lines
                .map((line, i) => `${item.numbers[i]}  ${line}`)
                .join("\n")}
            </pre>
          </article>
        ))
      )}
      {query.data && !query.data.items.length && (
        <EmptyState title={t("wiki.noMatchesTitle")}>
          {t("wiki.noMatchesBody")}
        </EmptyState>
      )}
    </>
  );
}

interface WorkflowInput {
  description?: string;
  required?: boolean;
  default?: string;
  type?: string;
  options?: string[];
  Description?: string;
  Required?: boolean;
  Default?: string;
  Type?: string;
  Options?: string[];
}
export interface WorkflowData {
  warnings?: string[];
  workflows: string[];
  actors?: { id: number; name: string; full_name: string }[];
  can_run: boolean;
  can_toggle: boolean;
  disabled: boolean;
  dispatch?: {
    inputs?: Record<string, WorkflowInput>;
    Inputs?: Record<string, WorkflowInput>;
  };
  input_keys?: string[];
}
export function RunPipelinePage() {
  const [selectedRef, setSelectedRef] = useState("");
  const { t } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams(),
    workflow = params.get("workflow") || "";
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["workflow-dispatch", path, workflow],
    queryFn: ({ signal }) =>
      nativePage<WorkflowData>(
        `${path}/actions?workflow=${encodeURIComponent(workflow)}`,
        signal,
      ),
  });
  const run = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fields = Object.fromEntries(new FormData(form)) as Record<
        string,
        string
      >;
      for (const [key, input] of Object.entries(inputs)) {
        if ((input.type || input.Type) === "boolean")
          fields[`inputs[${key}]`] = fields[`inputs[${key}]`] || "false";
      }
      const result = await nativeForm(`${path}/actions/manual`, {
        ...fields,
        workflow,
      });
      if (!result.redirect) throw new Error(t("pipelines.notCreated"));
      navigate(
        `/projects${path}/actions?workflow=${encodeURIComponent(workflow)}`,
      );
    },
  });
  const availableInputs =
    query.data?.dispatch?.inputs || query.data?.dispatch?.Inputs || {};
  const inputs = Object.fromEntries(
    (query.data?.input_keys || Object.keys(availableInputs)).map((key) => [
      key,
      availableInputs[key],
    ]),
  );
  useTitle(t("pipelines.runTitle"));
  return (
    <>
      <div className={headingClass}>
        <h1 className={headingTitleClass}>{t("pipelines.runTitle")}</h1>
      </div>
      <Feedback error={query.error || run.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        <form
          key={workflow}
          className="workspace-form max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate(e.currentTarget);
          }}
        >
          <label>
            {t("pipelines.workflow")}
            <SelectControl
              label={t("pipelines.workflow")}
              value={workflow}
              placeholder={t("pipelines.selectWorkflow")}
              options={[
                { value: "", label: t("pipelines.selectWorkflow") },
                ...(query.data?.workflows || []).map((w) => ({
                  value: w,
                  label: w,
                })),
              ]}
              onValueChange={(w) => setParams({ workflow: w })}
            />
          </label>
          {workflow && query.data?.dispatch ? (
            <>
              <div className="flex flex-col gap-2">
                <span>{t("pipelines.ref")}</span>
                <input
                  type="hidden"
                  name="ref"
                  value={selectedRef || repository.default_branch}
                />
                <RefSwitcher
                  path={path}
                  value={selectedRef || repository.default_branch}
                  onSelect={setSelectedRef}
                  label={t("pipelines.ref")}
                />
              </div>
              <h2>{t("pipelines.inputs")}</h2>
              {Object.entries(inputs).map(([key, raw]) => {
                const type = raw.type || raw.Type || "string",
                  label = raw.description || raw.Description || key,
                  def = raw.default || raw.Default || "",
                  required = raw.required || raw.Required;
                return type === "boolean" ? (
                  <label key={key} className="check-field">
                    <input
                      type="checkbox"
                      name={`inputs[${key}]`}
                      value="true"
                      defaultChecked={def === "true"}
                    />
                    {label}
                  </label>
                ) : (
                  <label key={key}>
                    {label}
                    {type === "choice" ? (
                      <SelectControl
                        label={label}
                        name={`inputs[${key}]`}
                        defaultValue={def}
                        required={required}
                        options={(raw.options || raw.Options || []).map(
                          (v) => ({ value: v, label: v }),
                        )}
                      />
                    ) : (
                      <input
                        type={type === "number" ? "number" : "text"}
                        name={`inputs[${key}]`}
                        defaultValue={def}
                        required={required}
                      />
                    )}
                  </label>
                );
              })}
              <button
                className="button primary self-start"
                disabled={run.isPending || !query.data.can_run}
              >
                <Play size={16} />
                {t("pipelines.run")}
              </button>
            </>
          ) : workflow ? (
            <EmptyState title={t("pipelines.notConfiguredTitle")}>
              {t("pipelines.notConfiguredBody")}
            </EmptyState>
          ) : null}
          <Link className="text-primary" to={`/projects${path}/actions`}>
            {t("pipelines.back")}
          </Link>
        </form>
      )}
    </>
  );
}
export function PipelineArtifacts({
  run,
  canDelete,
  done,
}: {
  run: string;
  canDelete: boolean;
  done: boolean;
}) {
  const { t, i18n } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const query = useQuery({
    queryKey: ["artifacts", path, run, done],
    refetchInterval: done ? false : 5000,
    queryFn: ({ signal }) =>
      get<{
        run_id: number;
        artifacts: { name: string; size: number; status: string }[];
      }>(`${path}/actions/runs/${run}/artifacts`, signal),
  });
  const remove = useMutation({
    mutationFn: async (name: string) => {
      await request(
        `${path}/actions/runs/${run}/artifacts/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      await query.refetch();
    },
  });
  return (
    <section className="mt-8 flex flex-col gap-3 border-t border-line py-5">
      <h2>{t("pipelines.artifacts.title")}</h2>
      <Feedback error={query.error || remove.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.artifacts.length ? (
        query.data.artifacts.map((a) => (
          <div className={assetClass} key={a.name}>
            <Package size={16} />
            {a.status === "expired" ? (
              <span>{t("pipelines.artifacts.expired", { name: a.name })}</span>
            ) : (
              <a
                className="text-primary hover:underline"
                href={native(
                  `${path}/actions/runs/${query.data.run_id}/artifacts/${encodeURIComponent(a.name)}`,
                )}
              >
                {a.name}
              </a>
            )}
            <small className="ml-auto text-muted">
              {formatSize(a.size, i18n.language)}
            </small>
            {canDelete && (
              <button
                className="icon-button ml-auto"
                aria-label={t("pipelines.artifacts.deleteLabel", {
                  name: a.name,
                })}
                onClick={() => {
                  if (
                    window.confirm(
                      t("pipelines.artifacts.confirmDelete", { name: a.name }),
                    )
                  )
                    remove.mutate(a.name);
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="text-muted">{t("pipelines.artifacts.none")}</p>
      )}
    </section>
  );
}
export function WikiPageActions({
  page,
  canWrite,
  onDelete,
}: {
  page: string;
  canWrite: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  return (
    <ActionMenu
      label={t("wiki.pageActions")}
      trigger={t("wiki.actionsTrigger")}
    >
      <MenuLink
        to={`/projects${path}/wiki/history?${new URLSearchParams({ name: page || "Home" })}`}
      >
        {t("wiki.pageHistory")}
      </MenuLink>
      <MenuLink to={`/projects${path}/wiki/search`}>
        {t("wiki.searchWiki")}
      </MenuLink>
      <MenuDownload href={native(`${path}/wiki/raw/${wikiPath(page)}.md`)}>
        {t("wiki.downloadRaw")}
      </MenuDownload>
      {canWrite && (
        <MenuAction onClick={onDelete}>{t("wiki.deletePage")}</MenuAction>
      )}
    </ActionMenu>
  );
}
