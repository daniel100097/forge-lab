import { useState } from "react";
import { BoardCardContent, BoardCardOrder, type BoardIssue } from "./BoardCard";
import { orderedBoardIssues, type BoardMove } from "./boardOrder";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LayoutGrid, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { get, nativeForm, nativePage, post, request, type Issue } from "./api";
import {
  EmptyState,
  Feedback,
  Markdown,
  Pagination,
  Pending,
  pageClass,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { ActionMenu, MenuAction, MenuLink } from "./ActionMenu";
import { ConfirmAction } from "./IssueManagement";
import { uiRoute } from "./routes";
const encode = encodeURIComponent;
const searchFormClass = "my-5 flex items-end gap-3";
const actionsClass = "flex flex-wrap items-center gap-2";
// Board cards reuse the project board's compact column selector.
const columnSelectClass =
  "min-h-6 max-w-36 rounded-full border-transparent bg-[#ececef] px-2 py-0 text-xs hover:border-[#89888d] hover:bg-[#f2f1f5] data-popup-open:border-[#89888d] data-popup-open:bg-[#ececef] dark:bg-hover dark:text-ink dark:hover:bg-hover dark:data-popup-open:border-control dark:data-popup-open:bg-hover dark:data-popup-open:hover:border-[#89888d]";
interface OwnerBoard {
  id: number;
  title: string;
  description: string;
  description_html?: string;
  closed: boolean;
  card_type: number;
  open_count?: number;
  closed_count?: number;
}
interface Column {
  id: number;
  title: string;
  color: string;
  default: boolean;
  issues: BoardIssue[];
}
interface Data {
  items: OwnerBoard[];
  project?: OwnerBoard;
  columns: Column[];
  can_write: boolean;
  total: number;
  page_size: number;
  open_count?: number;
  closed_count?: number;
  title?: string;
  description?: string;
  card_type?: number;
  templates?: { id: number; name: string }[];
  attachments?: Record<string, { name: string; url: string }[]>;
}
function fields(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form)) as Record<string, string>;
}
export function OwnerBoardsPage({
  mode = "list",
}: {
  mode?: "list" | "view" | "new" | "edit";
}) {
  const { t } = useTranslation("workspace");
  const { org = "", username = "", board = "" } = useParams();
  const owner = org || username;
  const root = org
    ? `/organizations/${encode(org)}/boards`
    : `/users/${encode(username)}/boards`;
  const nativeRoot = `/${encode(owner)}/-/projects`;
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    state = params.get("state") || "open",
    sort = params.get("sort") || "newest",
    page = Number(params.get("page")) || 1;
  const endpoint =
    mode === "list"
      ? nativeRoot
      : mode === "new"
        ? `${nativeRoot}/new`
        : `${nativeRoot}/${encode(board)}${mode === "edit" ? "/edit" : ""}`;
  const query = useQuery({
    queryKey: ["owner-board", owner, board, mode, q, state, page, sort],
    queryFn: ({ signal }) =>
      nativePage<Data>(
        `${endpoint}?${new URLSearchParams({ q, state, page: String(page), sort })}`,
        signal,
      ),
  });
  useTitle(t("boards.documentTitle", { owner }));
  return (
    <section className={pageClass}>
      {/* The back link sits above the title; keep the action level with it. */}
      <div className="mb-3 flex min-h-10 items-end justify-between gap-4 max-md:gap-3">
        <div>
          <Link
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            to={
              org
                ? `/organizations/${encode(org)}`
                : `/users/${encode(username)}`
            }
          >
            <ArrowLeft size={14} />
            {owner}
          </Link>
          <h1 className="max-md:text-[22px]">
            {mode === "new"
              ? t("boards.newTitle")
              : mode === "edit"
                ? t("boards.editTitle")
                : t("shared.issueBoards")}
          </h1>
        </div>
        {mode === "list" && query.data?.can_write && (
          <Link className="button primary" to={`${root}/new`}>
            <Plus size={15} />
            {t("boards.new")}
          </Link>
        )}
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data &&
        (mode === "new" || mode === "edit" ? (
          <OwnerBoardForm
            data={query.data}
            endpoint={endpoint}
            root={root}
            editing={mode === "edit"}
          />
        ) : mode === "view" ? (
          <OwnerBoardView
            data={query.data}
            nativeRoot={`${nativeRoot}/${board}`}
            root={root}
            owner={owner}
          />
        ) : (
          <>
            <nav className="tabs" aria-label={t("boards.stateTabs")}>
              {["open", "closed"].map((value) => (
                <button
                  key={value}
                  className={state === value ? "active" : ""}
                  onClick={() => setParams({ q, sort, state: value })}
                >
                  {value === "open" ? t("shared.open") : t("shared.closed")}
                  <span className="counter">
                    {value === "open"
                      ? query.data.open_count || 0
                      : query.data.closed_count || 0}
                  </span>
                </button>
              ))}
            </nav>
            <div className="my-4 flex flex-wrap items-center gap-3">
              <form
                className="flex min-w-0 flex-1 items-center gap-2 max-md:order-first max-md:basis-full"
                onSubmit={(event) => {
                  event.preventDefault();
                  setParams({
                    state,
                    sort,
                    q: String(new FormData(event.currentTarget).get("q") || ""),
                  });
                }}
              >
                <label className="filter-input w-auto min-w-0 flex-1">
                  <Search size={16} />
                  <input
                    name="q"
                    aria-label={t("boards.search")}
                    placeholder={t("boards.searchPlaceholder")}
                    defaultValue={q}
                  />
                </label>
                <button className="button">{t("shared.search")}</button>
              </form>
              <SelectControl
                label={t("boards.parity.sortLabel")}
                value={sort}
                onValueChange={(value) => setParams({ q, state, sort: value })}
                options={[
                  "newest",
                  "oldest",
                  "recentupdate",
                  "leastupdate",
                ].map((value) => ({
                  value,
                  label: t(`boards.parity.sort.${value as "newest"}`),
                }))}
              />
            </div>
            {query.data.items.length ? (
              <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 max-md:grid-cols-[1fr] md:max-[1101px]:grid-cols-2">
                {query.data.items.map((item) => (
                  <Link
                    key={item.id}
                    to={`${root}/${item.id}`}
                    className="rounded border border-line bg-surface p-5 hover:border-[#89888d]"
                  >
                    <LayoutGrid size={22} className="text-muted" />
                    <h3 className="mt-3 mb-2">{item.title}</h3>
                    <Markdown html={item.description_html}>
                      {item.description}
                    </Markdown>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                      <span>
                        {t("boards.parity.openCount", {
                          count: item.open_count || 0,
                        })}
                      </span>
                      <span>
                        {t("boards.parity.closedCount", {
                          count: item.closed_count || 0,
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title={t("boards.empty")} />
            )}
            <Pagination
              page={page}
              total={query.data.total}
              size={query.data.page_size}
              onPage={(value) =>
                setParams({ q, state, sort, page: String(value) })
              }
            />
          </>
        ))
      )}
    </section>
  );
}
function OwnerBoardForm({
  data,
  endpoint,
  root,
  editing,
}: {
  data: Data;
  endpoint: string;
  root: string;
  editing: boolean;
}) {
  const { t } = useTranslation("workspace");
  const client = useQueryClient(),
    navigate = useNavigate();
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => nativeForm(endpoint, fields(form)),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["owner-board"] });
      navigate(result.redirect ? uiRoute(result.redirect) : root);
    },
  });
  return (
    <form
      className="workspace-form mt-4 max-w-2xl rounded border border-line bg-surface p-6 max-md:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <label>
        {t("boards.name")}
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={data.title}
        />
      </label>
      <label>
        {t("shared.description")}
        <textarea name="content" rows={4} defaultValue={data.description} />
      </label>
      {!editing && (
        <label>
          {t("boards.layout")}
          <SelectControl
            label={t("boards.layout")}
            name="template_type"
            defaultValue="1"
            options={(data.templates || []).map((template) => ({
              value: String(template.id),
              label: template.name,
            }))}
          />
        </label>
      )}
      <label>
        {t("boards.cardStyle")}
        <SelectControl
          label={t("boards.cardStyle")}
          name="card_type"
          defaultValue={String(data.card_type || 0)}
          options={[
            { value: "0", label: t("boards.textOnly") },
            { value: "1", label: t("boards.imagesAndText") },
          ]}
        />
      </label>
      <Feedback error={save.error} />
      <div className={actionsClass}>
        <button
          className="button primary"
          disabled={save.isPending || !data.can_write}
        >
          {editing ? t("boards.save") : t("boards.create")}
        </button>
        <Link className="button" to={root}>
          {t("shared.cancel")}
        </Link>
      </div>
    </form>
  );
}
function OwnerBoardView({
  data,
  nativeRoot,
  root,
  owner,
}: {
  data: Data;
  nativeRoot: string;
  root: string;
  owner: string;
}) {
  const { t } = useTranslation("workspace");
  const client = useQueryClient(),
    navigate = useNavigate();
  const [filter, setFilter] = useState(""),
    [dragged, setDragged] = useState<number | null>(null),
    [editing, setEditing] = useState<Column | "new" | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["owner-board"] });
  const { t: cardText } = useTranslation("issues");
  const move = useMutation({
    mutationFn: (move: BoardMove) => {
      const issues = orderedBoardIssues(data.columns, move);
      if (!issues) throw new Error(cardText("boardParity.invalidMove"));
      return post(`${nativeRoot}/${move.column}/move`, { issues });
    },
    onSuccess: refresh,
  });
  const change = useMutation({
    mutationFn: async ({
      path,
      values,
      method = "POST",
    }: {
      path: string;
      values: Record<string, string>;
      method?: string;
    }) =>
      (
        await request(`${nativeRoot}${path}`, {
          method,
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(values),
        })
      ).data,
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) => {
      const ids = data.columns.map((column) => column.id),
        index = ids.indexOf(id);
      [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
      return post(`${nativeRoot}/move`, {
        columns: ids.map((columnID, sorting) => ({ columnID, sorting })),
      });
    },
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: async ({
      reference,
      issue,
      remove = false,
    }: {
      reference?: string;
      issue?: Issue;
      remove?: boolean;
    }) => {
      let repository = "",
        item = issue;
      if (reference) {
        const match = reference
          .trim()
          .match(/^([^/#\s]+)\/([^/#\s]+)[#!](\d+)$/);
        if (!match || match[1].toLowerCase() !== owner.toLowerCase())
          throw new Error(t("boards.invalidReference", { owner }));
        repository = `/${encode(match[1])}/${encode(match[2])}`;
        item = (
          await get<{ issue: Issue }>(
            `/-/ui/data/repos${repository}/issues/${match[3]}`,
          )
        ).issue;
      } else if (item) {
        const parts = uiRoute(item.html_url).split("/");
        repository = `/${parts[2]}/${parts[3]}`;
      }
      if (!item) throw new Error(t("boards.issueNotFound"));
      await nativeForm(`${repository}/issues/projects`, {
        issue_ids: String(item.id),
        id: remove ? "0" : String(data.project!.id),
      });
    },
    onSuccess: refresh,
  });
  if (!data.project) return <EmptyState title={t("boards.notFound")} />;
  return (
    <>
      <div className="mb-3 flex min-h-14 items-center gap-3 border-b border-line pt-1 pb-3 max-md:flex-wrap">
        <div className="flex min-w-0 items-center gap-1">
          <Link className="icon-button" to={root} aria-label={t("boards.all")}>
            <ArrowLeft size={16} />
          </Link>
          <h2>{data.project.title}</h2>
          {data.project.closed && (
            <span className="label">{t("shared.closed")}</span>
          )}
        </div>
        <label className="filter-input w-auto min-w-0 flex-1 max-md:order-3 max-md:basis-full">
          <Search size={16} />
          <input
            aria-label={t("boards.filter")}
            placeholder={t("boards.filterPlaceholder")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        {data.can_write && (
          <ActionMenu
            label={t("boards.actions")}
            trigger={t("boards.editTrigger")}
            className="button max-md:ml-auto"
          >
            <MenuLink to={`${root}/${data.project.id}/edit`}>
              {t("boards.edit")}
            </MenuLink>
            <MenuAction onClick={() => setEditing("new")}>
              {t("boards.newColumn")}
            </MenuAction>
            <MenuAction
              onClick={() =>
                change.mutate({
                  path: data.project!.closed ? "/open" : "/close",
                  values: {},
                })
              }
            >
              {data.project.closed ? t("boards.reopen") : t("boards.close")}
            </MenuAction>
          </ActionMenu>
        )}
      </div>
      {data.project.description && (
        <Markdown html={data.project.description_html}>
          {data.project.description}
        </Markdown>
      )}
      <Feedback
        error={move.error || change.error || assign.error || reorder.error}
      />
      {data.can_write && (
        <details className="my-4 text-[13px]">
          <summary className="cursor-pointer font-semibold">
            {t("boards.addExisting")}
          </summary>
          <form
            className={searchFormClass}
            onSubmit={(event) => {
              event.preventDefault();
              assign.mutate({
                reference: String(
                  new FormData(event.currentTarget).get("reference") || "",
                ),
              });
            }}
          >
            <label className="flex-1">
              {t("boards.reference")}
              <input
                className="rounded border border-input bg-surface px-3 py-2 text-sm"
                name="reference"
                required
                placeholder={t("boards.referencePlaceholder", { owner })}
              />
            </label>
            <button className="button" disabled={assign.isPending}>
              {t("boards.addToBoard")}
            </button>
          </form>
        </details>
      )}
      {editing && (
        <form
          className="workspace-form my-5 max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4"
          key={editing === "new" ? "new" : editing.id}
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate({
              path: editing === "new" ? "" : `/${editing.id}`,
              method: editing === "new" ? "POST" : "PUT",
              values: fields(event.currentTarget),
            });
          }}
        >
          <h3>
            {editing === "new" ? t("boards.newColumn") : t("boards.editColumn")}
          </h3>
          <label>
            {t("boards.columnTitle")}
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={editing === "new" ? "" : editing.title}
            />
          </label>
          <label>
            {t("boards.columnColor")}
            <input
              name="color"
              type="color"
              defaultValue={
                editing === "new" ? "#6699cc" : editing.color || "#6699cc"
              }
            />
          </label>
          <div className={actionsClass}>
            <button className="button primary">{t("boards.saveColumn")}</button>
            <button
              className="button"
              type="button"
              onClick={() => setEditing(null)}
            >
              {t("shared.cancel")}
            </button>
          </div>
        </form>
      )}
      <div className="flex min-h-[400px] gap-2 overflow-x-auto pb-3">
        {data.columns.map((column, columnIndex) => (
          <div
            className="kanban-column w-100 shrink-0 rounded-lg bg-[#ececef] max-md:w-80 dark:bg-surface-subtle"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null && data.can_write)
                move.mutate({ issue: dragged, column: column.id });
              setDragged(null);
            }}
          >
            <div className="flex h-13 items-center gap-2 px-4 py-3">
              <i
                className="size-2 rounded-full"
                style={{ background: column.color || "#8d82b3" }}
              />
              <h3 className="min-w-0 overflow-hidden text-sm font-semibold text-ellipsis">
                {column.title}
              </h3>
              <span className="ml-auto text-xs font-semibold text-muted">
                {column.issues.length}
              </span>
              {data.can_write && (
                <ActionMenu
                  label={t("boards.columnActions", { title: column.title })}
                  trigger="…"
                  className="button min-h-7 px-2 py-0.5"
                >
                  <MenuAction onClick={() => setEditing(column)}>
                    {t("boards.editColumn")}
                  </MenuAction>
                  {!column.default && (
                    <MenuAction
                      onClick={() =>
                        change.mutate({
                          path: `/${column.id}/default`,
                          values: {},
                        })
                      }
                    >
                      {t("boards.setDefault")}
                    </MenuAction>
                  )}
                  {columnIndex > 0 && (
                    <MenuAction
                      onClick={() =>
                        reorder.mutate({ id: column.id, delta: -1 })
                      }
                    >
                      {t("boards.moveLeft")}
                    </MenuAction>
                  )}
                  {columnIndex < data.columns.length - 1 && (
                    <MenuAction
                      onClick={() =>
                        reorder.mutate({ id: column.id, delta: 1 })
                      }
                    >
                      {t("boards.moveRight")}
                    </MenuAction>
                  )}
                  <MenuAction
                    onClick={() => {
                      if (
                        window.confirm(
                          t("boards.confirmDeleteColumn", {
                            title: column.title,
                          }),
                        )
                      )
                        change.mutate({
                          path: `/${column.id}`,
                          method: "DELETE",
                          values: {},
                        });
                    }}
                  >
                    {t("boards.deleteColumn")}
                  </MenuAction>
                </ActionMenu>
              )}
            </div>
            {column.issues
              .filter((issue) =>
                `${issue.title} #${issue.number} ${issue.labels.map((label) => label.name).join(" ")}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((issue) => (
                <article
                  className={
                    data.can_write && !move.isPending
                      ? "kanban-card mx-2 mb-2 cursor-grab rounded-lg border border-line bg-surface p-3 shadow-xs"
                      : "kanban-card mx-2 mb-2 rounded-lg border border-line bg-surface p-3 shadow-xs"
                  }
                  key={issue.id}
                  draggable={data.can_write && !move.isPending}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", String(issue.id));
                    event.dataTransfer.effectAllowed = "move";
                    setDragged(issue.id);
                  }}
                  onDragEnd={() => setDragged(null)}
                  data-issue-id={issue.id}
                  onDragOver={(event) => {
                    if (data.can_write && !move.isPending) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (dragged !== null && data.can_write && !move.isPending)
                      move.mutate({
                        issue: dragged,
                        column: column.id,
                        before: issue.id,
                      });
                    setDragged(null);
                  }}
                >
                  <BoardCardContent
                    issue={issue}
                    cardType={data.project?.card_type}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {data.can_write && (
                      <BoardCardOrder
                        issue={issue.id}
                        column={column}
                        disabled={move.isPending}
                        onMove={(value) => move.mutate(value)}
                      />
                    )}
                    {data.can_write && (
                      <SelectControl
                        className={columnSelectClass}
                        label={t("boards.moveIssue", { title: issue.title })}
                        value={String(column.id)}
                        disabled={move.isPending}
                        onValueChange={(value) =>
                          move.mutate({
                            issue: issue.id,
                            column: Number(value),
                          })
                        }
                        options={data.columns.map((value) => ({
                          value: String(value.id),
                          label: value.title,
                        }))}
                      />
                    )}
                  </div>
                  {data.can_write && (
                    <button
                      className="text-xs text-muted mt-3"
                      onClick={() => assign.mutate({ issue, remove: true })}
                    >
                      {t("boards.removeFromBoard")}
                    </button>
                  )}
                </article>
              ))}
            {!column.issues.length && (
              <div className="px-3 py-8 text-center text-sm text-muted">
                {t("boards.emptyColumn")}
              </div>
            )}
          </div>
        ))}
      </div>
      {data.can_write && (
        <div className="mt-6">
          <ConfirmAction
            title={t("boards.confirmDelete", { title: data.project.title })}
            action={async () => {
              await nativeForm(`${nativeRoot}/delete`, {});
              await refresh();
              navigate(root);
            }}
          >
            {t("boards.confirmDeleteText")}
          </ConfirmAction>
        </div>
      )}
    </>
  );
}
