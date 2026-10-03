import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import {
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  Edit3,
  GitMerge,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { RepoContext } from "./App";
import {
  get,
  nativeForm,
  post,
  request,
  type Issue,
  type Project,
} from "./api";
import { ActionMenu, MenuAction } from "./ActionMenu";
import { SelectControl } from "./SelectControl";
import { MilestoneLabelFilter } from "./MilestoneLabelFilter";
import {
  EmptyState,
  Feedback,
  IssueLabel,
  Markdown,
  MarkdownEditor,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import {
  AttachmentPicker,
  submitWithAttachments,
  type Attachment,
} from "./DiscussionAttachments";

interface Label {
  id: number;
  name: string;
  description: string;
  color: string;
  exclusive: boolean;
  archived: boolean;
  organization: boolean;
  open_count?: number;
  closed_count?: number;
}
interface Milestone {
  id: number;
  title: string;
  description: string;
  closed: boolean;
  due_date: string;
  total: number;
  completed: number;
  progress: number;
  open_count?: number;
  closed_count?: number;
  overdue?: boolean;
  description_html?: string;
}
interface LabelData {
  items: Label[];
  templates: { name: string; description: string }[];
  can_write: boolean;
}
interface MilestoneData {
  milestone: Milestone;
  items: Issue[];
  total: number;
  can_write: boolean;
  open_count: number;
  closed_count: number;
  labels: Label[];
  assignees: { id: number; name: string }[];
  authors: { id: number; name: string }[];
  can_create_issue: boolean;
}
interface Metadata {
  issue_id: number;
  content_version: number;
  label_ids: number[];
  assignee_ids: number[];
  milestone_id: number;
  due_date: string;
  labels: Label[];
  assignees: { id: number; name: string; avatar: string }[];
  milestones: Milestone[];
  can_manage: boolean;
  time_enabled: boolean;
  can_track: boolean;
  seconds: number;
  stopwatch: boolean;
  times: {
    id: number;
    seconds: number;
    user: string;
    created_at: string;
    can_delete: boolean;
  }[];
  dependencies_enabled: boolean;
  can_manage_dependencies: boolean;
  dependencies: {
    id: number;
    number: number;
    title: string;
    closed: boolean;
    pull: boolean;
    repository: string;
    kind: "blockedBy" | "blocking";
  }[];
}

/** Link-styled inline action (edit, remove, history) used in discussion sidebars. */
export const editLink =
  "rounded px-1 py-0.5 text-[12px] text-primary hover:underline";
export const metadataSection = (pulls: boolean) =>
  pulls
    ? "mb-0 border-b border-line py-4 first:pt-1"
    : "mb-5 border-b border-line pb-5";
export const metadataTitle = "mb-2 text-sm font-semibold";
export const smallForm = "flex flex-col gap-3 p-3 text-[13px]";
export const smallInput =
  "w-full rounded border border-line bg-surface px-2.5 py-[7px]";
export const dialogBackdrop =
  "fixed inset-0 z-140 bg-black/40 transition-opacity duration-160 ease-[ease] data-ending-style:opacity-0 data-starting-style:opacity-0";
/** Modal dialog surface; callers add position (top) and width. */
export const dialogPopup =
  "fixed left-1/2 z-141 -translate-x-1/2 rounded-lg border border-line bg-surface p-6 text-ink [box-shadow:0_8px_32px_#0003] [&_p]:mt-4 [&_p]:mb-6 [&_p]:text-[14px]";
const managementList = "overflow-hidden rounded-lg border border-line";
const pageHeading =
  "mb-6 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
// Headings with a description keep their actions level with the title.
const pageHeadingWithText =
  "mb-6 flex min-h-10 items-start justify-between gap-4 max-md:gap-3";
const managementForm =
  "workspace-form mb-6 max-w-[720px] rounded-lg border border-line bg-surface p-5";
const sectionTitle = "mt-6 mb-4 text-[16px]";
const listToolbar = "my-4 flex flex-wrap items-center gap-3";
const actions = "flex flex-wrap items-center gap-2";
const mutedLine = "leading-[calc(1.25/0.875)] text-muted";
const metadataHeading = "flex items-baseline justify-between gap-2";
const metadataOptions = "max-h-[280px] overflow-y-auto py-1";
const metadataOption =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-hover aria-pressed:bg-hover";

function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form)) as Record<string, string>;
}
function duration(t: TFunction<"issues">, seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return t("metadata.time.duration", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

export function ConfirmAction({
  title,
  children,
  action,
  label: customLabel,
  className = "button",
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
  finalFocus,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  action: () => Promise<unknown>;
  label?: string;
  className?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
  finalFocus?: RefObject<HTMLElement | null>;
  danger?: boolean;
}) {
  const { t } = useTranslation("issues");
  const label = customLabel ?? t("confirm.delete");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: () => setOpen(false),
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          setOpen(next);
          mutation.reset();
        }
      }}
    >
      {trigger && (
        <Dialog.Trigger className={className} disabled={disabled}>
          {label}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup
          initialFocus={cancelButton}
          finalFocus={finalFocus}
          className={`${dialogPopup} top-[20%] w-[min(480px,calc(100vw-32px))]`}
        >
          <Dialog.Title className="text-[20px] leading-[1.4]">
            {title}
          </Dialog.Title>
          <Dialog.Description render={<div />}>{children}</Dialog.Description>
          <Feedback error={mutation.error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Dialog.Close
              ref={cancelButton}
              className="button"
              disabled={mutation.isPending}
            >
              {t("confirm.cancel")}
            </Dialog.Close>
            <button
              className={danger ? "button danger" : "button"}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? t("confirm.working") : label}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function LabelsPage() {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { t } = useTranslation("issues");
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") || "alphabetically";
  const [editing, setEditing] = useState<Label | "new" | null>(null);
  const [template, setTemplate] = useState("");
  const query = useQuery({
    queryKey: ["labels", path, sort],
    queryFn: ({ signal }) =>
      get<LabelData>(
        `${dataPath}/labels?${new URLSearchParams({ sort })}`,
        signal,
      ),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["labels", path] });
  const initialize = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/labels/initialize`, { template_name: template }),
    onSuccess: refresh,
  });
  useTitle(t("labels.title"));
  return (
    <div className="min-w-0">
      <div className={pageHeadingWithText}>
        <div>
          <h1 className="max-md:text-[22px]">{t("labels.title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("labels.description")}</p>
        </div>
        {query.data?.can_write && (
          <button className="button primary" onClick={() => setEditing("new")}>
            <Plus size={16} />
            {t("labels.new")}
          </button>
        )}
      </div>
      {editing && (
        <LabelEditor
          key={typeof editing === "string" ? editing : editing.id}
          label={editing === "new" ? undefined : editing}
          path={path}
          onClose={() => setEditing(null)}
          onSave={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      <div className={listToolbar}>
        <label className="filter-input w-auto min-w-0 flex-1 max-md:basis-full">
          <Search size={16} />
          <input
            aria-label={t("labels.search")}
            placeholder={t("labels.search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="text-sm text-muted">
          {t("labels.count", { count: query.data?.items.length ?? 0 })}
        </span>
        <SelectControl
          label={t("nativeManagement.labelSort")}
          value={sort}
          onValueChange={(value) => setParams({ sort: value })}
          options={[
            {
              value: "alphabetically",
              label: t("nativeManagement.alphabetically"),
            },
            {
              value: "reversealphabetically",
              label: t("nativeManagement.reverseAlphabetically"),
            },
            { value: "leastissues", label: t("nativeManagement.leastIssues") },
            { value: "mostissues", label: t("milestones.sort.mostissues") },
          ]}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        <div className={managementList}>
          {query.data?.items
            .filter((label) =>
              `${label.name} ${label.description}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((label) => (
              <div
                className="label-management-row flex items-center gap-4 border-b border-line p-4 last:border-b-0 max-md:flex-wrap max-md:gap-3"
                key={label.id}
              >
                <div className="min-w-0 flex-1 max-md:basis-full">
                  <IssueLabel name={label.name} color={label.color} />
                  <p className={`mt-2 text-[13px] ${mutedLine}`}>
                    {label.description}
                  </p>
                </div>
                <div className={actions}>
                  <Link
                    className="text-xs text-muted hover:underline"
                    to={`/projects${path}/issues?${new URLSearchParams({ labels: String(label.id), state: "open" })}`}
                  >
                    {t("nativeManagement.openCount", {
                      count: label.open_count || 0,
                    })}
                  </Link>
                  <Link
                    className="text-xs text-muted hover:underline"
                    to={`/projects${path}/issues?${new URLSearchParams({ labels: String(label.id), state: "closed" })}`}
                  >
                    {t("nativeManagement.closedCount", {
                      count: label.closed_count || 0,
                    })}
                  </Link>
                  {label.organization && (
                    <span className="badge">{t("labels.organization")}</span>
                  )}
                  {label.exclusive && (
                    <span className="badge">{t("labels.scoped")}</span>
                  )}
                  {label.archived && (
                    <span className="badge">{t("labels.archived")}</span>
                  )}
                  {query.data?.can_write && !label.organization && (
                    <>
                      <button
                        className="button"
                        aria-label={t("labels.editLabel", { name: label.name })}
                        onClick={() => setEditing(label)}
                      >
                        <Edit3 size={15} />
                        {t("labels.edit")}
                      </button>
                      <ConfirmAction
                        label={t("labels.delete")}
                        title={t("labels.deleteTitle", { name: label.name })}
                        action={async () => {
                          await nativeForm(`${path}/labels/delete`, {
                            id: String(label.id),
                          });
                          await refresh();
                        }}
                      >
                        {t("labels.deleteText")}
                      </ConfirmAction>
                    </>
                  )}
                </div>
              </div>
            ))}
          {query.data?.items.length === 0 && (
            <EmptyState title={t("labels.empty")} icon={<Tag size={30} />}>
              {t("labels.emptyText")}
            </EmptyState>
          )}
        </div>
      )}
      {query.data?.can_write && !!query.data.templates.length && (
        <section className="mt-7">
          <h2>{t("labels.import.title")}</h2>
          <p className="mt-2 mb-4 text-sm text-muted">
            {t("labels.import.description")}
          </p>
          <div className={actions}>
            <SelectControl
              label={t("labels.import.template")}
              searchable
              placeholder={t("labels.import.choose")}
              value={template}
              onValueChange={setTemplate}
              options={[
                { value: "", label: t("labels.import.choose") },
                ...query.data.templates.map((item) => ({
                  value: item.name,
                  label: item.name,
                  description: item.description,
                })),
              ]}
            />
            <button
              className="button"
              disabled={!template || initialize.isPending}
              onClick={() => initialize.mutate()}
            >
              {t("labels.import.submit")}
            </button>
          </div>
          <Feedback error={initialize.error} />
        </section>
      )}
    </div>
  );
}

