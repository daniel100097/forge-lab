import { useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  FileCode2,
  FileDiff,
  GitCommitHorizontal,
  GitGraph,
  Search,
  Tag,
} from "lucide-react";
import { get } from "./api";
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
import { RefSwitcher } from "./RefSwitcher";
import { PersonAvatar, SignatureBadge, type Signature } from "./CommitPage";

interface CommitStatusSummary {
  state: string;
  checks: { context: string; state: string; description: string }[];
}
export interface HistoryCommit {
  sha: string;
  message: string;
  body?: string;
  author: string;
  date: string;
  parents?: number;
  user?: { name: string; display_name: string; avatar_url: string } | null;
  signature?: Signature | null;
  status?: CommitStatusSummary;
  tags?: { name: string; release: boolean }[];
}

/** Native commit status icon (commit_status.tmpl): worst state of all checks. */
export function CommitStatusIcon({
  status,
}: {
  status?: { state: string; checks?: { context: string; state: string }[] };
}) {
  const { t } = useTranslation("repository");
  if (!status) return null;
  const title = [
    t("history.status", { state: status.state }),
    ...(status.checks ?? []).map((check) => `${check.context}: ${check.state}`),
  ].join("\n");
  const Icon =
    status.state === "success"
      ? CircleCheck
      : status.state === "pending"
        ? CircleDashed
        : CircleX;
  const color =
    status.state === "success"
      ? "text-success"
      : status.state === "pending"
        ? "text-[#c17d10]"
        : status.state === "warning"
          ? "text-[#c17d10]"
          : "text-danger";
  return (
    <span
      className={`commit-status inline-flex shrink-0 ${color}`}
      title={title}
      role="img"
      aria-label={title}
    >
      <Icon size={16} />
    </span>
  );
}

