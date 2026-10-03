import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  GitBranch,
  GitPullRequest,
  Search,
  Tag,
} from "lucide-react";
import { nativePage, type Commit } from "./api";
import type { RepoContext } from "./App";
import {
  EmptyState,
  Feedback,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { CommitStatusIcon } from "./RepositoryHistory";
import { headerClass, titleClass, toolbarClass } from "./repositoryStyles";

interface GraphRef {
  name: string;
  short: string;
  group: string;
}
interface GraphCommit extends Commit {
  parents: string[];
  refs: GraphRef[];
  column: number;
  row: number;
  flow?: number;
  status?: string;
  verified?: boolean;
}
interface GraphData {
  items: GraphCommit[];
  total: number;
  page_size: number;
  refs?: GraphRef[];
}

const colorCount = 8;

/** The native branch filter of the graph: several branches and tags. */
function RefFilter({
  refs,
  selected,
  onChange,
}: {
  refs: GraphRef[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation("repository");
  const [filter, setFilter] = useState("");
  const visible = refs.filter((ref) =>
    ref.short.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  return (
    <Popover.Root>
      <Popover.Trigger className="select-trigger graph-ref-filter max-w-72">
        <GitBranch size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">
          {selected.length
            ? t("graph.selectedRefs", { count: selected.length })
            : t("shared.allBranches")}
        </span>
        <ChevronDown size={14} className="ml-auto shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="dropdown-positioner"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup
            className="dropdown-popup w-80 max-w-[calc(100vw-24px)] p-0"
            aria-label={t("graph.filter")}
          >
            <div className="p-2">
              <label className="filter-input w-full">
                <Search size={14} />
                <input
                  autoFocus
                  aria-label={t("refs.filterBranchesTags")}
                  placeholder={t("refs.filterBranchesTags")}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
            </div>
            <div className="max-h-72 overflow-auto py-1">
              {visible.map((ref) => {
                const checked = selected.includes(ref.name);
                return (
                  <button
                    key={ref.name}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-sm hover:bg-hover"
                    onClick={() =>
                      onChange(
                        checked
                          ? selected.filter((name) => name !== ref.name)
                          : [...selected, ref.name],
                      )
                    }
                  >
                    <span className="inline-flex w-4 shrink-0">
                      {checked && <Check size={14} />}
                    </span>
                    {ref.group === "tags" ? (
                      <Tag size={13} className="shrink-0 text-muted" />
                    ) : (
                      <GitBranch size={13} className="shrink-0 text-muted" />
                    )}
                    <span className="min-w-0 truncate">{ref.short}</span>
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="border-t border-line p-1">
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
                  onClick={() => onChange([])}
                >
                  {t("graph.clearFilter")}
                </button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function GraphPage() {
  const { t } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1),
    branches = params.getAll("branch"),
    hidePullRefs = params.get("hide-pr-refs") !== "false",
    monochrome = params.get("mode") === "monochrome";
  const update = (changes: {
    branches?: string[];
    hidePullRefs?: boolean;
    monochrome?: boolean;
    page?: number;
  }) => {
    const next = new URLSearchParams();
    for (const branch of changes.branches ?? branches)
      next.append("branch", branch);
    if (!(changes.hidePullRefs ?? hidePullRefs))
      next.set("hide-pr-refs", "false");
    if (changes.monochrome ?? monochrome) next.set("mode", "monochrome");
    if (changes.page && changes.page > 1)
      next.set("page", String(changes.page));
    setParams(next);
  };
  const query = useQuery({
    queryKey: ["graph", path, page, branches.join("\n"), hidePullRefs],
    queryFn: ({ signal }) => {
      const request = new URLSearchParams([
        ["page", String(page)],
        ["hide-pr-refs", String(hidePullRefs)],
        ...branches.map((branch) => ["branch", branch]),
      ]);
      return nativePage<GraphData>(`${path}/graph?${request}`, signal);
    },
    enabled: !repository.empty,
    // Keep the ref filter usable while the next selection loads.
    placeholderData: (previous) => previous,
  });
  useTitle(t("graph.title"));
  const commits = useMemo(() => query.data?.items || [], [query.data]);
  const width = Math.max(90, ...commits.map((c) => (c.column + 2) * 20)),
    positions = new Map(
      commits.map((c, i) => [c.sha, { x: 20 + c.column * 20, y: i * 64 + 32 }]),
    );
  const color = (c: GraphCommit) =>
    monochrome
      ? "var(--color-muted)"
      : `var(--graph-${(c.flow ?? c.column) % colorCount})`;
  const root = `/projects${path}`;
  return (
    <section className="mx-auto min-w-0 max-w-[1272px] [--graph-0:#1f75cb] [--graph-1:#8f65d9] [--graph-2:#2da17b] [--graph-3:#d99530] [--graph-4:#dd2b0e] [--graph-5:#0e7c86] [--graph-6:#c2185b] [--graph-7:#5c6bc0]">
      <header className={headerClass}>
        <h1 className={titleClass}>{t("graph.title")}</h1>
      </header>
      <div className={toolbarClass}>
        <RefFilter
          refs={query.data?.refs ?? []}
          selected={branches}
          onChange={(next) => update({ branches: next, page: 1 })}
        />
        <label className="check-field flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hidePullRefs}
            onChange={(event) =>
              update({ hidePullRefs: event.target.checked, page: 1 })
            }
          />
          {t("graph.hidePullRefs")}
        </label>
        <div
          className="ml-auto flex items-stretch max-md:ml-0"
          role="group"
          aria-label={t("graph.colors")}
        >
          {(["color", "monochrome"] as const).map((mode) => (
            <button
              key={mode}
              className="button m-0 min-h-8 rounded-none px-3 first:rounded-l-md last:rounded-r-md aria-pressed:bg-hover aria-pressed:font-semibold [&+&]:border-l-0"
              aria-pressed={(mode === "monochrome") === monochrome}
              onClick={() => update({ monochrome: mode === "monochrome" })}
            >
              {t(mode === "color" ? "graph.color" : "graph.monochrome")}
            </button>
          ))}
        </div>
      </div>
      <Feedback error={query.error} />
      {query.isPending && !repository.empty ? (
        <Pending />
      ) : !commits.length ? (
        <EmptyState title={t("shared.noCommitsYet")}>
          {t("graph.emptyBody")}
        </EmptyState>
      ) : (
        <div className="flex overflow-auto rounded-md border border-line">
          <svg
            className="shrink-0"
            aria-label={t("graph.label")}
            width={width}
            height={commits.length * 64}
            role="img"
          >
            {commits.flatMap((c) =>
              (c.parents || []).map((parent) => {
                const start = positions.get(c.sha)!,
                  end = positions.get(parent) || {
                    x: start.x,
                    y: commits.length * 64,
                  };
                return (
                  <path
                    key={`${c.sha}-${parent}`}
                    d={`M ${start.x} ${start.y} C ${start.x} ${start.y + 25}, ${end.x} ${end.y - 25}, ${end.x} ${end.y}`}
                    fill="none"
                    stroke={color(c)}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                );
              }),
            )}
            {commits.map((c) => (
              <circle
                key={c.sha}
                cx={positions.get(c.sha)!.x}
                cy={positions.get(c.sha)!.y}
                r="5"
                fill={color(c)}
                stroke="var(--ui-surface)"
                strokeWidth="2"
              />
            ))}
          </svg>
          <div className="min-w-[420px] flex-1">
            {commits.map((c) => (
              <div
                key={c.sha}
                className="repository-graph-commit relative flex h-16 flex-col justify-center gap-1 border-b border-line pr-25 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {c.refs.map((ref) =>
                    ref.group === "pull" ? (
                      <Link
                        key={ref.name}
                        className="badge inline-flex items-center gap-1 hover:underline"
                        to={`${root}/merge-requests/${ref.name.split("/")[2]}`}
                      >
                        <GitPullRequest size={11} />!{ref.name.split("/")[2]}
                      </Link>
                    ) : (
                      <Link
                        className="badge inline-flex shrink-0 items-center gap-1 hover:underline"
                        key={ref.name}
                        to={`${root}?${new URLSearchParams({ ref: ref.short })}`}
                      >
                        {ref.group === "tags" ? (
                          <Tag size={11} />
                        ) : (
                          <GitBranch size={11} />
                        )}
                        {ref.short}
                      </Link>
                    ),
                  )}
                  <Link
                    className="truncate font-semibold"
                    to={`${root}/commit/${c.sha}`}
                  >
                    {c.message}
                  </Link>
                  {c.status && (
                    <CommitStatusIcon status={{ state: c.status }} />
                  )}
                </div>
                <span className="text-xs text-muted">
                  {c.author} · {relativeDate(c.date)}
                </span>
                <Link
                  className="absolute top-5 right-3 text-xs"
                  to={`${root}/commit/${c.sha}`}
                >
                  {c.sha.slice(0, 8)}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={query.data.page_size}
          onPage={(p) => update({ page: p })}
        />
      )}
    </section>
  );
}