function LabelEditor({
  label,
  path,
  onClose,
  onSave,
}: {
  label?: Label;
  path: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const { t } = useTranslation("issues");
  const [name, setName] = useState(label?.name || "");
  const [color, setColor] = useState(label?.color || "#1f75cb");
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(`${path}/labels/${label ? "edit" : "new"}`, {
        ...formValues(form),
        ...(label ? { id: String(label.id) } : {}),
      });
      await onSave();
    },
  });
  return (
    <form
      className={managementForm}
      aria-label={label ? t("labels.editor.edit") : t("labels.editor.new")}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <h2 className="mb-1">
        {label ? t("labels.editor.edit") : t("labels.editor.new")}
      </h2>
      <label>
        {t("labels.editor.title")}
        <input
          name="title"
          required
          maxLength={50}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        {t("labels.editor.description")}
        <input
          name="description"
          maxLength={200}
          defaultValue={label?.description}
        />
      </label>
      <label>
        {t("labels.editor.color")}
        <div className="flex items-center gap-3">
          <input
            className="h-[34px] w-10 flex-none p-[3px]"
            type="color"
            aria-label={t("labels.editor.pickColor")}
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#1f75cb"}
            onChange={(event) => setColor(event.target.value)}
          />
          <input
            className="w-[120px]"
            name="color"
            required
            pattern="#[0-9a-fA-F]{6}"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <IssueLabel name={name || t("labels.editor.preview")} color={color} />
        </div>
      </label>
      <label className="check-field">
        <input
          name="exclusive"
          type="checkbox"
          value="on"
          defaultChecked={label?.exclusive}
        />
        {t("labels.editor.exclusive")}
      </label>
      {label && (
        <label className="check-field">
          <input
            name="is_archived"
            type="checkbox"
            value="on"
            defaultChecked={label.archived}
          />
          {t("labels.archived")}
        </label>
      )}
      <Feedback error={save.error} />
      <div className={actions}>
        <button className="button primary" disabled={save.isPending}>
          {label ? t("labels.editor.save") : t("labels.editor.create")}
        </button>
        <button className="button" type="button" onClick={onClose}>
          {t("labels.editor.cancel")}
        </button>
      </div>
    </form>
  );
}

