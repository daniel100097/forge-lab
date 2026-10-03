import { ProjectTopics } from "./ProjectTopics";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover } from "@base-ui/react/popover";
import { Menu } from "@base-ui/react/menu";
import { Trans, useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileText,
  Flag,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Globe,
  HardDrive,
  Link2,
  LockKeyhole,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  Rocket,
  Rss,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { get, native, nativeForm, nativePage, type Tree } from "./api";
import type { RepoContext } from "./App";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Markdown,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { FileIcon, FileTree } from "./RepositoryFiles";
import {
  ActionMenu,
  MenuDownload,
  MenuGroup,
  MenuLink,
  MenuSeparator,
} from "./ActionMenu";
import {
  RepositoryFinder,
  DelimitedPreview,
  MediaPreview,
  canPreviewMedia,
} from "./RepositoryPreviews";
import { RefSwitcher, escapeSegments, refKind } from "./RefSwitcher";
import {
  EscapeToggle,
  EscapeWarning,
  SourceView,
  copyText,
  sourceLines,
  useLineEscapes,
} from "./SourceView";
import { CitationOutput, useCitation } from "./Citation";
import {
  CodeSearchBar,
  EmptyRepositoryGuide,
  RecentBranches,
  RepositoryOrigin,
  WatchMenu,
  archiveUrl,
  commitAvatarClass,
  repositoryDetails,
  type RecentBranch,
  type RepositoryDetails,
} from "./CodeExtras";
import { uiRoute } from "./routes";

/** Buttons and selects in the project overview header area are compact. */
const overviewControlClass =
  "h-8 rounded-md px-2.5 dark:border-transparent dark:bg-[#48474d] dark:hover:bg-[#535258]";
const actionsClass = "flex flex-wrap items-center gap-2";
const infoSectionClass =
  "border-t border-line py-3 max-lg:max-w-sm [&_svg]:shrink-0 [&_svg]:text-muted";
const infoLinkClass =
  "flex w-full items-center gap-2 py-1 text-left hover:text-primary hover:underline";
const infoItemClass = "flex w-full items-center gap-2 py-1 text-left";
const fileActionClass =
  "button ml-0 flex min-h-8 items-center gap-1 px-2.5 py-1 whitespace-nowrap text-ink";
const viewOptionClass =
  "button m-0 min-h-8 rounded-none px-2.5 py-1 whitespace-nowrap text-ink first:rounded-l-md last:rounded-r-md aria-pressed:bg-hover aria-pressed:[box-shadow:inset_0_0_0_1px_var(--ui-button-border)]";
const counterLinkClass =
  "flex min-w-7 items-center justify-center border-l border-line px-2 text-sm hover:bg-hover dark:bg-[#48474d] dark:hover:bg-[#535258]";

interface ProjectOverview {
  topics: { name: string; count: number }[];
  avatar_url: string;
  created_at: string;
  size_bytes: number;
  branch_count: number;
  tag_count: number;
  commit_count: number;
  languages: { name: string; color: string; percentage: number }[];
  watching: boolean;
  watchers_count: number;
  watch_selection: { issues: boolean; pulls: boolean; releases: boolean };
  recent_branches?: RecentBranch[];
}

/** Tree data with the native file view details the overlay adds. */
interface TreeDetails extends Tree {
  ref_type?: "branch" | "tag" | "commit";
  readme?: string;
  size?: number;
  content_html?: string;
  converted?: boolean;
  executable?: boolean;
  symlink?: boolean;
  symlink_target?: string;
  language?: string;
  vendored?: boolean;
  generated?: boolean;
  image_size?: [number, number];
  citation?: boolean;
  file_error?: string;
  file_warning?: string;
  submodule_url?: string;
  tab_size?: number;
  lfs_lock?: { owner: string; mine: boolean; created_at: string };
  entries?: (NonNullable<Tree["entries"]>[number] & {
    symlink?: boolean;
    submodule?: { url: string; commit: string };
  })[];
}

/** One decimal place in the UI language, e.g. "45.3" or "45,3". */
function formatDecimal(value: number, language: string) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(value);
}

export function formatStorage(bytes: number, language: string) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${formatDecimal(bytes / 1024 ** unit, language)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}

