import { useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  Download,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Plus,
  RotateCcw,
  Rss,
  Search,
  Shield,
  Tag,
  Trash2,
} from "lucide-react";
import { get, native, nativeForm, type Commit } from "./api";
import type { RepoContext } from "./App";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { ActionMenu, MenuDownload } from "./ActionMenu";
import {
  RefSwitcher,
  escapeSegments,
  useReferenceNames,
  refKind,
} from "./RefSwitcher";
import { archiveUrl, repositoryDetails } from "./CodeExtras";
import { CommitStatusIcon } from "./RepositoryHistory";
import { SignatureBadge, type Signature } from "./CommitPage";
import {
  actionsClass,
  contentClass,
  formClass,
  formLabelClass,
  headerClass,
  listClass,
  mutedClass,
  pageClass,
  rowClass,
  rowIconClass,
  rowMutedClass,
  rowTitleClass,
  titleClass,
  toolbarClass,
} from "./repositoryStyles";

interface PersonSummary {
  name: string;
  display_name: string;
  avatar_url: string;
}
interface ReferenceItem {
  id?: number;
  name: string;
  default?: boolean;
  protected?: boolean;
  deleted?: boolean;
  deleted_at?: string;
  deleted_by?: PersonSummary | null;
  can_restore?: boolean;
  can_delete: boolean;
  sync_allowed?: boolean;
  commits_behind?: number;
  message?: string;
  commit: Commit;
  ahead?: number;
  behind?: number;
  pusher?: PersonSummary | null;
  status?: {
    state: string;
    checks: { context: string; state: string; description: string }[];
  };
  pull?: {
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    repository: string;
    same_repository: boolean;
  };
  release?: boolean;
  draft?: boolean;
  prerelease?: boolean;
  signature?: Signature | null;
  author?: string;
  date?: string;
}
interface ReferenceList {
  items: ReferenceItem[];
  total: number;
  page: number;
  can_create: boolean;
  can_create_release?: boolean;
  can_read_releases?: boolean;
}

export function SearchForm({
  value,
  onSearch,
  label,
  placeholder,
}: {
  value: string;
  onSearch: (q: string) => void;
  label: string;
  placeholder: string;
}) {
  const { t } = useTranslation("repository");
  const [query, setQuery] = useState(value);
  return (
    <form
      className="flex min-w-48 flex-1 items-center gap-2 max-md:basis-full"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(query);
      }}
    >
      <label className="filter-input w-full flex-1">
        <Search size={16} />
        <input
          aria-label={label}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button className="button" type="submit">
        {t("shared.search")}
      </button>
    </form>
  );
}

/** Ahead/behind bars relative to the default branch (native branch list). */
function Divergence({ ahead, behind }: { ahead: number; behind: number }) {
  const { t } = useTranslation("repository");
  const total = Math.max(1, ahead + behind);
  const width = (value: number) =>
    `${value ? Math.max(6, (value / total) * 100) : 0}%`;
  return (
    <div
      className="branch-divergence flex w-36 shrink-0 flex-col gap-1 text-xs text-muted max-md:hidden"
      title={t("references.divergence", { ahead, behind })}
    >
      <div className="flex justify-between gap-2">
        <span>{t("references.behind", { count: behind })}</span>
        <span>{t("references.ahead", { count: ahead })}</span>
      </div>
      <div className="flex h-1.5 gap-0.5">
        <span className="flex flex-1 justify-end">
          <span
            className="h-full rounded-l-sm bg-[#bfbfc3] dark:bg-[#626168]"
            style={{ width: width(behind) }}
          />
        </span>
        <span className="flex flex-1">
          <span
            className="h-full rounded-r-sm bg-[#bfbfc3] dark:bg-[#626168]"
            style={{ width: width(ahead) }}
          />
        </span>
      </div>
    </div>
  );
}

