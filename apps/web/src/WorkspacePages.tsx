import { wikiPath } from "./wikiPath";
import { wikiTocBody } from "./wikiToc";
import { PipelineLogs } from "./PipelineLogs";
import { ReleaseMetadata, type ReleaseMetadataData } from "./ReleaseMetadata";
import { NativeImportProjectPage } from "./ProjectCreation";
import { NotificationTabs } from "./WorkspaceActivity";
import { useState } from "react";
import { SelectControl } from "./SelectControl";
import {
  Link,
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  CheckCheck,
  GitBranch,
  GitCommitHorizontal,
  Play,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  native,
  nativeForm,
  nativePage,
  post,
  request,
  type Bootstrap,
} from "./api";
import type { RepoContext } from "./App";
import {
  PipelineArtifacts,
  WikiPageActions,
  type WorkflowData,
} from "./PublishingPages";
import { uiRoute } from "./routes";
import {
  EmptyState,
  Feedback,
  Markdown,
  MarkdownEditor,
  Pagination,
  Pending,
  pageClass,
  pageHeadingClass,
  relativeDate,
  useTitle,
} from "./UI";

const headingTitleClass = "max-md:text-[22px]";
const actionsClass = "flex flex-wrap items-center gap-2";
const listToolbarClass =
  "my-4 flex items-center justify-between gap-3 max-md:gap-2";
const pipelineHeadingClass =
  "mb-3 flex min-h-10 items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-3";
const pipelineBadgeClass = (status: string) =>
  status === "success"
    ? "pipeline-badge inline-flex shrink-0 items-center rounded-full border border-[#b1d3bc] bg-success-bg px-2 py-1 text-xs text-success capitalize dark:border-[#397854]"
    : status === "failure" || status === "cancelled"
      ? "pipeline-badge inline-flex shrink-0 items-center rounded-full border border-[#edb8b1] bg-danger-bg px-2 py-1 text-xs text-danger capitalize dark:border-[#a34a44]"
      : status === "running"
        ? "pipeline-badge inline-flex shrink-0 items-center rounded-full border border-[#a4c5e8] bg-info-bg px-2 py-1 text-xs text-primary capitalize dark:border-[#426c96] dark:text-[#a3cbf5]"
        : "pipeline-badge inline-flex shrink-0 items-center rounded-full border border-line bg-[#f5f5f7] px-2 py-1 text-xs capitalize dark:bg-surface-subtle";
const statusIndicatorClass = (status: string) =>
  status === "success"
    ? "size-2 shrink-0 rounded-full bg-success"
    : status === "failure"
      ? "size-2 shrink-0 rounded-full bg-danger"
      : status === "running"
        ? "size-2 shrink-0 rounded-full bg-primary"
        : "size-2 shrink-0 rounded-full bg-[#89888d]";
// Forgejo Actions statuses; unknown values are shown as Forgejo sends them.
const pipelineStatuses = [
  "success",
  "failure",
  "cancelled",
  "skipped",
  "waiting",
  "running",
  "blocked",
  "unknown",
] as const;
const statusLabel = (t: TFunction<"workspace">, status: string) =>
  (pipelineStatuses as readonly string[]).includes(status)
    ? t(`pipelines.status.${status as (typeof pipelineStatuses)[number]}`)
    : status;

