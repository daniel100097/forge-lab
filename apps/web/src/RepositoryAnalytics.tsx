import { useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  GitCommitHorizontal,
  GitMerge,
  MessageSquareDot,
  Tag,
  ZoomOut,
} from "lucide-react";
import { get, native } from "./api";
import type { RepoContext } from "./App";
import { EmptyState, Feedback, Pending, relativeDate, useTitle } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  avatarClass,
  contentClass,
  headerClass,
  listClass,
  mutedClass,
  pageClass,
  rowClass,
  rowIconClass,
  rowMutedClass,
  sectionTitleClass,
  statCellClass,
  statHeadClass,
  titleClass,
} from "./repositoryStyles";

interface Activity {
  period: string;
  from: string;
  until: string;
  opened_issues: number;
  closed_issues: number;
  opened_pulls: number;
  merged_pulls: number;
  commits: number;
  commits_all_branches?: number;
  contributors: number;
  changed_files: number;
  additions: number;
  deletions: number;
  releases: number;
  items: {
    kind: string;
    event: string;
    number: number;
    title: string;
    date: string;
  }[];
  authors: {
    name: string;
    login: string;
    avatar_link: string;
    home_link?: string;
    commits: number;
  }[];
  released?: {
    tag: string;
    title: string;
    tag_only: boolean;
    prerelease: boolean;
    date: string;
  }[];
  unresolved?: { number: number; title: string; pull: boolean; date: string }[];
  can_read?: {
    code: boolean;
    issues: boolean;
    pulls: boolean;
    releases: boolean;
  };
}