export function MilestonesPage() {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { t, i18n } = useTranslation("issues");
  const [params, setParams] = useSearchParams();
  const state = params.get("state") || "open",
    page = Math.max(1, Number(params.get("page")) || 1),
    q = params.get("q") || "",
    sort = params.get("sort") || "closestduedate";
  const query = useQuery({
    queryKey: ["milestones", path, state, page, q, sort],
    queryFn: ({ signal }) =>
      get<{
        items: Milestone[];
        total: number;
        can_write: boolean;
        open_count: number;
        closed_count: number;
      }>(
        `${dataPath}/milestones?${new URLSearchParams({ state, page: String(page), q, sort })}`,
        signal,
      ),
  });
  const update = (values: Record<string, string>) =>
    setParams({ state, q, sort, ...values });
  useTitle(t("milestones.title"));
  return (
    <div className="min-w-0">
      <div className={pageHeading}>
        <h1 className="max-md:text-[22px]">{t("milestones.title")}</h1>
        {query.data?.can_write && (
          <Link className="button primary" to="new">
            {t("milestones.new")}
          </Link>
        )}
      </div>
      <div
        className="tabs"
        role="tablist"
        aria-label={t("milestones.statusTabs")}
      >
        {["open", "closed", "all"].map((value) => (
          <button
            key={value}
            className={state === value ? "active" : ""}
            role="tab"
            aria-selected={state === value}
            onClick={() => update({ state: value })}
          >
            {value === "open"
              ? t("milestones.active")
              : value === "closed"
                ? t("milestones.closed")
                : t("milestones.all")}
            {query.data && (
              <span className="counter">
                {value === "open"
                  ? query.data.open_count
                  : value === "closed"
                    ? query.data.closed_count
                    : query.data.open_count + query.data.closed_count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className={listToolbar}>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 max-md:order-first max-md:basis-full"
          onSubmit={(event) => {
            event.preventDefault();
            update({
              q: String(new FormData(event.currentTarget).get("q") || ""),
            });
          }}
        >
          <label className="filter-input w-auto min-w-0 flex-1">
            <Search size={16} />
            <input
              name="q"
              aria-label={t("milestones.search")}
              placeholder={t("milestones.searchPlaceholder")}
              defaultValue={q}
            />
          </label>
          <button className="button">{t("milestones.searchButton")}</button>
        </form>
        <SelectControl
          label={t("milestones.sort.label")}
          value={sort}
          onValueChange={(value) => update({ sort: value })}
          options={[
            {
              value: "closestduedate",
              label: t("milestones.sort.closestduedate"),
            },
            {
              value: "furthestduedate",
              label: t("milestones.sort.furthestduedate"),
            },
            { value: "mostcomplete", label: t("milestones.sort.mostcomplete") },
            {
              value: "leastcomplete",
              label: t("milestones.sort.leastcomplete"),
            },
            { value: "mostissues", label: t("milestones.sort.mostissues") },
            { value: "leastissues", label: t("nativeManagement.leastIssues") },
            { value: "name", label: t("nativeManagement.nameSort") },
          ]}
        />
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div className={managementList}>
          {query.data.items.map((milestone) => (
            <article
              className="flex items-center gap-4 border-b border-line p-4 last:border-b-0 max-md:grid max-md:grid-cols-[20px_minmax(0,1fr)] max-md:gap-3"
              key={milestone.id}
            >
              <CalendarDays size={20} />
              <div className="min-w-0 flex-1">
                <Link
                  className="text-[16px] font-semibold hover:underline"
                  to={String(milestone.id)}
                >
                  {milestone.title}
                </Link>
                <p
                  className={`mt-1.5 text-[13px] ${milestone.overdue && !milestone.closed ? "text-danger" : mutedLine}`}
                >
                  {milestone.due_date
                    ? t("milestones.due", {
                        date: new Date(
                          `${milestone.due_date}T00:00:00`,
                        ).toLocaleDateString(i18n.language),
                      })
                    : t("milestones.noDueDate")}{" "}
                  ·{" "}
                  {milestone.closed
                    ? t("milestones.closed")
                    : t("milestones.active")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted">
                  <span>
                    {t("nativeManagement.openCount", {
                      count:
                        milestone.open_count ??
                        milestone.total - milestone.completed,
                    })}
                  </span>
                  <span>
                    {t("nativeManagement.closedCount", {
                      count: milestone.closed_count ?? milestone.completed,
                    })}
                  </span>
                </div>
                {!!milestone.description && (
                  <div className="mt-1.5 text-[13px]">
                    <Markdown
                      html={milestone.description_html}
                      basePath={`${path}/src/branch/HEAD/`}
                    >
                      {milestone.description}
                    </Markdown>
                  </div>
                )}
              </div>
              <MilestoneProgress
                milestone={milestone}
                className="max-md:col-start-2"
              />
              {query.data.can_write && (
                <MilestoneListActions milestone={milestone} />
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={t("milestones.empty")}
          icon={<CalendarDays size={32} />}
        >
          {t("milestones.emptyText")}
        </EmptyState>
      )}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.total}
          size={30}
          onPage={(value) => update({ page: String(value) })}
        />
      )}
    </div>
  );
}

function MilestoneListActions({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>();
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["milestones", path] }),
      client.invalidateQueries({ queryKey: ["milestone", path] }),
    ]);
  };
  const status = useMutation({
    mutationFn: () =>
      nativeForm(
        `${path}/milestones/${milestone.id}/${milestone.closed ? "open" : "close"}`,
        {},
      ),
    onSuccess: refresh,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 max-md:col-start-2">
      <Feedback error={status.error} />
      <Link className="button" to={`${milestone.id}/edit`}>
        {t("milestones.edit")}
      </Link>
      <button
        className="button"
        disabled={status.isPending}
        onClick={() => status.mutate()}
      >
        {milestone.closed ? t("milestones.reopen") : t("milestones.close")}
      </button>
      <ConfirmAction
        label={t("labels.delete")}
        title={t("milestones.deleteTitle")}
        action={async () => {
          await nativeForm(`${path}/milestones/delete`, {
            id: String(milestone.id),
          });
          await refresh();
        }}
      >
        {t("milestones.deleteText")}
      </ConfirmAction>
    </div>
  );
}

function MilestoneProgress({
  milestone,
  className,
}: {
  milestone: Milestone;
  className: string;
}) {
  const { t } = useTranslation("issues");
  return (
    <div className={`w-[210px] max-w-full shrink-0 ${className}`}>
      <progress
        className="h-2 w-full overflow-hidden rounded border-0 bg-line accent-[#108548] [&::-webkit-progress-bar]:rounded [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-[#108548]"
        max={100}
        value={milestone.progress}
        aria-label={t("milestones.completion", { title: milestone.title })}
      />
      <span className="mt-[5px] block text-[12px] text-muted">
        {t("milestones.progress", {
          progress: milestone.progress,
          completed: milestone.completed,
          total: milestone.total,
        })}
      </span>
    </div>
  );
}

export function MilestoneEditorPage() {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { milestone } = useParams();
  const { t } = useTranslation("issues");
  const navigate = useNavigate(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["milestone", path, milestone],
    queryFn: ({ signal }) =>
      get<MilestoneData>(`${dataPath}/milestones/${milestone}`, signal),
    enabled: !!milestone,
  });
  const permission = useQuery({
    queryKey: ["milestone-permission", path],
    queryFn: ({ signal }) =>
      get<{ can_write: boolean }>(`${dataPath}/milestones`, signal),
    enabled: !milestone,
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(
        `${path}/milestones/${milestone ? `${milestone}/edit` : "new"}`,
        formValues(form),
      );
      await client.invalidateQueries({ queryKey: ["milestones", path] });
      await client.invalidateQueries({ queryKey: ["milestone", path] });
      navigate(
        `/projects${path}/milestones${milestone ? `/${milestone}` : ""}`,
      );
    },
  });
  useTitle(milestone ? t("milestones.editTitle") : t("milestones.new"));
  if (milestone ? query.isPending : permission.isPending) return <Pending />;
  if (query.error || permission.error)
    return <Feedback error={query.error || permission.error} />;
  if (!(milestone ? query.data?.can_write : permission.data?.can_write))
    return <EmptyState title={t("milestones.writeRequired")} />;
  return (
    <div className="min-w-0">
      <div className={pageHeading}>
        <h1 className="max-md:text-[22px]">
          {milestone ? t("milestones.editTitle") : t("milestones.new")}
        </h1>
      </div>
      <form
        className="workspace-form mb-8 max-w-[720px]"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(event.currentTarget);
        }}
      >
        <label>
          {t("milestones.form.title")}
          <input
            name="title"
            required
            maxLength={50}
            defaultValue={query.data?.milestone.title}
          />
        </label>
        <label>
          {t("milestones.form.description")}
          <textarea
            name="content"
            rows={7}
            defaultValue={query.data?.milestone.description}
          />
        </label>
        <label>
          {t("milestones.form.dueDate")}
          <input
            type="date"
            name="deadline"
            defaultValue={query.data?.milestone.due_date}
          />
        </label>
        <Feedback error={save.error} />
        <div className={actions}>
          <button className="button primary" disabled={save.isPending}>
            {milestone
              ? t("milestones.form.save")
              : t("milestones.form.create")}
          </button>
          <Link className="button" to={`/projects${path}/milestones`}>
            {t("milestones.form.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

export function MilestonePage() {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { milestone } = useParams();
  const { t, i18n } = useTranslation("issues");
  const [params, setParams] = useSearchParams();
  const state = params.get("state") || "open";
  const sort = params.get("sort") || "latest";
  const updateFilters = (values: Record<string, string>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("page");
      for (const [key, value] of Object.entries(values)) next.set(key, value);
      return next;
    });
  const page = Math.max(1, Number(params.get("page")) || 1),
    client = useQueryClient(),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: ["milestone", path, milestone, params.toString()],
    queryFn: ({ signal }) =>
      get<MilestoneData>(
        `${dataPath}/milestones/${milestone}?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page) })}`,
        signal,
      ),
  });
  const change = useMutation({
    mutationFn: () =>
      nativeForm(
        `${path}/milestones/${milestone}/${query.data!.milestone.closed ? "open" : "close"}`,
        {},
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["milestone", path] });
      await client.invalidateQueries({ queryKey: ["milestones", path] });
    },
  });
  useTitle(query.data?.milestone.title || t("milestones.milestone"));
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const item = query.data.milestone;
  return (
    <div className="min-w-0">
      <div className={pageHeading}>
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${item.closed ? "bg-info-bg text-[#245b9b] dark:text-[#a3cbf5]" : "bg-[#c7e9d4] text-[#0a6635] dark:bg-success-bg dark:text-success"}`}
          >
            {item.closed ? t("milestones.closed") : t("milestones.active")}
          </span>
          <h1 className="max-md:text-[22px]">{item.title}</h1>
        </div>
        {query.data.can_write && (
          <div className={actions}>
            <Link className="button" to="edit">
              {t("milestones.editTitle")}
            </Link>
            <button
              className="button"
              disabled={change.isPending}
              onClick={() => change.mutate()}
            >
              {item.closed ? t("milestones.reopen") : t("milestones.close")}
            </button>
            <ConfirmAction
              title={t("milestones.deleteTitle")}
              action={async () => {
                await nativeForm(`${path}/milestones/delete`, {
                  id: String(item.id),
                });
                await client.invalidateQueries({
                  queryKey: ["milestones", path],
                });
                navigate(`/projects${path}/milestones`);
              }}
            >
              {t("milestones.deleteText")}
            </ConfirmAction>
          </div>
        )}
      </div>
      <Feedback error={change.error} />
      {query.data.can_create_issue && (
        <Link
          className="button primary my-3"
          to={`/projects${path}/issues/new?${new URLSearchParams({ milestone: String(item.id) })}`}
        >
          {t("nativeManagement.newIssue")}
        </Link>
      )}
      <div className="flex justify-between gap-8 border-b border-line pt-5 pb-7 max-md:flex-wrap max-md:gap-3 [&>.markdown]:min-w-0 [&>.markdown]:flex-1">
        <Markdown
          html={item.description_html}
          basePath={`${path}/src/branch/HEAD/`}
        >
          {item.description || t("milestones.noDescription")}
        </Markdown>
        <div className="shrink-0 max-md:w-full">
          <p
            className={`text-sm ${item.overdue && !item.closed ? "text-danger" : "text-muted"}`}
          >
            {item.due_date
              ? t("milestones.due", {
                  date: new Date(
                    `${item.due_date}T00:00:00`,
                  ).toLocaleDateString(i18n.language),
                })
              : t("milestones.noDueDate")}
          </p>
          <MilestoneProgress milestone={item} className="mt-3" />
        </div>
      </div>
      <h2 className={sectionTitle}>
        {t("milestones.items")}{" "}
        <span className="counter">{query.data.total}</span>
      </h2>
      <nav className="tabs" aria-label={t("nativeManagement.itemStatus")}>
        {["open", "closed", "all"].map((value) => (
          <button
            key={value}
            className={state === value ? "active" : ""}
            aria-current={state === value ? "page" : undefined}
            onClick={() => updateFilters({ state: value })}
          >
            {value === "open"
              ? t("milestones.itemState.open")
              : value === "closed"
                ? t("milestones.itemState.closed")
                : t("milestones.all")}{" "}
            <span className="counter">
              {value === "open"
                ? query.data.open_count || 0
                : value === "closed"
                  ? query.data.closed_count || 0
                  : (query.data.open_count || 0) +
                    (query.data.closed_count || 0)}
            </span>
          </button>
        ))}
      </nav>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <MilestoneLabelFilter
          labels={query.data.labels || []}
          value={params.get("labels") || ""}
          onValueChange={(value) => updateFilters({ labels: value })}
          archived={params.get("archived") === "true"}
          onArchivedChange={(value) =>
            updateFilters({ archived: String(value) })
          }
        />
        <SelectControl
          label={t("nativeManagement.filterAssignee")}
          value={params.get("assignee") || "0"}
          onValueChange={(value) => updateFilters({ assignee: value })}
          searchable
          options={[
            { value: "0", label: t("nativeManagement.allAssignees") },
            { value: "-1", label: t("nativeManagement.unassigned") },
            ...(query.data.assignees || []).map((user) => ({
              value: String(user.id),
              label: user.name,
            })),
          ]}
        />
        <SelectControl
          label={t("nativeManagement.filterAuthor")}
          value={params.get("poster") || "0"}
          onValueChange={(value) => updateFilters({ poster: value })}
          searchable
          options={[
            { value: "0", label: t("nativeManagement.allAuthors") },
            ...(query.data.authors || []).map((user) => ({
              value: String(user.id),
              label: user.name,
            })),
          ]}
        />
        <SelectControl
          label={t("nativeManagement.itemSort.label")}
          value={sort}
          onValueChange={(value) => updateFilters({ sort: value })}
          options={[
            "latest",
            "oldest",
            "recentupdate",
            "leastupdate",
            "mostcomment",
            "leastcomment",
            "nearduedate",
            "farduedate",
            "priority",
          ].map((value) => ({
            value,
            label: t(`nativeManagement.itemSort.${value as "latest"}`),
          }))}
        />
      </div>
      <div className={managementList}>
        {query.data.items.map((issue) => (
          <Link
            className="milestone-issue-row flex items-center gap-4 border-b border-line p-4 text-[14px] last:border-b-0 hover:bg-hover"
            key={issue.id}
            to={`/projects${path}/${issue.pull_request ? "merge-requests" : "issues"}/${issue.number}`}
          >
            {issue.pull_request ? (
              <GitMerge size={18} />
            ) : (
              <CircleDot size={18} />
            )}
            <div className="min-w-0 flex-1">
              <strong>{issue.title}</strong>
              <p className={`mt-[5px] text-[12px] ${mutedLine}`}>
                {issue.pull_request ? "!" : "#"}
                {issue.number} ·{" "}
                {issue.state === "closed"
                  ? t("milestones.itemState.closed")
                  : issue.state === "open"
                    ? t("milestones.itemState.open")
                    : issue.state}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 max-md:hidden">
              {issue.labels.map((label) => (
                <IssueLabel
                  key={label.id}
                  name={label.name}
                  color={label.color}
                />
              ))}
            </div>
          </Link>
        ))}
      </div>
      {!query.data.items.length && (
        <EmptyState title={t("milestones.noItems")}>
          {t("milestones.noItemsText")}
        </EmptyState>
      )}
      <Pagination
        page={page}
        total={query.data.total}
        size={30}
        onPage={(value) => updateFilters({ page: String(value) })}
      />
    </div>
  );
}

function MetadataPopover({
  label,
  editLabel,
  children,
}: {
  label: string;
  editLabel: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("issues");
  return (
    <Popover.Root>
      <Popover.Trigger className={editLink} aria-label={editLabel}>
        {t("metadata.edit")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="dropdown-positioner"
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup className="dropdown-popup metadata-popup w-[292px] max-w-[calc(100vw-24px)]">
            <div className="dropdown-heading flex items-center justify-between">
              <Popover.Title>{label}</Popover.Title>
              <Popover.Close
                className="icon-button"
                aria-label={t("metadata.close")}
              >
                <X size={14} />
              </Popover.Close>
            </div>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function IssueMetadataPanel({
  issue,
  pulls = false,
  children,
}: {
  issue: Issue;
  pulls?: boolean;
  children?: ReactNode;
}) {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { t } = useTranslation("issues");
  const client = useQueryClient();
  const kind = pulls ? "pulls" : "issues",
    index = String(issue.number);
  const query = useQuery({
    queryKey: ["issue-metadata", path, kind, index],
    queryFn: ({ signal }) =>
      get<Metadata>(`${dataPath}/${kind}/${index}/metadata`, signal),
  });
  const [labelSearch, setLabelSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const change = useMutation({
    mutationFn: async ({
      endpoint,
      values,
    }: {
      endpoint: string;
      values: Record<string, string>;
    }) => {
      await nativeForm(`${path}/${kind}/${endpoint}`, values);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["issue-metadata", path] }),
        client.invalidateQueries({ queryKey: ["native-issue-list", path] }),
        client.invalidateQueries({ queryKey: ["discussion", path] }),
        client.invalidateQueries({ queryKey: ["milestone", path] }),
        client.invalidateQueries({ queryKey: ["milestones", path] }),
      ]);
    },
  });
  const aside = `discussion-aside ${pulls ? "border-0 border-line pl-0" : "border-l border-line pl-5 max-[1100px]:border-0 max-[1100px]:p-0"}`;
  const section = metadataSection(pulls);
  const deadline = useMutation({
    mutationFn: async (value: string) => {
      await request(`${path}/${kind}/${index}/deadline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forgejo-UI": "1" },
        body: JSON.stringify({ due_date: value ? `${value}T12:00:00Z` : null }),
      });
      await client.invalidateQueries({ queryKey: ["issue-metadata", path] });
      await client.invalidateQueries({ queryKey: ["discussion", path] });
    },
  });
  if (query.isPending)
    return (
      <aside className={aside}>
        <Pending />
      </aside>
    );
  if (query.error)
    return (
      <aside className={aside}>
        <Feedback error={query.error} />
      </aside>
    );
  const data = query.data;
  const update = (endpoint: string, values: Record<string, string>) =>
    change.mutate({
      endpoint,
      values: { issue_ids: String(data.issue_id), ...values },
    });
  const selectedMilestone = data.milestones.find(
    (item) => item.id === data.milestone_id,
  );
  return (
    <aside className={aside}>
      <Feedback error={change.error} />
      <section className={section}>
        <div className={metadataHeading}>
          <h3 className={metadataTitle}>{t("metadata.assignees.title")}</h3>
          {data.can_manage && (
            <MetadataPopover
              label={t("metadata.assignees.popover")}
              editLabel={t("metadata.assignees.edit")}
            >
              <label className="dropdown-search">
                <Search size={15} />
                <input
                  aria-label={t("metadata.assignees.search")}
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder={t("metadata.assignees.searchPlaceholder")}
                />
              </label>
              <div className={metadataOptions}>
                {data.assignees
                  .filter((user) =>
                    user.name
                      .toLowerCase()
                      .includes(assigneeSearch.toLowerCase()),
                  )
                  .map((user) => (
                    <button
                      className={metadataOption}
                      key={user.id}
                      aria-pressed={data.assignee_ids.includes(user.id)}
                      disabled={change.isPending}
                      onClick={() =>
                        update("assignee", { id: String(user.id) })
                      }
                    >
                      <img
                        className="size-6 rounded-full"
                        src={user.avatar}
                        alt=""
                      />
                      <span className="flex-1">{user.name}</span>
                      {data.assignee_ids.includes(user.id) && (
                        <Check className="ml-auto" size={15} />
                      )}
                    </button>
                  ))}
              </div>
              <button
                className="menu-item"
                disabled={change.isPending || !data.assignee_ids.length}
                onClick={() => update("assignee", { action: "clear" })}
              >
                {t("metadata.assignees.removeAll")}
              </button>
            </MetadataPopover>
          )}
        </div>
        {issue.assignees?.length ? (
          issue.assignees.map((user) => (
            <span
              className="my-2 flex items-center gap-2 text-xs"
              key={user.login}
            >
              <img
                className="size-6 rounded-full"
                src={user.avatar_url}
                alt=""
              />
              {user.login}
            </span>
          ))
        ) : (
          <p className="text-sm text-muted">{t("metadata.assignees.none")}</p>
        )}
      </section>
      <section className={section}>
        <div className={metadataHeading}>
          <h3 className={metadataTitle}>{t("metadata.labels.title")}</h3>
          {data.can_manage && (
            <MetadataPopover
              label={t("metadata.labels.popover")}
              editLabel={t("metadata.labels.edit")}
            >
              <label className="dropdown-search">
                <Search size={15} />
                <input
                  aria-label={t("metadata.labels.search")}
                  value={labelSearch}
                  onChange={(e) => setLabelSearch(e.target.value)}
                  placeholder={t("metadata.labels.searchPlaceholder")}
                />
              </label>
              <div className={metadataOptions}>
                {data.labels
                  .filter(
                    (label) =>
                      !label.archived &&
                      label.name
                        .toLowerCase()
                        .includes(labelSearch.toLowerCase()),
                  )
                  .map((label) => (
                    <button
                      className={metadataOption}
                      key={label.id}
                      aria-pressed={data.label_ids.includes(label.id)}
                      disabled={change.isPending}
                      onClick={() =>
                        update("labels", {
                          id: String(label.id),
                          action: data.label_ids.includes(label.id)
                            ? "detach"
                            : "attach",
                        })
                      }
                    >
                      <IssueLabel name={label.name} color={label.color} />
                      {data.label_ids.includes(label.id) && (
                        <Check className="ml-auto" size={15} />
                      )}
                    </button>
                  ))}
              </div>
              <Link className="menu-item" to={`/projects${path}/labels`}>
                {t("metadata.labels.manage")}
              </Link>
            </MetadataPopover>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {issue.labels.length ? (
            issue.labels.map((label) => (
              <IssueLabel
                key={label.id}
                name={label.name}
                color={label.color}
              />
            ))
          ) : (
            <span className="text-sm text-muted">{t("metadata.none")}</span>
          )}
        </div>
      </section>
      <section className={section}>
        <div className={metadataHeading}>
          <h3 className={metadataTitle}>{t("metadata.milestone.title")}</h3>
        </div>
        {data.can_manage ? (
          <SelectControl
            label={t("metadata.milestone.select")}
            searchable
            value={String(data.milestone_id)}
            onValueChange={(id) => update("milestone", { id })}
            disabled={change.isPending}
            options={[
              { value: "0", label: t("metadata.none") },
              ...data.milestones.map((item) => ({
                value: String(item.id),
                label: item.closed
                  ? t("metadata.closedOption", { title: item.title })
                  : item.title,
              })),
            ]}
          />
        ) : (
          <p className="text-sm text-muted">
            {selectedMilestone?.title || t("metadata.none")}
          </p>
        )}
        {selectedMilestone && (
          <Link
            className="mt-2 block text-[12px] text-primary"
            to={`/projects${path}/milestones/${selectedMilestone.id}`}
          >
            {t("metadata.milestone.view")}
          </Link>
        )}
      </section>
      <section className={section}>
        <div className={metadataHeading}>
          <h3 className={metadataTitle}>{t("metadata.dueDate.title")}</h3>
          {data.can_manage && (
            <MetadataPopover
              label={t("metadata.dueDate.popover")}
              editLabel={t("metadata.dueDate.edit")}
            >
              <form
                className={smallForm}
                key={data.due_date}
                onSubmit={(event) => {
                  event.preventDefault();
                  deadline.mutate(
                    String(new FormData(event.currentTarget).get("date") || ""),
                  );
                }}
              >
                <label className="flex flex-col gap-1.5">
                  {t("metadata.dueDate.title")}
                  <input
                    className={smallInput}
                    name="date"
                    type="date"
                    defaultValue={data.due_date}
                  />
                </label>
                <Feedback error={deadline.error} />
                <button
                  className="button primary"
                  disabled={deadline.isPending}
                >
                  {t("metadata.dueDate.save")}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!data.due_date || deadline.isPending}
                  onClick={() => deadline.mutate("")}
                >
                  {t("metadata.dueDate.remove")}
                </button>
              </form>
            </MetadataPopover>
          )}
        </div>
        <p className="text-sm text-muted">
          {data.due_date || t("metadata.none")}
        </p>
      </section>
      {data.time_enabled && (
        <section className={section}>
          <div className={metadataHeading}>
            <h3 className={metadataTitle}>{t("metadata.time.title")}</h3>
            {data.can_track && (
              <MetadataPopover
                label={t("metadata.time.popover")}
                editLabel={t("metadata.time.edit")}
              >
                <form
                  className={smallForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = formValues(event.currentTarget);
                    update(`${index}/times/add`, values);
                  }}
                >
                  <div className="grid grid-cols-[1fr_1fr] gap-5">
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {t("metadata.time.hours")}
                      <input
                        className={smallInput}
                        name="hours"
                        type="number"
                        min={0}
                        max={1000}
                        defaultValue={0}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {t("metadata.time.minutes")}
                      <input
                        className={smallInput}
                        name="minutes"
                        type="number"
                        min={0}
                        max={1000}
                        defaultValue={30}
                      />
                    </label>
                  </div>
                  <button
                    className="button primary"
                    disabled={change.isPending}
                  >
                    {t("metadata.time.add")}
                  </button>
                </form>
                {data.times.map((time) => (
                  <div
                    className="tracked-time-row flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12px]"
                    key={time.id}
                  >
                    <span>
                      {duration(t, time.seconds)} · {time.user}
                    </span>
                    {time.can_delete && (
                      <button
                        className="icon-button"
                        aria-label={t("metadata.time.delete", {
                          duration: duration(t, time.seconds),
                          user: time.user,
                        })}
                        onClick={() =>
                          update(`${index}/times/${time.id}/delete`, {})
                        }
                        disabled={change.isPending}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </MetadataPopover>
            )}
          </div>
          <p>
            <Clock3 className="inline-block align-[-2px]" size={14} />{" "}
            {t("metadata.time.spent", { duration: duration(t, data.seconds) })}
          </p>
          {data.can_track && (
            <div className={`mt-2.5 ${actions}`}>
              <button
                className="button"
                disabled={change.isPending}
                onClick={() => update(`${index}/times/stopwatch/toggle`, {})}
              >
                {data.stopwatch
                  ? t("metadata.time.stop")
                  : t("metadata.time.start")}
              </button>
              {data.stopwatch && (
                <button
                  className={editLink}
                  disabled={change.isPending}
                  onClick={() => update(`${index}/times/stopwatch/cancel`, {})}
                >
                  {t("metadata.time.cancel")}
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {data.dependencies_enabled && (
        <DependencySection
          data={data}
          path={path}
          dataPath={dataPath}
          kind={kind}
          index={index}
          section={section}
        />
      )}
      {children}
      <section className={section}>
        <h3 className={metadataTitle}>{t("metadata.lastUpdated")}</h3>
        <p className="text-sm text-muted">{relativeDate(issue.updated_at)}</p>
      </section>
    </aside>
  );
}

function DependencySection({
  data,
  path,
  dataPath,
  kind,
  index,
  section,
}: {
  data: Metadata;
  path: string;
  dataPath: string;
  kind: string;
  index: string;
  section: string;
}) {
  const { t } = useTranslation("issues");
  const client = useQueryClient(),
    [target, setTarget] = useState("");
  const mutation = useMutation({
    mutationFn: async ({
      id,
      direction,
    }: {
      id?: number;
      direction?: string;
    }) => {
      if (id)
        await nativeForm(`${path}/${kind}/${index}/dependency/delete`, {
          removeDependencyID: String(id),
          dependencyType: direction!,
        });
      else {
        const match = target
          .trim()
          .match(/^(?:([^/\s]+)\/([^#\s]+))?[#!]?(\d+)$/);
        if (!match) throw new Error(t("metadata.dependencies.invalid"));
        const targetPath = match[1]
          ? `/-/ui/data/repos/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`
          : dataPath;
        const item = await get<{ issue: Issue }>(
          `${targetPath}/${target.includes("!") ? "pulls" : "issues"}/${match[3]}`,
        );
        await nativeForm(`${path}/${kind}/${index}/dependency/add`, {
          newDependency: String(item.issue.id),
        });
        setTarget("");
      }
      await client.invalidateQueries({ queryKey: ["issue-metadata", path] });
    },
  });
  return (
    <section className={section}>
      <div className={metadataHeading}>
        <h3 className={metadataTitle}>{t("metadata.dependencies.title")}</h3>
        {data.can_manage_dependencies && (
          <MetadataPopover
            label={t("metadata.dependencies.popover")}
            editLabel={t("metadata.dependencies.edit")}
          >
            <form
              className={smallForm}
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({});
              }}
            >
              <label className="flex flex-col gap-1.5">
                {t("metadata.dependencies.blockedBy")}
                <input
                  className={smallInput}
                  aria-label={t("metadata.dependencies.input")}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={t("metadata.dependencies.placeholder")}
                  required
                />
              </label>
              <Feedback error={mutation.error} />
              <button className="button primary" disabled={mutation.isPending}>
                {t("metadata.dependencies.add")}
              </button>
            </form>
          </MetadataPopover>
        )}
      </div>
      {data.dependencies.length ? (
        data.dependencies.map((dependency) => (
          <div
            className="dependency-row mt-3 flex items-start gap-2 text-[12px]"
            key={`${dependency.kind}-${dependency.id}`}
          >
            <div className="min-w-0 flex-1">
              <small className="block text-sm text-muted">
                {dependency.kind === "blockedBy"
                  ? t("metadata.dependencies.blockedBy")
                  : t("metadata.dependencies.blocks")}
              </small>
              <Link
                to={`/projects/${dependency.repository}/${dependency.pull ? "merge-requests" : "issues"}/${dependency.number}`}
                className={`mt-1 block [overflow-wrap:anywhere] hover:text-primary hover:underline ${dependency.closed ? "text-sm text-muted" : ""}`}
              >
                {dependency.repository}
                {dependency.pull ? "!" : "#"}
                {dependency.number} {dependency.title}
              </Link>
            </div>
            {data.can_manage_dependencies && (
              <button
                className="icon-button"
                aria-label={t("metadata.dependencies.remove", {
                  title: dependency.title,
                })}
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    id: dependency.id,
                    direction: dependency.kind,
                  })
                }
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted">{t("metadata.none")}</p>
      )}
      <Feedback error={mutation.error} />
    </section>
  );
}

export function IssueEditControls({
  issue,
  pulls = false,
  canEdit,
  attachments = [],
  attachmentsEnabled = false,
}: {
  issue: Issue;
  pulls?: boolean;
  canEdit: boolean;
  attachments?: Attachment[];
  attachmentsEnabled?: boolean;
}) {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { t } = useTranslation("issues");
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(issue.title),
    [content, setContent] = useState(issue.body || ""),
    [files, setFiles] = useState<File[]>([]),
    [retained, setRetained] = useState(attachments);
  const client = useQueryClient(),
    kind = pulls ? "pulls" : "issues";
  const query = useQuery({
    queryKey: ["issue-edit-version", path, kind, issue.number],
    queryFn: ({ signal }) =>
      get<Metadata>(`${dataPath}/${kind}/${issue.number}/metadata`, signal),
    enabled: editing,
    staleTime: 0,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (title !== issue.title)
        await nativeForm(`${path}/${kind}/${issue.number}/title`, { title });
      await submitWithAttachments(
        path,
        `${path}/${kind}/${issue.number}/content`,
        {
          content,
          content_version: String(query.data!.content_version),
        },
        files,
        retained.map((file) => file.uuid),
        "files[]",
      );
      await client.invalidateQueries({ queryKey: ["discussion", path] });
      await client.invalidateQueries({ queryKey: ["native-issue-list", path] });
      setEditing(false);
    },
  });
  if (!canEdit) return null;
  if (!editing)
    return (
      <button
        className="button ml-auto"
        onClick={() => {
          setTitle(issue.title);
          setContent(issue.body || "");
          setFiles([]);
          setRetained(attachments);
          setEditing(true);
        }}
      >
        <Edit3 size={14} />
        {t("editIssue.edit")}
      </button>
    );
  return (
    <form
      className="workspace-form m-0 basis-full rounded-lg border border-line p-4"
      aria-label={t("editIssue.label")}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        {t("editIssue.title")}
        <input
          required
          maxLength={255}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <MarkdownEditor
        label={t("editIssue.description")}
        placeholder={t("editIssue.descriptionPlaceholder")}
        value={content}
        onChange={setContent}
      />
      {retained.map((file) => (
        <div key={file.uuid}>
          {file.name}
          <button
            type="button"
            className={editLink}
            onClick={() =>
              setRetained(retained.filter((item) => item.uuid !== file.uuid))
            }
          >
            {t("editIssue.removeAttachment")}
          </button>
        </div>
      ))}
      {attachmentsEnabled && (
        <AttachmentPicker files={files} onChange={setFiles} />
      )}
      <Feedback error={query.error || save.error} />
      <div className={actions}>
        <button
          className="button primary"
          disabled={query.isPending || !!query.error || save.isPending}
        >
          {t("editIssue.save")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setEditing(false)}
        >
          {t("editIssue.cancel")}
        </button>
      </div>
    </form>
  );
}

interface BoardConfiguration {
  project: Project;
  card_type: number;
  columns: { id: number; title: string; color: string; default: boolean }[];
  can_write: boolean;
}
export function BoardSettingsPage() {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { board } = useParams(),
    navigate = useNavigate(),
    client = useQueryClient();
  const { t } = useTranslation("issues");
  const query = useQuery({
    queryKey: ["board-settings", path, board],
    queryFn: ({ signal }) =>
      get<BoardConfiguration>(`${dataPath}/projects/${board}/settings`, signal),
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["board", path] }),
      client.invalidateQueries({ queryKey: ["boards", path] }),
      client.invalidateQueries({ queryKey: ["board-settings", path] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(`${path}/projects/${board}/edit`, formValues(form));
      await refresh();
    },
  });
  const status = useMutation({
    mutationFn: async () => {
      await nativeForm(
        `${path}/projects/${board}/${query.data!.project.closed ? "open" : "close"}`,
        {},
      );
      await refresh();
    },
  });
  const addColumn = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(`${path}/projects/${board}`, formValues(form));
      await refresh();
      form.reset();
    },
  });
  useTitle(t("boardSettings.title"));
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  if (!query.data.can_write)
    return <EmptyState title={t("boardSettings.writeRequired")} />;
  return (
    <div className="min-w-0">
      <div className={pageHeading}>
        <h1 className="max-md:text-[22px]">{t("boardSettings.title")}</h1>
        <Link className="button" to={`/projects${path}/boards/${board}`}>
          {t("boardSettings.return")}
        </Link>
      </div>
      <form
        className="workspace-form mb-8 max-w-[720px]"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(event.currentTarget);
        }}
      >
        <label>
          {t("boardSettings.boardTitle")}
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={query.data.project.title}
          />
        </label>
        <label>
          {t("boardSettings.description")}
          <textarea
            name="content"
            defaultValue={query.data.project.description}
          />
        </label>
        <label>
          {t("boardSettings.cardLayout")}
          <SelectControl
            name="card_type"
            label={t("boardSettings.cardLayout")}
            defaultValue={String(query.data.card_type)}
            options={[
              { value: "0", label: t("boardSettings.textOnly") },
              { value: "1", label: t("boardSettings.imagesAndText") },
            ]}
          />
        </label>
        <Feedback error={save.error} />
        {save.isSuccess && (
          <p className="form-success" role="status">
            {t("boardSettings.saved")}
          </p>
        )}
        <button className="button primary" disabled={save.isPending}>
          {t("boardSettings.save")}
        </button>
      </form>
      <h2 className={sectionTitle}>{t("boardSettings.lists")}</h2>
      <div className={managementList}>
        {query.data.columns.map((column, position) => (
          <BoardColumnRow
            key={column.id}
            column={column}
            position={position}
            columns={query.data.columns}
            path={`${path}/projects/${board}`}
            refresh={refresh}
          />
        ))}
      </div>
      <form
        className={managementForm}
        onSubmit={(event) => {
          event.preventDefault();
          addColumn.mutate(event.currentTarget);
        }}
      >
        <h3>{t("boardSettings.addList")}</h3>
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr]">
          <label>
            {t("boardSettings.listTitle")}
            <input name="title" required maxLength={100} />
          </label>
          <label>
            {t("boardSettings.listColor")}
            <input name="color" type="color" defaultValue="#1f75cb" />
          </label>
        </div>
        <Feedback error={addColumn.error} />
        <button className="button" disabled={addColumn.isPending}>
          <Plus size={15} />
          {t("boardSettings.addList")}
        </button>
      </form>
      <section className="management-danger mt-8 border-t border-line pt-6">
        <h2 className="mb-4">{t("boardSettings.status")}</h2>
        <Feedback error={status.error} />
        <div className={actions}>
          <button
            className="button"
            disabled={status.isPending}
            onClick={() => status.mutate()}
          >
            {query.data.project.closed
              ? t("boardSettings.reopen")
              : t("boardSettings.close")}
          </button>
          <ConfirmAction
            title={t("boardSettings.deleteTitle")}
            action={async () => {
              await nativeForm(`${path}/projects/${board}/delete`, {});
              await refresh();
              navigate(`/projects${path}/boards`);
            }}
          >
            {t("boardSettings.deleteText")}
          </ConfirmAction>
        </div>
      </section>
    </div>
  );
}

function BoardColumnRow({
  column,
  position,
  columns,
  path,
  refresh,
}: {
  column: BoardConfiguration["columns"][number];
  position: number;
  columns: BoardConfiguration["columns"];
  path: string;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation("issues");
  const [editing, setEditing] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({
      action,
      values,
    }: {
      action: string;
      values?: Record<string, string>;
    }) => {
      if (action === "edit")
        await request(`${path}/${column.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Forgejo-UI": "1",
          },
          body: new URLSearchParams(values),
        });
      else if (action === "default")
        await nativeForm(`${path}/${column.id}/default`, {});
      else if (action === "up" || action === "down") {
        const order = [...columns];
        const next = action === "up" ? position - 1 : position + 1;
        [order[position], order[next]] = [order[next], order[position]];
        await post(`${path}/move`, {
          columns: order.map((item, sorting) => ({
            columnID: item.id,
            sorting,
          })),
        });
      }
      await refresh();
      setEditing(false);
    },
  });
  return (
    <div className="board-column-setting border-b border-line p-4 last:border-b-0">
      <div className="flex items-center gap-3 max-md:flex-wrap">
        <i
          className="size-2.5 rounded-full"
          style={{ backgroundColor: column.color || "#737278" }}
        />
        <strong className="flex-1">{column.title}</strong>
        {column.default && (
          <span className="badge">{t("boardSettings.column.default")}</span>
        )}
        <div className={`${actions} max-md:w-full`}>
          <button
            className="button"
            disabled={!position || mutation.isPending}
            onClick={() => mutation.mutate({ action: "up" })}
            aria-label={t("boardSettings.column.moveLeft", {
              title: column.title,
            })}
          >
            ←
          </button>
          <button
            className="button"
            disabled={position === columns.length - 1 || mutation.isPending}
            onClick={() => mutation.mutate({ action: "down" })}
            aria-label={t("boardSettings.column.moveRight", {
              title: column.title,
            })}
          >
            →
          </button>
          <ActionMenu
            label={t("boardSettings.column.actions", { title: column.title })}
            trigger={<MoreHorizontal size={16} />}
          >
            <MenuAction onClick={() => setEditing(!editing)}>
              {t("boardSettings.column.edit")}
            </MenuAction>
            <MenuAction
              disabled={column.default || mutation.isPending}
              onClick={() => mutation.mutate({ action: "default" })}
            >
              {t("boardSettings.column.setDefault")}
            </MenuAction>
          </ActionMenu>
          <ConfirmAction
            disabled={column.default}
            title={t("boardSettings.column.deleteTitle", {
              title: column.title,
            })}
            action={async () => {
              await request(`${path}/${column.id}`, {
                method: "DELETE",
                headers: { "X-Forgejo-UI": "1" },
              });
              await refresh();
            }}
          >
            {t("boardSettings.column.deleteText")}
          </ConfirmAction>
        </div>
      </div>
      <Feedback error={mutation.error} />
      {editing && (
        <form
          className={`workspace-form ${smallForm}`}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              action: "edit",
              values: formValues(event.currentTarget),
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            {t("boardSettings.listTitle")}
            <input
              className={smallInput}
              name="title"
              required
              defaultValue={column.title}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            {t("boardSettings.listColor")}
            <input
              className="h-9 w-16 rounded border border-line bg-surface px-2.5 py-[7px]"
              name="color"
              type="color"
              defaultValue={column.color || "#737278"}
            />
          </label>
          <button className="button primary" disabled={mutation.isPending}>
            {t("boardSettings.column.save")}
          </button>
        </form>
      )}
    </div>
  );
}