export function SettingsPage() {
  const { t } = useTranslation("workspace");
  const { path, repository } = useOutletContext<RepoContext>();
  const client = useQueryClient();
  useTitle(t("projectSettings.documentTitle", { name: repository.name }));
  const query = useQuery({
    queryKey: ["repo-settings", path],
    queryFn: ({ signal }) =>
      nativePage<{
        repo_name: string;
        description: string;
        website: string;
        private: boolean;
        template: boolean;
      }>(`${path}/settings`, signal),
    enabled: repository.permissions?.admin,
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(`${path}/settings`, {
        action: "update",
        repo_name: query.data!.repo_name,
        private: query.data!.private ? "on" : "",
        template: query.data!.template ? "on" : "",
        ...(Object.fromEntries(new FormData(form)) as Record<string, string>),
      });
      await client.invalidateQueries({ queryKey: ["repo"] });
      await client.invalidateQueries({ queryKey: ["projects"] });
      await client.invalidateQueries({ queryKey: ["repo-settings", path] });
    },
  });
  if (!repository.permissions?.admin)
    return <EmptyState title={t("projectSettings.adminRequired")} />;
  return (
    <>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("projectSettings.title")}</h1>
      </div>
      <div className="grid grid-cols-[minmax(150px,1fr)_minmax(0,2fr)] gap-10 border-t border-line py-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6">
        <div>
          <h2>{t("projectSettings.details")}</h2>
          <p className="mt-2 text-sm text-muted">
            {t("projectSettings.detailsDescription")}
          </p>
        </div>
        <div>
          {query.isPending ? (
            <Pending />
          ) : query.error ? (
            <Feedback error={query.error} />
          ) : (
            <form
              className="workspace-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(e.currentTarget);
              }}
            >
              <label>
                {t("projectSettings.name")}
                <input readOnly value={query.data.repo_name} />
              </label>
              <label>
                {t("shared.description")}
                <textarea
                  name="description"
                  aria-label={t("shared.description")}
                  rows={4}
                  defaultValue={query.data.description}
                  maxLength={2048}
                />
              </label>
              <label>
                {t("shared.website")}
                <input
                  type="url"
                  name="website"
                  defaultValue={query.data.website}
                  maxLength={255}
                />
              </label>
              <div className="text-sm text-muted">
                {query.data.private
                  ? t("projectSettings.visibilityPrivate")
                  : t("projectSettings.visibilityPublic")}
              </div>
              <Feedback error={save.error} />
              {save.isSuccess && (
                <p className="form-success" role="status">
                  {t("projectSettings.saved")}
                </p>
              )}
              <div>
                <button className="button primary" disabled={save.isPending}>
                  {t("shared.saveChanges")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
interface Release extends ReleaseMetadataData {
  body_html?: string;
  id: number;
  name: string;
  tag_name: string;
  body: string;
  draft: boolean;
  hide_archive_links: boolean;
  prerelease: boolean;
  published_at: string;
  tarball_url: string;
  zipball_url: string;
  assets: {
    id: number;
    name: string;
    browser_download_url: string;
    download_count?: number;
  }[];
}
export function ReleasesPage() {
  const { t } = useTranslation("workspace");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") || "";
  const query = useQuery({
    queryKey: ["releases", path, page, q],
    queryFn: ({ signal }) =>
      nativePage<{ items: Release[]; total: number; can_create: boolean }>(
        `${path}/releases?${new URLSearchParams({ page: String(page), limit: "10", q })}`,
        signal,
      ),
  });
  useTitle(t("releases.documentTitle", { name: repository.name }));
  return (
    <>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("releases.title")}</h1>
        <div className={actionsClass}>
          <Link className="button" to="latest">
            {t("releases.latest")}
          </Link>
          {query.data?.can_create && (
            <Link className="button primary" to="new">
              <Plus size={15} />
              {t("releases.new")}
            </Link>
          )}
        </div>
      </div>
      <div className="tabs">
        <span className="active">{t("releases.title")}</span>
        <Link to={`/projects${path}/tags`}>{t("releases.tags")}</Link>
        <a className="ml-auto" href={native(`${path}/releases.rss`)}>
          {t("releases.feed")}
        </a>
      </div>
      <form
        className={listToolbarClass}
        onSubmit={(e) => {
          e.preventDefault();
          setParams({
            q: String(new FormData(e.currentTarget).get("q") || ""),
          });
        }}
      >
        <label className="filter-input w-auto min-w-0 flex-1">
          <Search size={16} />
          <input
            aria-label={t("releases.search")}
            name="q"
            defaultValue={q}
            placeholder={t("releases.searchPlaceholder")}
          />
        </label>
        <button className="button">{t("shared.search")}</button>
      </form>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        query.data.items.map((release) => (
          <article
            className="release-entry grid grid-cols-[160px_minmax(0,1fr)] gap-8 border-t border-line py-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6"
            key={release.id}
          >
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <Tag size={16} />
                {release.tag_name}
              </span>
              <p className="mt-2 text-xs text-muted">
                {relativeDate(release.published_at)}
              </p>
              {release.draft && (
                <span className="badge">{t("releases.draft")}</span>
              )}
              {release.prerelease && (
                <span className="badge">{t("releases.prerelease")}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2>
                  <Link
                    to={`/projects${path}/releases/tag/${encodeURIComponent(release.tag_name)}`}
                  >
                    {release.name || release.tag_name}
                  </Link>
                </h2>
                {query.data?.can_create && (
                  <Link
                    className="button"
                    to={`/projects${path}/releases/edit/${encodeURIComponent(release.tag_name)}`}
                  >
                    {t("shared.edit")}
                  </Link>
                )}
              </div>
              <ReleaseMetadata release={release} path={path} />
              <Markdown
                html={release.body_html}
                basePath={`${path}/src/tag/${encodeURIComponent(release.tag_name)}/`}
              >
                {release.body || t("releases.noNotes")}
              </Markdown>
              <details className="mt-6 border-t border-line pt-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  {t("releases.assets")}
                </summary>
                <div className={`mt-3 ${actionsClass}`}>
                  {!release.hide_archive_links && release.zipball_url && (
                    <a className="button" href={release.zipball_url}>
                      {t("releases.sourceZip")} ·{" "}
                      {t("releases.downloads", {
                        count: release.archive_download_count?.zip || 0,
                      })}
                    </a>
                  )}
                  {!release.hide_archive_links && release.tarball_url && (
                    <a className="button" href={release.tarball_url}>
                      {t("releases.sourceTarGz")} ·{" "}
                      {t("releases.downloads", {
                        count: release.archive_download_count?.tar_gz || 0,
                      })}
                    </a>
                  )}
                  {release.assets?.map((asset) => (
                    <a
                      className="button"
                      key={asset.id}
                      href={asset.browser_download_url}
                    >
                      {asset.name} ·{" "}
                      {t("releases.downloads", {
                        count: asset.download_count || 0,
                      })}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          </article>
        ))
      ) : (
        <EmptyState
          title={q ? t("releases.noMatches") : t("releases.empty")}
          icon={<Tag size={34} />}
        >
          {t("releases.emptyHint")}
        </EmptyState>
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={10}
          onPage={(p) => setParams({ q, page: String(p) })}
        />
      )}
    </>
  );
}
export function NewReleasePage() {
  const { t } = useTranslation("workspace");
  const { path, repository } = useOutletContext<RepoContext>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const result = await nativeForm(
        `${path}/releases/new`,
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      );
      if (!result.redirect) throw new Error(t("releases.notCreated"));
      await client.invalidateQueries({ queryKey: ["releases", path] });
      navigate(`/projects${path}/releases`);
    },
  });
  useTitle(t("releases.new"));
  return (
    <>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("releases.new")}</h1>
      </div>
      <form
        className="workspace-form max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(e.currentTarget);
        }}
      >
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr]">
          <label>
            {t("releases.tagName")}
            <input required name="tag_name" placeholder="v1.0.0" />
          </label>
          <label>
            {t("releases.target")}
            <input
              required
              name="tag_target"
              defaultValue={repository.default_branch}
            />
          </label>
        </div>
        <label>
          {t("releases.releaseTitle")}
          <input
            name="title"
            placeholder={t("releases.releaseTitlePlaceholder")}
          />
        </label>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          label={t("releases.notes")}
        />
        <label className="check-field">
          <input name="prerelease" type="checkbox" value="on" />
          {t("releases.isPrerelease")}
        </label>
        <label className="check-field">
          <input name="draft" type="checkbox" value="true" />
          {t("releases.saveDraft")}
        </label>
        <Feedback error={create.error} />
        <div className={actionsClass}>
          <button className="button primary" disabled={create.isPending}>
            {t("releases.create")}
          </button>
          <Link className="button" to=".." relative="path">
            {t("shared.cancel")}
          </Link>
        </div>
      </form>
    </>
  );
}
interface Wiki {
  empty?: boolean;
  title: string;
  content: string;
  content_html?: string;
  sidebar_html?: string;
  footer_html?: string;
  toc_html?: string;
  author?: { Name: string; When: string };
  revisions?: number;
  pages: { Name: string; SubURL: string; UpdatedUnix?: number }[];
  can_write: boolean;
}
export function WikiPage() {
  const [filter, setFilter] = useState("");
  const { t, i18n } = useTranslation("workspace");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const pageName = params.get("page") || "";
  const mode = params.get("action") || "";
  const revision = params.get("revision") || "";
  const endpoint = `${path}/wiki/${wikiPath(pageName)}`;
  const query = useQuery({
    queryKey: ["wiki", path, pageName, revision, mode === "pages"],
    queryFn: async ({ signal }) => {
      if (mode === "pages")
        return nativePage<Wiki>(`${path}/wiki/?action=_pages`, signal);
      const { data } = await request<Wiki & { redirect?: string }>(
        endpoint +
          (revision ? `?revision=${encodeURIComponent(revision)}` : ""),
        { signal, headers: { "X-Forgejo-UI": "1" } },
      );
      if (data.redirect) {
        const target = new URL(data.redirect, location.origin);
        if (target.searchParams.get("action") === "_pages")
          return nativePage<Wiki>(`${path}/wiki/?action=_pages`, signal);
        throw new Error(t("wiki.unavailable"));
      }
      return data;
    },
  });
  const pageList = useQuery({
    queryKey: ["wiki-pages", path],
    queryFn: ({ signal }) =>
      nativePage<Pick<Wiki, "pages">>(`${path}/wiki/?action=_pages`, signal),
    enabled: !mode,
  });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const result = await nativeForm(endpoint, {
        ...(Object.fromEntries(new FormData(form)) as Record<string, string>),
        action: mode === "new" ? "_new" : "_edit",
      });
      if (!result.redirect) throw new Error(t("wiki.notSaved"));
      await client.invalidateQueries({ queryKey: ["wiki", path] });
      await client.invalidateQueries({ queryKey: ["wiki-pages", path] });
      const target =
        new URL(result.redirect, location.origin).pathname.split("/wiki/")[1] ||
        "Home";
      setParams({ page: target });
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      await nativeForm(endpoint, { action: "_delete" });
      await client.invalidateQueries({ queryKey: ["wiki", path] });
      await client.invalidateQueries({ queryKey: ["wiki-pages", path] });
      setParams({});
    },
  });
  useTitle(t("wiki.documentTitle", { name: repository.name }));
  if (mode === "pages")
    return (
      <>
        <div className={pageHeadingClass}>
          <h1 className={headingTitleClass}>{t("wiki.pages")}</h1>
          {query.data?.can_write && (
            <button
              type="button"
              className="button primary"
              onClick={() => setParams({ action: "new" })}
            >
              {t("wiki.newPage")}
            </button>
          )}
        </div>
        <Feedback error={query.error} />
        <input
          className="filter-input mb-4 w-full min-w-0"
          aria-label={t("wiki.filterPages")}
          placeholder={t("wiki.filterPages")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {query.isPending ? (
          <Pending />
        ) : (
          <div className="border-t border-line">
            {query.data?.pages
              ?.filter((item) =>
                item.Name.toLocaleLowerCase(i18n.language).includes(
                  filter.toLocaleLowerCase(i18n.language),
                ),
              )
              .map((item) => (
                <Link
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3"
                  key={item.SubURL}
                  to={
                    "?" +
                    new URLSearchParams({
                      page: item.SubURL,
                    })
                  }
                >
                  <span className="min-w-0 wrap-anywhere">{item.Name}</span>
                  {!!item.UpdatedUnix && (
                    <time
                      className="text-sm text-muted"
                      dateTime={new Date(item.UpdatedUnix * 1000).toISOString()}
                    >
                      {new Date(item.UpdatedUnix * 1000).toLocaleDateString(
                        i18n.language,
                      )}
                    </time>
                  )}
                </Link>
              ))}
            {!query.data?.pages?.length && (
              <EmptyState
                title={t("wiki.emptyTitle")}
                icon={<BookOpen size={34} />}
              >
                {t("wiki.emptyText")}
              </EmptyState>
            )}
          </div>
        )}
      </>
    );
  return (
    <>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>
          {mode === "new"
            ? t("wiki.newTitle")
            : mode === "edit"
              ? t("wiki.editTitle")
              : t("wiki.title")}
        </h1>
        {query.data && !mode && !revision && (
          <div className={actionsClass}>
            {!query.data.empty && query.data.can_write && (
              <button
                className="button"
                onClick={() => setParams({ page: pageName, action: "edit" })}
              >
                {t("shared.edit")}
              </button>
            )}
            <WikiPageActions
              page={pageName || "Home"}
              canWrite={query.data.can_write}
              onDelete={() => {
                if (
                  window.confirm(
                    t("wiki.confirmDelete", { title: query.data.title }),
                  )
                )
                  remove.mutate();
              }}
            />
            {query.data.can_write && (
              <button
                className="button primary"
                onClick={() => setParams({ page: pageName, action: "new" })}
              >
                <Plus size={15} />
                {t("wiki.newPage")}
              </button>
            )}
          </div>
        )}
      </div>
      <Feedback error={query.error || remove.error} />
      {revision && (
        <p className="mb-4 rounded border border-line p-3">
          <Trans
            t={t}
            i18nKey="wiki.viewingRevision"
            components={{
              revision: <code>{revision.slice(0, 8)}</code>,
              anchor: (
                <Link
                  className="text-primary"
                  to={`?${new URLSearchParams({ page: pageName })}`}
                />
              ),
            }}
          />
        </p>
      )}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <div className="wiki-layout grid grid-cols-[minmax(0,1fr)_220px] gap-8 border-t border-line pt-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6">
            <div className="min-w-0">
              {mode && query.data.can_write ? (
                <WikiEditor
                  key={`${pageName}:${mode}`}
                  page={query.data}
                  create={mode === "new"}
                  saving={save.isPending}
                  error={save.error}
                  onSave={(form) => save.mutate(form)}
                  onCancel={() => setParams(pageName ? { page: pageName } : {})}
                />
              ) : query.data.empty ? (
                <EmptyState
                  title={t("wiki.emptyTitle")}
                  icon={<BookOpen size={34} />}
                >
                  {t("wiki.emptyText")}
                </EmptyState>
              ) : (
                <>
                  <h2 className="mb-5 border-b border-line pb-4 text-2xl">
                    {query.data.title}
                  </h2>
                  {query.data.author && (
                    <p className="mb-4 text-sm text-muted">
                      {t("wiki.edited", {
                        name: query.data.author.Name,
                        date: relativeDate(query.data.author.When),
                        count: query.data.revisions || 0,
                      })}
                    </p>
                  )}
                  <Markdown
                    html={query.data.content_html}
                    basePath={`${path}/wiki/`}
                  >
                    {query.data.content}
                  </Markdown>
                  {query.data.footer_html && (
                    <footer className="mt-6 border-t border-line pt-4">
                      <Markdown
                        html={query.data.footer_html}
                        basePath={`${path}/wiki/`}
                      >
                        {""}
                      </Markdown>
                    </footer>
                  )}
                </>
              )}
            </div>
            <aside className="border-l border-line pl-5 max-md:border-l-0 max-md:pl-0">
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("wiki.clone")}
                </summary>
                <input
                  className="mt-2 w-full rounded border border-input p-2 text-xs"
                  readOnly
                  aria-label={t("wiki.clone")}
                  value={
                    new URL(native(`${path}.wiki.git`), location.origin).href
                  }
                />
              </details>
              {query.data.sidebar_html && (
                <Markdown
                  html={query.data.sidebar_html}
                  basePath={`${path}/wiki/`}
                >
                  {""}
                </Markdown>
              )}
              {query.data.toc_html && (
                <details open className="my-4">
                  <summary>{t("wiki.contents")}</summary>
                  <Markdown
                    html={wikiTocBody(query.data.toc_html)}
                    basePath={`${path}/wiki/`}
                  >
                    {""}
                  </Markdown>
                </details>
              )}
              <h3 className="mb-3 text-sm">{t("wiki.pages")}</h3>
              <input
                className="mb-3 w-full rounded border border-input p-2 text-sm"
                aria-label={t("wiki.filterPages")}
                placeholder={t("wiki.filterPages")}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              {(pageList.data?.pages || query.data.pages)
                ?.filter((item) =>
                  item.Name.toLocaleLowerCase(i18n.language).includes(
                    filter.toLocaleLowerCase(i18n.language),
                  ),
                )
                .map((p) => (
                  <button
                    className={
                      p.SubURL === pageName || p.Name === query.data?.title
                        ? "flex w-full items-center gap-2 rounded bg-[#e9e5f5] px-2 py-2 text-left text-sm font-semibold dark:bg-hover dark:text-ink"
                        : "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-[#f5f5f5] dark:hover:bg-hover"
                    }
                    key={p.SubURL}
                    onClick={() => setParams({ page: p.SubURL })}
                  >
                    <FileIcon />
                    <span>
                      {p.Name}
                      {!!p.UpdatedUnix && (
                        <small className="block text-muted">
                          {new Date(p.UpdatedUnix * 1000).toLocaleDateString(
                            i18n.language,
                          )}
                        </small>
                      )}
                    </span>
                  </button>
                ))}
            </aside>
          </div>
        )
      )}
    </>
  );
}
function FileIcon() {
  return <BookOpen size={14} />;
}
function WikiEditor({
  page,
  create,
  saving,
  error,
  onSave,
  onCancel,
}: {
  page: Wiki;
  create: boolean;
  saving: boolean;
  error: Error | null;
  onSave: (form: HTMLFormElement) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("workspace");
  const [body, setBody] = useState(create ? "" : page.content);
  return (
    <form
      className="workspace-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(e.currentTarget);
      }}
    >
      <label>
        {t("wiki.pageTitle")}
        <input
          name="title"
          required
          defaultValue={create ? (page.empty ? "Home" : "") : page.title}
        />
      </label>
      <MarkdownEditor
        value={body}
        onChange={setBody}
        label={t("wiki.pageContent")}
        rows={14}
      />
      <label>
        {t("wiki.commitMessage")}
        <input
          name="message"
          placeholder={t("wiki.commitMessagePlaceholder")}
        />
      </label>
      <Feedback error={error} />
      <div className={actionsClass}>
        <button className="button primary" disabled={saving}>
          {t("wiki.save")}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {t("shared.cancel")}
        </button>
      </div>
    </form>
  );
}
interface Notification {
  id: number;
  unread: boolean;
  pinned: boolean;
  repository: { full_name: string };
  subject: { title: string; html_url: string; type: string };
  updated_at: string;
}
export function NotificationsPage({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "unread",
    page = Math.max(1, Number(params.get("page")) || 1);
  const query = useQuery({
    queryKey: ["notifications", q, page],
    queryFn: ({ signal }) =>
      nativePage<{ items: Notification[]; total: number }>(
        `/notifications?${new URLSearchParams({ q, page: String(page) })}`,
        signal,
      ),
    enabled: !!bootstrap.user,
  });
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: async ({ id, status }: { id?: number; status?: string }) => {
      await nativeForm(
        id ? "/notifications/status" : "/notifications/purge",
        id ? { notification_id: String(id), status: status! } : {},
      );
      await client.invalidateQueries({ queryKey: ["notifications"] });
      await client.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });
  useTitle(t("shared.notifications"));
  if (!bootstrap.user) return <Navigate to="/login" replace />;
  return (
    <section className={pageClass}>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("shared.notifications")}</h1>
        <button
          className="button"
          disabled={
            !query.data?.items.some((i) => i.unread) || update.isPending
          }
          onClick={() => update.mutate({})}
        >
          <CheckCheck size={15} />
          {t("notifications.markAllRead")}
        </button>
      </div>
      <NotificationTabs active="" />
      <div
        className="tabs"
        role="tablist"
        aria-label={t("notifications.stateTabs")}
      >
        {["unread", "read"].map((state) => (
          <button
            role="tab"
            aria-selected={q === state}
            className={q === state ? "active" : ""}
            key={state}
            onClick={() => setParams({ q: state })}
          >
            {state === "unread"
              ? t("notifications.unread")
              : t("notifications.read")}
          </button>
        ))}
      </div>
      <Feedback error={query.error || update.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div>
          {query.data.items.map((item) => (
            <article
              className="notification-row flex items-start gap-4 border-b border-line px-3 py-4 text-sm max-md:flex-wrap"
              key={item.id}
            >
              <Bell size={17} />
              <Link
                className="min-w-0 flex-1"
                to={uiRoute(item.subject.html_url)}
              >
                <strong>{item.subject.title}</strong>
                <p className="text-xs text-muted mt-1">
                  {item.repository.full_name} · {relativeDate(item.updated_at)}
                </p>
              </Link>
              <button
                className="button"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    id: item.id,
                    status: item.pinned ? "unread" : "pinned",
                  })
                }
              >
                {item.pinned
                  ? t("notifications.unpin")
                  : t("notifications.pin")}
              </button>
              <button
                className="button"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    id: item.id,
                    status: item.unread ? "read" : "unread",
                  })
                }
              >
                {item.unread
                  ? t("notifications.markRead")
                  : t("notifications.markUnread")}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={t("notifications.emptyTitle")}
          icon={<Bell size={34} />}
        >
          {q === "unread"
            ? t("notifications.emptyUnread")
            : q === "read"
              ? t("notifications.emptyRead")
              : t("notifications.emptyOther", { state: q })}
        </EmptyState>
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={20}
          onPage={(p) => setParams({ q, page: String(p) })}
        />
      )}
    </section>
  );
}
interface Pipeline {
  trigger: string;
  actor: string;
  actor_link: string;
  branch: string;
  branch_link: string;
  ref_deleted: boolean;
  duration: string;
  prioritized: boolean;
  can_prioritize: boolean;
  id: number;
  index: number;
  title: string;
  workflow: string;
  ref: string;
  sha: string;
  status: string;
  created_at: string;
  link: string;
}
export function PipelinesPage() {
  const { t } = useTranslation("workspace");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1),
    workflow = params.get("workflow") || "",
    actor = params.get("actor") || "0",
    status = params.get("status") || "0";
  const filter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value && value !== "0") next.set(name, value);
    else next.delete(name);
    setParams(next);
  };
  const query = useQuery({
    queryKey: ["pipelines", path, page, workflow, actor, status],
    queryFn: ({ signal }) =>
      nativePage<WorkflowData & { items: Pipeline[]; total: number }>(
        `${path}/actions?${new URLSearchParams({ page: String(page), workflow, actor, status, limit: "30" })}`,
        signal,
      ),
    refetchInterval: 15000,
  });
  const priority = useMutation({
    mutationFn: async (run: Pipeline) => {
      await nativeForm(
        `${run.link}/${run.prioritized ? "deprioritize" : "prioritize"}`,
        Object.fromEntries(params),
      );
      await query.refetch();
    },
  });
  const toggleWorkflow = useMutation({
    mutationFn: async () => {
      await nativeForm(
        `${path}/actions/${query.data?.disabled ? "enable" : "disable"}`,
        { workflow },
      );
      await query.refetch();
    },
  });
  useTitle(t("pipelines.documentTitle", { name: repository.name }));
  return (
    <>
      <div className={pipelineHeadingClass}>
        <h1 className={headingTitleClass}>{t("pipelines.title")}</h1>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:justify-start">
          {!!query.data?.total && (
            <a
              className="button"
              href={native(
                `${path}/actions/${workflow ? `workflows/${encodeURIComponent(workflow)}/` : ""}runs/latest`,
              )}
            >
              {t("pipelines.latest")}
            </a>
          )}
          {query.data?.can_run && (
            <Link
              className="button primary"
              to={`new${workflow ? `?workflow=${encodeURIComponent(workflow)}` : ""}`}
            >
              {t("pipelines.run")}
            </Link>
          )}
          {query.data?.can_toggle && (
            <button
              className="button"
              onClick={() => toggleWorkflow.mutate()}
              disabled={toggleWorkflow.isPending}
            >
              {query.data.disabled
                ? t("pipelines.enableWorkflow")
                : t("pipelines.disableWorkflow")}
            </button>
          )}
          <Link className="button" to="..">
            <GitBranch size={15} />
            {t("pipelines.repository")}
          </Link>
        </div>
      </div>
      {query.data?.warnings?.map((warning, index) => (
        <p
          role="status"
          className="my-3 rounded border border-line bg-info-bg p-3 text-sm"
          key={index}
        >
          {warning}
        </p>
      ))}
      <Feedback error={priority.error} />
      <div className="tabs">
        <span className="active flex min-h-12 items-center gap-2 border-b-2 border-b-[#28272d] px-4 py-3 text-sm font-semibold dark:border-b-ink">
          {t("pipelines.all")}{" "}
          {query.data && <span className="counter">{query.data.total}</span>}
        </span>
      </div>
      <div className="my-4 flex flex-wrap items-center justify-start gap-3 max-md:gap-2">
        <SelectControl
          label={t("pipelines.workflow")}
          searchable
          value={workflow}
          onValueChange={(value) => filter("workflow", value)}
          options={[
            { value: "", label: t("pipelines.allWorkflows") },
            ...(query.data?.workflows ?? []).map((value) => ({
              value,
              label: value,
            })),
          ]}
        />
        <SelectControl
          label={t("pipelines.statusFilter")}
          value={status}
          onValueChange={(value) => filter("status", value)}
          options={[
            { value: "0", label: t("pipelines.allStatuses") },
            ...(
              [
                "success",
                "failure",
                "cancelled",
                "skipped",
                "waiting",
                "running",
                "blocked",
              ] as const
            ).map((value, index) => ({
              value: String(index + 1),
              label: t(`pipelines.statusOption.${value}`),
            })),
          ]}
        />
        <SelectControl
          label={t("pipelines.triggeredBy")}
          searchable
          value={actor}
          onValueChange={(value) => filter("actor", value)}
          options={[
            { value: "0", label: t("pipelines.allUsers") },
            ...(query.data?.actors || []).map((user) => ({
              value: String(user.id),
              label: user.full_name || user.name,
              description: `@${user.name}`,
            })),
          ]}
        />
      </div>
      <Feedback error={query.error || toggleWorkflow.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div>
          {query.data.items.map((run) => (
            <article
              className="pipeline-row flex items-center gap-4 border-b border-line px-3 py-4 text-sm hover:bg-[#fafafa] max-md:flex-wrap dark:hover:bg-hover"
              key={run.id}
            >
              <span className={pipelineBadgeClass(run.status)}>
                {statusLabel(t, run.status)}
              </span>
              <div className="min-w-0 flex-1 max-md:basis-[calc(100%-100px)]">
                <Link
                  className="font-semibold text-primary"
                  to={uiRoute(run.link)}
                >
                  {run.title}
                </Link>
                {run.prioritized && (
                  <span className="badge ml-2">
                    {t("pipeline.prioritized")}
                  </span>
                )}
                <p className="mt-2 text-xs text-muted">
                  {run.trigger} ·{" "}
                  <Link className="text-primary" to={uiRoute(run.actor_link)}>
                    {run.actor}
                  </Link>
                </p>
                <p className="text-xs text-muted mt-2">
                  #{run.index} · {run.workflow}
                </p>
              </div>
              <span className="text-xs text-muted flex items-center gap-2">
                <GitCommitHorizontal size={14} />
                {run.sha.slice(0, 8)}
              </span>
              <div className="text-xs text-muted">
                <Link
                  className={run.ref_deleted ? "line-through" : "text-primary"}
                  to={uiRoute(run.branch_link)}
                >
                  {run.branch}
                </Link>
                <p className="mt-2">
                  {relativeDate(run.created_at)} · {run.duration}
                </p>
              </div>
              {run.can_prioritize && (
                <button
                  className="button"
                  disabled={priority.isPending}
                  onClick={() => priority.mutate(run)}
                >
                  {t(
                    run.prioritized
                      ? "pipeline.removePriority"
                      : "pipeline.prioritize",
                  )}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            actor !== "0" || status !== "0"
              ? t("pipelines.noMatches")
              : t("pipelines.empty")
          }
          icon={<Play size={34} />}
        >
          {actor !== "0" || status !== "0" ? (
            t("pipelines.noMatchesHint")
          ) : (
            <Trans
              t={t}
              i18nKey="pipelines.emptyHint"
              components={{ path: <code>.forgejo/workflows/</code> }}
            />
          )}
        </EmptyState>
      )}
      {query.data && (
        <Pagination
          total={query.data.total}
          page={page}
          size={30}
          onPage={(p) =>
            setParams({ workflow, actor, status, page: String(p) })
          }
        />
      )}
    </>
  );
}

interface RunView {
  attemptNumber?: number;
  state: {
    run: {
      workflowName?: string;
      workflowURL?: string;
      workflowSourceURL?: string;
      description?: string;
      title: string;
      status: string;
      done: boolean;
      canCancel: boolean;
      canApprove: boolean;
      canRerun: boolean;
      canPrioritize: boolean;
      prioritized: boolean;
      canDelete: boolean;
      canDeleteArtifact: boolean;
      jobs: {
        id: number;
        name: string;
        status: string;
        duration: string;
        canRerun: boolean;
      }[];
      commit: { shortSHA: string; branch: { name: string; link: string } };
      preExecutionError?: string;
      preExecutionWarnings?: string[];
    };
    currentJob: {
      details?: string[];
      title: string;
      allAttempts?: { number: number; status: string }[];
      steps: { summary: string; duration: string; status: string }[];
    };
  };
  logs: {
    stepsLog: {
      step: number;
      lines: { index: number; message: string; timestamp?: number }[];
    }[];
  };
}
export function PipelinePage() {
  const { t } = useTranslation("workspace");
  const { path } = useOutletContext<RepoContext>();
  const navigate = useNavigate();
  const { run = "", job = "0", attempt } = useParams();
  const [openSteps, setOpenSteps] = useState<number[]>(() => {
    const match = /^#jobstep-(\d+)-/.exec(location.hash);
    return match ? [Number(match[1])] : [];
  });
  const [timestamps, setTimestamps] = useState(false),
    [seconds, setSeconds] = useState(false),
    [fullScreen, setFullScreen] = useState(false);
  const endpoint = `${path}/actions/runs/${encodeURIComponent(run)}/jobs/${encodeURIComponent(job)}${attempt ? `/attempt/${encodeURIComponent(attempt)}` : ""}`;
  const query = useQuery({
    queryKey: ["pipeline", endpoint, openSteps],
    queryFn: async () => {
      const body = {
        logCursors: openSteps.map((step) => ({
          step,
          cursor: 0,
          expanded: true,
        })),
      };
      const data = await post<RunView>(endpoint, body);
      const currentAttempt = attempt
        ? Number(attempt)
        : Math.max(
            1,
            ...(data.state.currentJob.allAttempts || []).map(
              (item) => item.number,
            ),
          );
      const selected = attempt
        ? data
        : await post<RunView>(`${endpoint}/attempt/${currentAttempt}`, body);
      return { ...selected, attemptNumber: currentAttempt };
    },
    refetchInterval: (q) => (q.state.data?.state.run.done ? false : 5000),
  });
  const client = useQueryClient();
  const action = useMutation({
    mutationFn: async (name: string) => {
      await nativeForm(
        `${path}/actions/runs/${encodeURIComponent(run)}/${name}`,
        {},
      );
      await client.invalidateQueries({ queryKey: ["pipeline"] });
      if (name === "delete") navigate(`/projects${path}/actions`);
      else if (attempt && name.includes("rerun"))
        navigate(`/projects${path}/actions/runs/${run}/jobs/${job}`);
    },
  });
  useTitle(t("pipeline.title", { run }));
  const data = query.data?.state;
  return (
    <>
      <div className={pipelineHeadingClass}>
        <h1 className={headingTitleClass}>{t("pipeline.title", { run })}</h1>
        <Link className="button" to={`/projects${path}/actions`}>
          {t("pipelines.all")}
        </Link>
      </div>
      <Feedback error={query.error || action.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        data && (
          <>
            <div className="pipeline-summary mb-6 flex items-center gap-4 border-y border-line py-5 max-md:flex-wrap">
              <span className={pipelineBadgeClass(data.run.status)}>
                {statusLabel(t, data.run.status)}
              </span>
              <div className="flex-1 max-md:min-w-0 max-md:basis-[calc(100%-100px)]">
                <h2 className="text-base">{data.run.title}</h2>
                <p className="text-xs text-muted mt-2">
                  {data.run.commit.shortSHA} ·{" "}
                  <Link
                    className="text-primary"
                    to={uiRoute(data.run.commit.branch.link)}
                  >
                    {data.run.commit.branch.name}
                  </Link>
                </p>
              </div>
              {data.run.canApprove && (
                <Link
                  className="button primary"
                  to={`${uiRoute(data.run.commit.branch.link)}#pull-request-trust-panel`}
                >
                  {t("pipeline.reviewApproval")}
                </Link>
              )}
              {data.run.canPrioritize && (
                <button
                  className="button"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      data.run.prioritized ? "deprioritize" : "prioritize",
                    )
                  }
                >
                  {data.run.prioritized
                    ? t("pipeline.removePriority")
                    : t("pipeline.prioritize")}
                </button>
              )}
              {data.run.canCancel && (
                <button
                  className="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("cancel")}
                >
                  {t("pipeline.cancel")}
                </button>
              )}
              {data.run.canDelete && (
                <button
                  className="button"
                  onClick={() => {
                    if (window.confirm(t("pipeline.confirmDelete", { run })))
                      action.mutate("delete");
                  }}
                >
                  {t("shared.delete")}
                </button>
              )}
              {data.run.canRerun && (
                <button
                  className="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("rerun")}
                >
                  {t("pipeline.retry")}
                </button>
              )}
            </div>
            <div className="my-4 flex flex-wrap gap-3 text-sm">
              {data.run.workflowSourceURL && (
                <Link
                  className="text-primary"
                  to={uiRoute(data.run.workflowSourceURL)}
                >
                  {data.run.workflowName}
                </Link>
              )}
              {data.run.workflowURL && (
                <Link
                  className="text-primary"
                  to={uiRoute(data.run.workflowURL)}
                >
                  {t("pipeline.workflowRuns")}
                </Link>
              )}
              {data.run.description && (
                <Markdown html={data.run.description}>{""}</Markdown>
              )}
            </div>
            {data.run.preExecutionError && (
              <p className="form-error">
                {data.run.preExecutionError.replace(/<[^>]*>/g, "")}
              </p>
            )}
            {data.run.preExecutionWarnings?.map((warning, index) => (
              <p
                className="my-3 rounded border border-[#c99b36] bg-[color-mix(in_srgb,#d99530_10%,var(--ui-surface))] p-3 text-sm"
                role="status"
                key={index}
              >
                {warning.replace(/<[^>]*>/g, "")}
              </p>
            ))}
            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-6 max-md:grid-cols-[minmax(0,1fr)]">
              <aside className="pipeline-jobs border-r border-line pr-4 max-md:border-r-0 max-md:pr-0">
                <h3 className="mb-4 text-sm">{t("pipeline.jobs")}</h3>
                {data.run.jobs.map((item, i) => (
                  <Link
                    key={item.id}
                    className={
                      String(i) === job
                        ? "my-1 flex items-center gap-2 rounded bg-[#e9e5f5] px-2 py-2 text-sm dark:bg-hover dark:text-ink"
                        : "my-1 flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-[#f5f5f5] dark:hover:bg-hover"
                    }
                    to={`/projects${path}/actions/runs/${run}/jobs/${i}`}
                  >
                    <span className={statusIndicatorClass(item.status)} />
                    <span>{item.name}</span>
                    <small className="ml-auto text-xs text-muted">
                      {item.duration}
                    </small>
                  </Link>
                ))}
              </aside>
              <section
                className={
                  fullScreen
                    ? "fixed inset-0 z-50 overflow-auto bg-surface p-4"
                    : "min-w-0"
                }
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2>{data.currentJob.title}</h2>
                  {data.currentJob.allAttempts &&
                    data.currentJob.allAttempts.length > 1 && (
                      <SelectControl
                        label={t("pipeline.attempt")}
                        value={
                          attempt || String(query.data?.attemptNumber || 1)
                        }
                        options={data.currentJob.allAttempts.map((a) => ({
                          value: String(a.number),
                          label: t("pipeline.attemptOption", {
                            number: a.number,
                            status: statusLabel(t, a.status),
                          }),
                        }))}
                        onValueChange={(v) =>
                          navigate(
                            `/projects${path}/actions/runs/${run}/jobs/${job}/attempt/${v}`,
                          )
                        }
                      />
                    )}
                  <a
                    className="button ml-auto"
                    href={native(
                      `${path}/actions/runs/${run}/jobs/${job}/attempt/${attempt || query.data?.attemptNumber || 1}/logs`,
                    )}
                  >
                    {t("pipeline.downloadLog")}
                  </a>
                  {data.run.jobs[Number(job)]?.canRerun && (
                    <button
                      className="button"
                      disabled={action.isPending}
                      onClick={() => action.mutate(`jobs/${job}/rerun`)}
                    >
                      {t("pipeline.retryJob")}
                    </button>
                  )}
                </div>
                <div className="my-3 flex flex-wrap gap-3 text-sm">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={timestamps}
                      onChange={(event) => setTimestamps(event.target.checked)}
                    />
                    {t("pipeline.timestamps")}
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={seconds}
                      onChange={(event) => setSeconds(event.target.checked)}
                    />
                    {t("pipeline.seconds")}
                  </label>
                  <button
                    className="button"
                    onClick={() => setFullScreen(!fullScreen)}
                  >
                    {t(
                      fullScreen
                        ? "pipeline.exitFullScreen"
                        : "pipeline.fullScreen",
                    )}
                  </button>
                </div>
                {data.currentJob.details?.map((detail, index) => (
                  <div
                    key={index}
                    className="my-3 rounded border border-line bg-info-bg p-3"
                  >
                    <Markdown html={detail}>{""}</Markdown>
                  </div>
                ))}
                {data.currentJob.steps?.length ? (
                  data.currentJob.steps.map((step, i) => (
                    <div
                      className="mb-2 overflow-hidden rounded border border-line"
                      key={i}
                    >
                      <button
                        className="flex w-full items-center gap-3 bg-[#fafafa] px-4 py-3 text-left text-sm dark:bg-surface-subtle"
                        onClick={() =>
                          setOpenSteps(
                            openSteps.includes(i)
                              ? openSteps.filter((step) => step !== i)
                              : [...openSteps, i],
                          )
                        }
                        aria-expanded={openSteps.includes(i)}
                      >
                        <span className={statusIndicatorClass(step.status)} />
                        <strong>{step.summary}</strong>
                        <span className="ml-auto text-xs">{step.duration}</span>
                      </button>
                      {openSteps.includes(i) && (
                        <PipelineLogs
                          step={i}
                          lines={
                            query.data?.logs.stepsLog?.find(
                              (item) => item.step === i,
                            )?.lines || []
                          }
                          timestamps={timestamps}
                          seconds={seconds}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <EmptyState title={t("pipeline.waitingTitle")}>
                    {t("pipeline.waitingText")}
                  </EmptyState>
                )}
              </section>
            </div>
            <PipelineArtifacts
              run={run}
              canDelete={data.run.canDeleteArtifact}
              done={data.run.done}
            />
          </>
        )
      )}
    </>
  );
}

import { WorkspacePeopleSort } from "./WorkspacePeopleSort";
export function OrganizationsPage() {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1),
    q = params.get("q") || "";
  const query = useQuery({
    queryKey: ["organizations", params.toString()],
    queryFn: ({ signal }) =>
      nativePage<{
        items: {
          id: number;
          name: string;
          full_name: string;
          description: string;
        }[];
        total: number;
        page_size: number;
      }>(
        `/explore/organizations?${new URLSearchParams({ ...Object.fromEntries(params), q, page: String(page) })}`,
        signal,
      ),
  });
  useTitle(t("shared.organizations"));
  return (
    <section className={pageClass}>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("shared.organizations")}</h1>
      </div>
      <form
        className={listToolbarClass}
        onSubmit={(e) => {
          e.preventDefault();
          setParams({
            ...Object.fromEntries(params),
            page: "1",
            q: String(new FormData(e.currentTarget).get("q") || ""),
          });
        }}
      >
        <label className="filter-input w-auto min-w-0 flex-1">
          <Search size={16} />
          <input
            name="q"
            aria-label={t("organizations.search")}
            placeholder={t("organizations.searchPlaceholder")}
            defaultValue={q}
          />
        </label>
        <button className="button">{t("shared.search")}</button>
      </form>
      <WorkspacePeopleSort />
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div className="repo-list border-t border-line">
          {query.data.items.map((org) => (
            <Link
              className="repo-row flex min-h-16 items-center gap-2 border-b border-line px-4 py-3 hover:bg-[#fafafa] max-md:gap-3 dark:hover:bg-hover"
              key={org.id}
              to={`/organizations/${encodeURIComponent(org.name)}`}
            >
              <span
                className={`project-avatar color-${org.id % 5} size-8 rounded text-lg font-normal`}
              >
                {org.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="text-sm">{org.full_name || org.name}</strong>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {org.description || org.name}
                </p>
              </div>
              <span className="text-sm text-primary">
                {t("organizations.viewProjects")}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title={t("organizations.empty")}>
          {t("organizations.emptyText")}
        </EmptyState>
      )}
      {query.data && (
        <Pagination
          page={page}
          size={query.data.page_size}
          total={query.data.total}
          onPage={(p) => setParams({ q, page: String(p) })}
        />
      )}
    </section>
  );
}
export function ImportProjectPage({ bootstrap }: { bootstrap: Bootstrap }) {
  return <NativeImportProjectPage bootstrap={bootstrap} />;
}