function AnalyticsTabs({ path, current }: { path: string; current: string }) {
  const { t } = useTranslation("repository");
  return (
    <nav
      className="tabs overflow-auto whitespace-nowrap"
      aria-label={t("activity.tabs.label")}
    >
      {[
        ["activity", t("activity.tabs.activity")],
        ["activity/contributors", t("activity.tabs.contributors")],
        ["activity/code-frequency", t("activity.tabs.codeFrequency")],
        ["activity/recent-commits", t("activity.tabs.commits")],
      ].map(([route, label]) => (
        <Link
          key={route}
          to={`/projects${path}/${route}`}
          className={route === current ? "active" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Commits per author as a bar list (native top authors chart). */
function TopAuthors({ authors }: { authors: Activity["authors"] }) {
  const { t, i18n } = useTranslation("repository");
  const max = Math.max(1, ...authors.map((author) => author.commits));
  const format = new Intl.NumberFormat(i18n.language);
  return (
    <figure className="top-authors my-4" aria-label={t("activity.topAuthors")}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {authors.map((author) => (
          <li
            key={author.login || author.name}
            className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-center gap-3 text-sm max-md:grid-cols-[minmax(0,120px)_minmax(0,1fr)]"
            title={t("shared.commitCount", { count: author.commits })}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img
                className="size-6 shrink-0 rounded-full"
                src={author.avatar_link}
                alt=""
              />
              {author.login ? (
                <Link
                  className="truncate hover:underline"
                  to={`/users/${encodeURIComponent(author.login)}`}
                >
                  {author.name}
                </Link>
              ) : (
                <span className="truncate">{author.name}</span>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-3.5 rounded-r bg-primary"
                style={{ width: `${(author.commits / max) * 85}%` }}
              />
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {format.format(author.commits)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function RepositoryActivityPage() {
  const { t } = useTranslation("repository");
  const { path, dataPath, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const period = params.get("period") || "weekly";
  const query = useQuery({
    queryKey: ["repository-activity", path, period],
    queryFn: ({ signal }) =>
      get<Activity>(`${dataPath}/activity?period=${period}`, signal),
  });
  useTitle(t("activity.title"));
  const data = query.data;
  const root = `/projects${path}`;
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>{t("activity.title")}</h1>
        <SelectControl
          label={t("activity.period")}
          value={period}
          onValueChange={(value) => setParams({ period: value })}
          options={(
            [
              "daily",
              "halfweekly",
              "weekly",
              "monthly",
              "quarterly",
              "semiyearly",
              "yearly",
            ] as const
          ).map((value) => ({ value, label: t(`activity.periods.${value}`) }))}
        />
      </header>
      <AnalyticsTabs path={path} current="activity" />
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        data && (
          <>
            <div className="repository-activity-stats my-6 grid grid-cols-3 gap-4 max-md:grid-cols-1">
              {[
                [data.merged_pulls, t("activity.stats.mergedPulls")],
                [data.opened_pulls, t("activity.stats.openedPulls")],
                [data.closed_issues, t("activity.stats.closedIssues")],
                [data.opened_issues, t("activity.stats.openedIssues")],
                [data.commits, t("activity.stats.commits")],
                [data.contributors, t("activity.stats.contributors")],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="flex flex-col gap-2 rounded-md border border-line px-5 py-4"
                >
                  <strong className="text-3xl font-semibold">{value}</strong>
                  <span className="text-sm text-muted">{label}</span>
                </div>
              ))}
            </div>
            <p className="rounded-md border border-line bg-surface-subtle px-4 py-3 text-sm">
              <Trans
                t={t}
                i18nKey="activity.summary"
                count={data.changed_files}
                values={{
                  additions: t("activity.additions", {
                    count: data.additions,
                  }),
                  deletions: t("activity.deletions", {
                    count: data.deletions,
                  }),
                }}
                components={{
                  strong: <strong />,
                  additions: <span />,
                  deletions: <span />,
                }}
              />
            </p>
            {data.can_read?.code !== false && !repository.empty && (
              <>
                <h2 className={sectionTitleClass}>{t("activity.codeTitle")}</h2>
                {data.commits_all_branches ? (
                  <p className="activity-push-stats text-sm leading-6">
                    {t("activity.pushStats", {
                      authors: t("activity.authorCount", {
                        count: data.contributors,
                      }),
                      commits: t("shared.commitCount", { count: data.commits }),
                      branch: repository.default_branch,
                      all: t("shared.commitCount", {
                        count: data.commits_all_branches,
                      }),
                    })}
                  </p>
                ) : (
                  <p className={mutedClass}>{t("activity.noGitActivity")}</p>
                )}
                {!!data.authors?.length && (
                  <TopAuthors authors={data.authors} />
                )}
              </>
            )}
            {!!data.released?.length && (
              <>
                <h2 className={sectionTitleClass}>
                  {t("activity.releasedTitle", {
                    count: data.released.length,
                  })}
                </h2>
                <div className={listClass}>
                  {data.released.map((release) => (
                    <article className={rowClass} key={release.tag}>
                      <Tag size={18} className={rowIconClass} />
                      <div className={contentClass}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge">
                            {t(
                              release.tag_only
                                ? "activity.releaseKinds.tag"
                                : release.prerelease
                                  ? "activity.releaseKinds.prerelease"
                                  : "activity.releaseKinds.release",
                            )}
                          </span>
                          <Link
                            className="font-semibold hover:underline"
                            to={
                              release.tag_only
                                ? `${root}?${new URLSearchParams({ ref: release.tag })}`
                                : `${root}/releases/tag/${encodeURIComponent(release.tag)}`
                            }
                          >
                            {release.tag_only
                              ? release.tag
                              : `${release.tag} · ${release.title}`}
                          </Link>
                        </div>
                        <p className={rowMutedClass}>
                          {relativeDate(release.date)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            <h2 className={sectionTitleClass}>{t("activity.heading")}</h2>
            <div className={listClass}>
              {[...data.items]
                .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
                .map((item, index) => (
                  <article
                    className={rowClass}
                    key={`${item.kind}-${item.number}-${index}`}
                  >
                    {item.kind === "pull" ? (
                      <GitMerge size={18} className={rowIconClass} />
                    ) : (
                      <GitCommitHorizontal size={18} className={rowIconClass} />
                    )}
                    <div className={contentClass}>
                      <Link
                        to={`${root}/${item.kind === "pull" ? "merge-requests" : "issues"}/${item.number}`}
                      >
                        {item.title}
                      </Link>
                      <p className={rowMutedClass}>
                        {item.event === "opened" ||
                        item.event === "closed" ||
                        item.event === "merged"
                          ? t(`activity.events.${item.event}`, {
                              reference: `${item.kind === "pull" ? "!" : "#"}${item.number}`,
                              date: relativeDate(item.date),
                            })
                          : `${item.kind === "pull" ? "!" : "#"}${item.number} ${item.event} ${relativeDate(item.date)}`}
                      </p>
                    </div>
                  </article>
                ))}
            </div>
            {!data.items.length && (
              <EmptyState title={t("activity.emptyTitle")}>
                {t("activity.emptyBody")}
              </EmptyState>
            )}
            {!!data.unresolved?.length && (
              <>
                <h2
                  className={sectionTitleClass}
                  title={t("activity.unresolvedHint")}
                >
                  {t("activity.unresolvedTitle", {
                    count: data.unresolved.length,
                  })}
                </h2>
                <div className={listClass}>
                  {data.unresolved.map((item) => (
                    <article
                      className={rowClass}
                      key={`${item.pull}-${item.number}`}
                    >
                      <MessageSquareDot size={18} className={rowIconClass} />
                      <div className={contentClass}>
                        <Link
                          to={`${root}/${item.pull ? "merge-requests" : "issues"}/${item.number}`}
                        >
                          {item.title}
                        </Link>
                        <p className={rowMutedClass}>
                          {t("activity.updated", {
                            reference: `${item.pull ? "!" : "#"}${item.number}`,
                            date: relativeDate(item.date),
                          })}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            <h2 className={sectionTitleClass}>
              {t("activity.topContributors")}
            </h2>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              {(data.authors || []).map((author) => (
                <article
                  className="flex items-center gap-3 rounded-md border border-line p-4"
                  key={author.login || author.name}
                >
                  <img
                    className={avatarClass}
                    src={author.avatar_link}
                    alt=""
                  />
                  <div>
                    <strong>{author.name}</strong>
                    <p className={mutedClass}>
                      {t("shared.commitCount", { count: author.commits })}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      )}
    </section>
  );
}

interface Week {
  week: number;
  additions: number;
  deletions: number;
  commits: number;
}
interface Contributor {
  name: string;
  login: string;
  avatar_link: string;
  home_link?: string;
  total_commits: number;
  weeks: Record<string, Week>;
}
async function contributorData(
  path: string,
  signal: AbortSignal,
  failure: string,
) {
  const response = await fetch(native(`${path}/activity/contributors/data`), {
    credentials: "same-origin",
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 202) return null;
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(failure);
  return (await response.json()) as Record<string, Contributor>;
}

type Range = [number, number] | null;

/**
 * Weekly line chart with a hover readout and drag-to-zoom (native
 * contributors chart). The zoom range is shared through onZoom.
 */
function WeekChart({
  weeks,
  metric,
  range,
  onZoom,
  compact = false,
}: {
  weeks: Week[];
  metric: "commits" | "lines";
  range?: Range;
  onZoom?: (range: Range) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("repository");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const sorted = useMemo(
    () =>
      [...weeks]
        .sort((a, b) => a.week - b.week)
        .filter(
          (week) => !range || (week.week >= range[0] && week.week <= range[1]),
        ),
    [weeks, range],
  );
  const keys: ("commits" | "additions" | "deletions")[] =
    metric === "commits" ? ["commits"] : ["additions", "deletions"];
  const max = Math.max(1, ...sorted.flatMap((w) => keys.map((key) => w[key]))),
    width = 900,
    height = compact ? 90 : 160;
  const x = (index: number) =>
    sorted.length === 1 ? width / 2 : (index / (sorted.length - 1)) * width;
  const y = (value: number) => height - (value / max) * (height - 16);
  const colors = {
    commits: "var(--color-primary)",
    additions: "#2da160",
    deletions: "#dd2b0e",
  };
  const indexAt = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !sorted.length) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return Math.round(ratio * (sorted.length - 1));
  };
  const date = (week?: Week) =>
    week ? new Date(week.week).toLocaleDateString(i18n.language) : "";
  const hovered = hover === null ? undefined : sorted[hover];
  return (
    <div className={`relative min-w-0 ${compact ? "my-3" : "my-5"}`}>
      {metric === "lines" && (
        <div className="mb-2 flex gap-4 text-xs text-muted">
          {keys.map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <i
                className="h-0.5 w-4 rounded"
                style={{ backgroundColor: colors[key] }}
              />
              {t(`analytics.${key}`)}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svg}
        className={`${compact ? "h-24" : "h-44"} w-full touch-none select-none ${onZoom ? "cursor-crosshair" : ""}`}
        viewBox={`0 0 ${width} ${height + 12}`}
        role="img"
        aria-label={t(
          metric === "commits"
            ? "analytics.commitsPerWeek"
            : "analytics.linesPerWeek",
        )}
        preserveAspectRatio="none"
        onPointerMove={(event) => {
          const index = indexAt(event.clientX);
          setHover(index);
          if (drag) setDrag([drag[0], index]);
        }}
        onPointerLeave={() => {
          setHover(null);
          setDrag(null);
        }}
        onPointerDown={(event) => {
          if (!onZoom) return;
          const index = indexAt(event.clientX);
          setDrag([index, index]);
        }}
        onPointerUp={() => {
          if (!drag || !onZoom) return;
          const [a, b] = [Math.min(...drag), Math.max(...drag)];
          setDrag(null);
          if (b > a) onZoom([sorted[a].week, sorted[b].week]);
        }}
      >
        <path d={`M 0 ${height} H ${width}`} stroke="var(--color-line)" />
        {drag && drag[0] !== drag[1] && (
          <rect
            x={x(Math.min(...drag))}
            y={0}
            width={Math.abs(x(drag[1]) - x(drag[0]))}
            height={height}
            fill="var(--color-primary)"
            opacity={0.12}
          />
        )}
        {keys.map((key) => (
          <g key={key}>
            <path
              d={`M ${x(0)} ${height} ${sorted.map((week, index) => `L ${x(index)} ${y(week[key])}`).join(" ")} L ${x(sorted.length - 1)} ${height} Z`}
              fill={colors[key]}
              opacity={0.1}
            />
            <polyline
              points={sorted
                .map((week, index) => `${x(index)},${y(week[key])}`)
                .join(" ")}
              fill="none"
              stroke={colors[key]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Zero-length round-capped lines: dots that keep their shape
                in the stretched (preserveAspectRatio="none") chart. */}
            {sorted.map((week, index) =>
              sorted.length <= 12 ||
              index === sorted.length - 1 ||
              index === hover ? (
                <line
                  key={week.week}
                  x1={x(index)}
                  x2={x(index)}
                  y1={y(week[key])}
                  y2={y(week[key])}
                  stroke={colors[key]}
                  strokeWidth={index === hover ? 10 : 8}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </g>
        ))}
        {hovered && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={0}
            y2={height}
            stroke="var(--color-muted)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${Math.min(80, (x(hover!) / width) * 100)}%`,
          }}
          role="status"
        >
          <span className="block text-muted">
            {t("analytics.weekOf", { date: date(hovered) })}
          </span>
          {keys.map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <i
                className="h-0.5 w-3 rounded"
                style={{ backgroundColor: colors[key] }}
              />
              <strong>{hovered[key]}</strong> {t(`analytics.${key}`)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{date(sorted[0])}</span>
        <span>{date(sorted.at(-1))}</span>
      </div>
    </div>
  );
}

export function RepositoryAnalyticsPage({
  kind,
}: {
  kind: "contributors" | "code-frequency" | "recent-commits";
}) {
  const { t, i18n } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const [range, setRange] = useState<Range>(null);
  const [metric, setMetric] = useState<"commits" | "additions" | "deletions">(
    "commits",
  );
  const title = t(
    kind === "contributors"
      ? "activity.tabs.contributors"
      : kind === "code-frequency"
        ? "activity.tabs.codeFrequency"
        : "activity.tabs.commits",
  );
  const query = useQuery({
    queryKey: ["contributor-statistics", path],
    queryFn: ({ signal }) =>
      contributorData(path, signal, t("analytics.loadFailed")),
    refetchInterval: (query) => (query.state.data === null ? 2500 : false),
    enabled: !repository.empty,
  });
  useTitle(title);
  const format = new Intl.NumberFormat(i18n.language);
  const totals = query.data?.total,
    weeks = Object.values(totals?.weeks || {}).sort((a, b) => a.week - b.week),
    inRange = (week: Week) =>
      !range || (week.week >= range[0] && week.week <= range[1]),
    people = Object.entries(query.data || {})
      .filter(([key]) => key !== "total")
      .map(([, person]) => {
        const personWeeks = Object.values(person.weeks || {}).filter(inRange);
        return {
          ...person,
          commits: personWeeks.reduce((n, week) => n + week.commits, 0),
          additions: personWeeks.reduce((n, week) => n + week.additions, 0),
          deletions: personWeeks.reduce((n, week) => n + week.deletions, 0),
        };
      })
      .filter((person) => person.commits > 0 || !range)
      .sort((a, b) => b[metric] - a[metric]),
    visibleWeeks =
      kind === "recent-commits"
        ? weeks.filter(
            // Forgejo reports week starts as Unix milliseconds.
            (week) => week.week > Date.now() - 365 * 24 * 3600 * 1000,
          )
        : weeks;
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>{title}</h1>
        <span className={mutedClass}>{repository.default_branch}</span>
      </header>
      <AnalyticsTabs path={path} current={`activity/${kind}`} />
      <Feedback error={query.error} />
      {repository.empty ? (
        <EmptyState title={t("shared.noCommitsYet")}>
          {t("analytics.emptyBody")}
        </EmptyState>
      ) : query.isPending || query.data === null ? (
        <>
          <Pending />
          {query.data === null && (
            <p className={mutedClass}>{t("analytics.calculating")}</p>
          )}
        </>
      ) : (
        query.data && (
          <>
            <div className="my-5 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">
                {t("shared.commitCount", { count: totals?.total_commits || 0 })}
                {" · "}
                {t("analytics.contributorCount", { count: people.length })}
              </p>
              {kind === "contributors" && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {range && (
                    <button className="button" onClick={() => setRange(null)}>
                      <ZoomOut size={15} />
                      {t("analytics.resetZoom")}
                    </button>
                  )}
                  <SelectControl
                    label={t("analytics.metric")}
                    value={metric}
                    onValueChange={(value) =>
                      setMetric(value as "commits" | "additions" | "deletions")
                    }
                    options={[
                      { value: "commits", label: t("analytics.commits") },
                      { value: "additions", label: t("analytics.additions") },
                      { value: "deletions", label: t("analytics.deletions") },
                    ]}
                  />
                </div>
              )}
            </div>
            {kind === "contributors" && (
              <p className="text-xs text-muted">
                {t(range ? "analytics.zoomed" : "analytics.zoomHint", {
                  from: range
                    ? new Date(range[0]).toLocaleDateString(i18n.language)
                    : "",
                  to: range
                    ? new Date(range[1]).toLocaleDateString(i18n.language)
                    : "",
                })}
              </p>
            )}
            <WeekChart
              weeks={visibleWeeks}
              metric={kind === "code-frequency" ? "lines" : "commits"}
              range={kind === "contributors" ? range : null}
              onZoom={kind === "contributors" ? setRange : undefined}
            />
            {kind === "contributors" ? (
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                {people.map((person, index) => (
                  <article
                    className="repository-contributor-card min-w-0 rounded-md border border-line p-4"
                    key={person.login || `${person.name}-${index}`}
                  >
                    <header className="flex items-center gap-3">
                      <img
                        className={avatarClass}
                        src={person.avatar_link}
                        alt=""
                      />
                      <div className="min-w-0 flex-1">
                        {person.login ? (
                          <Link
                            className="font-semibold hover:underline"
                            to={`/users/${encodeURIComponent(person.login)}`}
                          >
                            {person.name}
                          </Link>
                        ) : (
                          <strong>{person.name}</strong>
                        )}
                        <p className={`${mutedClass} flex flex-wrap gap-x-2`}>
                          <span>
                            {t("shared.commitCount", {
                              count: person.commits,
                            })}
                          </span>
                          <span className="text-success">
                            {t("analytics.additionsShort", {
                              value: format.format(person.additions),
                            })}
                          </span>
                          <span className="text-danger">
                            {t("analytics.deletionsShort", {
                              value: format.format(person.deletions),
                            })}
                          </span>
                        </p>
                      </div>
                      <span className={mutedClass}>#{index + 1}</span>
                    </header>
                    <WeekChart
                      weeks={Object.values(person.weeks || {})}
                      metric="commits"
                      range={range}
                      compact
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="repository-stat-table overflow-auto rounded-md border border-line">
                <table className="w-full text-sm [&_tr:last-child_td]:border-b-0">
                  <thead>
                    <tr>
                      <th className={statHeadClass}>
                        {t("analytics.weekStarting")}
                      </th>
                      <th className={statHeadClass}>
                        {t("analytics.commits")}
                      </th>
                      <th className={statHeadClass}>
                        {t("analytics.additions")}
                      </th>
                      <th className={statHeadClass}>
                        {t("analytics.deletions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...visibleWeeks].reverse().map((week) => (
                      <tr key={week.week}>
                        <td className={statCellClass}>
                          {new Date(week.week).toLocaleDateString(
                            i18n.language,
                          )}
                        </td>
                        <td className={statCellClass}>{week.commits}</td>
                        <td className={statCellClass}>+{week.additions}</td>
                        <td className={statCellClass}>−{week.deletions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