export function HistoryPage() {
  const { t } = useTranslation("repository");
  const { path, dataPath, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = params.get("ref") || repository.default_branch;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const file = params.get("path") || "";
  const search = params.get("q") || "",
    all = params.get("all") === "true";
  useTitle(t("history.documentTitle", { name: repository.name }));
  // Native search (/commits/{ref}/search) covers the whole branch, also when
  // it is started from a file history.
  const searching = !!search;
  const query = useQuery({
    queryKey: ["commits", path, ref, page, file, search, all],
    queryFn: ({ signal }) =>
      get<{
        items: HistoryCommit[];
        total: number;
        page_size: number;
        renamed_from?: { path: string; commit: string };
      }>(
        `${dataPath}/commits?${new URLSearchParams({ ref, path: searching ? "" : file, q: search, all: String(all), page: String(page) })}`,
        signal,
      ),
  });
  const root = `/projects${path}`;
  return (
    <>
      <div className="mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3">
        <h1 className="max-md:text-[22px]">{t("history.title")}</h1>
        <Link className="button" to={`../graph`}>
          <GitGraph size={15} />
          {t("history.graph")}
        </Link>
      </div>
      <form
        className="my-4 flex flex-wrap items-center gap-3"
        key={`${ref}:${search}:${all}:${file}`}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          setParams({
            ref,
            ...(file ? { path: file } : {}),
            q: String(values.get("q") || ""),
            all: values.has("all") ? "true" : "false",
          });
        }}
      >
        <RefSwitcher
          path={path}
          value={ref}
          label={t("history.branchLabel")}
          className="max-w-[220px] shrink-0"
          onSelect={(value) =>
            setParams({
              ref: value,
              ...(file ? { path: file } : {}),
              q: search,
              all: String(all),
            })
          }
        />
        <label className="filter-input w-auto min-w-0 flex-1 max-md:order-first max-md:basis-full">
          <Search size={16} />
          <input
            name="q"
            aria-label={t("history.searchLabel")}
            placeholder={t("history.searchPlaceholder")}
            defaultValue={search}
          />
        </label>
        <label className="check-field flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" name="all" defaultChecked={all} />
          {t("shared.allBranches")}
        </label>
        <button className="button">{t("shared.search")}</button>
      </form>
      {file && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            {t(searching ? "history.searchingBranch" : "history.fileHistory")}
          </span>
          <Link
            className="font-mono hover:underline"
            to={`${root}?${new URLSearchParams({ ref, path: file })}`}
          >
            {file}
          </Link>
          <Link className="button" to={`?ref=${encodeURIComponent(ref)}`}>
            {t("history.allFiles")}
          </Link>
        </div>
      )}
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div className="commit-list overflow-hidden rounded border border-line">
          {query.data.items.map((c) => (
            <article
              className="commit-list-row flex items-center gap-3 border-b border-line p-4 text-sm last:border-0 max-md:flex-wrap max-md:gap-2 max-md:px-2.5"
              key={c.sha}
            >
              <span className="max-md:hidden">
                {c.user ? (
                  <PersonAvatar user={c.user} name={c.author} />
                ) : (
                  <GitCommitHorizontal size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1 max-md:basis-full">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`../commit/${c.sha}`}
                    className={`font-semibold hover:underline ${(c.parents ?? 1) > 1 ? "text-muted" : ""}`}
                  >
                    {c.message}
                  </Link>
                  {c.body && (
                    <button
                      className="label hover:bg-control"
                      aria-expanded={expanded.has(c.sha)}
                      aria-label={t("history.toggleBody")}
                      title={t("history.toggleBody")}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (!next.delete(c.sha)) next.add(c.sha);
                          return next;
                        })
                      }
                    >
                      …
                    </button>
                  )}
                  <CommitStatusIcon status={c.status} />
                  {c.tags?.map((tag) => (
                    <Link
                      key={tag.name}
                      className="label hover:underline"
                      to={
                        tag.release
                          ? `${root}/releases/tag/${encodeURIComponent(tag.name)}`
                          : `${root}?${new URLSearchParams({ ref: tag.name })}`
                      }
                    >
                      <Tag size={11} />
                      {tag.name}
                    </Link>
                  ))}
                </div>
                {c.body && expanded.has(c.sha) && (
                  <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-muted">
                    {c.body}
                  </pre>
                )}
                <p className="text-xs text-muted mt-1">
                  {c.user ? (
                    <>
                      <Link
                        className="font-semibold hover:underline"
                        to={`/users/${encodeURIComponent(c.user.name)}`}
                      >
                        {c.user.display_name || c.author}
                      </Link>{" "}
                      {t("history.committedAt", { date: relativeDate(c.date) })}
                    </>
                  ) : (
                    t("shared.committed", {
                      author: c.author,
                      date: relativeDate(c.date),
                    })
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 max-md:ml-auto">
                <SignatureBadge signature={c.signature} />
                <span className="flex items-stretch overflow-hidden rounded-lg border border-control [&_.copy-icon]:h-auto">
                  <Link
                    className="flex items-center px-2.5 font-mono hover:bg-hover"
                    to={`../commit/${c.sha}`}
                  >
                    {c.sha.slice(0, 8)}
                  </Link>
                  <CopyButton
                    value={c.sha}
                    label={t("shared.copyCommitSha")}
                    compact
                  />
                </span>
                {file && !searching && (
                  <Link
                    className="icon-button"
                    to={`../commit/${c.sha}?${new URLSearchParams({ files: file })}`}
                    aria-label={t("history.viewFileDiff")}
                    title={t("history.viewFileDiff")}
                  >
                    <FileDiff size={16} />
                  </Link>
                )}
                <Link
                  className="icon-button"
                  to={`${root}?${new URLSearchParams({ ref: c.sha, ...(file && !searching ? { path: file } : {}) })}`}
                  aria-label={t("history.browseAtCommit")}
                  title={t("history.browseAtCommit")}
                >
                  <FileCode2 size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={t(search ? "history.noMatches" : "shared.noCommitsYet")}
        />
      )}
      {query.data?.renamed_from && (
        <p className="mt-3 rounded border border-line bg-surface-subtle px-4 py-3 text-sm">
          {t("history.renamedFrom", { path: query.data.renamed_from.path })}{" "}
          <Link
            className="text-primary hover:underline"
            to={`?${new URLSearchParams({ ref: query.data.renamed_from.commit, path: query.data.renamed_from.path })}`}
          >
            {t("history.browseFurther")}
          </Link>
        </p>
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={query.data.page_size}
          onPage={(p) =>
            setParams({
              ref,
              ...(file ? { path: file } : {}),
              q: search,
              all: String(all),
              page: String(p),
            })
          }
        />
      )}
    </>
  );
}