function PullLink({
  pull,
  root,
}: {
  pull: NonNullable<ReferenceItem["pull"]>;
  root: string;
}) {
  const { t } = useTranslation("repository");
  const Icon =
    pull.state === "merged"
      ? GitMerge
      : pull.state === "closed"
        ? GitPullRequestClosed
        : GitPullRequest;
  const color =
    pull.state === "merged"
      ? "bg-merged-bg text-merged"
      : pull.state === "closed"
        ? "bg-danger-bg text-danger"
        : "bg-success-bg text-success";
  const target = pull.same_repository
    ? `${root}/merge-requests/${pull.number}`
    : `/projects/${pull.repository.split("/").map(encodeURIComponent).join("/")}/merge-requests/${pull.number}`;
  return (
    <Link
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 text-xs leading-5 ${color}`}
      to={target}
      title={`${pull.title} (${t(`references.pullState.${pull.state}`)})`}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">
        {pull.same_repository ? "" : pull.repository}!{pull.number}
      </span>
    </Link>
  );
}

export function BranchesPage() {
  return <ReferencesPage />;
}
export function TagsPage() {
  return <ReferencesPage tags />;
}
function ReferencesPage({ tags = false }: { tags?: boolean }) {
  const { t } = useTranslation("repository");
  const context = useOutletContext<RepoContext>();
  const { path, dataPath } = context;
  const repository = repositoryDetails(context.repository);
  const root = `/projects${path}`;
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState("");
  const [source, setSource] = useState(
    params.get("ref") || repository.default_branch,
  );
  const [confirm, setConfirm] = useState<ReferenceItem>();
  const names = useReferenceNames(path);
  const page = Number(params.get("page") || 1),
    keyword = params.get("q") || "",
    deleted = params.get("state") === "deleted",
    creating = params.get("new") === "1";
  const kind = tags ? "tags" : "branches",
    title = t(`references.${kind}.title`);
  const client = useQueryClient();
  useTitle(title);
  const query = useQuery({
    queryKey: ["reference-list", path, kind, keyword, page, deleted],
    queryFn: ({ signal }) =>
      get<ReferenceList>(
        `${dataPath}/${kind}?${new URLSearchParams({ q: keyword, page: String(page), state: deleted ? "deleted" : "active" })}`,
        signal,
      ),
  });
  const mutate = useMutation({
    mutationFn: async ({
      action,
      item,
    }: {
      action: "create" | "delete" | "restore" | "sync";
      item?: ReferenceItem;
    }) => {
      if (action === "sync")
        return nativeForm(`${path}/sync_fork`, { branch: item!.name });
      if (action === "create")
        return nativeForm(
          `${path}/branches/_new/${refKind(source, names)}/${escapeSegments(source)}`,
          { new_branch_name: name, create_tag: String(tags), current_path: "" },
        );
      return nativeForm(
        `${path}/${tags ? "tags/delete" : `branches/${action}`}`,
        tags
          ? { id: String(item!.id) }
          : {
              name: item!.name,
              branch_id: String(item!.id || ""),
              page: String(page),
            },
      );
    },
    onSuccess: async () => {
      setConfirm(undefined);
      setName("");
      setParams({
        ...(keyword ? { q: keyword } : {}),
        ...(deleted ? { state: "deleted" } : {}),
      });
      await client.invalidateQueries({ queryKey: ["reference-list", path] });
      await client.invalidateQueries({ queryKey: ["branches", path] });
      await client.invalidateQueries({ queryKey: ["tag-names", path] });
      await client.invalidateQueries({ queryKey: ["repo-overview", path] });
    },
  });
  const startCreate = (from: string) => {
    setSource(from);
    setParams({ new: "1", ref: from });
  };
  const archives = repository.archive_downloads !== false;
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>{title}</h1>
        <div className={actionsClass}>
          {tags && repository.feeds && (
            <a
              className="button px-2"
              href={native(`${path}/tags.rss`)}
              aria-label={t("feeds.tags")}
              title={t("feeds.tags")}
            >
              <Rss size={15} />
            </a>
          )}
          {query.data?.can_create && (
            <button
              className="button primary"
              onClick={() => startCreate(source)}
            >
              <Plus size={16} />
              {t(`references.${kind}.new`)}
            </button>
          )}
        </div>
      </header>
      {!tags && (
        <nav className="tabs" aria-label={t("references.status")}>
          <button
            className={!deleted ? "active" : ""}
            onClick={() => setParams({})}
          >
            {t("references.active")}
          </button>
          <button
            className={deleted ? "active" : ""}
            onClick={() => setParams({ state: "deleted" })}
          >
            {t("references.deleted")}
          </button>
        </nav>
      )}
      <Feedback error={query.error || mutate.error} />
      {creating && (
        <form
          className={`workspace-form ${formClass}`}
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate({ action: "create" });
          }}
        >
          <h2 className="text-lg font-semibold">
            {t(`references.${kind}.new`)}
          </h2>
          <label className={formLabelClass}>
            {t(`references.${kind}.nameLabel`)}
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className={formLabelClass}>
            <span>{t("references.createFrom")}</span>
            <RefSwitcher
              path={path}
              value={source}
              onSelect={setSource}
              label={t("references.createFrom")}
              className="max-w-sm"
            />
          </div>
          <p className={mutedClass}>{t(`references.${kind}.createHint`)}</p>
          <div className={actionsClass}>
            <button className="button primary" disabled={mutate.isPending}>
              {t(`references.${kind}.create`)}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setParams({})}
            >
              {t("shared.cancel")}
            </button>
          </div>
        </form>
      )}
      {confirm && (
        <div
          className="my-4 rounded-md border border-line bg-surface-subtle p-5"
          role="alertdialog"
          aria-labelledby="delete-reference-title"
        >
          <h2 id="delete-reference-title" className="text-lg font-semibold">
            {t(`references.${kind}.deleteTitle`)}
          </h2>
          <p className="my-3">
            <Trans
              t={t}
              i18nKey={`references.${kind}.deleteBody`}
              components={{ name: <strong>{confirm.name}</strong> }}
            />
          </p>
          <div className={actionsClass}>
            <button
              className="button"
              disabled={mutate.isPending}
              onClick={() => mutate.mutate({ action: "delete", item: confirm })}
            >
              {t(`references.${kind}.delete`)}
            </button>
            <button className="button" onClick={() => setConfirm(undefined)}>
              {t("shared.cancel")}
            </button>
          </div>
        </div>
      )}
      <div className={toolbarClass}>
        <SearchForm
          key={keyword}
          value={keyword}
          label={t(`references.${kind}.searchLabel`)}
          placeholder={t(`references.${kind}.searchPlaceholder`)}
          onSearch={(q) =>
            setParams({ ...(deleted ? { state: "deleted" } : {}), q })
          }
        />
      </div>
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <div className={listClass}>
              {query.data.items.map((item) => (
                <article className={rowClass} key={item.name}>
                  {tags ? (
                    <Tag size={18} className={rowIconClass} />
                  ) : item.protected ? (
                    <Shield size={18} className={rowIconClass} />
                  ) : (
                    <GitBranch size={18} className={rowIconClass} />
                  )}
                  <div className={contentClass}>
                    <div className={rowTitleClass}>
                      <Link
                        to={
                          tags && item.release && query.data.can_read_releases
                            ? `${root}/releases/tag/${encodeURIComponent(item.name)}`
                            : `${root}?${new URLSearchParams({ ref: item.name })}`
                        }
                      >
                        {item.name}
                      </Link>
                      {!item.deleted && (
                        <span className="[&_.button]:min-h-6 [&_.button]:border-0 [&_.button]:bg-transparent [&_.button]:px-1">
                          <CopyButton
                            value={item.name}
                            label={t(
                              tags
                                ? "references.copyTag"
                                : "references.copyBranch",
                            )}
                            compact
                          />
                        </span>
                      )}
                      {item.default && (
                        <span className="badge">{t("references.default")}</span>
                      )}
                      {item.protected && (
                        <span className="badge">
                          {t("references.protected")}
                        </span>
                      )}
                      {item.release && (
                        <span className="badge">
                          {t(
                            item.draft
                              ? "references.draftRelease"
                              : item.prerelease
                                ? "references.prerelease"
                                : "references.release",
                          )}
                        </span>
                      )}
                      <SignatureBadge signature={item.signature} />
                      <CommitStatusIcon status={item.status} />
                      {item.pull && <PullLink pull={item.pull} root={root} />}
                      {item.deleted && (
                        <span className="badge">
                          {item.deleted_by
                            ? t("references.deletedBy", {
                                name: item.deleted_by.display_name,
                                date: relativeDate(item.deleted_at),
                              })
                            : t("references.deletedAgo", {
                                date: relativeDate(item.deleted_at),
                              })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <Link to={`${root}/commit/${item.commit.sha}`}>
                        {item.commit.sha.slice(0, 8)}
                      </Link>
                      <span className="max-w-[440px] truncate">
                        {item.commit.message}
                      </span>
                      <span className={rowMutedClass}>
                        {item.commit.author && `${item.commit.author} · `}
                        {relativeDate(item.commit.date)}
                      </span>
                      {item.pusher && (
                        <span
                          className={`${rowMutedClass} flex items-center gap-1`}
                        >
                          <img
                            className="size-4 rounded-full"
                            src={item.pusher.avatar_url}
                            alt=""
                          />
                          {t("references.pushedBy", {
                            name: item.pusher.display_name,
                          })}
                        </span>
                      )}
                    </div>
                    {item.message && (
                      <p className="mt-2 text-sm whitespace-pre-wrap">
                        {item.message}
                      </p>
                    )}
                  </div>
                  {!tags &&
                    !item.deleted &&
                    !item.default &&
                    item.ahead !== undefined &&
                    item.behind !== undefined &&
                    item.ahead >= 0 && (
                      <Divergence ahead={item.ahead} behind={item.behind} />
                    )}
                  <div className={`${actionsClass} max-md:ml-7`}>
                    {item.sync_allowed && (
                      <button
                        className="button"
                        disabled={mutate.isPending}
                        onClick={() => mutate.mutate({ action: "sync", item })}
                      >
                        <RotateCcw size={15} />
                        {item.commits_behind
                          ? t("references.syncForkBehind", {
                              count: item.commits_behind,
                            })
                          : t("references.syncFork")}
                      </button>
                    )}
                    {tags && !item.release && query.data.can_create_release && (
                      <Link
                        className="button"
                        to={`${root}/releases/new?${new URLSearchParams({ tag: item.name })}`}
                      >
                        {t("references.newRelease")}
                      </Link>
                    )}
                    {tags && item.release && query.data.can_read_releases && (
                      <Link
                        className="button"
                        to={`${root}/releases/tag/${encodeURIComponent(item.name)}`}
                      >
                        {t("references.viewRelease")}
                      </Link>
                    )}
                    {!item.deleted && !item.default && !tags && (
                      <Link
                        className="button"
                        to={`${root}/compare?${new URLSearchParams({ target: repository.default_branch, source: item.name })}`}
                      >
                        {t("references.compare")}
                      </Link>
                    )}
                    {!item.deleted && query.data.can_create && !tags && (
                      <button
                        className="icon-button"
                        aria-label={t("references.branches.newFrom", {
                          name: item.name,
                        })}
                        title={t("references.branches.newFrom", {
                          name: item.name,
                        })}
                        onClick={() => startCreate(item.name)}
                      >
                        <GitBranch size={16} />
                      </button>
                    )}
                    {!item.deleted && !tags && repository.feeds && (
                      <a
                        className="icon-button"
                        href={native(
                          `${path}/rss/branch/${escapeSegments(item.name)}`,
                        )}
                        aria-label={t("feeds.branch", { name: item.name })}
                        title={t("feeds.branch", { name: item.name })}
                      >
                        <Rss size={16} />
                      </a>
                    )}
                    {!item.deleted && archives && (
                      <ActionMenu
                        label={t("references.download", { name: item.name })}
                        className="icon-button"
                        trigger={<Download size={16} />}
                      >
                        <MenuDownload href={archiveUrl(path, item.name, "zip")}>
                          ZIP
                        </MenuDownload>
                        <MenuDownload
                          href={archiveUrl(path, item.name, "tar.gz")}
                        >
                          TAR.GZ
                        </MenuDownload>
                      </ActionMenu>
                    )}
                    {item.can_restore && (
                      <button
                        className="button"
                        disabled={mutate.isPending}
                        onClick={() =>
                          mutate.mutate({ action: "restore", item })
                        }
                      >
                        <RotateCcw size={15} />
                        {t("references.restore")}
                      </button>
                    )}
                    {item.can_delete ? (
                      <button
                        className="icon-button"
                        aria-label={t("references.deleteItem", {
                          name: item.name,
                        })}
                        onClick={() => setConfirm(item)}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      !item.deleted && (
                        // Keeps the actions aligned with rows that can be deleted.
                        <span className="size-8 shrink-0" aria-hidden />
                      )
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!query.data.items.length && (
              <EmptyState
                title={t(
                  `references.${kind}.${
                    deleted
                      ? keyword
                        ? "emptyDeletedSearchTitle"
                        : "emptyDeletedTitle"
                      : keyword
                        ? "emptySearchTitle"
                        : "emptyTitle"
                  }`,
                )}
              >
                {keyword
                  ? t("references.emptySearchBody")
                  : t(`references.${kind}.emptyBody`)}
              </EmptyState>
            )}
            <Pagination
              page={page}
              total={query.data.total}
              onPage={(p) =>
                setParams({
                  q: keyword,
                  page: String(p),
                  ...(deleted ? { state: "deleted" } : {}),
                })
              }
            />
          </>
        )
      )}
    </section>
  );
}
