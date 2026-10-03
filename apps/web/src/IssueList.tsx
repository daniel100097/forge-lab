import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleDot,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { RepoContext } from "./App";
import { nativeForm, nativePage, get, post, request, type Issue } from "./api";
import { ActionMenu, MenuAction, MenuGroup } from "./ActionMenu";
import { SelectControl } from "./SelectControl";
import { IssueRowDetails, type IssueRowMetadata } from "./IssueRowDetails";
import {
  EmptyState,
  Feedback,
  IssueLabel,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
type ListIssue = Issue & { pin_order?: number };
interface Named {
  id: number;
  name: string;
}
interface ListData {
  items: ListIssue[];
  row_details?: Record<string, IssueRowMetadata>;
  pinned: ListIssue[];
  total: number;
  page_size: number;
  counts: Record<string, number>;
  can_bulk: boolean;
  can_admin: boolean;
  can_create: boolean;
  signed_in: boolean;
  labels: (Named & { color: string; archived: boolean; exclusive: boolean })[];
  milestones: Named[];
  projects: Named[];
  assignees: (Named & { full_name: string })[];
}
interface Poster {
  user_id: number;
  username: string;
  full_name?: string;
}
export function IssuesPage({ pulls = false }: { pulls?: boolean }) {
  const { repository, path } = useOutletContext<RepoContext>();
  const { t } = useTranslation("issues");
  const kind = pulls ? "pulls" : "issues";
  const [params, setParams] = useSearchParams();
  const state = params.get("state") || "open",
    sort = params.get("sort") || "recentupdate",
    page = Math.max(1, Number(params.get("page")) || 1);
  const nativeRoot = `${path}/${pulls ? "pulls" : "issues"}`,
    uiRoot = `/projects${path}/${pulls ? "merge-requests" : "issues"}`;
  const [search, setSearch] = useState(params.get("q") || ""),
    [authorSearch, setAuthorSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]),
    [confirmDelete, setConfirmDelete] = useState(false);
  const serialized = params.toString();
  useEffect(() => {
    setSearch(params.get("q") || "");
    setSelected([]);
    setConfirmDelete(false);
  }, [serialized]);
  const queryParams = new URLSearchParams(params);
  queryParams.set("state", state === "merged" ? "closed" : state);
  queryParams.set("sort", sort);
  if (pulls && state === "merged") queryParams.set("merged", "true");
  else queryParams.delete("merged");
  const query = useQuery({
    queryKey: ["native-issue-list", path, pulls, serialized],
    queryFn: ({ signal }) =>
      nativePage<ListData>(`${nativeRoot}?${queryParams}`, signal),
    // Native search indexing can finish just after a bulk status mutation.
    // Refresh a transitional snapshot until its rows match the requested tab.
    refetchInterval: (query) => {
      const items = query.state.data?.items || [];
      const stale =
        state === "open"
          ? items.some((item) => item.state === "closed")
          : state === "closed" || state === "merged"
            ? items.some((item) => item.state !== "closed")
            : false;
      return stale ? 500 : false;
    },
  });
  const posters = useQuery({
    queryKey: ["issue-list-posters", nativeRoot, authorSearch],
    queryFn: ({ signal }) =>
      get<{ results: Poster[] }>(
        `${nativeRoot}/posters?q=${encodeURIComponent(authorSearch)}`,
        signal,
      ),
  });
  const data = query.data;
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value && value !== "any") next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const labelIds = (params.get("labels") || "").split(",").filter(Boolean);
  const addLabel = (value: string) => {
    if (value === "any") return;
    const next =
      value === "0"
        ? ["0"]
        : [
            ...labelIds.filter(
              (id) =>
                id !== "0" && Math.abs(Number(id)) !== Math.abs(Number(value)),
            ),
            value,
          ];
    change("labels", next.join(","));
  };
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      operation,
      action = "",
      id = "",
      issue,
      position,
    }: {
      operation: string;
      action?: string;
      id?: string;
      issue?: ListIssue;
      position?: number;
    }) => {
      if (operation === "pin")
        return nativeForm(`${nativeRoot}/${issue!.number}/pin`, {});
      if (operation === "unpin")
        return request(`${nativeRoot}/unpin/${issue!.number}`, {
          method: "DELETE",
        });
      if (operation === "move_pin")
        return post(`${nativeRoot}/move_pin`, { id: issue!.id, position });
      return nativeForm(`${nativeRoot}/${operation}`, {
        action,
        id,
        issue_ids: selected.join(","),
      });
    },
    onSuccess: async () => {
      setConfirmDelete(false);
      setSelected([]);
      await client.invalidateQueries({ queryKey: ["native-issue-list"] });
      await client.invalidateQueries({ queryKey: ["repo"] });
    },
  });
  const mutate = (operation: string, action = "", id = "") =>
    mutation.mutate({ operation, action, id });
  const visibleLabels = (data?.labels || []).filter(
    (label) =>
      !label.archived ||
      params.get("archived") === "true" ||
      labelIds.some((id) => Math.abs(Number(id)) === label.id),
  );
  const selectedPoster = params.get("poster") || "any",
    posterOptions = (posters.data?.results || []).map((p) => ({
      value: String(p.user_id),
      label: p.full_name || p.username,
      description: `@${p.username}`,
    }));
  if (
    selectedPoster !== "any" &&
    !posterOptions.some((p) => p.value === selectedPoster)
  )
    posterOptions.push({
      value: selectedPoster,
      label: t("list.filters.authorFallback", { id: selectedPoster }),
      description: t("list.filters.selectedAuthor"),
    });
  useTitle(t(`list.title.${kind}`, { project: repository.name }));
  const filterLabel = "flex min-w-0 flex-col gap-2 text-xs font-semibold";
  const filterSelect = (
    key: string,
    label: string,
    any: string,
    rows: Named[],
    none?: string,
  ) => (
    <SelectControl
      label={label}
      searchable
      className="w-full text-sm font-normal"
      value={params.get(key) || "any"}
      onValueChange={(value) => change(key, value)}
      options={[
        { value: "any", label: any },
        ...(none ? [{ value: "-1", label: none }] : []),
        ...rows.map((row) => ({ value: String(row.id), label: row.name })),
      ]}
    />
  );
  return (
    <>
      <h1 className="sr-only">{t(`list.heading.${kind}`)}</h1>
      <div className="flex items-center justify-between gap-3 border-b border-line max-md:flex-wrap-reverse max-md:gap-0">
        <div
          className="pill-tabs border-0"
          role="tablist"
          aria-label={t(`list.stateTabs.${kind}`)}
        >
          {(pulls
            ? (["open", "merged", "closed", "all"] as const)
            : (["open", "closed", "all"] as const)
          ).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={state === value}
              className={state === value ? "active" : ""}
              onClick={() => change("state", value)}
            >
              {t(`list.states.${value}`)}
              {data && (
                <span className="counter">{data.counts[value] || 0}</span>
              )}
            </button>
          ))}
        </div>
        {data?.can_create && (
          <Link
            className="button primary my-2 max-md:ml-auto"
            to={pulls ? `/projects${path}/compare` : `${uiRoot}/new`}
          >
            {t(`list.new.${kind}`)}
          </Link>
        )}
      </div>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 max-md:basis-full"
          onSubmit={(event) => {
            event.preventDefault();
            change("q", search);
          }}
        >
          <label className="filter-input w-full flex-1">
            <Search size={16} />
            <input
              aria-label={t(`list.search.${kind}`)}
              placeholder={t("list.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label={t("list.clearSearch")}
                onClick={() => {
                  setSearch("");
                  change("q", "");
                }}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <button className="button" type="submit">
            {t("list.searchButton")}
          </button>
        </form>
        <SelectControl
          label={t("list.sort.label")}
          menuTitle={t("list.sort.menuTitle")}
          className="max-md:w-full"
          value={sort}
          onValueChange={(value) => change("sort", value)}
          options={[
            { value: "recentupdate", label: t("list.sort.recentupdate") },
            { value: "latest", label: t("list.sort.latest") },
            { value: "oldest", label: t("list.sort.oldest") },
            { value: "leastupdate", label: t("list.sort.leastupdate") },
            { value: "mostcomment", label: t("list.sort.mostcomment") },
            { value: "leastcomment", label: t("list.sort.leastcomment") },
            { value: "nearduedate", label: t("list.sort.nearduedate") },
            { value: "farduedate", label: t("list.sort.farduedate") },
            { value: "relevance", label: t("list.sort.relevance") },
          ]}
        />
      </div>
      <details className="native-issue-filters mb-4 rounded border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
          <SlidersHorizontal size={15} />
          {t("list.filters.title")}
          <span className="ml-auto text-xs font-normal text-muted max-md:hidden">
            {t("list.filters.summary")}
          </span>
        </summary>
        <div className="grid grid-cols-3 gap-4 border-t border-line p-4 max-md:grid-cols-1">
          <label className={filterLabel}>
            {t("list.filters.label")}
            <SelectControl
              label={t("list.filters.includeLabel")}
              className="w-full text-sm font-normal"
              searchable
              value="any"
              onValueChange={addLabel}
              options={[
                { value: "any", label: t("list.filters.addLabelFilter") },
                { value: "0", label: t("list.filters.noLabels") },
                ...visibleLabels.map((label) => ({
                  value: String(label.id),
                  label: label.name,
                })),
              ]}
            />
          </label>
          <label className={filterLabel}>
            {t("list.filters.excludeLabel")}
            <SelectControl
              label={t("list.filters.excludeLabel")}
              className="w-full text-sm font-normal"
              searchable
              value="any"
              onValueChange={addLabel}
              options={[
                { value: "any", label: t("list.filters.excludeALabel") },
                ...visibleLabels.map((label) => ({
                  value: String(-label.id),
                  label: label.name,
                })),
              ]}
            />
          </label>
          <label className={filterLabel}>
            {t("list.filters.assignee")}
            {filterSelect(
              "assignee",
              t("list.filters.assignee"),
              t("list.filters.anyAssignee"),
              data?.assignees || [],
              t("list.filters.unassigned"),
            )}
          </label>
          <label className={filterLabel}>
            {t("list.filters.author")}
            <SelectControl
              label={t("list.filters.author")}
              className="w-full text-sm font-normal"
              searchable
              value={selectedPoster}
              onSearchChange={setAuthorSearch}
              onValueChange={(value) => change("poster", value)}
              options={[
                { value: "any", label: t("list.filters.anyAuthor") },
                ...posterOptions,
              ]}
            />
          </label>
          <label className={filterLabel}>
            {t("list.filters.milestone")}
            {filterSelect(
              "milestone",
              t("list.filters.milestone"),
              t("list.filters.anyMilestone"),
              data?.milestones || [],
              t("list.filters.noMilestone"),
            )}
          </label>
          <label className={filterLabel}>
            {t("list.filters.board")}
            {filterSelect(
              "project",
              t("list.filters.board"),
              t("list.filters.anyBoard"),
              data?.projects || [],
              t("list.filters.noBoard"),
            )}
          </label>
          {data?.signed_in && (
            <label className={filterLabel}>
              {t("list.filters.involvement")}
              <SelectControl
                label={t("list.filters.involvement")}
                className="w-full text-sm font-normal"
                value={params.get("type") || "all"}
                onValueChange={(value) => change("type", value)}
                options={[
                  { value: "all", label: t("list.filters.allWorkItems") },
                  { value: "assigned", label: t("list.filters.assignedToMe") },
                  { value: "created_by", label: t("list.filters.createdByMe") },
                  { value: "mentioned", label: t("list.filters.mentioningMe") },
                  ...(pulls
                    ? [
                        {
                          value: "review_requested",
                          label: t("list.filters.reviewRequested"),
                        },
                        {
                          value: "reviewed_by",
                          label: t("list.filters.reviewedByMe"),
                        },
                      ]
                    : []),
                ]}
              />
            </label>
          )}
        </div>
        {!!data?.labels.some((label) => label.archived) && (
          <label className="check-field px-4 pb-4 text-sm">
            <input
              type="checkbox"
              checked={params.get("archived") === "true"}
              onChange={(event) =>
                change("archived", event.target.checked ? "true" : "")
              }
            />
            {t("list.filters.showArchived")}
          </label>
        )}
      </details>
      {!!labelIds.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {labelIds.map((id) => (
            <button
              className="button text-xs"
              key={id}
              onClick={() =>
                change(
                  "labels",
                  labelIds.filter((value) => value !== id).join(","),
                )
              }
            >
              {id === "0"
                ? t("list.filters.noLabels")
                : t(
                    Number(id) < 0
                      ? "list.filters.excludeChip"
                      : "list.filters.labelChip",
                    {
                      name:
                        data?.labels.find(
                          (label) => label.id === Math.abs(Number(id)),
                        )?.name || id,
                    },
                  )}
              <X size={13} />
              <span className="sr-only">
                {t("list.filters.removeLabelFilter")}
              </span>
            </button>
          ))}
        </div>
      )}
      {[
        "q",
        "labels",
        "milestone",
        "project",
        "assignee",
        "poster",
        "type",
      ].some((key) => params.has(key)) && (
        <button
          className="mb-4 text-sm text-primary hover:underline"
          onClick={() => setParams({ state, sort })}
        >
          {t("list.filters.clear")}
        </button>
      )}
      <Feedback error={query.error || posters.error || mutation.error} />
      {!!data?.pinned.length && (
        <section
          className="native-issue-pins mb-5"
          aria-label={t("list.pinned.label")}
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Pin size={15} />
            {t(`list.pinned.title.${kind}`)}
          </h2>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {data.pinned.map((issue, index) => (
              <article
                className="min-w-0 rounded border border-line bg-surface-subtle p-3"
                key={issue.id}
                data-issue-id={issue.id}
              >
                <Link
                  className="flex items-start gap-2 text-sm"
                  to={`${uiRoot}/${issue.number}`}
                >
                  <StateIcon issue={issue} pulls={pulls} />
                  <strong>{issue.title}</strong>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {pulls ? "!" : "#"}
                    {issue.number} · {issue.user.login}
                  </span>
                  {data.can_admin && (
                    <div className="flex">
                      <button
                        className="icon-button"
                        aria-label={t("list.pinned.moveUp", {
                          title: issue.title,
                        })}
                        disabled={index === 0 || mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            operation: "move_pin",
                            issue,
                            position: index,
                          })
                        }
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("list.pinned.moveDown", {
                          title: issue.title,
                        })}
                        disabled={
                          index === data.pinned.length - 1 || mutation.isPending
                        }
                        onClick={() =>
                          mutation.mutate({
                            operation: "move_pin",
                            issue,
                            position: index + 2,
                          })
                        }
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("list.pinned.unpin", {
                          title: issue.title,
                        })}
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({ operation: "unpin", issue })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {data?.can_bulk && !!data.items.length && (
        <div className="flex flex-wrap items-center gap-2 border-y border-line py-3 text-sm [&_input]:size-4 [&_input]:shrink-0 [&_input]:accent-primary">
          <label className="mr-2 flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              aria-label={t("list.bulk.selectAllLabel")}
              checked={data.items.every((issue) => selected.includes(issue.id))}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? data.items.map((issue) => issue.id)
                    : [],
                )
              }
            />
            {selected.length
              ? t("list.bulk.selected", { number: selected.length })
              : t("list.bulk.selectAll")}
          </label>
          {!!selected.length && (
            <>
              <button
                className="button"
                disabled={mutation.isPending}
                onClick={() => mutate("status", "close")}
              >
                {t("list.bulk.close")}
              </button>
              <button
                className="button"
                disabled={mutation.isPending}
                onClick={() => mutate("status", "open")}
              >
                {t("list.bulk.reopen")}
              </button>
              <SelectControl
                label={t("list.bulk.labels")}
                value="any"
                disabled={mutation.isPending}
                onValueChange={(value) => {
                  const [action, id] = value.split(":");
                  if (action !== "any") mutate("labels", action, id);
                }}
                options={[
                  { value: "any", label: t("list.bulk.labelsOption") },
                  { value: "clear", label: t("list.bulk.removeAllLabels") },
                  ...visibleLabels.flatMap((label) => [
                    {
                      value: `attach:${label.id}`,
                      label: t("list.bulk.addLabel", { name: label.name }),
                    },
                    {
                      value: `detach:${label.id}`,
                      label: t("list.bulk.removeLabel", { name: label.name }),
                    },
                  ]),
                ]}
              />
              <SelectControl
                label={t("list.bulk.milestone")}
                value="any"
                disabled={mutation.isPending}
                onValueChange={(value) => {
                  if (value !== "any") mutate("milestone", "", value);
                }}
                options={[
                  { value: "any", label: t("list.bulk.milestoneOption") },
                  { value: "0", label: t("list.bulk.removeMilestone") },
                  ...data.milestones.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                  })),
                ]}
              />
              <SelectControl
                label={t("list.bulk.assignees")}
                value="any"
                disabled={mutation.isPending}
                onValueChange={(value) => {
                  if (value !== "any")
                    mutate("assignee", value === "0" ? "clear" : "", value);
                }}
                options={[
                  { value: "any", label: t("list.bulk.assigneesOption") },
                  { value: "0", label: t("list.bulk.clearAssignees") },
                  ...data.assignees.map((row) => ({
                    value: String(row.id),
                    label: t("list.bulk.toggleAssignee", { name: row.name }),
                  })),
                ]}
              />
              {!!data.projects.length && (
                <SelectControl
                  label={t("list.bulk.board")}
                  value="any"
                  disabled={mutation.isPending}
                  onValueChange={(value) => {
                    if (value !== "any") mutate("projects", "", value);
                  }}
                  options={[
                    { value: "any", label: t("list.bulk.boardOption") },
                    { value: "0", label: t("list.bulk.removeFromBoard") },
                    ...data.projects.map((row) => ({
                      value: String(row.id),
                      label: row.name,
                    })),
                  ]}
                />
              )}
              {data.can_admin && (
                <button
                  className="button"
                  disabled={mutation.isPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("list.bulk.delete")}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {confirmDelete && (
        <div
          className="my-4 flex flex-col gap-3 rounded border border-[#c91c00] p-4"
          role="alertdialog"
          aria-label={t("list.bulk.deleteLabel")}
        >
          <h2 className="text-base font-semibold">
            {t(`list.bulk.deleteTitle.${kind}`, { count: selected.length })}
          </h2>
          <p className="text-sm text-muted">{t("list.bulk.deleteText")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button"
              disabled={mutation.isPending}
              onClick={() => mutate("delete", "delete")}
            >
              {t("list.bulk.delete")}
            </button>
            <button className="button" onClick={() => setConfirmDelete(false)}>
              {t("list.bulk.cancel")}
            </button>
          </div>
        </div>
      )}
      {query.isPending ? (
        <Pending />
      ) : data?.items.length ? (
        <div className="issue-list border-t border-line">
          {data.items.map((issue) => (
            <article
              className="issue-row native-issue-row flex items-start gap-3 border-b border-line px-4 py-3 hover:bg-[#fafafa] dark:hover:bg-hover max-md:flex-wrap max-md:px-1"
              key={issue.id}
              data-issue-id={issue.id}
            >
              {data.can_bulk && (
                <input
                  className="mt-1 size-4 shrink-0 accent-primary"
                  type="checkbox"
                  aria-label={t("list.row.select", { title: issue.title })}
                  checked={selected.includes(issue.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, issue.id]
                        : current.filter((id) => id !== issue.id),
                    )
                  }
                />
              )}
              <StateIcon issue={issue} pulls={pulls} />
              <div className="min-w-0 flex-1 max-md:basis-[70%]">
                <Link
                  className="break-words font-semibold hover:underline"
                  to={`${uiRoot}/${issue.number}`}
                >
                  {issue.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>
                    {t("list.row.opened", {
                      reference: `${pulls ? "!" : "#"}${issue.number}`,
                      date: relativeDate(issue.created_at || issue.updated_at),
                      user: issue.user.login,
                    })}
                  </span>
                  {issue.labels?.map((label) => (
                    <IssueLabel
                      key={label.id}
                      name={label.name}
                      color={label.color}
                    />
                  ))}
                  {issue.milestone?.title && (
                    <span>{issue.milestone.title}</span>
                  )}
                </div>
                <IssueRowDetails
                  details={data.row_details?.[issue.id]}
                  dueDate={issue.due_date}
                />
              </div>
              <div className="ml-auto flex min-w-0 flex-none flex-col items-end gap-1.5 text-xs text-muted max-md:basis-full">
                <div className="flex items-center gap-2">
                  {issue.assignees?.map((user) => (
                    <img
                      className="size-5 rounded-full"
                      key={user.login}
                      src={user.avatar_url}
                      alt={user.login}
                      title={t("list.row.assignedTo", { user: user.login })}
                    />
                  ))}
                  <span
                    className="flex items-center gap-1"
                    title={t("list.row.comments", { count: issue.comments })}
                  >
                    <MessageSquare size={14} />
                    {issue.comments}
                  </span>
                  {data.can_admin && (
                    <ActionMenu
                      label={t("list.row.actions", { title: issue.title })}
                      trigger={<MoreHorizontal size={17} />}
                      className="icon-button"
                    >
                      <MenuGroup label={t("list.row.quickActions")}>
                        <MenuAction
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              operation: issue.pin_order ? "unpin" : "pin",
                              issue,
                            })
                          }
                        >
                          {issue.pin_order
                            ? t("list.row.unpin")
                            : t("list.row.pinToTop")}
                        </MenuAction>
                      </MenuGroup>
                    </ActionMenu>
                  )}
                </div>
                <span>
                  {t("list.row.updated", {
                    date: relativeDate(issue.updated_at),
                  })}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !query.error && (
          <EmptyState
            title={t(
              `list.empty.${kind}.${(["open", "merged", "closed"] as const).find((value) => value === state) ?? "all"}`,
            )}
            icon={
              pulls ? <GitPullRequest size={34} /> : <CircleDot size={34} />
            }
          >
            {t(`list.empty.hint.${kind}`)}
          </EmptyState>
        )
      )}
      {data && (
        <Pagination
          page={page}
          size={data.page_size}
          total={data.total}
          onPage={(next) => {
            const value = new URLSearchParams(params);
            value.set("page", String(next));
            setParams(value);
          }}
        />
      )}
    </>
  );
}
function StateIcon({ issue, pulls }: { issue: ListIssue; pulls: boolean }) {
  return (
    <span
      className={`native-issue-state mt-0.5 inline-flex shrink-0 ${issue.pull_request?.merged ? "merged text-[#7759c2]" : issue.state === "closed" ? "text-muted" : "text-[#108548]"}`}
    >
      {issue.pull_request?.merged ? (
        <GitMerge size={17} />
      ) : pulls ? (
        <GitPullRequest size={17} />
      ) : issue.state === "closed" ? (
        <Check size={17} />
      ) : (
        <CircleDot size={17} />
      )}
    </span>
  );
}
