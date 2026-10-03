import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleDot, GitMerge, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativeForm, nativePage, type Bootstrap, type Issue } from "./api";
import {
  EmptyState,
  Feedback,
  IssueLabel,
  Markdown,
  Pagination,
  Pending,
  pageClass,
  pageHeadingClass,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { uiRoute } from "./routes";
import {
  ContributionGrid,
  fieldInputClass,
  ProfileActivity,
  workspaceSearchClass,
} from "./WorkspaceManagement";

import { WorkspaceRepoFilters } from "./WorkspaceRepoFilters";
import { DashboardContext } from "./DashboardContext";
const encode = encodeURIComponent;
// Matches the project issue list: controls sit 16px below the tabs, search
// takes the free width and moves to its own row on small screens.
const toolbarClass = "my-4 flex flex-wrap items-center gap-3";
const toolbarSearchClass =
  "flex min-w-0 flex-1 items-center gap-2 max-md:order-first max-md:basis-full";
const toolbarSelectClass = "max-md:flex-1";
const headingTitleClass = "max-md:text-[22px]";
const projectRoute = (name: string) =>
  `/projects/${name.split("/").map(encode).join("/")}`;
interface ActivityData {
  kind: string;
  total: number;
  page_size: number;
  teams?: { id: number; name: string }[];
  heatmap?: { timestamp: number; contributions: number }[];
  contributions?: number;
  items: {
    id: number;
    type: number;
    actor: string;
    repository: string;
    ref: string;
    content: string;
    created_at: string;
  }[];
}
function QuerySearch({
  value,
  label,
  placeholder,
  onSearch,
  className = workspaceSearchClass,
}: {
  value: string;
  label: string;
  placeholder: string;
  onSearch: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("workspace");
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(String(new FormData(event.currentTarget).get("q") || ""));
      }}
    >
      <label className="filter-input flex-1">
        <Search size={16} />
        <input
          name="q"
          defaultValue={value}
          aria-label={label}
          placeholder={placeholder}
        />
      </label>
      <button className="button">{t("shared.search")}</button>
    </form>
  );
}
function TeamFilter({
  teams,
  selected,
  onChange,
}: {
  teams?: { name: string }[];
  selected: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("workspace");
  return teams?.length ? (
    <SelectControl
      label={t("shared.team")}
      value={selected}
      onValueChange={onChange}
      options={[
        { value: "", label: t("shared.allTeams") },
        ...teams.map((team) => ({ value: team.name, label: team.name })),
      ]}
    />
  ) : null;
}
export function DashboardActivityPage() {
  const { t } = useTranslation("workspace");
  const { org = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page")) || 1,
    date = params.get("date") || "",
    team = params.get("team") || "";
  const endpoint = org
    ? `/org/${encode(org)}/dashboard${team ? `/${encode(team)}` : ""}`
    : "/";
  const query = useQuery({
    queryKey: ["workspace-activity", endpoint, date, page],
    queryFn: ({ signal }) =>
      nativePage<ActivityData>(
        `${endpoint}?${new URLSearchParams({ date, page: String(page) })}`,
        signal,
      ),
  });
  const title = org ? t("activity.orgTitle", { org }) : t("activity.title");
  useTitle(title);
  return (
    <section className={pageClass}>
      <div className={`${pageHeadingClass} flex-wrap`}>
        <h1 className={headingTitleClass}>{title}</h1>
        <DashboardContext section="activity" />
        {org && (
          <Link className="button" to={`/organizations/${encode(org)}`}>
            {t("activity.viewOrganization")}
          </Link>
        )}
      </div>
      <div className={toolbarClass}>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t("activity.date")}
          <input
            className={fieldInputClass}
            type="date"
            value={date}
            onChange={(event) => setParams({ date: event.target.value, team })}
          />
        </label>
        {date && (
          <button className="button" onClick={() => setParams({ team })}>
            {t("activity.allDates")}
          </button>
        )}
        <TeamFilter
          teams={query.data?.teams}
          selected={team}
          onChange={(value) => setParams({ team: value, date })}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            {query.data.heatmap && (
              <ContributionGrid
                entries={query.data.heatmap}
                total={query.data.contributions || 0}
              />
            )}
            <ProfileActivity items={query.data.items} />
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) => setParams({ date, team, page: String(value) })}
            />
          </>
        )
      )}
    </section>
  );
}
interface WorkData {
  items: Issue[];
  total: number;
  page_size: number;
  type?: string;
  projects?: { id: number; title: string }[];
  stats?: { open: number; closed: number };
  teams?: { id: number; name: string }[];
}
export function WorkspaceWorkPage({
  bootstrap,
  pulls = false,
  subscriptions = false,
}: {
  bootstrap: Bootstrap;
  pulls?: boolean;
  subscriptions?: boolean;
}) {
  const { t } = useTranslation("workspace");
  const { org = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const state = params.get("state") || (subscriptions ? "all" : "open"),
    type = params.get("type") || "your_repositories",
    q = params.get("q") || "",
    sort = params.get("sort") || "recentupdate",
    page = Number(params.get("page")) || 1,
    team = params.get("team") || "",
    issueType = params.get("issueType") || "";
  const endpoint = subscriptions
    ? "/notifications/subscriptions"
    : org
      ? `/org/${encode(org)}/${pulls ? "pulls" : "issues"}${team ? `/${encode(team)}` : ""}`
      : pulls
        ? "/pulls"
        : "/issues";
  const search = new URLSearchParams({
    ...Object.fromEntries(params),
    state,
    type,
    q,
    issueType,
    sort,
    page: String(page),
  });
  const query = useQuery({
    queryKey: ["workspace-work", endpoint, search.toString()],
    queryFn: ({ signal }) =>
      nativePage<WorkData>(`${endpoint}?${search}`, signal),
    enabled: !!bootstrap.user,
  });
  const change = (values: Record<string, string>) =>
    setParams({
      ...Object.fromEntries(params),
      state,
      type,
      q,
      sort,
      team,
      issueType,
      ...values,
      page: values.page || "1",
    });
  const title = subscriptions
    ? t("work.subscriptions")
    : pulls
      ? t("shared.mergeRequests")
      : t("shared.issues");
  useTitle(title);
  if (!bootstrap.user) return <Navigate to="/login" replace />;
  return (
    <section className={pageClass}>
      <div className={`${pageHeadingClass} flex-wrap`}>
        <h1 className={headingTitleClass}>{title}</h1>
        {!subscriptions && (
          <DashboardContext section={pulls ? "merge-requests" : "issues"} />
        )}
        {org && (
          <Link className="button" to={`/organizations/${encode(org)}`}>
            {org}
          </Link>
        )}
      </div>
      {subscriptions && <NotificationTabs active="subscriptions" />}
      <nav className="tabs" aria-label={t("work.stateTabs")}>
        {(
          [...(subscriptions ? ["all"] : []), "open", "closed"] as (
            "all" | "open" | "closed"
          )[]
        ).map((value) => (
          <button
            key={value}
            className={state === value ? "active" : ""}
            onClick={() => change({ state: value })}
          >
            {t(`shared.${value}`)}
            {typeof query.data?.stats?.[value as "open" | "closed"] ===
              "number" && (
              <span className="counter">
                {query.data.stats[value as "open" | "closed"]}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className={toolbarClass}>
        {!subscriptions && (
          <SelectControl
            label={t("work.filter.label")}
            className={toolbarSelectClass}
            value={type}
            onValueChange={(value) => change({ type: value })}
            options={[
              {
                value: "your_repositories",
                label: t("work.filter.yourProjects"),
              },
              { value: "assigned", label: t("work.filter.assigned") },
              { value: "created_by", label: t("work.filter.createdBy") },
              { value: "mentioned", label: t("work.filter.mentioned") },
              ...(pulls
                ? [
                    {
                      value: "review_requested",
                      label: t("work.filter.reviewRequested"),
                    },
                    {
                      value: "reviewed_by",
                      label: t("work.filter.reviewedBy"),
                    },
                  ]
                : []),
            ]}
          />
        )}
        {subscriptions ? (
          <SelectControl
            label={t("work.subscriptionType")}
            className={toolbarSelectClass}
            value={issueType}
            onValueChange={(value) => change({ issueType: value })}
            options={[
              { value: "", label: t("work.issuesAndMergeRequests") },
              { value: "issues", label: t("shared.issues") },
              { value: "pulls", label: t("shared.mergeRequests") },
            ]}
          />
        ) : (
          <QuerySearch
            value={q}
            label={t("work.search")}
            placeholder={t("work.searchPlaceholder")}
            className={toolbarSearchClass}
            onSearch={(value) => change({ q: value })}
          />
        )}
        {!subscriptions && (
          <SelectControl
            label={t("work.board")}
            value={params.get("project") || ""}
            options={[
              { value: "", label: t("work.allBoards") },
              ...(query.data?.projects || []).map((project) => ({
                value: String(project.id),
                label: project.title,
              })),
            ]}
            onValueChange={(value) => change({ project: value })}
          />
        )}
        {subscriptions && (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            {t("work.labels")}
            <input
              className={fieldInputClass}
              value={params.get("labels") || ""}
              onChange={(event) => change({ labels: event.target.value })}
              pattern="[0-9,]*"
            />
          </label>
        )}
        <SelectControl
          label={t("work.sort.label")}
          className={toolbarSelectClass}
          value={sort}
          onValueChange={(value) => change({ sort: value })}
          options={[
            { value: "recentupdate", label: t("work.sort.recentupdate") },
            { value: "latest", label: t("work.sort.latest") },
            { value: "oldest", label: t("work.sort.oldest") },
            { value: "leastupdate", label: t("work.sort.leastupdate") },
            { value: "mostcomment", label: t("work.sort.mostcomment") },
            { value: "leastcomment", label: t("work.sort.leastcomment") },
            { value: "nearduedate", label: t("work.sort.nearduedate") },
            { value: "farduedate", label: t("work.sort.farduedate") },
          ]}
        />
        <TeamFilter
          teams={query.data?.teams}
          selected={team}
          onChange={(value) => change({ team: value })}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <WorkRows items={query.data.items} showState={subscriptions} />
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) => change({ page: String(value) })}
            />
          </>
        )
      )}
    </section>
  );
}
function WorkRows({
  items,
  showState = false,
}: {
  items: Issue[];
  showState?: boolean;
}) {
  const { t } = useTranslation("workspace");
  return items.length ? (
    <div className="issue-list border-t border-line">
      {items.map((issue) => (
        <Link
          className="issue-row flex items-start gap-3 border-b border-line px-4 py-3 hover:bg-[#fafafa] max-md:px-1 dark:hover:bg-hover"
          key={issue.id}
          to={uiRoute(issue.html_url)}
        >
          {issue.pull_request ? (
            <GitMerge size={18} />
          ) : (
            <CircleDot size={18} />
          )}
          <div className="min-w-0 flex-1">
            <strong className="text-sm font-semibold text-ink">
              {issue.title}
            </strong>
            <p className="text-xs text-muted my-1">
              {t("work.meta", {
                project: new URL(
                  issue.html_url,
                  window.location.origin,
                ).pathname
                  .split("/")
                  .slice(1, 3)
                  .join("/"),
                number: issue.number,
                user: issue.user.login,
                date: relativeDate(issue.updated_at),
              })}
            </p>
            {issue.labels.map((label) => (
              <IssueLabel
                key={label.id}
                name={label.name}
                color={label.color}
              />
            ))}
          </div>
          {showState && (
            <span className="text-xs text-muted capitalize">
              {issue.state === "open" || issue.state === "closed"
                ? t(`work.state.${issue.state}`)
                : issue.state}
            </span>
          )}
        </Link>
      ))}
    </div>
  ) : (
    <EmptyState title={t("work.empty")} />
  );
}
export function NotificationTabs({ active }: { active: string }) {
  const { t } = useTranslation("workspace");
  return (
    <nav className="tabs" aria-label={t("notifications.sections")}>
      {[
        ["", t("notifications.inbox")],
        ["subscriptions", t("work.subscriptions")],
        ["watching", t("notifications.watching")],
      ].map(([path, title]) => (
        <Link
          key={path}
          className={active === path ? "active" : ""}
          to={`/notifications${path ? "/" + path : ""}`}
        >
          {title}
        </Link>
      ))}
    </nav>
  );
}
export function WatchedProjectsPage() {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    page = Number(params.get("page")) || 1;
  const query = useQuery({
    queryKey: ["watched-projects", params.toString()],
    queryFn: ({ signal }) =>
      nativePage<{
        items: {
          id: number;
          full_name: string;
          description: string;
          updated_at: string;
        }[];
        total: number;
        page_size: number;
      }>(
        `/notifications/watching?${new URLSearchParams({ ...Object.fromEntries(params), q, page: String(page) })}`,
        signal,
      ),
  });
  const unwatch = useMutation({
    mutationFn: (name: string) =>
      nativeForm(
        `/${name.split("/").map(encode).join("/")}/action/unwatch`,
        {},
      ),
    onSuccess: () => query.refetch(),
  });
  useTitle(t("watching.title"));
  return (
    <section className={pageClass}>
      <div className={`${pageHeadingClass} flex-wrap`}>
        <h1 className={headingTitleClass}>{t("shared.notifications")}</h1>
      </div>
      <NotificationTabs active="watching" />
      <QuerySearch
        value={q}
        label={t("watching.search")}
        placeholder={t("watching.searchPlaceholder")}
        onSearch={(value) =>
          setParams({ ...Object.fromEntries(params), q: value, page: "1" })
        }
      />
      <WorkspaceRepoFilters language={false} sizes={false} />
      <Feedback error={query.error || unwatch.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            {query.data.items.length ? (
              query.data.items.map((project) => (
                <article
                  className="account-row flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0"
                  key={project.id}
                >
                  <div className="min-w-0 flex-1">
                    <Link to={projectRoute(project.full_name)}>
                      {project.full_name}
                    </Link>
                    <p className="mt-1 text-xs break-all text-muted">
                      {project.description}
                    </p>
                    <span className="text-xs text-muted">
                      {t("shared.updated", {
                        date: relativeDate(project.updated_at),
                      })}
                    </span>
                  </div>
                  <button
                    className="button ml-auto"
                    onClick={() => unwatch.mutate(project.full_name)}
                  >
                    {t("watching.unwatch")}
                  </button>
                </article>
              ))
            ) : (
              <EmptyState title={t("watching.empty")} />
            )}
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) =>
                setParams({
                  ...Object.fromEntries(params),
                  q,
                  page: String(value),
                })
              }
            />
          </>
        )
      )}
    </section>
  );
}
export function WorkspaceMilestonesPage() {
  const { t } = useTranslation("workspace");
  const { org = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    state = params.get("state") || "open",
    page = Number(params.get("page")) || 1,
    team = params.get("team") || "",
    repo = params.get("repo") || "";
  const endpoint = org
    ? `/org/${encode(org)}/milestones${team ? `/${encode(team)}` : ""}`
    : "/milestones";
  const query = useQuery({
    queryKey: ["workspace-milestones", endpoint, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<{
        items: {
          id: number;
          title: string;
          description: string;
          description_html?: string;
          repository_owner: string;
          repository: string;
          closed: boolean;
          deadline: string;
          issues: number;
          closed_issues: number;
        }[];
        repositories: { id: number; full_name: string }[];
        total: number;
        page_size: number;
        stats?: { open: number; closed: number };
        teams?: { name: string }[];
      }>(
        `${endpoint}?${new URLSearchParams({ ...Object.fromEntries(params), q, state, page: String(page), ...(repo ? { repos: `[${repo}]` } : {}) })}`,
        signal,
      ),
  });
  const change = (values: Record<string, string>) =>
    setParams({
      ...Object.fromEntries(params),
      q,
      state,
      team,
      repo,
      ...values,
      page: values.page || "1",
    });
  useTitle(t("shared.milestones"));
  return (
    <section className={pageClass}>
      <div className={`${pageHeadingClass} flex-wrap`}>
        <h1 className={headingTitleClass}>{t("shared.milestones")}</h1>
        <DashboardContext section="milestones" />
      </div>
      <nav className="tabs" aria-label={t("milestones.stateTabs")}>
        {["open", "closed"].map((value) => (
          <button
            key={value}
            className={state === value ? "active" : ""}
            onClick={() => change({ state: value })}
          >
            {value === "open" ? t("shared.open") : t("shared.closed")}
            <span className="counter">
              {query.data?.stats?.[value as "open" | "closed"] || 0}
            </span>
          </button>
        ))}
      </nav>
      <div className={toolbarClass}>
        <QuerySearch
          value={q}
          label={t("milestones.search")}
          placeholder={t("milestones.searchPlaceholder")}
          className={toolbarSearchClass}
          onSearch={(value) => change({ q: value })}
        />
        <details className="relative">
          <summary className="button">
            {t("milestones.selectedProjects")}
          </summary>
          <div className="absolute z-10 mt-2 max-h-72 min-w-64 overflow-auto rounded border border-line bg-surface p-3 shadow-popover">
            {(query.data?.repositories || []).map((project) => (
              <label className="check-field" key={project.id}>
                <input
                  type="checkbox"
                  checked={repo.split(",").includes(String(project.id))}
                  onChange={(event) => {
                    const selected = new Set(repo.split(",").filter(Boolean));
                    event.target.checked
                      ? selected.add(String(project.id))
                      : selected.delete(String(project.id));
                    change({ repo: [...selected].join(",") });
                  }}
                />
                {project.full_name}
              </label>
            ))}
          </div>
        </details>
        <SelectControl
          label={t("milestones.sort")}
          value={params.get("sort") || "soonestduedate"}
          options={(
            [
              "soonestduedate",
              "furthestduedate",
              "leastcomplete",
              "mostcomplete",
              "mostissues",
              "leastissues",
            ] as const
          ).map((value) => ({ value, label: t(`milestones.sorts.${value}`) }))}
          onValueChange={(value) => change({ sort: value })}
        />
        <TeamFilter
          teams={query.data?.teams}
          selected={team}
          onChange={(value) => change({ team: value })}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            {query.data.items.length ? (
              query.data.items.map((item) => (
                <article key={item.id}>
                  <div className={`${pageHeadingClass} flex-wrap`}>
                    <Link
                      to={`${projectRoute(`${item.repository_owner}/${item.repository}`)}/milestones/${item.id}`}
                    >
                      {item.title}
                    </Link>
                    <span className="text-xs text-muted">
                      {item.repository_owner}/{item.repository}
                    </span>
                  </div>
                  {item.description && (
                    <Markdown html={item.description_html}>
                      {item.description}
                    </Markdown>
                  )}
                  <progress
                    max={item.issues || 1}
                    value={item.closed_issues}
                    aria-label={t("milestones.progress", { title: item.title })}
                  />
                  <p className="text-xs text-muted mt-2">
                    {t("milestones.closedIssues", {
                      closed: item.closed_issues,
                      count: item.issues,
                    })}
                  </p>
                </article>
              ))
            ) : (
              <EmptyState title={t("milestones.empty")} />
            )}
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) => change({ page: String(value) })}
            />
          </>
        )
      )}
    </section>
  );
}
interface SearchData {
  enabled: boolean;
  unavailable?: boolean;
  total: number;
  page_size: number;
  modes?: string[];
  items: {
    repository: string;
    path: string;
    sha: string;
    lines: { number: number; html: string }[];
  }[];
  languages?: { name: string; count: number }[];
}
export function WorkspaceCodeSearchPage() {
  const { t } = useTranslation("workspace");
  const { username = "", org = "" } = useParams();
  const owner = username || org;
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    mode = params.get("mode") || "exact",
    language = params.get("l") || "",
    path = params.get("path") || "",
    page = Number(params.get("page")) || 1;
  const query = useQuery({
    queryKey: ["workspace-code-search", owner, q, mode, language, path, page],
    queryFn: ({ signal }) =>
      nativePage<SearchData>(
        `${owner ? `/${encode(owner)}/-/code` : "/explore/code"}?${new URLSearchParams({ q, mode, l: language, path, page: String(page) })}`,
        signal,
      ),
  });
  const change = (values: Record<string, string>) =>
    setParams({
      q,
      mode,
      l: language,
      path,
      ...values,
      page: values.page || "1",
    });
  useTitle(t("codeSearch.title"));
  return (
    <section className="mx-auto w-full max-w-[1272px] min-w-0 pt-0 pr-7 pb-8 pl-3 max-md:px-3 max-md:pb-6">
      <div className={`${pageHeadingClass} flex-wrap`}>
        <h1 className={headingTitleClass}>
          {owner
            ? t("codeSearch.ownerTitle", { owner })
            : t("codeSearch.title")}
        </h1>
      </div>
      <div className={toolbarClass}>
        <QuerySearch
          value={q}
          label={t("codeSearch.title")}
          placeholder={t("codeSearch.placeholder")}
          className={toolbarSearchClass}
          onSearch={(value) => change({ q: value })}
        />
        <SelectControl
          label={t("codeSearch.mode")}
          value={mode}
          onValueChange={(value) => change({ mode: value })}
          options={(query.data?.modes || ["exact", "union", "regexp"]).map(
            (value) => ({
              value,
              label:
                value === "exact" ||
                value === "union" ||
                value === "regexp" ||
                value === "fuzzy"
                  ? t(`codeSearch.modes.${value}`)
                  : value,
            }),
          )}
        />
        <SelectControl
          label={t("codeSearch.language")}
          value={language}
          onValueChange={(value) => change({ l: value })}
          options={[
            { value: "", label: t("codeSearch.allLanguages") },
            ...(query.data?.languages || []).map((item) => ({
              value: item.name,
              label: `${item.name} (${item.count})`,
            })),
          ]}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data && !query.data.enabled ? (
        <EmptyState title={t("codeSearch.disabled")}>
          {t("codeSearch.disabledHint")}
        </EmptyState>
      ) : query.data?.unavailable ? (
        <EmptyState title={t("codeSearch.unavailable")} />
      ) : (
        query.data && (
          <>
            {query.data.items?.map((item) => (
              <section key={`${item.repository}/${item.path}`}>
                <header>
                  <Link
                    to={`${projectRoute(item.repository)}?${new URLSearchParams({ path: item.path, ref: item.sha, type: "commit" })}`}
                  >
                    {item.repository} / {item.path}
                  </Link>
                </header>
                <div>
                  {item.lines.map((line, index) => (
                    <Link
                      key={index}
                      to={`${projectRoute(item.repository)}?${new URLSearchParams({ path: item.path, ref: item.sha, type: "commit" })}#L${line.number}`}
                    >
                      <span>{line.number}</span>
                      <code dangerouslySetInnerHTML={{ __html: line.html }} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
            {!query.data.items?.length && (
              <EmptyState
                title={q ? t("codeSearch.empty") : t("codeSearch.prompt")}
              />
            )}
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) => change({ page: String(value) })}
            />
          </>
        )
      )}
    </section>
  );
}