export function CodePage() {
  const { t, i18n } = useTranslation("repository");
  const context = useOutletContext<RepoContext>();
  const { path, dataPath } = context;
  const r = repositoryDetails(context.repository);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const [finding, setFinding] = useState(false);
  const fileSearch = useRef<HTMLInputElement>(null);
  const ref = params.get("ref") ?? r.default_branch;
  const file = params.get("path") ?? "";
  const overview = file === "" && params.get("view") !== "files";
  const details = useQuery({
    queryKey: ["repo-overview", path],
    queryFn: ({ signal }) =>
      get<ProjectOverview>(`${dataPath}/overview`, signal),
    enabled: overview,
  });
  const releases = useQuery({
    queryKey: ["releases", path, "overview"],
    queryFn: ({ signal }) =>
      nativePage<{
        items: {
          name: string;
          tag_name: string;
          published_at: string;
          draft: boolean;
        }[];
        total: number;
      }>(`${path}/releases?page=1&limit=3`, signal),
    enabled: overview && !!r.units?.releases && !r.empty,
  });
  const client = useQueryClient();
  const percent = (value: number) =>
    t("shared.percent", { value: formatDecimal(value, i18n.language) });
  const languageShare = (language: { name: string; percentage: number }) =>
    t("code.sidebar.language", {
      name: language.name,
      percent: percent(language.percentage),
    });
  useTitle(t("code.documentTitle", { name: file || r.name }));
  const tree = useQuery({
    queryKey: ["tree", path, ref, file],
    queryFn: ({ signal }) =>
      get<TreeDetails>(
        `${dataPath}/tree?${new URLSearchParams({ ref, path: file })}`,
        signal,
      ),
    enabled: !!r.units?.code,
  });
  const directory = tree.data?.entries
    ? file
    : file.split("/").slice(0, -1).join("/");
  const readmeFile = tree.data?.entries ? tree.data.readme : undefined;
  const readme = useQuery({
    queryKey: ["tree", path, ref, readmeFile],
    queryFn: ({ signal }) =>
      get<TreeDetails>(
        `${dataPath}/tree?${new URLSearchParams({ ref, path: readmeFile! })}`,
        signal,
      ),
    enabled: !!readmeFile,
  });
  const branches = useQuery({
    queryKey: ["branches", path],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(`${path}/branches/list`, signal),
    enabled: !!r.units?.code && !r.empty,
  });
  const star = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/action/${r.starred ? "unstar" : "star"}`, {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["repo"] });
      await client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const go = (target: string) => {
    setParams({ ref, ...(target ? { path: target } : {}) });
    setFilter("");
    setFinding(false);
  };
  const refType =
    tree.data?.ref_type ??
    refKind(ref, { branches: branches.data?.results ?? [], tags: [] });
  const fileRowClass = overview
    ? "file-table-row grid min-h-10 w-full grid-cols-[minmax(140px,1fr)_minmax(100px,1.55fr)_110px] items-center gap-4 border-b border-line bg-surface px-4 py-2 text-left text-sm last:border-b-0 odd:bg-white hover:bg-hover dark:odd:bg-[#26252b] dark:hover:bg-hover max-xl:grid-cols-[minmax(100px,1fr)_minmax(60px,1fr)_90px] max-xl:gap-2 max-xl:px-3 max-md:grid-cols-[minmax(0,1fr)_90px] [&_svg]:shrink-0 [&_svg]:text-muted"
    : "file-table-row grid w-full grid-cols-[minmax(130px,1fr)_minmax(100px,1.5fr)_110px] items-center gap-4 border-b border-line px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-[#f5f5f5] dark:hover:bg-hover max-md:grid-cols-[minmax(0,1fr)_100px] max-md:gap-2 max-md:px-3 [&_svg]:shrink-0 [&_svg]:text-muted";
  if (!r.units?.code)
    return (
      <EmptyState title={t("code.disabled.title")}>
        {t("code.disabled.body")}
      </EmptyState>
    );
  const citationFile = tree.data?.entries?.find((entry) =>
    /^CITATION\.(cff|bib)$/.test(entry.name),
  );
  const starButton = overview ? (
    <span className="star-control inline-flex h-8 items-stretch overflow-hidden rounded-md border border-control dark:border-transparent">
      <button
        className={`button gap-1.5 rounded-none border-0 ${overviewControlClass}`}
        aria-pressed={r.starred}
        disabled={!r.signed_in || star.isPending}
        onClick={() => star.mutate()}
      >
        <Star size={15} fill={r.starred ? "currentColor" : "none"} />
        {t(r.starred ? "code.starred" : "code.star")}
      </button>
      <Link
        to={`/projects${path}/stars`}
        className={counterLinkClass}
        aria-label={t("code.header.stargazers", { count: r.stars_count })}
        title={t("code.header.stargazers", { count: r.stars_count })}
      >
        {r.stars_count}
      </Link>
    </span>
  ) : (
    <button
      className="button px-2"
      aria-pressed={r.starred}
      disabled={!r.signed_in || star.isPending}
      onClick={() => star.mutate()}
    >
      <Star size={15} fill={r.starred ? "currentColor" : "none"} />
      {t(r.starred ? "code.starred" : "code.star")}
      <span className="counter bg-transparent px-0">{r.stars_count}</span>
    </button>
  );
  const cloneButton = (
    <CloneMenu
      repository={r}
      path={path}
      refName={ref}
      compact={overview}
      directory={tree.data?.entries ? file : ""}
    />
  );
  const switchRef = (value: string) => {
    setParams({ ref: value, ...(file ? { path: file } : {}) });
    setFilter("");
    setFinding(false);
  };
  return (
    <div
      className={
        overview
          ? "project-overview mx-auto -mt-1 grid max-w-[1272px] grid-cols-[minmax(0,1fr)_290px] items-start gap-x-8 max-xl:grid-cols-[minmax(0,1fr)_210px] max-xl:gap-x-6 max-lg:grid-cols-[minmax(0,1fr)]"
          : filesOpen
            ? "repository-workspace grid grid-cols-[300px_minmax(0,1fr)] gap-5 max-[1440px]:grid-cols-[260px_minmax(0,1fr)] max-[1201px]:grid-cols-[minmax(0,1fr)]"
            : "repository-workspace grid grid-cols-[minmax(0,1fr)] gap-5"
      }
    >
      {overview ? (
        <>
          <header className="col-span-full mb-3 flex min-h-12 items-center justify-between gap-4 max-md:mb-4 max-md:flex-wrap max-md:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {details.data?.avatar_url ? (
                <img
                  className="mr-0.5 size-11 shrink-0 rounded-md object-cover text-xl max-md:size-9"
                  src={details.data.avatar_url}
                  alt=""
                />
              ) : (
                <span
                  className="project-avatar color-0 mr-0.5 size-11 shrink-0 rounded-md object-cover text-xl max-md:size-9"
                  aria-hidden="true"
                >
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <h1 className="min-w-0 text-[28px] leading-9 font-semibold tracking-[-0.6px] break-words max-md:text-2xl max-md:leading-8">
                {r.name}
              </h1>
              {r.private && (
                <LockKeyhole
                  size={16}
                  className="shrink-0 text-muted"
                  aria-label={t("code.header.privateProject")}
                />
              )}
              {r.archived && (
                <span className="label">{t("code.header.archived")}</span>
              )}
              {r.is_template && (
                <span className="label">{t("code.header.template")}</span>
              )}
              {r.object_format === "sha256" && (
                <span className="label">{t("code.header.sha256")}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 max-md:min-w-0 max-md:shrink max-md:flex-wrap">
              {r.feeds && (
                <a
                  className={`button ${overviewControlClass} px-2 max-md:hidden`}
                  href={native(`${path}.rss`)}
                  aria-label={t("feeds.repository")}
                  title={t("feeds.repository")}
                >
                  <Rss size={15} />
                </a>
              )}
              {details.data && (
                <WatchMenu
                  path={path}
                  watching={details.data.watching}
                  selection={details.data.watch_selection}
                  count={details.data.watchers_count}
                  signedIn={!!r.signed_in}
                  buttonClass={`button ${overviewControlClass}`}
                />
              )}
              {starButton}
              <span className="fork-control inline-flex h-8 items-stretch overflow-hidden rounded-md border border-line bg-surface-subtle text-sm dark:border-transparent dark:bg-[#48474d]">
                <Link
                  to="fork"
                  className="inline-flex items-center gap-1.5 px-2.5 hover:bg-hover"
                  title={t("code.header.forkTitle")}
                >
                  <GitFork size={15} /> {t("code.header.fork")}
                </Link>
                <Link
                  to={`/projects${path}/forks`}
                  className={counterLinkClass}
                  aria-label={t("code.header.forks", {
                    count: r.forks_count ?? 0,
                  })}
                  title={t("code.header.forks", { count: r.forks_count ?? 0 })}
                >
                  {r.forks_count ?? 0}
                </Link>
              </span>
              <ActionMenu
                label={t("code.header.projectActions")}
                className="icon-button"
                trigger={<MoreVertical size={18} />}
              >
                {r.archive_downloads !== false && (
                  <>
                    <MenuDownload href={archiveUrl(path, ref, "zip")}>
                      <FileArchive size={15} /> {t("code.download.zip")}
                    </MenuDownload>
                    <MenuDownload href={archiveUrl(path, ref, "tar.gz")}>
                      <FileArchive size={15} /> {t("code.download.tar")}
                    </MenuDownload>
                    <MenuDownload href={archiveUrl(path, ref, "bundle")}>
                      <FileArchive size={15} /> {t("code.download.bundle")}
                    </MenuDownload>
                  </>
                )}
                {citationFile && (
                  <MenuLink
                    to={`?${new URLSearchParams({ ref, path: citationFile.path })}`}
                  >
                    <Quote size={15} /> {t("code.header.cite")}
                  </MenuLink>
                )}
                {!!r.open_with?.length && (
                  <>
                    <MenuSeparator />
                    {r.open_with.map((app) => (
                      <OpenWithItem
                        key={app.name}
                        app={app}
                        url={r.clone?.HTTPS || r.clone?.SSH || ""}
                      />
                    ))}
                  </>
                )}
                {r.can_report && (
                  <>
                    <MenuSeparator />
                    <MenuLink
                      to={uiRoute(
                        native(
                          `/report_abuse?${new URLSearchParams({ type: "repo", id: String(r.id) })}`,
                        ),
                      )}
                    >
                      <Flag size={15} /> {t("code.header.reportAbuse")}
                    </MenuLink>
                  </>
                )}
                {r.permissions?.admin && (
                  <>
                    <MenuSeparator />
                    <MenuLink to="settings">
                      <Settings size={15} /> {t("code.header.projectSettings")}
                    </MenuLink>
                  </>
                )}
              </ActionMenu>
            </div>
          </header>
          <RepositoryOrigin repository={r} />
          {!r.archived && (
            <RecentBranches items={details.data?.recent_branches} />
          )}
        </>
      ) : (
        <aside
          className={
            filesOpen
              ? "sticky top-12 max-h-[calc(100vh-60px)] min-w-0 self-start overflow-auto bg-transparent pt-0 pb-8 max-[1201px]:hidden"
              : "sticky top-12 hidden max-h-[calc(100vh-60px)] min-w-0 self-start overflow-auto bg-transparent pt-0 pb-8"
          }
          aria-label={t("code.tree.label")}
        >
          <div className="mb-2 flex min-h-9 items-center gap-2">
            <button
              className="button size-8 p-0"
              aria-label={t("code.tree.hide")}
              onClick={() => setFilesOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
            <h2 className="text-xl font-semibold text-heading">
              {t("code.tree.title")}
            </h2>
          </div>
          <label className="filter-input mb-2 w-full border-line">
            <input
              ref={fileSearch}
              aria-label={t("code.tree.filterLabel")}
              placeholder={t("code.tree.filterPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          {!r.empty && (
            <FileTree
              dataPath={dataPath}
              path={path}
              revision={ref}
              selected={file}
              filter={filter}
              onSelect={go}
            />
          )}
        </aside>
      )}
      <div className="min-w-0">
        <div
          className={
            overview
              ? "mt-0 mb-4 flex min-h-8 flex-nowrap items-center gap-2 max-md:flex-wrap"
              : "mt-0 mb-5 flex min-h-9 flex-nowrap items-center gap-2 max-md:mb-4 max-md:flex-wrap"
          }
        >
          {!overview && !filesOpen && (
            <button
              className="button max-[1201px]:hidden"
              aria-label={t("code.tree.show")}
              onClick={() => setFilesOpen(true)}
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          {!r.empty && (
            <RefSwitcher
              path={path}
              value={ref}
              onSelect={switchRef}
              canCreate={!!r.can_create_branch}
              feeds={!!r.feeds}
              label={t("code.toolbar.branchMenuTitle")}
              className={
                overview
                  ? `max-w-[min(180px,35vw)] shrink-0 ${overviewControlClass}`
                  : "max-w-[180px] shrink-0"
              }
            />
          )}
          {finding ? (
            <label className="filter-input m-0 min-w-0 flex-1 gap-1 px-2">
              <Search size={15} />
              <input
                autoFocus
                aria-label={t("code.toolbar.findLabel")}
                placeholder={t("code.toolbar.findPlaceholder")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFinding(false);
                    setFilter("");
                  }
                }}
              />
              <button
                aria-label={t("code.toolbar.closeFind")}
                onClick={() => {
                  setFinding(false);
                  setFilter("");
                }}
              >
                <X size={14} />
              </button>
            </label>
          ) : (
            <nav
              className={
                overview
                  ? "flex min-w-0 items-center gap-1 overflow-hidden text-sm max-md:flex-1"
                  : "flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm max-md:basis-[calc(100%-140px)]"
              }
              aria-label={t("code.toolbar.filePath")}
            >
              <button
                className={
                  overview
                    ? "truncate font-semibold hover:underline"
                    : "overflow-hidden font-semibold text-ellipsis whitespace-nowrap hover:underline"
                }
                onClick={() => go("")}
              >
                {r.name}
              </button>
              {file
                .split("/")
                .filter(Boolean)
                .map((part, i) => (
                  <span
                    key={i}
                    className={
                      overview
                        ? "flex items-center gap-1 text-muted"
                        : "flex min-w-0 items-center gap-1 text-muted"
                    }
                  >
                    <ChevronRight size={13} />
                    <button
                      className={
                        overview
                          ? "truncate font-semibold hover:underline"
                          : "overflow-hidden font-semibold text-ellipsis whitespace-nowrap hover:underline"
                      }
                      onClick={() =>
                        go(
                          file
                            .split("/")
                            .slice(0, i + 1)
                            .join("/"),
                        )
                      }
                    >
                      {part}
                    </button>
                  </span>
                ))}
            </nav>
          )}
          <div
            className={
              overview
                ? "ml-auto flex shrink-0 items-center gap-2 max-xl:gap-1 max-md:order-3 max-md:w-full max-md:flex-wrap max-md:justify-end max-md:gap-2"
                : "ml-auto flex shrink-0 items-center gap-2 max-md:ml-0"
            }
          >
            {overview && r.is_template && r.signed_in && (
              <Link
                className={`button primary ${overview ? "h-8 rounded-md" : ""}`}
                to={uiRoute(
                  native(
                    `/repo/create?${new URLSearchParams({ template_id: String(r.id) })}`,
                  ),
                )}
              >
                {t("code.toolbar.useTemplate")}
              </Link>
            )}
            {(r.units?.pulls || r.units?.issues || r.permissions?.write_code) &&
              r.signed_in && (
                <ActionMenu
                  className={
                    overview ? `button ${overviewControlClass}` : "button"
                  }
                  label={t("code.toolbar.addToProject")}
                  trigger={
                    <>
                      <Plus size={17} />
                      <ChevronDown size={12} />
                    </>
                  }
                >
                  <MenuGroup label={t("code.toolbar.create")}>
                    {r.permissions?.write_code && !r.archived && (
                      <>
                        <MenuLink
                          to={`new?${new URLSearchParams({ ref, path: directory })}`}
                        >
                          <File size={15} />
                          {t("code.toolbar.newFile")}
                        </MenuLink>
                        <MenuLink
                          to={`upload?${new URLSearchParams({ ref, path: directory })}`}
                        >
                          <Upload size={15} />
                          {t("code.toolbar.uploadFiles")}
                        </MenuLink>
                        <MenuLink
                          to={`branches?${new URLSearchParams({ new: "1", ref })}`}
                        >
                          <GitBranch size={15} />
                          {t("code.toolbar.newBranch")}
                        </MenuLink>
                        <MenuLink
                          to={`tags?${new URLSearchParams({ new: "1", ref })}`}
                        >
                          <Tag size={15} />
                          {t("code.toolbar.newTag")}
                        </MenuLink>
                        <MenuLink to={`patch?${new URLSearchParams({ ref })}`}>
                          {t("code.toolbar.applyPatch")}
                        </MenuLink>
                        <MenuSeparator />
                      </>
                    )}
                    {r.units?.issues && (
                      <MenuLink to="issues/new">
                        {t("code.toolbar.newIssue")}
                      </MenuLink>
                    )}
                    {r.units?.pulls && (
                      <MenuLink to="merge-requests/new">
                        {t("code.toolbar.newMergeRequest")}
                      </MenuLink>
                    )}
                  </MenuGroup>
                </ActionMenu>
              )}
            {!finding && !r.empty && (
              <button
                className={
                  overview ? `button ${overviewControlClass}` : "button"
                }
                onClick={() => setFinding(true)}
              >
                {t("code.toolbar.findFile")}
              </button>
            )}
            {cloneButton}
          </div>
        </div>
        {!overview && (
          <div className="mt-0 mb-4 flex min-h-10 flex-wrap items-center justify-between gap-4 max-md:gap-3">
            <h1 className="flex items-center gap-2 text-3xl leading-9 font-bold max-md:text-[24px] max-md:leading-8 [&_svg]:shrink-0 [&_svg]:text-muted">
              <FileIcon name={file} folder={!!tree.data?.entries} />
              <span className="break-all">
                {file.split("/").at(-1) || r.name}
              </span>
            </h1>
            <div className={`${actionsClass} max-md:ml-auto`}>{starButton}</div>
          </div>
        )}
        <Feedback error={star.error} />
        {finding && tree.data?.sha ? (
          <RepositoryFinder
            path={path}
            sha={tree.data.sha}
            filter={filter}
            onSelect={go}
          />
        ) : tree.isPending ? (
          <Pending />
        ) : tree.error ? (
          <Feedback error={tree.error} />
        ) : tree.data.empty ? (
          <EmptyRepositoryGuide repository={r} />
        ) : (
          <>
            <div
              className={
                overview
                  ? "mb-4 flex min-h-[60px] items-center gap-2 rounded-md border-0 border-line bg-[#fbfafd] px-4 py-2.5 dark:bg-[#2b2a30]"
                  : "mb-4 flex min-h-16 items-center gap-2 rounded-lg border border-line bg-surface-subtle px-4 py-3"
              }
            >
              <span
                className={`${commitAvatarClass} max-md:hidden ${overview ? "size-7" : "size-8"}`}
              >
                {tree.data.commit?.author.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <strong
                  className={
                    overview
                      ? "block truncate text-sm font-semibold"
                      : "block truncate text-sm"
                  }
                >
                  {tree.data.commit?.message}
                </strong>
                <span className="text-xs text-muted">
                  {t("shared.committed", {
                    author: tree.data.commit?.author,
                    date: relativeDate(tree.data.commit?.date),
                  })}
                </span>
              </div>
              <div
                className={
                  overview
                    ? "flex shrink-0 items-center overflow-hidden rounded-md border-0 border-control bg-[#fbfafd] text-sm dark:bg-[#3b3a40] max-xl:hidden [&_.copy-icon]:size-8 [&_.copy-icon]:min-h-8 [&_.copy-icon]:rounded-md [&_.copy-icon]:p-0 [&_.copy-icon]:text-sm dark:[&_.copy-icon]:border-transparent! dark:[&_.copy-icon]:bg-[#48474d] dark:[&_.copy-icon:hover]:bg-[#535258]"
                    : "flex shrink-0 items-center overflow-hidden rounded-lg border border-control bg-surface text-sm max-md:hidden"
                }
              >
                <Link
                  className={
                    overview
                      ? "px-3 py-1.5 hover:bg-canvas"
                      : "px-3 py-1 hover:bg-canvas"
                  }
                  to={`commit/${tree.data.sha}`}
                >
                  <code>{tree.data.sha.slice(0, 8)}</code>
                </Link>
                <CopyButton
                  value={tree.data.sha}
                  label={t("shared.copyCommitSha")}
                  compact
                />
              </div>
              <Link
                className={
                  overview
                    ? "button h-8 rounded-md border-0 bg-[#fbfafd] px-2.5 dark:bg-[#48474d] dark:hover:bg-[#535258]"
                    : "button"
                }
                to={`history?${new URLSearchParams({ ref, ...(file ? { path: file } : {}) })}`}
              >
                {t("code.history")}
              </Link>
              {!overview &&
                tree.data.entries &&
                file &&
                r.archive_downloads !== false && (
                  <ActionMenu
                    label={t("code.directory.actions")}
                    className="icon-button"
                    trigger={<MoreVertical size={17} />}
                  >
                    <MenuDownload href={archiveUrl(path, ref, "zip", file)}>
                      <FileArchive size={15} /> {t("code.download.zip")}
                    </MenuDownload>
                    <MenuDownload href={archiveUrl(path, ref, "tar.gz", file)}>
                      <FileArchive size={15} /> {t("code.download.tar")}
                    </MenuDownload>
                  </ActionMenu>
                )}
            </div>
            {tree.data.entries ? (
              <>
                {(r.code_indexer === false ||
                  (refType === "branch" && ref === r.default_branch)) &&
                  refType !== "commit" && (
                    <CodeSearchBar
                      path={path}
                      directory={file}
                      refName={ref}
                      refKind={refType}
                      indexed={!!r.code_indexer}
                    />
                  )}
                <div
                  className={
                    overview
                      ? "file-table overflow-hidden rounded-md border border-line bg-surface"
                      : "file-table overflow-hidden rounded-lg border border-line"
                  }
                >
                  <div
                    className={
                      overview
                        ? "grid min-h-10 w-full grid-cols-[minmax(140px,1fr)_minmax(100px,1.55fr)_110px] items-center gap-4 border-0 border-line bg-[#fbfafd] px-4 py-2 text-left text-sm font-semibold text-heading dark:bg-[#3b3a40] max-xl:grid-cols-[minmax(100px,1fr)_minmax(60px,1fr)_90px] max-xl:gap-2 max-xl:px-3 max-md:grid-cols-[minmax(0,1fr)_90px]"
                        : "grid w-full grid-cols-[minmax(130px,1fr)_minmax(100px,1.5fr)_110px] items-center gap-4 border-b border-line bg-surface-subtle px-4 py-2.5 text-left text-sm font-semibold text-heading max-md:grid-cols-[minmax(0,1fr)_100px] max-md:gap-2 max-md:px-3"
                    }
                  >
                    <span>{t("code.table.name")}</span>
                    <span className="max-md:hidden">
                      {t("code.table.lastCommit")}
                    </span>
                    <span className="text-right">
                      {t("code.table.lastUpdate")}
                    </span>
                  </div>
                  {file && (
                    <button
                      className={fileRowClass}
                      onClick={() => go(file.split("/").slice(0, -1).join("/"))}
                    >
                      <span className="flex items-center gap-2 truncate text-right text-sm text-muted">
                        <Folder size={16} />
                        ..
                      </span>
                    </button>
                  )}
                  {tree.data.entries
                    .filter((e) =>
                      e.name.toLowerCase().includes(filter.toLowerCase()),
                    )
                    .map((entry) => {
                      const nameCell = (
                        <span
                          className={
                            overview
                              ? "flex items-center gap-1 truncate"
                              : "flex items-center gap-2 truncate"
                          }
                        >
                          {entry.submodule ? (
                            <FolderGit2 size={16} />
                          ) : entry.symlink ? (
                            <Link2 size={16} />
                          ) : (
                            <FileIcon
                              name={entry.name}
                              folder={entry.type === "tree"}
                            />
                          )}
                          <span className="truncate">{entry.name}</span>
                          {entry.submodule && (
                            <span className="shrink-0 font-mono text-xs text-muted">
                              @ {entry.submodule.commit.slice(0, 10)}
                            </span>
                          )}
                        </span>
                      );
                      const rest = (
                        <>
                          <span className="truncate text-muted max-md:hidden">
                            {entry.commit?.message}
                          </span>
                          <span className="truncate text-right text-sm text-muted">
                            {relativeDate(entry.commit?.date)}
                          </span>
                        </>
                      );
                      return entry.submodule ? (
                        <a
                          className={fileRowClass}
                          key={entry.path}
                          href={
                            entry.submodule.url
                              ? `${entry.submodule.url}/commit/${entry.submodule.commit}`
                              : undefined
                          }
                          title={t("code.table.submodule", {
                            url: entry.submodule.url,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {nameCell}
                          {rest}
                        </a>
                      ) : (
                        <button
                          className={fileRowClass}
                          key={entry.path}
                          onClick={() => go(entry.path)}
                        >
                          {nameCell}
                          {rest}
                        </button>
                      );
                    })}
                  {filter &&
                    !tree.data.entries.some((entry) =>
                      entry.name.toLowerCase().includes(filter.toLowerCase()),
                    ) && (
                      <p className="p-4 text-sm text-muted">
                        {t("code.table.noMatches", { filter })}
                      </p>
                    )}
                </div>
              </>
            ) : (
              <FilePanel
                key={`${ref}:${file}`}
                tree={tree.data}
                file={file}
                refName={ref}
                directory={directory}
                repository={r}
                canDelete={
                  !!r.permissions?.write_code &&
                  !r.archived &&
                  !!branches.data?.results.includes(ref)
                }
                onFollow={go}
              />
            )}
            {readmeFile && readme.data?.content !== undefined && (
              <section
                className={
                  overview
                    ? "readme-panel mt-4 overflow-hidden rounded-md border border-line"
                    : "readme-panel mt-4 overflow-hidden rounded-lg border border-line"
                }
                id="project-readme"
              >
                <div
                  className={
                    overview
                      ? "file-info flex min-h-11 items-center gap-2 border-b border-line bg-[#fbfafd] px-3 py-2.5 text-sm dark:bg-[#2b2a30] max-md:flex-wrap"
                      : "file-info flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface-subtle px-3 py-2 text-sm max-md:flex-col max-md:flex-wrap max-md:items-start"
                  }
                >
                  <File size={15} />
                  <button
                    className="font-semibold hover:underline"
                    onClick={() => go(readmeFile)}
                  >
                    {readmeFile.slice(directory ? directory.length + 1 : 0)}
                  </button>
                  {readme.data.editable && (
                    <Link
                      className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
                      to={`edit?${new URLSearchParams({ ref, path: readmeFile })}`}
                    >
                      {t("code.file.edit")}
                    </Link>
                  )}
                </div>
                <div
                  className={
                    overview
                      ? "p-7 max-md:p-4 [&_.markdown_h1]:border-0 [&_.markdown_h1]:pb-0 [&_.markdown_h2]:border-0 [&_.markdown_h2]:pb-0"
                      : "p-6"
                  }
                >
                  {readme.data.markup ? (
                    <Markdown
                      html={readme.data.content_html || undefined}
                      basePath={`${path}/src/commit/${tree.data.sha}/${readmeFile.split("/").slice(0, -1).join("/")}${readmeFile.includes("/") ? "/" : ""}`}
                    >
                      {readme.data.content ?? ""}
                    </Markdown>
                  ) : (
                    <pre className="font-mono text-sm whitespace-pre-wrap">
                      {readme.data.content}
                    </pre>
                  )}
                </div>
              </section>
            )}
            <Feedback error={readme.error} />
          </>
        )}
      </div>
      {overview && (
        <aside
          className="min-w-0 pt-2 text-sm max-lg:mt-6 max-lg:border-t max-lg:border-line max-lg:pt-4"
          aria-label={t("code.sidebar.label")}
        >
          <h2 className="text-sm font-semibold">{t("code.sidebar.title")}</h2>
          {r.description && (
            <p className="mt-2 mb-3 leading-5 break-words text-muted">
              {r.description}
            </p>
          )}
          {r.website && (
            <a
              className="mb-3 flex items-center gap-2 break-all text-primary hover:underline [&_svg]:shrink-0"
              href={r.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe size={15} />
              {r.website}
            </a>
          )}
          <ProjectTopics
            path={path}
            topics={details.data?.topics}
            editable={!!r.permissions?.admin && !r.archived}
          />
          {details.data?.languages.length ? (
            <div
              className="group/languages relative mt-2 mb-4 max-lg:max-w-sm"
              tabIndex={0}
              aria-label={t("code.sidebar.languages", {
                list: details.data.languages
                  .map((language) => languageShare(language))
                  .join(", "),
              })}
            >
              <div className="flex h-2 w-full gap-px overflow-hidden rounded-full">
                {details.data.languages.map((language) => (
                  <span
                    key={language.name}
                    className="min-w-[3px]"
                    style={{
                      width: `${language.percentage}%`,
                      backgroundColor: language.color,
                    }}
                    title={languageShare(language)}
                  />
                ))}
              </div>
              <div className="absolute top-full z-10 mt-2 hidden w-full rounded-md border border-line bg-surface p-3 shadow-lg group-focus-within/languages:block group-hover/languages:block">
                {details.data.languages.map((language) => (
                  <span
                    key={language.name}
                    className="mb-1 flex items-center gap-1.5 text-xs"
                  >
                    <i
                      className="size-2 rounded-full"
                      style={{ backgroundColor: language.color }}
                    />
                    {language.name}{" "}
                    <small className="ml-auto text-muted">
                      {percent(language.percentage)}
                    </small>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className={infoSectionClass}>
            {details.data && (
              <>
                <Link
                  className={infoLinkClass}
                  to={`history?ref=${encodeURIComponent(r.default_branch)}`}
                >
                  <GitCommitHorizontal size={16} />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="code.sidebar.commits"
                      count={details.data.commit_count}
                      components={{
                        strong: <strong className="font-semibold" />,
                      }}
                    />
                  </span>
                </Link>
                <Link className={infoLinkClass} to="branches">
                  <GitBranch size={16} />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="code.sidebar.branches"
                      count={details.data.branch_count}
                      components={{
                        strong: <strong className="font-semibold" />,
                      }}
                    />
                  </span>
                </Link>
                <Link className={infoLinkClass} to="tags">
                  <Tag size={16} />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="code.sidebar.tags"
                      count={details.data.tag_count}
                      components={{
                        strong: <strong className="font-semibold" />,
                      }}
                    />
                  </span>
                </Link>
                <span className={infoItemClass}>
                  <HardDrive size={16} />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="code.sidebar.storage"
                      values={{
                        size: formatStorage(
                          details.data.size_bytes,
                          i18n.language,
                        ),
                      }}
                      components={{
                        strong: <strong className="font-semibold" />,
                      }}
                    />
                  </span>
                </span>
              </>
            )}
            {details.isPending && (
              <span className={`${infoItemClass} text-muted`}>
                {t("code.sidebar.loading")}
              </span>
            )}
            <Feedback error={details.error} />
          </div>
          <div className={infoSectionClass}>
            {readmeFile && (
              <button
                className={infoLinkClass}
                onClick={() =>
                  document.getElementById("project-readme")?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  })
                }
              >
                <File size={16} />
                {t("code.sidebar.readme")}
              </button>
            )}
            {tree.data?.entries
              ?.filter((entry) =>
                /^(license|copying|changelog|contributing)(\.|$)/i.test(
                  entry.name,
                ),
              )
              .map((entry) => (
                <button
                  key={entry.path}
                  className={infoLinkClass}
                  onClick={() => go(entry.path)}
                >
                  <File size={16} />
                  {/^(license|copying)/i.test(entry.name)
                    ? entry.name
                    : t(
                        /^changelog/i.test(entry.name)
                          ? "code.sidebar.changelog"
                          : "code.sidebar.contributionGuide",
                      )}
                </button>
              ))}
            {citationFile && (
              <button
                className={infoLinkClass}
                onClick={() => go(citationFile.path)}
              >
                <Quote size={16} />
                {t("code.header.cite")}
              </button>
            )}
            {r.units?.actions && (
              <Link className={infoLinkClass} to="actions">
                <Rocket size={16} />
                {t("code.sidebar.ciConfiguration")}
              </Link>
            )}
            {r.units?.wiki && (
              <Link className={infoLinkClass} to="wiki">
                <BookOpen size={16} />
                {t("code.sidebar.wiki")}
              </Link>
            )}
            {r.external?.wiki && (
              <a
                className={infoLinkClass}
                href={r.external.wiki}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} />
                {t("code.sidebar.externalWiki")}
              </a>
            )}
            {r.external?.issues && (
              <a
                className={infoLinkClass}
                href={r.external.issues}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} />
                {t("code.sidebar.externalIssues")}
              </a>
            )}
          </div>
          {!!releases.data?.total && (
            <div className={infoSectionClass}>
              <Link className={infoLinkClass} to="releases">
                <Rocket size={16} />
                <strong>
                  {t("code.sidebar.releases", { count: releases.data.total })}
                </strong>
              </Link>
              {releases.data.items
                .filter((release) => !release.draft)
                .slice(0, 1)
                .map((release) => (
                  <div key={release.tag_name} className="pl-6 mt-1">
                    <Link
                      className="text-primary hover:underline"
                      to={`releases/tag/${encodeURIComponent(release.tag_name)}`}
                    >
                      {release.name || release.tag_name}
                    </Link>
                    <span className="block text-xs text-muted mt-1">
                      {relativeDate(release.published_at)}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {details.data?.created_at && (
            <div className={infoSectionClass}>
              <h3 className="text-sm font-semibold">
                {t("code.sidebar.createdOn")}
              </h3>
              <time className="mt-1 block" dateTime={details.data.created_at}>
                {new Date(details.data.created_at).toLocaleDateString(
                  i18n.language,
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </time>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/** "Open with …" links (native clone panel): {url} is the clone URL. */
function OpenWithItem({
  app,
  url,
}: {
  app: { name: string; url: string };
  url: string;
}) {
  const { t } = useTranslation("repository");
  return (
    <MenuLinkExternal href={app.url.replace("{url}", encodeURIComponent(url))}>
      <Code2 size={15} /> {t("code.openWith", { name: app.name })}
    </MenuLinkExternal>
  );
}

function MenuLinkExternal({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item className="menu-item" render={<a href={href} />}>
      {children}
    </Menu.Item>
  );
}

function CloneMenu({
  repository: r,
  path,
  refName,
  compact,
  directory,
}: {
  repository: RepositoryDetails;
  path: string;
  refName: string;
  compact: boolean;
  directory: string;
}) {
  const { t } = useTranslation("repository");
  const [open, setOpen] = useState(false);
  const cloneUrl = r.clone?.HTTPS || r.clone?.SSH || "";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`button border-[#3a383f] bg-[#3a383f] text-white hover:border-(--ui-button-default-border-hover) hover:bg-[#28272d] active:border-(--ui-button-default-border-active) active:bg-(--ui-button-default-bg-active) dark:border-control dark:bg-[#ececef] dark:text-[#28272d] dark:hover:border-control dark:hover:bg-[#dcdcde] dark:active:border-control dark:active:bg-[#dcdcde] ${compact ? "h-8 rounded-md px-2.5" : ""}`}
      >
        {t("code.clone.trigger")} <ChevronDown size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="dropdown-positioner"
          align="end"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup
            className="w-84 max-w-[calc(100vw-24px)] origin-(--transform-origin) rounded-lg border border-control bg-surface p-4 opacity-100 [box-shadow:var(--ui-shadow)] outline-none [transition:opacity_120ms_ease-out,transform_120ms_ease-out] [transform:scale(1)] data-ending-style:opacity-0 data-ending-style:[transition-duration:90ms] data-ending-style:[transform:scale(0.97)] data-starting-style:opacity-0 data-starting-style:[transform:scale(0.97)]"
            aria-label={t("code.clone.title")}
          >
            <div className="-mx-4 -mt-4 flex items-center justify-between gap-2 border-b border-line px-4 py-2">
              <h3 className="text-sm">{t("code.clone.title")}</h3>
              <Popover.Close
                className="icon-button"
                aria-label={t("code.clone.close")}
              >
                <X size={16} />
              </Popover.Close>
            </div>
            {[
              ["HTTPS", r.clone?.HTTPS],
              ["SSH", r.clone?.SSH],
            ]
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <div key={label} className="mt-4">
                  <label
                    className="block text-xs font-semibold mb-2"
                    htmlFor={`clone-${label}`}
                  >
                    {t("code.clone.with", { protocol: label })}
                  </label>
                  <div className="flex overflow-hidden rounded border border-input [&_.copy-icon]:h-auto [&_.copy-icon]:shrink-0">
                    <input
                      className="w-full min-w-0 border-0 bg-code p-2 font-mono text-xs"
                      id={`clone-${label}`}
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <CopyButton
                      value={url!}
                      label={t("code.clone.copyUrl", { protocol: label })}
                      compact
                    />
                  </div>
                </div>
              ))}
            {!!r.open_with?.length && cloneUrl && (
              <div className="-mx-4 mt-4 border-t border-line px-4 pt-3">
                <h4 className="mb-1 text-xs font-semibold">
                  {t("code.clone.openIn")}
                </h4>
                <div className="flex flex-col">
                  {r.open_with.map((app) => (
                    <a
                      key={app.name}
                      className="flex items-center gap-2 py-1 text-sm text-primary hover:underline"
                      href={app.url.replace(
                        "{url}",
                        encodeURIComponent(cloneUrl),
                      )}
                    >
                      <Code2 size={14} />
                      {t("code.openWith", { name: app.name })}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {r.archive_downloads !== false && (
              <div className="-mx-4 mt-4 -mb-4 flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-sm">
                <h4 className="w-full text-xs font-semibold">
                  {t(
                    directory
                      ? "code.clone.downloadDirectory"
                      : "code.clone.download",
                  )}
                </h4>
                <a
                  className="text-primary hover:underline"
                  href={archiveUrl(path, refName, "zip", directory)}
                  download
                >
                  zip
                </a>
                <a
                  className="text-primary hover:underline"
                  href={archiveUrl(path, refName, "tar.gz", directory)}
                  download
                >
                  tar.gz
                </a>
                {!directory && (
                  <a
                    className="text-primary hover:underline"
                    href={archiveUrl(path, refName, "bundle")}
                    download
                  >
                    bundle
                  </a>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The file view: native header (file info and actions) and the content. */
function FilePanel({
  tree,
  file,
  refName,
  directory,
  repository: r,
  canDelete,
  onFollow,
}: {
  tree: TreeDetails;
  file: string;
  refName: string;
  directory: string;
  repository: RepositoryDetails;
  canDelete: boolean;
  onFollow: (path: string) => void;
}) {
  const { t, i18n } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const [raw, setRaw] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [citationView, setCitationView] = useState<"original" | "other">(
    "original",
  );
  const content = tree.content;
  const lines = useMemo(
    () => (content === undefined ? [] : sourceLines(content)),
    [content],
  );
  const escapes = useLineEscapes(lines, "file-view");
  const citation = useCitation(file, tree.citation ? (content ?? "") : "");
  const name = file.split("/").at(-1) ?? file;
  const encodedFile = escapeSegments(file);
  const refType = tree.ref_type ?? "commit";
  const commitFile = `${path}/${tree.lfs?.available ? "media" : "raw"}/commit/${tree.sha}/${encodedFile}`;
  const rawUrl = native(
    `${path}/${tree.lfs?.available ? "media" : "raw"}/${refType}/${escapeSegments(refType === "commit" ? tree.sha : refName)}/${encodedFile}`,
  );
  const permalink = `${window.location.origin}${native(`${path}/src/commit/${tree.sha}/${encodedFile}`)}`;
  const markupHtml = tree.content_html;
  const previewAvailable =
    /\.(md|markdown|csv|tsv)$/i.test(file) ||
    canPreviewMedia(file) ||
    !!tree.markup;
  const showSource = raw || !previewAvailable;
  const textView =
    content !== undefined &&
    (showSource ||
      !(
        canPreviewMedia(file) ||
        /\.(csv|tsv)$/i.test(file) ||
        markupHtml ||
        /\.(md|markdown)$/i.test(file) ||
        tree.markup
      ));
  const info: ReactNode[] = [];
  if (tree.symlink) info.push(t("code.file.symlink"));
  if (content !== undefined) {
    info.push(t("code.file.lines", { count: content ? lines.length : 0 }));
    if (content && !content.endsWith("\n"))
      info.push(
        <span key="eol" title={t("code.file.noEolHint")}>
          {t("code.file.noEol")}
        </span>,
      );
  }
  if (tree.size !== undefined)
    info.push(
      tree.lfs
        ? t("code.file.sizeLfs", {
            size: formatStorage(tree.size, i18n.language),
          })
        : formatStorage(tree.size, i18n.language),
    );
  if (tree.lfs_lock)
    info.push(
      <span
        key="lock"
        className="inline-flex items-center gap-1"
        title={t("code.file.lockedHint")}
      >
        <LockKeyhole size={13} />
        <Link
          className="hover:underline"
          to={`/users/${encodeURIComponent(tree.lfs_lock.owner)}`}
        >
          {tree.lfs_lock.owner}
        </Link>
      </span>,
    );
  if (tree.language) info.push(tree.language);
  if (tree.executable) info.push(t("code.file.executable"));
  if (tree.vendored) info.push(t("code.file.vendored"));
  if (tree.generated) info.push(t("code.file.generated"));
  if (tree.image_size)
    info.push(`${tree.image_size[0]}×${tree.image_size[1]}px`);
  return (
    <div className="code-panel overflow-hidden rounded-lg border border-line bg-surface">
      <div className="file-info flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-subtle px-3 py-2 text-sm">
        <div className="flex min-w-0 flex-[1_1_220px] flex-wrap items-center gap-x-2 gap-y-1">
          <File size={15} className="shrink-0 text-muted" />
          <strong className="min-w-0 break-all">{name}</strong>
          {info.map((item, index) => (
            <span
              key={index}
              className="file-info-entry shrink-0 border-l border-line pl-2 font-mono text-xs text-muted"
            >
              {item}
            </span>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 max-md:ml-0 max-md:justify-start">
          {tree.citation && content !== undefined && (
            <div
              className="flex items-stretch"
              role="group"
              aria-label={t("citation.format")}
            >
              <button
                className={viewOptionClass}
                aria-pressed={citationView === "original"}
                onClick={() => setCitationView("original")}
              >
                {citation.original}
              </button>
              <button
                className={`${viewOptionClass} [border-left:0]`}
                aria-pressed={citationView === "other"}
                onClick={() => setCitationView("other")}
              >
                {citation.other}
              </button>
            </div>
          )}
          {content !== undefined && (
            <div
              className="flex items-stretch"
              role="group"
              aria-label={t("code.file.view")}
            >
              <button
                className={viewOptionClass}
                aria-label={t("code.file.viewSource")}
                aria-pressed={showSource}
                onClick={() => setRaw(true)}
              >
                {t("code.file.code")}
              </button>
              {previewAvailable && (
                <button
                  className={`${viewOptionClass} [border-left:0]`}
                  aria-pressed={!raw}
                  onClick={() => setRaw(false)}
                >
                  {t("code.file.preview")}
                </button>
              )}
              <Link
                className={`${viewOptionClass} flex items-center gap-1 [border-left:0]`}
                to={`blame?${new URLSearchParams({ ref: tree.sha, path: file, type: "commit" })}`}
              >
                {t("code.file.blame")}
              </Link>
            </div>
          )}
          {(tree.symlink_target || (escapes.status.escaped && textView)) && (
            <div className="flex items-stretch" role="group">
              {tree.symlink_target && (
                <button
                  className={viewOptionClass}
                  onClick={() => onFollow(tree.symlink_target!)}
                >
                  {t("code.file.followSymlink")}
                </button>
              )}
              {escapes.status.escaped && textView && (
                <EscapeToggle
                  escaped={escaped}
                  onToggle={() => setEscaped(!escaped)}
                  className={`${viewOptionClass} ${tree.symlink_target ? "[border-left:0]" : ""}`}
                />
              )}
            </div>
          )}
          {!tree.submodule && (
            <>
              <div
                className="flex items-stretch [&>*]:min-h-8 [&>*]:px-2"
                role="group"
                aria-label={t("code.file.actions")}
              >
                <a
                  className={viewOptionClass}
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("code.file.raw")}
                  title={t("code.file.raw")}
                >
                  <FileText size={15} />
                </a>
                {refType !== "commit" && (
                  <Link
                    className={`${viewOptionClass} [border-left:0]`}
                    to={`?${new URLSearchParams({ ref: tree.sha, path: file })}`}
                    aria-label={t("code.file.permalink")}
                    title={t("code.file.permalink")}
                  >
                    <Link2 size={15} />
                  </Link>
                )}
                {content !== undefined && (
                  <button
                    className={`${viewOptionClass} [border-left:0]`}
                    aria-label={t("code.file.copyContent")}
                    title={
                      copied
                        ? t("code.file.copied")
                        : t("code.file.copyContent")
                    }
                    onClick={() =>
                      void copyText(content).then((ok) => setCopied(ok))
                    }
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                )}
                <a
                  className={`${viewOptionClass} [border-left:0]`}
                  href={native(commitFile)}
                  download
                  aria-label={t("code.file.download")}
                  title={t("code.file.download")}
                >
                  <Download size={15} />
                </a>
                {r.feeds &&
                  (refType === "branch" ? (
                    <a
                      className={`${viewOptionClass} [border-left:0]`}
                      href={native(
                        `${path}/rss/branch/${escapeSegments(refName)}/${encodedFile}`,
                      )}
                      aria-label={t("feeds.file")}
                      title={t("feeds.file")}
                    >
                      <Rss size={15} />
                    </a>
                  ) : (
                    <span
                      className={`${viewOptionClass} [border-left:0] cursor-not-allowed opacity-50`}
                      title={t("feeds.fileBranchOnly")}
                      aria-label={t("feeds.fileBranchOnly")}
                      role="img"
                    >
                      <Rss size={15} />
                    </span>
                  ))}
              </div>
              {tree.editable ? (
                <Link
                  className={fileActionClass}
                  to={`edit?${new URLSearchParams({ ref: refName, path: file })}`}
                >
                  <Pencil size={14} />
                  {t("code.file.edit")}
                </Link>
              ) : (
                <span
                  className="text-xs text-muted"
                  title={
                    tree.lfs_lock && !tree.lfs_lock.mine
                      ? t("code.file.lockedHint")
                      : t("code.file.readOnlyHint")
                  }
                >
                  {t("code.file.readOnly")}
                </span>
              )}
              {canDelete && !(tree.lfs_lock && !tree.lfs_lock.mine) && (
                <ActionMenu
                  label={t("code.file.actions")}
                  className="icon-button"
                  trigger={<MoreVertical size={17} />}
                >
                  <MenuLink
                    to={`delete?${new URLSearchParams({ ref: refName, path: file })}`}
                  >
                    <Trash2 size={15} />
                    {t("code.file.delete")}
                  </MenuLink>
                </ActionMenu>
              )}
            </>
          )}
        </div>
      </div>
      {tree.file_error && (
        <div className="border-b border-line bg-danger-bg px-4 py-3 text-sm whitespace-pre-wrap text-danger">
          {tree.file_error}
        </div>
      )}
      {tree.file_warning && (
        <div className="border-b border-line bg-[#fdf1dd] px-4 py-3 text-sm whitespace-pre-wrap text-[#8f4700] dark:bg-[#4a3a1c] dark:text-[#e9c77b]">
          {tree.file_warning}
        </div>
      )}
      {tree.lfs && (
        <div className="lfs-file-notice flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-xs text-muted">
          <strong>Git LFS</strong>
          <span>
            {formatStorage(tree.lfs.size, i18n.language)} · SHA-256{" "}
            <code>{tree.lfs.oid.slice(0, 12)}</code>
          </span>
          {!tree.lfs.available && (
            <p className="w-full">{t("code.file.lfsMissing")}</p>
          )}
        </div>
      )}
      {textView && <EscapeWarning status={escapes.status} />}
      {tree.citation && citationView === "other" && content !== undefined ? (
        <CitationOutput
          value={citation.text}
          error={citation.error}
          format={citation.other}
        />
      ) : canPreviewMedia(file) && !raw && (!tree.lfs || tree.lfs.available) ? (
        <MediaPreview url={native(commitFile)} filename={file} />
      ) : content !== undefined ? (
        /\.(csv|tsv)$/i.test(file) && !raw ? (
          <DelimitedPreview text={content} filename={file} />
        ) : (/\.(md|markdown)$/i.test(file) || markupHtml) && !raw ? (
          <div className="p-8 max-md:p-5">
            <Markdown
              html={markupHtml || undefined}
              basePath={`${path}/src/commit/${tree.sha}/${directory ? directory + "/" : ""}`}
            >
              {content}
            </Markdown>
          </div>
        ) : tree.markup && !raw && !tree.lfs ? (
          <iframe
            className="h-[640px] w-full border-0 bg-white"
            sandbox="allow-same-origin"
            src={native(`${path}/render/commit/${tree.sha}/${encodedFile}`)}
            title={t("code.file.rendered", { file })}
          />
        ) : (
          <SourceView
            code={content}
            filename={file}
            marks={escapes.marks}
            escaped={escaped}
            onToggleEscape={() => setEscaped(!escaped)}
            tabSize={tree.tab_size}
            actions={{
              permalink,
              blame: `/projects${path}/blame?${new URLSearchParams({ ref: tree.sha, path: file, type: "commit" })}`,
              newIssue: r.units?.issues
                ? `/projects${path}/issues/new`
                : undefined,
            }}
          />
        )
      ) : tree.submodule ? (
        <EmptyState title={t("code.file.submodule")}>
          {tree.submodule_url ? (
            <Trans
              t={t}
              i18nKey="code.file.submoduleLink"
              values={{
                url: tree.submodule_url,
                commit: tree.submodule.slice(0, 10),
              }}
              components={{
                anchor: (
                  <a
                    className="text-primary hover:underline"
                    href={`${tree.submodule_url}/commit/${tree.submodule}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
              }}
            />
          ) : (
            t("code.file.noPreview")
          )}
        </EmptyState>
      ) : (
        <EmptyState
          title={t(tree.too_large ? "code.file.tooLarge" : "code.file.binary")}
        >
          {t("code.file.noPreview")}{" "}
          <a
            className="text-primary hover:underline"
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("code.file.viewRaw")}
          </a>
        </EmptyState>
      )}
    </div>
  );
}

export { HistoryPage } from "./RepositoryHistory";
export { CommitPage } from "./CommitPage";
