import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  Bell,
  BellOff,
  Ellipsis,
  History,
  LockKeyhole,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import type { RepoContext } from "./App";
import { native, nativeForm, nativePage, type Issue } from "./api";
import {
  ConfirmAction,
  dialogBackdrop,
  dialogPopup,
  editLink,
  metadataSection,
  metadataTitle,
  smallInput,
} from "./IssueManagement";
import { SelectControl } from "./SelectControl";
import { ActionMenu, MenuAction, MenuSeparator } from "./ActionMenu";
import {
  Feedback,
  Markdown,
  MarkdownEditor,
  Pending,
  relativeDate,
} from "./UI";
import { uiRoute } from "./routes";
import { ContentReportMenu } from "./ContentReportMenu";
import { timelineDeadline, timelineDuration } from "./timelineFormat";
import { TimelineReviewThread } from "./PullReview";
import {
  AttachmentList,
  AttachmentPicker,
  submitWithAttachments,
  type Attachment,
} from "./DiscussionAttachments";
export {
  AttachmentList,
  AttachmentPicker,
  submitWithAttachments,
  type Attachment,
} from "./DiscussionAttachments";
export interface Reaction {
  type: string;
  count: number;
  selected: boolean;
}
export interface Lifecycle {
  locked: boolean;
  pinned: boolean;
  watching?: boolean;
  can_manage: boolean;
  can_admin: boolean;
  can_react: boolean;
  reaction_options: string[];
  reactions: Reaction[];
  lock_reasons: string[];
  attachments_enabled: boolean;
  attachments: Attachment[];
  reference: string;
  can_edit_ref: boolean;
  project_id?: number;
  projects: { id: number; title: string; closed: boolean; url: string }[];
  participants?: { login: string; avatar_url: string; url: string }[];
}
export interface TimelineEntry {
  id: number;
  type?: number;
  event?: string;
  body: string;
  content_version: number;
  created_at: string;
  user: { login: string; avatar_url: string };
  old_title?: string;
  new_title?: string;
  old_ref?: string;
  new_ref?: string;
  label?: string;
  milestone?: string;
  old_milestone?: string;
  project?: string;
  old_project?: string;
  commits?: string[];
  force_push?: boolean;
  assignee?: string;
  removed?: boolean;
  reference?: { title: string; url: string; number: number };
  can_edit?: boolean;
  can_report?: boolean;
  thread_id?: number;
  review_type?: number;
  reactions?: Reaction[];
  attachments?: Attachment[];
}
function useRefresh() {
  const { path } = useOutletContext<RepoContext>(),
    client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["discussion", path] }),
      client.invalidateQueries({ queryKey: ["pull-review", path] }),
      client.invalidateQueries({ queryKey: ["issue-metadata", path] }),
      client.invalidateQueries({ queryKey: ["issue-history"] }),
      client.invalidateQueries({ queryKey: ["native-issue-list", path] }),
    ]);
  };
}
const reactionButton =
  "inline-flex min-h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] transition-[background-color,border-color] duration-120 ease-[ease] hover:bg-hover aria-pressed:border-primary aria-pressed:bg-selected";
const emoji: Record<string, string> = {
  "+1": "👍",
  "-1": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};
export function Reactions({
  endpoint,
  values = [],
  data,
}: {
  endpoint: string;
  values?: Reaction[];
  data?: Lifecycle;
}) {
  const { t } = useTranslation("issues");
  const refresh = useRefresh(),
    [open, setOpen] = useState(false);
  const react = useMutation({
    mutationFn: async (type: string) => {
      await nativeForm(
        `${endpoint}/${values.some((value) => value.type === type && value.selected) ? "unreact" : "react"}`,
        { content: type },
      );
      await refresh();
      setOpen(false);
    },
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {values.map((value) => (
        <button
          className={reactionButton}
          key={value.type}
          disabled={!data?.can_react || react.isPending}
          aria-pressed={value.selected}
          aria-label={t(
            value.selected
              ? "lifecycle.reactions.remove"
              : "lifecycle.reactions.add",
            { type: value.type, total: value.count },
          )}
          onClick={() => react.mutate(value.type)}
        >
          <span>{emoji[value.type] || value.type}</span>
          {value.count}
        </button>
      ))}
      {data?.can_react && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            className={reactionButton}
            aria-label={t("lifecycle.reactions.title")}
          >
            <SmilePlus size={15} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="dropdown-positioner" sideOffset={6}>
              <Popover.Popup className="dropdown-popup [&>div]:grid [&>div]:grid-cols-[repeat(4,1fr)] [&>div]:gap-1 [&>div]:p-2">
                <Popover.Title className="dropdown-heading">
                  {t("lifecycle.reactions.title")}
                </Popover.Title>
                <div>
                  {data.reaction_options.map((type) => (
                    <button
                      className="min-h-10 rounded-md text-[22px] hover:bg-hover"
                      type="button"
                      key={type}
                      aria-label={t("lifecycle.reactions.reactWith", { type })}
                      disabled={react.isPending}
                      onClick={() => react.mutate(type)}
                    >
                      {emoji[type] || type}
                    </button>
                  ))}
                </div>
                <Feedback error={react.error} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
      <Feedback error={react.error} />
    </div>
  );
}
export function IssueLifecycleControls({
  issue,
  data,
  pulls,
}: {
  issue: Issue;
  data?: Lifecycle;
  pulls: boolean;
}) {
  const { t } = useTranslation("issues");
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState<"lock" | "delete" | null>(
    null,
  );
  const { path } = useOutletContext<RepoContext>(),
    refresh = useRefresh(),
    navigate = useNavigate(),
    client = useQueryClient(),
    [reason, setReason] = useState("");
  const kind = pulls ? "pulls" : "issues",
    root = `${path}/${kind}/${issue.number}`;
  const action = useMutation({
    mutationFn: async ({
      endpoint,
      values = {},
    }: {
      endpoint: string;
      values?: Record<string, string>;
    }) => {
      await nativeForm(endpoint, values);
      await refresh();
    },
  });
  if (!data) return null;
  return (
    <div className="mt-3 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {data.watching !== undefined && (
          <button
            className="button"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                endpoint: `${root}/watch`,
                values: { watch: String(!data.watching) },
              })
            }
          >
            {data.watching ? <BellOff size={15} /> : <Bell size={15} />}{" "}
            {data.watching
              ? t("lifecycle.unsubscribe")
              : t("lifecycle.subscribe")}
          </button>
        )}
        {(data.can_admin || data.can_manage) && (
          <ActionMenu
            label={t("lifecycle.moreActions")}
            trigger={<Ellipsis size={16} />}
            triggerRef={menuTrigger}
            align="start"
            className="button w-8 px-0"
          >
            {data.can_admin && (
              <MenuAction
                disabled={action.isPending}
                onClick={() => action.mutate({ endpoint: `${root}/pin` })}
              >
                {data.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                {data.pinned ? t("lifecycle.unpin") : t("lifecycle.pin")}
              </MenuAction>
            )}
            {data.can_manage && (
              <MenuAction
                disabled={action.isPending}
                onClick={() => {
                  if (data.locked) {
                    action.mutate({ endpoint: `${root}/unlock` });
                  } else {
                    setReason("");
                    setConfirmation("lock");
                  }
                }}
              >
                {data.locked ? (
                  <UnlockKeyhole size={16} />
                ) : (
                  <LockKeyhole size={16} />
                )}
                {data.locked ? t("lifecycle.unlock") : t("lifecycle.lock")}
              </MenuAction>
            )}
            {data.can_admin && (
              <>
                <MenuSeparator />
                <MenuAction
                  danger
                  disabled={action.isPending}
                  onClick={() => setConfirmation("delete")}
                >
                  <Trash2 size={16} />
                  {t(`lifecycle.delete.${kind}`)}
                </MenuAction>
              </>
            )}
          </ActionMenu>
        )}
        {data.can_manage && !data.locked && (
          <ConfirmAction
            trigger={false}
            open={confirmation === "lock"}
            onOpenChange={(open) => setConfirmation(open ? "lock" : null)}
            finalFocus={menuTrigger}
            label={t("lifecycle.lock")}
            title={t("lifecycle.lockTitle")}
            action={async () => {
              await nativeForm(`${root}/lock`, { reason: reason || " " });
              await refresh();
            }}
          >
            <p>{t("lifecycle.lockText")}</p>
            <SelectControl
              label={t("lifecycle.lockReason")}
              value={reason}
              onValueChange={setReason}
              options={[
                { value: "", label: t("lifecycle.noReason") },
                ...data.lock_reasons.map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />
          </ConfirmAction>
        )}
        {data.can_admin && (
          <ConfirmAction
            trigger={false}
            open={confirmation === "delete"}
            onOpenChange={(open) => setConfirmation(open ? "delete" : null)}
            finalFocus={menuTrigger}
            danger
            label={t(`lifecycle.delete.${kind}`)}
            title={t(`lifecycle.deleteTitle.${kind}`, { number: issue.number })}
            action={async () => {
              await nativeForm(`${root}/delete`, {});
              await Promise.all([
                client.invalidateQueries({
                  queryKey: ["native-issue-list", path],
                }),
                client.invalidateQueries({ queryKey: ["repo"] }),
              ]);
              navigate(
                `/projects${path}/${pulls ? "merge-requests" : "issues"}`,
              );
            }}
          >
            <p>{t("lifecycle.deleteText")}</p>
          </ConfirmAction>
        )}
      </div>
      {data.locked && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-line bg-surface-subtle p-3 text-[13px]">
          <LockKeyhole size={15} />
          {t("lifecycle.locked")}
        </p>
      )}
      <Feedback error={action.error} />
    </div>
  );
}
export function IssueExtraSidebar({
  issue,
  data,
  pulls,
}: {
  issue: Issue;
  data?: Lifecycle;
  pulls: boolean;
}) {
  const { t } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>(),
    refresh = useRefresh(),
    [reference, setReference] = useState(data?.reference || ""),
    kind = pulls ? "pulls" : "issues";
  const [copyError, setCopyError] = useState<Error | null>(null);
  const save = useMutation({
    mutationFn: async ({
      endpoint,
      values,
    }: {
      endpoint: string;
      values: Record<string, string>;
    }) => {
      await nativeForm(`${path}/${kind}/${endpoint}`, values);
      await refresh();
    },
  });
  if (!data) return null;
  const section = metadataSection(pulls);
  return (
    <>
      {!!data.projects.length && (
        <section className={section}>
          <h3 className={metadataTitle}>{t("sidebar.board")}</h3>
          {data.can_manage ? (
            <SelectControl
              label={t("sidebar.boardSelect")}
              value={String(data.project_id || 0)}
              onValueChange={(value) =>
                save.mutate({
                  endpoint: "projects",
                  values: { issue_ids: String(issue.id), id: value },
                })
              }
              options={[
                { value: "0", label: t("sidebar.none") },
                ...data.projects.map((item) => ({
                  value: String(item.id),
                  label: item.closed
                    ? t("sidebar.closedOption", { title: item.title })
                    : item.title,
                })),
              ]}
            />
          ) : (
            <p>
              {data.projects.find((item) => item.id === data.project_id)
                ?.title || t("sidebar.none")}
            </p>
          )}
        </section>
      )}
      {!pulls && (
        <section className={section}>
          <h3 className={metadataTitle}>{t("sidebar.reference")}</h3>
          {data.can_edit_ref ? (
            <form
              className="mt-2 flex flex-col gap-3 text-[13px]"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({
                  endpoint: `${issue.number}/ref`,
                  values: { ref: reference },
                });
              }}
            >
              <input
                className={smallInput}
                aria-label={t("sidebar.referenceInput")}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder={t("sidebar.referencePlaceholder")}
              />
              <button
                className="button"
                disabled={save.isPending || reference === data.reference}
              >
                {t("sidebar.saveReference")}
              </button>
            </form>
          ) : (
            <p>{data.reference || t("sidebar.none")}</p>
          )}
        </section>
      )}
      <Feedback error={save.error || copyError} />
      <section className={section}>
        <h3 className={metadataTitle}>{t("sidebar.copyReference")}</h3>
        <button
          className="button max-w-full break-all whitespace-normal"
          aria-label={t("sidebar.copyReference")}
          onClick={() => {
            if (!navigator.clipboard) {
              setCopyError(new Error(t("contentMenu.copyError")));
              return;
            }
            navigator.clipboard
              .writeText(`${path.slice(1)}#${issue.number}`)
              .catch(() => setCopyError(new Error(t("contentMenu.copyError"))));
          }}
        >{`${path.slice(1)}#${issue.number}`}</button>
      </section>
      {!!data.participants?.length && (
        <section className={section}>
          <h3 className={metadataTitle}>
            {t("sidebar.participants", { count: data.participants.length })}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.participants.map((person) => (
              <Link
                key={person.login}
                to={uiRoute(person.url)}
                title={person.login}
              >
                <img
                  className="size-7 rounded-full"
                  src={person.avatar_url}
                  alt={person.login}
                />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
// Timeline event names sent by the server mapped to their sentence keys.
const eventKeys = {
  reopen: "reopen",
  close: "close",
  issue_ref: "issueRef",
  pull_ref: "pullRef",
  comment_ref: "commentRef",
  commit_ref: "commitRef",
  label: "label",
  milestone: "milestone",
  assignees: "assignees",
  change_title: "changeTitle",
  delete_branch: "deleteBranch",
  start_tracking: "startTracking",
  stop_tracking: "stopTracking",
  add_time_manual: "addTime",
  cancel_tracking: "cancelTracking",
  added_deadline: "addedDeadline",
  modified_deadline: "modifiedDeadline",
  removed_deadline: "removedDeadline",
  add_dependency: "addDependency",
  remove_dependency: "removeDependency",
  review: "review",
  lock: "lock",
  unlock: "unlock",
  change_target_branch: "changeTargetBranch",
  delete_time_manual: "deleteTime",
  review_request: "reviewRequest",
  merge_pull: "mergePull",
  pull_push: "pullPush",
  pull_request_push: "pullPush",
  project: "project",
  project_column: "projectColumn",
  project_board: "projectColumn",
  pull_scheduled_merge: "scheduledMerge",
  pull_cancel_scheduled_merge: "cancelledMerge",
  dismiss_review: "dismissReview",
  change_issue_ref: "changeIssueRef",
  pr_scheduled_to_auto_merge: "scheduledMerge",
  pr_unscheduled_to_auto_merge: "cancelledMerge",
  pin: "pin",
  unpin: "unpin",
} as const;
type EventKey = (typeof eventKeys)[keyof typeof eventKeys];
export function DiscussionEntry({
  item,
  issue,
  data,
  pulls,
}: {
  item: TimelineEntry;
  issue: Issue;
  data?: Lifecycle;
  pulls: boolean;
}) {
  const { t, i18n } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>(),
    refresh = useRefresh(),
    [editing, setEditing] = useState(false),
    [body, setBody] = useState(item.body),
    [files, setFiles] = useState<File[]>([]),
    [attachments, setAttachments] = useState(item.attachments || []);
  const save = useMutation({
    mutationFn: async () => {
      await submitWithAttachments(
        path,
        `${path}/comments/${item.id}`,
        {
          content: body,
          content_version: String(item.content_version),
          context: path,
        },
        files,
        attachments.map((file) => file.uuid),
        "files[]",
      );
      setFiles([]);
      await refresh();
      setEditing(false);
    },
  });
  if (item.thread_id)
    return (
      <TimelineReviewThread index={issue.number} threadID={item.thread_id} />
    );
  if (item.type && item.type !== 0 && item.type !== 22 && item.type !== 32) {
    const eventKey: EventKey | undefined =
      eventKeys[item.event as keyof typeof eventKeys];
    return (
      <div
        className="discussion-event flex gap-4 py-3.5 text-[13px] text-muted [&_p]:mt-1.5 [&_p]:[overflow-wrap:anywhere] [&_strong]:text-ink"
        id={`event-${item.id}`}
      >
        <span className="relative ml-1 size-6 shrink-0 rounded-full border border-line bg-surface-subtle after:absolute after:top-2 after:left-2 after:size-1.5 after:rounded-full after:bg-muted" />
        <div className="min-w-0">
          <Trans
            t={t}
            i18nKey={
              eventKey ? `timeline.events.${eventKey}` : "timeline.events.other"
            }
            values={{
              user: item.user.login,
              event: item.event?.replace(/_/g, " ") ?? "",
              time: relativeDate(item.created_at),
            }}
            components={{
              user: <strong />,
              time: <span className="text-sm text-muted" />,
            }}
          />
          {item.old_title && (
            <p>
              <del>{item.old_title}</del> → {item.new_title}
            </p>
          )}
          {(item.old_ref || item.new_ref) && (
            <p>
              <code>{item.old_ref || t("timeline.none")}</code> →{" "}
              <code>{item.new_ref || t("timeline.none")}</code>
            </p>
          )}
          {(item.label ||
            item.assignee ||
            item.milestone ||
            item.old_milestone) && (
            <p>
              {item.removed
                ? t("timeline.removed", {
                    name:
                      item.label ||
                      item.assignee ||
                      item.milestone ||
                      item.old_milestone,
                  })
                : item.label ||
                  item.assignee ||
                  item.milestone ||
                  item.old_milestone}
            </p>
          )}
          {(item.project || item.old_project) && (
            <p>
              {item.old_project || t("timeline.noBoard")} →{" "}
              {item.project || t("timeline.noBoard")}
            </p>
          )}
          {item.reference && (
            <p>
              <Link to={uiRoute(item.reference.url)}>
                {item.reference.title} #{item.reference.number}
              </Link>
            </p>
          )}
          {!!item.commits?.length && (
            <p>
              <Trans
                t={t}
                i18nKey={
                  item.force_push ? "timeline.forcePushed" : "timeline.pushed"
                }
                components={{
                  commits: (
                    <>
                      {item.commits.map((sha, i) => (
                        <span key={sha}>
                          {i > 0 && ", "}
                          <Link to={uiRoute(`${path}/commit/${sha}`)}>
                            <code>{sha.slice(0, 8)}</code>
                          </Link>
                        </span>
                      ))}
                    </>
                  ),
                }}
              />
            </p>
          )}
          {item.body &&
            ([16, 17, 18].includes(item.type || 0) ? (
              <p>{timelineDeadline(item.body, item.type!, i18n.language)}</p>
            ) : [13, 14, 26].includes(item.type || 0) &&
              timelineDuration(item.body) ? (
              <p>{t("timeline.duration", timelineDuration(item.body)!)}</p>
            ) : (
              <Markdown>{item.body}</Markdown>
            ))}
        </div>
      </div>
    );
  }
  return (
    <article
      className="discussion-entry relative mb-5 ml-12 rounded-lg border border-line bg-surface max-md:ml-10"
      id={`issuecomment-${item.id}`}
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-surface px-4 pt-3 pb-1 text-sm max-md:flex-wrap">
        <img
          className="absolute top-0 -left-12 size-8 rounded-full max-md:-left-10 max-md:size-7"
          src={item.user.avatar_url}
          alt=""
        />
        <strong>{item.user.login}</strong>
        {item.type === 22 && (
          <span className="text-xs text-muted">
            {item.review_type === 1
              ? t("timeline.comment.approved")
              : item.review_type === 3
                ? t("timeline.comment.changesRequested")
                : t("timeline.comment.commented")}
          </span>
        )}
        {item.type === 32 && (
          <span className="text-xs text-muted">
            {t("timeline.comment.dismissedReview")}
          </span>
        )}
        <span className="text-xs text-muted">
          {relativeDate(item.created_at)}
        </span>
        <div className="ml-auto flex items-center gap-3 max-[700px]:mt-1.5 max-[700px]:ml-0 max-[700px]:w-full">
          <ContentHistory issue={issue} commentId={item.id} pulls={pulls} />
          <ContentReportMenu
            id={item.id}
            type="comment"
            canReport={!!item.can_report}
            canQuote={!!data?.can_react}
            body={item.body}
            reference={native(
              `${path}/${pulls ? "pulls" : "issues"}/${issue.number}#issuecomment-${item.id}`,
            )}
            newIssueURL={`/projects${path}/issues/new`}
          />
          {item.can_edit && (
            <>
              <button
                className={`inline-flex items-center gap-1 ${editLink}`}
                onClick={() => {
                  setEditing(!editing);
                  setBody(item.body);
                  setAttachments(item.attachments || []);
                }}
              >
                {t("timeline.comment.edit")}
              </button>
              <ConfirmAction
                className={`inline-flex items-center gap-1 ${editLink}`}
                label={t("timeline.comment.delete")}
                title={t("timeline.comment.deleteTitle")}
                action={async () => {
                  await nativeForm(`${path}/comments/${item.id}/delete`, {});
                  await refresh();
                }}
              >
                {t("timeline.comment.deleteText")}
              </ConfirmAction>
            </>
          )}
        </div>
      </div>
      <div className="px-4 pt-2 pb-4 text-sm leading-6 break-words whitespace-normal">
        {editing ? (
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <MarkdownEditor
              label={t("timeline.comment.edit")}
              placeholder={t("timeline.comment.editPlaceholder")}
              value={body}
              onChange={setBody}
            />
            {attachments.map((file) => (
              <div key={file.uuid}>
                {file.name}
                <button
                  className={editLink}
                  type="button"
                  onClick={() =>
                    setAttachments(
                      attachments.filter((item) => item.uuid !== file.uuid),
                    )
                  }
                >
                  {t("timeline.comment.removeAttachment")}
                </button>
              </div>
            ))}
            {data?.attachments_enabled && (
              <AttachmentPicker files={files} onChange={setFiles} />
            )}
            <Feedback error={save.error} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="button primary"
                disabled={save.isPending || !body.trim()}
              >
                {t("timeline.comment.save")}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => setEditing(false)}
              >
                {t("timeline.comment.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <Markdown basePath={`${path}/src/branch/HEAD/`}>
              {item.body}
            </Markdown>
            <AttachmentList files={item.attachments} />
          </>
        )}
        <Reactions
          endpoint={`${path}/comments/${item.id}/reactions`}
          values={item.reactions}
          data={data}
        />
      </div>
    </article>
  );
}
const historyTitle = "mb-2 text-[13px] font-semibold";
const historyText =
  "max-h-[350px] overflow-auto rounded-md border border-line bg-surface-subtle p-4 text-[12px] whitespace-pre-wrap [overflow-wrap:anywhere]";
export function ContentHistory({
  issue,
  commentId = 0,
  pulls = false,
}: {
  issue: Issue;
  commentId?: number;
  pulls?: boolean;
}) {
  const { t } = useTranslation("issues");
  const { path } = useOutletContext<RepoContext>(),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    refresh = useRefresh();
  const root = `${path}/${pulls ? "pulls" : "issues"}/${issue.number}/content-history`;
  const list = useQuery({
    queryKey: ["issue-history", root, commentId],
    queryFn: ({ signal }) =>
      nativePage<{
        results: {
          id: number;
          user: string;
          created: boolean;
          deleted: boolean;
          edited_at: string;
        }[];
      }>(`${root}/list?comment_id=${commentId}`, signal),
    enabled: open,
  });
  const id = selected || String(list.data?.results?.[0]?.id || "");
  const detail = useQuery({
    queryKey: ["issue-history", root, "detail", id],
    queryFn: ({ signal }) =>
      nativePage<{
        id: number;
        can_delete: boolean;
        before: string;
        content: string;
      }>(`${root}/detail?history_id=${id}`, signal),
    enabled: open && !!id,
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={`inline-flex items-center gap-1 ${editLink}`}
        aria-label={
          commentId ? t("history.commentLabel") : t("history.descriptionLabel")
        }
      >
        <History size={13} />
        {t("history.trigger")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup
          className={`${dialogPopup} top-[8%] max-h-[84dvh] w-[min(800px,calc(100vw-32px))] overflow-y-auto`}
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-[20px] leading-[1.4]">
              {t("history.title")}
            </Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label={t("history.close")}
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-muted">
            {commentId
              ? t("history.introComment")
              : t("history.introDescription")}
          </Dialog.Description>
          {list.isPending ? (
            <Pending />
          ) : list.error ? (
            <Feedback error={list.error} />
          ) : list.data?.results?.length ? (
            <>
              <SelectControl
                label={t("history.revision")}
                value={id}
                onValueChange={setSelected}
                options={list.data.results.map((item) => {
                  const revision = t(
                    item.created ? "history.created" : "history.edited",
                    { user: item.user, date: relativeDate(item.edited_at) },
                  );
                  return {
                    value: String(item.id),
                    label: item.deleted
                      ? t("history.deleted", { revision })
                      : revision,
                  };
                })}
              />
              {detail.isPending ? (
                <Pending />
              ) : detail.error ? (
                <Feedback error={detail.error} />
              ) : (
                detail.data && (
                  <>
                    <div className="history-columns my-5 grid grid-cols-[1fr_1fr] gap-4 max-[700px]:grid-cols-[1fr]">
                      <section className="min-w-0">
                        <h3 className={historyTitle}>
                          {t("history.previous")}
                        </h3>
                        <pre className={historyText}>
                          {detail.data.before || t("history.noPrevious")}
                        </pre>
                      </section>
                      <section className="min-w-0">
                        <h3 className={historyTitle}>
                          {t("history.selected")}
                        </h3>
                        <pre className={historyText}>
                          {detail.data.content || t("history.removed")}
                        </pre>
                      </section>
                    </div>
                    {detail.data.can_delete && (
                      <ConfirmAction
                        label={t("history.deleteRevision")}
                        title={t("history.deleteTitle")}
                        action={async () => {
                          await nativeForm(`${root}/soft-delete`, {
                            history_id: id,
                            comment_id: String(commentId),
                          });
                          await refresh();
                        }}
                      >
                        {t("history.deleteText")}
                      </ConfirmAction>
                    )}
                  </>
                )
              )}
            </>
          ) : (
            <p>{t("history.empty")}</p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
