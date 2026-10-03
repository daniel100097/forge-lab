import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import {
  Link,
  useLocation,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  GitCommitHorizontal,
  GitPullRequest,
  MessageSquare,
  X,
} from "lucide-react";
import type { RepoContext } from "./App";
import { get, native, nativeForm, nativeText, type Issue } from "./api";
import { DiffView } from "./Diff";
import { parsePullRange } from "./pullRange";
import { pullChangedFiles, viewedFileCount } from "./pullFiles";
import { ContentReportMenu } from "./ContentReportMenu";
import {
  ConfirmAction,
  editLink,
  dialogBackdrop,
  dialogPopup,
} from "./IssueManagement";
import type { MergeMetadata } from "./pullMerge";
import { Reactions, type Lifecycle, type Reaction } from "./IssueLifecycle";
import { SelectControl } from "./SelectControl";
import {
  EmptyState,
  Feedback,
  Markdown,
  MarkdownEditor,
  Pending,
  relativeDate,
} from "./UI";

interface Review {
  id: number;
  type: number;
  reviewer_id: number;
  reviewer: string;
  avatar: string;
  content: string;
  commit: string;
  dismissed: boolean;
  stale: boolean;
  official: boolean;
  created_at: string;
}
export interface ReviewComment {
  id: number;
  body: string;
  user: string;
  avatar: string;
  created_at: string;
  content_version: number;
  can_edit: boolean;
  can_report: boolean;
  reactions?: Reaction[];
}
export interface Thread {
  id: number;
  review_id: number;
  path: string;
  line: number;
  resolved: boolean;
  outdated: boolean;
  pending: boolean;
  comments: ReviewComment[];
  patch?: string;
}
export interface ReviewData {
  merge?: MergeMetadata;
  lifecycle?: Lifecycle;
  blocked: {
    approvals?: boolean;
    rejection?: boolean;
    review_requests?: boolean;
    outdated?: boolean;
    checks?: boolean;
    granted_approvals?: number;
    required_approvals?: number;
    require_signed?: boolean;
    will_sign?: boolean;
    signing_reason?: string;
    signing_reason_text?: string;
    conflicted_files?: string[];
    protected_files?: string[];
    signing_key?: string;
    signing_all_styles?: boolean;
    dependencies?: boolean;
    broken?: boolean;
    checking?: boolean;
    ancestor?: boolean;
    empty?: boolean;
    conflict?: boolean;
  };
  status_checks: {
    context: string;
    description: string;
    state: string;
    target_url: string;
    required: boolean;
  }[];
  missing_checks: string[];
  status_state: string;
  actions_trust?: {
    state: "no" | "explicitly" | "implicitly" | "irrelevant";
    needs_approval: boolean;
    can_delegate: boolean;
  };
  issue_id: number;
  head_sha: string;
  base_sha: string;
  view_head_sha: string;
  view_base_sha: string;
  reviews: Review[];
  threads: Thread[];
  pending_count: number;
  viewed_files: Record<string, string>;
  can_comment: boolean;
  can_approve: boolean;
  can_resolve: boolean;
  can_request: boolean;
  can_dismiss: boolean;
  reviewer_options: { id: number; name: string; avatar?: string }[];
  can_edit: boolean;
  can_update_merge: boolean;
  can_update_rebase: boolean;
  can_cleanup: boolean;
  can_edit_head: boolean;
  head_repo: string;
  head_branch: string;
  auto_merge: boolean;
  checking: boolean;
  can_auto_merge: boolean;
  allow_maintainer_edit: boolean;
  closed: boolean;
  merged: boolean;
}
interface PullCommit {
  id: string;
  summary: string;
  short_sha: string;
  committer_or_author_name: string;
  time: string;
}
interface PullCommits {
  commits: PullCommit[];
  last_review_commit_sha: string;
}
type Line = { path: string; line: number; side: "previous" | "proposed" };

const toolbarActions = "flex flex-wrap items-center gap-2 max-md:w-full";
const toolbarSelect = "max-w-[250px] max-md:max-w-[155px]";
const segmentedButton = "w-auto min-w-18 px-3 whitespace-nowrap";

export function usePullReview(
  index: number | string,
  from = "",
  to = "",
  enabled = true,
) {
  const { path, dataPath } = useOutletContext<RepoContext>();
  return useQuery<ReviewData>({
    queryKey: ["pull-review", path, String(index), from, to],
    enabled,
    refetchInterval: (query) =>
      query.state.data?.checking || query.state.data?.auto_merge ? 1000 : false,
    queryFn: ({ signal }) =>
      get<ReviewData>(
        `${dataPath}/pulls/${index}/review?${new URLSearchParams({ from, to })}`,
        signal,
      ),
  });
}
function useRefreshReview() {
  const { path } = useOutletContext<RepoContext>(),
    client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["pull-review", path] }),
      client.invalidateQueries({ queryKey: ["discussion", path] }),
      client.invalidateQueries({ queryKey: ["pull-diff", path] }),
      client.invalidateQueries({ queryKey: ["pull-commits", path] }),
      client.invalidateQueries({ queryKey: ["native-issue-list", path] }),
      client.invalidateQueries({ queryKey: ["repo"] }),
    ]);
  };
}

export function PullCommitsTab({ index }: { index: number | string }) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const query = useQuery({
    queryKey: ["pull-commits", path, String(index)],
    queryFn: ({ signal }) =>
      get<PullCommits>(`${path}/pulls/${index}/commits/list`, signal),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  return (
    <section>
      <div className="mt-5 mb-4 flex items-center gap-3">
        <h2 className="text-[16px] font-semibold">
          {t("review.commits.title")}
        </h2>
        <span className="counter">{query.data.commits.length}</span>
      </div>
      {query.data.commits.length ? (
        <div className="overflow-hidden rounded-lg border border-line">
          {query.data.commits.map((commit) => (
            <article
              className="pull-commit-row flex items-center gap-4 border-b border-line p-4 last:border-b-0 max-md:gap-2.5 max-md:p-3"
              key={commit.id}
            >
              <GitCommitHorizontal size={18} />
              <div className="min-w-0 flex-1">
                <Link
                  className="text-[14px] font-semibold hover:text-primary hover:underline max-md:wrap-anywhere"
                  to={`?tab=changes&commit=${commit.id}`}
                >
                  {commit.summary}
                </Link>
                <p className="mt-1 text-[12px] leading-[calc(1.25/0.875)] text-muted">
                  {commit.committer_or_author_name} ·{" "}
                  {relativeDate(commit.time)}
                </p>
              </div>
              <Link
                className="button"
                to={`/projects${path}/commit/${commit.id}`}
              >
                {commit.short_sha}
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={t("review.commits.empty")} />
      )}
    </section>
  );
}

export function PullChanges({
  index,
  commit,
}: {
  index: number | string;
  commit?: string;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path, dataPath } = useOutletContext<RepoContext>();
  const [selected, setSelected] = useState<Line | null>(null),
    [parallel, setParallel] = useState(false),
    [whitespace, setWhitespace] = useState("show-all");
  const [showOutdated, setShowOutdated] = useState(false);
  const [viewedPending, setViewedPending] = useState<{
    file: string;
    checked: boolean;
  }>();
  const [params, setParams] = useSearchParams();
  const { from, to } = parsePullRange(params, commit);
  function setRange(key: "from" | "to", value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", "changes");
      next.set(key, value);
      next.delete("page");
      return next;
    });
  }
  const review = usePullReview(index, from, to),
    refresh = useRefreshReview();
  const commits = useQuery({
    queryKey: ["pull-commits", path, String(index)],
    queryFn: ({ signal }) =>
      get<PullCommits>(`${path}/pulls/${index}/commits/list`, signal),
  });
  const diffPath = `${dataPath}/pulls/${index}/review?${new URLSearchParams({ from, to, whitespace, format: "diff" })}`;
  const diff = useQuery({
    queryKey: ["pull-diff", path, String(index), diffPath],
    queryFn: ({ signal }) => nativeText(diffPath, signal),
    enabled: !from || !!review.data,
  });
  const viewed = useMutation({
    mutationFn: async ({
      file,
      checked,
    }: {
      file: string;
      checked: boolean;
    }) => {
      const response = await fetch(
        native(`${path}/pulls/${index}/viewed-files`),
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-Forgejo-UI": "1" },
          body: JSON.stringify({
            headCommitSHA: review.data!.head_sha,
            files: { [file]: checked },
          }),
        },
      );
      if (!response.ok || response.redirected)
        throw new Error(t("review.changes.viewedError"));
      await refresh();
    },
    onSettled: () => setViewedPending(undefined),
  });
  if (review.isPending || diff.isPending) return <Pending />;
  if (review.error || diff.error)
    return (
      <>
        <Feedback error={review.error || diff.error} />
        <a
          className="button"
          href={native(`${path}/pulls/${index}.diff`)}
          download
        >
          {t("review.changes.downloadDiff")}
        </a>
        <a
          className="button"
          href={native(`${path}/pulls/${index}.patch`)}
          download
        >
          {t("review.changes.downloadPatch")}
        </a>
      </>
    );
  const data = review.data,
    options = (commits.data?.commits || []).map((item) => ({
      value: item.id,
      label: `${item.short_sha} ${item.summary}`,
    }));
  const changedFiles = pullChangedFiles(diff.data);
  const viewedCount = viewedFileCount(
    changedFiles,
    data.viewed_files,
    viewedPending,
  );
  const outdated = data.threads.filter((thread) => thread.outdated);
  return (
    <section>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <div className={toolbarActions}>
          <SelectControl
            label={t("review.changes.fromCommit")}
            className={toolbarSelect}
            value={from}
            onValueChange={(value) => setRange("from", value)}
            searchable
            options={[
              { value: "", label: t("review.changes.allChanges") },
              { value: data.base_sha, label: t("review.changes.mergeBase") },
              ...options,
            ]}
          />
          <SelectControl
            label={t("review.changes.toCommit")}
            className={toolbarSelect}
            value={to}
            onValueChange={(value) => setRange("to", value)}
            searchable
            options={[
              { value: "", label: t("review.changes.latestVersion") },
              ...options,
            ]}
          />
        </div>
        <div className={toolbarActions}>
          <SelectControl
            label={t("review.changes.whitespace.label")}
            className={toolbarSelect}
            value={whitespace}
            onValueChange={setWhitespace}
            options={[
              {
                value: "show-all",
                label: t("review.changes.whitespace.showAll"),
              },
              {
                value: "ignore-all",
                label: t("review.changes.whitespace.ignoreAll"),
              },
              {
                value: "ignore-change",
                label: t("review.changes.whitespace.ignoreChange"),
              },
              {
                value: "ignore-eol",
                label: t("review.changes.whitespace.ignoreEol"),
              },
            ]}
          />
          <div className="segmented shrink-0">
            <button
              className={segmentedButton}
              aria-pressed={!parallel}
              onClick={() => setParallel(false)}
            >
              {t("review.changes.unified")}
            </button>
            <button
              className={segmentedButton}
              aria-pressed={parallel}
              onClick={() => setParallel(true)}
            >
              {t("review.changes.sideBySide")}
            </button>
          </div>
          {data.can_comment && <ReviewSubmission index={index} data={data} />}
        </div>
      </div>
      <Feedback error={viewed.error || commits.error} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        {data.can_comment && (
          <span>
            {t("mergeOptions.files.viewedCounter", {
              viewed: viewedCount,
              total: changedFiles.length,
            })}
          </span>
        )}
        {!!outdated.length && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={showOutdated}
              onChange={(event) => setShowOutdated(event.target.checked)}
            />
            {t("mergeOptions.files.showOutdated", { count: outdated.length })}
          </label>
        )}
      </div>
      {(from || to) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-info-bg p-3 text-sm">
          <span className="min-w-0 break-words">
            {from
              ? t("review.changes.rangeNotice", {
                  from: from.slice(0, 10),
                  to: data.view_head_sha.slice(0, 10),
                })
              : t("review.changes.singleNotice", { commit: to.slice(0, 10) })}
          </span>
          <button
            className="button"
            onClick={() =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("from", "");
                next.set("to", "");
                return next;
              })
            }
          >
            {t("review.changes.showAll")}
          </button>
        </div>
      )}
      <DiffView
        text={diff.data}
        navigation
        fileRef={data.view_head_sha}
        parallel={parallel}
        onComment={data.can_comment ? setSelected : undefined}
        fileControl={(file) => (
          <div className="flex flex-wrap items-center gap-2">
            {data.can_edit_head &&
              changedFiles.some(
                (changed) => changed.name === file && !changed.deleted,
              ) && (
                <Link
                  className="button small"
                  to={`/projects/${data.head_repo.split("/").map(encodeURIComponent).join("/")}/edit?${new URLSearchParams({ ref: data.head_branch, path: file })}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {t("mergeOptions.files.editHead")}
                </Link>
              )}
            {data.can_comment && !from && !to && (
              <label
                className="inline-flex items-center gap-1.5 px-1 text-[12px] font-normal whitespace-nowrap"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={
                    viewedPending?.file === file
                      ? viewedPending.checked
                      : data.viewed_files[file] === "viewed"
                  }
                  disabled={!!viewedPending}
                  onChange={(event) => {
                    const pending = { file, checked: event.target.checked };
                    setViewedPending(pending);
                    viewed.mutate(pending);
                  }}
                />
                {t("review.changes.viewed")}
              </label>
            )}
          </div>
        )}
        afterLine={(file, before, after) => (
          <>
            {data.threads
              .filter(
                (thread) =>
                  !thread.outdated &&
                  thread.path === file &&
                  (thread.line < 0
                    ? -thread.line === before
                    : thread.line === after),
              )
              .map((thread) => (
                <ReviewThread
                  key={thread.id}
                  thread={thread}
                  index={index}
                  data={data}
                />
              ))}
            {selected?.path === file &&
              (selected.side === "previous"
                ? selected.line === before
                : selected.line === after) && (
                <InlineCommentForm
                  index={index}
                  line={selected}
                  data={data}
                  onClose={() => setSelected(null)}
                />
              )}
          </>
        )}
      />
      {data.threads.some((thread) => thread.outdated) && (
        <p className="mt-5 text-[13px] leading-[calc(1.25/0.875)] text-muted">
          {t("review.changes.outdatedHint")}
        </p>
      )}
      {showOutdated &&
        outdated.map((thread) => (
          <ReviewThread
            key={thread.id}
            thread={thread}
            index={index}
            data={data}
          />
        ))}
    </section>
  );
}

function InlineCommentForm({
  index,
  line,
  data,
  onClose,
  reply,
}: {
  index: number | string;
  line: Line;
  data: ReviewData;
  onClose: () => void;
  reply?: number;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const [content, setContent] = useState(""),
    refresh = useRefreshReview();
  const submit = useMutation({
    mutationFn: async (single: boolean) => {
      await nativeForm(`${path}/pulls/${index}/files/reviews/comments`, {
        origin: "diff",
        content,
        side: line.side,
        line: String(line.line),
        path: line.path,
        single_review: single ? "true" : "false",
        before_commit_id: data.view_base_sha,
        latest_commit_id: data.view_head_sha,
        ...(reply ? { reply: String(reply) } : {}),
      });
      await refresh();
      setContent("");
      onClose();
    },
  });
  return (
    <form
      className="max-w-full border-y border-line bg-surface p-4 font-sans"
      aria-label={
        reply ? t("review.inline.replyForm") : t("review.inline.newForm")
      }
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate(false);
      }}
    >
      <MarkdownEditor
        label={
          reply
            ? t("review.inline.replyLabel")
            : t("review.inline.commentLabel")
        }
        value={content}
        onChange={setContent}
        rows={4}
      />
      <Feedback error={submit.error} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="button primary"
          disabled={!content.trim() || submit.isPending}
        >
          {reply ? t("review.inline.reply") : t("review.inline.addToReview")}
        </button>
        {!reply && (
          <button
            className="button"
            type="button"
            disabled={!content.trim() || submit.isPending}
            onClick={() => submit.mutate(true)}
          >
            {t("review.inline.addNow")}
          </button>
        )}
        <button
          className="button"
          type="button"
          onClick={onClose}
          disabled={submit.isPending}
        >
          {t("review.inline.cancel")}
        </button>
      </div>
    </form>
  );
}

function ReviewSubmission({
  index,
  data,
}: {
  index: number | string;
  data: ReviewData;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const [open, setOpen] = useState(false),
    [type, setType] = useState("comment"),
    [content, setContent] = useState("");
  const refresh = useRefreshReview();
  const submit = useMutation({
    mutationFn: async () => {
      await nativeForm(`${path}/pulls/${index}/files/reviews/submit`, {
        type,
        content,
        commit_id: data.head_sha,
      });
      await refresh();
      setOpen(false);
      setContent("");
    },
  });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="button primary">
        {data.pending_count
          ? t("review.submit.finishWithCount", { pending: data.pending_count })
          : t("review.submit.finish")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-55"
        >
          <Popover.Popup className="dropdown-popup max-h-(--available-height) w-[480px] max-w-[calc(100vw-48px)] overflow-y-auto rounded-md border-line bg-surface p-4 max-md:w-[calc(100vw-32px)] max-md:max-w-[calc(100vw-32px)] [&_p]:text-[12px]">
            <div className="mb-4 flex items-center justify-between">
              <Popover.Title>{t("review.submit.title")}</Popover.Title>
              <Popover.Close
                className="icon-button"
                aria-label={t("review.submit.close")}
              >
                <X size={16} />
              </Popover.Close>
            </div>
            <form
              className="workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
            >
              <MarkdownEditor
                label={t("review.submit.summary")}
                value={content}
                onChange={setContent}
                rows={4}
              />
              <SelectControl
                label={t("review.submit.outcome")}
                value={type}
                onValueChange={setType}
                options={[
                  {
                    value: "comment",
                    label: t("review.submit.outcomes.comment"),
                  },
                  ...(data.can_approve
                    ? [
                        {
                          value: "approve",
                          label: t("review.submit.outcomes.approve"),
                        },
                        {
                          value: "reject",
                          label: t("review.submit.outcomes.reject"),
                        },
                      ]
                    : []),
                ]}
              />
              <p className="text-sm text-muted">
                {data.pending_count
                  ? t("review.submit.pendingHint", {
                      count: data.pending_count,
                    })
                  : t("review.submit.hint")}
              </p>
              <Feedback error={submit.error} />
              <button
                className="button primary"
                disabled={
                  submit.isPending ||
                  (type !== "approve" && !content.trim() && !data.pending_count)
                }
              >
                {t("review.submit.submit")}
              </button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ReviewThread({
  thread,
  index,
  data,
}: {
  thread: Thread;
  index: number | string;
  data: ReviewData;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const [reply, setReply] = useState(false),
    [expanded, setExpanded] = useState(!thread.resolved && !thread.outdated),
    refresh = useRefreshReview();
  const { hash } = useLocation();
  const linked = thread.comments.some(
    (comment) => hash === `#issuecomment-${comment.id}`,
  );
  useEffect(() => {
    if (linked) setExpanded(true);
  }, [linked]);
  useEffect(() => {
    if (expanded && linked) {
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ block: "center" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [expanded, linked, hash]);
  const resolve = useMutation({
    mutationFn: async () => {
      await nativeForm(`${path}/pulls/resolve_conversation`, {
        origin: "diff",
        action: thread.resolved ? "UnResolve" : "Resolve",
        comment_id: String(thread.id),
      });
      await refresh();
    },
  });
  return (
    <article
      className="review-thread my-4 min-w-0 overflow-hidden rounded-md border border-line bg-surface font-sans"
      id={`discussion-${thread.id}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3 text-[12px] max-md:flex-wrap">
        <button
          className="flex min-w-0 items-center gap-[5px]"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {thread.resolved ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <MessageSquare size={16} />
          )}
          <strong className="truncate font-mono">{thread.path}</strong>
          <span>:{Math.abs(thread.line)}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          {thread.pending && (
            <span className="badge">{t("review.thread.pending")}</span>
          )}
          {thread.outdated && (
            <span className="badge">{t("review.thread.outdated")}</span>
          )}
          {thread.resolved && (
            <span className="badge">{t("review.thread.resolved")}</span>
          )}
          {data.can_resolve && (
            <button
              className={editLink}
              disabled={resolve.isPending}
              onClick={() => resolve.mutate()}
            >
              {thread.resolved
                ? t("review.thread.reopen")
                : t("review.thread.resolve")}
            </button>
          )}
        </div>
      </div>
      <Feedback error={resolve.error} />
      {expanded && (
        <>
          {thread.patch && (
            <pre
              className="overflow-x-auto border-b border-line bg-canvas p-3 font-mono text-xs"
              aria-label={t("mergeOptions.threadSnippet")}
            >
              {thread.patch}
            </pre>
          )}
          {thread.comments.map((comment) => (
            <ReviewCommentBody
              key={comment.id}
              comment={comment}
              index={index}
              data={data}
            />
          ))}
          {data.can_comment &&
            (reply ? (
              <InlineCommentForm
                index={index}
                line={{
                  path: thread.path,
                  line: Math.abs(thread.line),
                  side: thread.line < 0 ? "previous" : "proposed",
                }}
                data={data}
                reply={thread.review_id}
                onClose={() => setReply(false)}
              />
            ) : (
              <button
                className="mx-4 my-3 w-[calc(100%-32px)] rounded border border-input bg-surface px-3 py-2 text-left text-[13px] text-muted"
                onClick={() => setReply(true)}
              >
                {t("review.thread.reply")}
              </button>
            ))}
        </>
      )}
    </article>
  );
}

export function TimelineReviewThread({
  index,
  threadID,
}: {
  index: number | string;
  threadID: number;
}) {
  const query = usePullReview(index);
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const thread = query.data.threads.find(
    (candidate) => candidate.id === threadID,
  );
  return thread ? (
    <ReviewThread index={index} thread={thread} data={query.data} />
  ) : null;
}

function ReviewCommentBody({
  comment,
  index,
  data,
}: {
  comment: ReviewComment;
  index: number | string;
  data: ReviewData;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const [editing, setEditing] = useState(false),
    [content, setContent] = useState(comment.body),
    refresh = useRefreshReview();
  const save = useMutation({
    mutationFn: async () => {
      await nativeForm(`${path}/comments/${comment.id}`, {
        content,
        content_version: String(comment.content_version),
        ignore_attachments: "true",
        context: path,
      });
      await refresh();
      setEditing(false);
    },
  });
  return (
    <div
      className="review-comment border-b border-line p-4 last:border-b-0"
      id={`issuecomment-${comment.id}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        {comment.avatar && (
          <img className="size-6 rounded-full" src={comment.avatar} alt="" />
        )}
        <strong>{comment.user}</strong>
        <span className="text-[12px] text-muted">
          {relativeDate(comment.created_at)}
        </span>
        <ContentReportMenu
          id={comment.id}
          type="comment"
          canReport={comment.can_report}
          body={comment.body}
          reference={native(
            `${path}/pulls/${index}#issuecomment-${comment.id}`,
          )}
          canQuote={data.lifecycle?.can_react}
          newIssueURL={
            data.lifecycle?.can_react
              ? `/projects${path}/issues/new`
              : undefined
          }
        />
        {comment.can_edit && (
          <>
            <button
              className={`${editLink} ml-auto`}
              onClick={() => setEditing(!editing)}
            >
              {t("review.comment.edit")}
            </button>
            <ConfirmAction
              className={editLink}
              title={t("review.comment.deleteTitle")}
              action={async () => {
                await nativeForm(`${path}/comments/${comment.id}/delete`, {});
                await refresh();
              }}
            >
              {t("review.comment.deleteBody")}
            </ConfirmAction>
          </>
        )}
      </div>
      {editing ? (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <MarkdownEditor
            label={t("review.comment.editLabel")}
            value={content}
            onChange={setContent}
          />
          <Feedback error={save.error} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button primary"
              disabled={save.isPending || !content.trim()}
            >
              {t("review.comment.save")}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setEditing(false)}
            >
              {t("review.comment.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <Markdown basePath={`${path}/src/branch/HEAD/`}>
          {comment.body}
        </Markdown>
      )}
      <Reactions
        endpoint={`${path}/comments/${comment.id}/reactions`}
        values={comment.reactions}
        data={data.lifecycle}
      />
    </div>
  );
}

function DismissReview({ review }: { review: Review }) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const refresh = useRefreshReview();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const action = useMutation({
    mutationFn: async () => {
      await nativeForm(`${path}/pulls/dismiss_review`, {
        review_id: String(review.id),
        message,
      });
      await refresh();
    },
    onSuccess: () => {
      setOpen(false);
      setMessage("");
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!action.isPending) {
          setOpen(next);
          action.reset();
        }
      }}
    >
      <Dialog.Trigger className={editLink}>
        {t("review.overview.dismiss")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup
          className={`${dialogPopup} top-[20%] w-[min(480px,calc(100vw-32px))]`}
        >
          <Dialog.Title className="text-xl">
            {t("review.overview.dismissTitle", { reviewer: review.reviewer })}
          </Dialog.Title>
          <Dialog.Description>
            {t("review.overview.dismissBody")}
          </Dialog.Description>
          <form
            className="workspace-form max-w-none"
            onSubmit={(event) => {
              event.preventDefault();
              action.mutate();
            }}
          >
            <label>
              {t("mergeOptions.dismissMessage")}
              <textarea
                rows={4}
                value={message}
                disabled={action.isPending}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <Feedback error={action.error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close
                type="button"
                className="button"
                disabled={action.isPending}
              >
                {t("create.cancel")}
              </Dialog.Close>
              <button className="button primary" disabled={action.isPending}>
                {action.isPending
                  ? t("mergeOptions.working")
                  : t("review.overview.dismiss")}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PullBlockedReasons({ index }: { index: number | string }) {
  const { t } = useTranslation("mergeRequests");
  const query = usePullReview(index);
  if (!query.data || query.data.closed || query.data.merged) return null;
  const blocked = query.data.blocked;
  if (!blocked) return null;
  const reasons = [
    blocked.approvals &&
      t("review.blocked.approvals", {
        granted: blocked.granted_approvals || 0,
        required: blocked.required_approvals || 0,
      }),
    blocked.rejection && t("review.blocked.rejection"),
    blocked.review_requests && t("review.blocked.reviewRequests"),
    blocked.outdated && t("review.blocked.outdated"),
    blocked.checks && t("review.blocked.checks"),
    blocked.signing_all_styles && t("review.blocked.signing"),

    blocked.dependencies && t("mergeOptions.blocked.dependencies"),
    blocked.broken && t("mergeOptions.blocked.broken"),
    blocked.checking && t("mergeOptions.blocked.checking"),
    blocked.ancestor && t("mergeOptions.blocked.ancestor"),
    blocked.empty && t("mergeOptions.blocked.empty"),
    blocked.conflict &&
      !blocked.conflicted_files?.length &&
      t("mergeOptions.blocked.conflict"),
  ].filter(Boolean);
  const hasReasons =
    reasons.length ||
    blocked.conflicted_files?.length ||
    blocked.protected_files?.length;
  if (!hasReasons && !blocked.will_sign && !blocked.signing_reason_text)
    return null;
  return (
    <div className="border-t border-line px-4 py-3 text-sm">
      {hasReasons ? (
        <h4 className="mb-2 font-semibold">{t("review.blocked.title")}</h4>
      ) : null}
      <ul className="list-disc space-y-1 pl-5">
        {reasons.map((reason) => (
          <li key={String(reason)}>{reason}</li>
        ))}
        {[
          {
            files: blocked.conflicted_files,
            title: t("review.blocked.conflicts"),
          },
          {
            files: blocked.protected_files,
            title: t("review.blocked.protected"),
          },
        ]
          .filter((group) => group.files?.length)
          .map((group) => (
            <li key={group.title}>
              {group.title}
              <ul className="list-disc pl-5">
                {group.files!.map((file) => (
                  <li key={file} className="break-all">
                    <code>{file}</code>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
      {(blocked.will_sign || blocked.signing_reason_text) && (
        <p className="mt-2 text-muted">
          {blocked.will_sign
            ? t("mergeOptions.signed", { key: blocked.signing_key || "" })
            : blocked.signing_reason_text}
        </p>
      )}
    </div>
  );
}

export function PullStatusChecks({ index }: { index: number | string }) {
  const { t } = useTranslation("mergeRequests");
  const query = usePullReview(index);
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  if (!data.status_state) return null;
  const states = {
    pending: t("review.checks.states.pending"),
    success: t("review.checks.states.success"),
    skipped: t("review.checks.states.skipped"),
    warning: t("review.checks.states.warning"),
    failure: t("review.checks.states.failure"),
    error: t("review.checks.states.error"),
  };
  const stateLabel = (state: string) =>
    states[state as keyof typeof states] || states.pending;
  return (
    <details className="border-t border-line text-sm" open>
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        {t("review.checks.summary", { state: stateLabel(data.status_state) })}
      </summary>
      <ul className="border-t border-line">
        {[
          ...(data.status_checks || []),
          ...(data.missing_checks || []).map((context) => ({
            context,
            state: "pending",
            description: "",
            target_url: "",
            required: true,
          })),
        ].map((check) => (
          <li
            key={check.context}
            className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0"
          >
            <span
              className={
                check.state === "success"
                  ? "text-success"
                  : ["error", "failure"].includes(check.state)
                    ? "text-danger"
                    : "text-muted"
              }
            >
              {stateLabel(check.state)}
            </span>
            <strong className="min-w-0 break-all">{check.context}</strong>
            {check.description && (
              <span className="min-w-0 break-words text-muted">
                {check.description}
              </span>
            )}
            {check.required && (
              <span className="badge">{t("review.checks.required")}</span>
            )}
            {check.target_url && (
              <a
                className="ml-auto text-primary hover:underline"
                href={check.target_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("review.checks.details")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PullReviewOverview({
  issue,
  canMerge,
  mergeStyles,
  targetBranch,
}: {
  issue: Issue;
  canMerge: boolean;
  mergeStyles: string[];
  targetBranch: string;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const query = usePullReview(issue.number),
    refresh = useRefreshReview();
  const [reviewer, setReviewer] = useState("");
  const manage = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => {
      await nativeForm(`${path}/pulls/request_review`, {
        issue_ids: String(query.data!.issue_id),
        id: String(id),
        action,
      });
      await refresh();
      setReviewer("");
    },
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  const reviewStatus = (type: number) =>
    type === 1
      ? t("review.overview.status.approved")
      : type === 3
        ? t("review.overview.status.changesRequested")
        : t("review.overview.status.requested");
  const latest = new Map<number, Review>();
  for (const review of data.reviews)
    if ([1, 3, 4].includes(review.type) && !review.dismissed)
      latest.set(review.reviewer_id, review);
  return (
    <section>
      <div className="mt-5 mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">
          {t("review.overview.title")}
        </h2>
        {data.can_comment && (
          <ReviewSubmission index={issue.number} data={data} />
        )}
      </div>
      <div className="rounded-md border border-line">
        {latest.size ? (
          [...latest.values()].map((review) => (
            <div
              className="review-status-row flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-[13px] last:border-b-0"
              key={review.id}
            >
              {review.avatar && (
                <img
                  className="size-6 rounded-full"
                  src={review.avatar}
                  alt=""
                />
              )}
              <strong>{review.reviewer}</strong>
              <span
                className={`ml-auto text-[12px] ${review.type === 1 ? "text-success" : review.type === 3 ? "text-danger" : "text-muted"}`}
              >
                {review.stale
                  ? t("review.overview.staleStatus", {
                      status: reviewStatus(review.type),
                    })
                  : reviewStatus(review.type)}
              </span>
              {data.can_request && (
                <button
                  className={editLink}
                  disabled={manage.isPending}
                  onClick={() =>
                    manage.mutate({
                      id: review.reviewer_id,
                      action: review.type === 4 ? "detach" : "attach",
                    })
                  }
                >
                  {review.type === 4
                    ? t("review.overview.removeRequest")
                    : t("review.overview.requestAgain")}
                </button>
              )}
              {data.can_dismiss && review.type !== 4 && !review.dismissed && (
                <DismissReview review={review} />
              )}
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted">
            {t("review.overview.noReviews")}
          </p>
        )}
      </div>
      {data.can_request && !!data.reviewer_options.length && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SelectControl
            label={t("review.overview.requestFrom")}
            searchable
            value={reviewer}
            onValueChange={setReviewer}
            options={[
              { value: "", label: t("review.overview.chooseReviewer") },
              ...data.reviewer_options.map((user) => ({
                value: String(user.id),
                label: user.name,
              })),
            ]}
          />
          <button
            className="button"
            disabled={!reviewer || manage.isPending}
            onClick={() =>
              manage.mutate({ id: Number(reviewer), action: "attach" })
            }
          >
            {t("review.overview.request")}
          </button>
        </div>
      )}
      <Feedback error={manage.error} />
      <PullWorkflowTrust issue={issue} data={query.data} />
      <PullBranchActions
        issue={issue}
        data={data}
        canMerge={canMerge}
        mergeStyles={mergeStyles}
        targetBranch={targetBranch}
      />
      {data.threads
        .filter((thread) => thread.pending)
        .map((thread) => (
          <ReviewThread
            key={thread.id}
            thread={thread}
            index={issue.number}
            data={data}
          />
        ))}
    </section>
  );
}

function PullBranchActions({
  issue,
  data,
  canMerge,
  targetBranch,
}: {
  issue: Issue;
  data: ReviewData;
  canMerge: boolean;
  mergeStyles: string[];
  targetBranch: string;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>();
  const [target, setTarget] = useState(targetBranch),
    refresh = useRefreshReview();
  const branches = useQuery({
    queryKey: ["branches", path],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(`${path}/branches/list`, signal),
    enabled: data.can_edit,
  });
  const action = useMutation({
    mutationFn: async ({
      operation,
      values = {},
    }: {
      operation: string;
      values?: Record<string, string>;
    }) => {
      await nativeForm(`${path}/${operation}`, values);
      await refresh();
    },
  });
  if (!(data.can_edit || data.can_cleanup || canMerge)) return null;
  const run = (operation: string, values?: Record<string, string>) =>
    action.mutate({ operation, values });
  return (
    <details className="group/branch my-3 border-b border-line py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-muted after:ml-auto after:[transform:rotate(0)] after:[transition:transform_120ms] after:content-['›'] group-open/branch:after:[transform:rotate(90deg)] motion-reduce:after:transition-none">
        <GitPullRequest size={16} />
        {t("review.settings.title")}
      </summary>
      <div className="flex flex-col gap-4 pt-4 pb-1 text-[13px]">
        <Feedback error={action.error || branches.error} />
        {(data.can_update_merge || data.can_update_rebase) && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{t("review.settings.updateSource")}</span>
            {data.can_update_merge && (
              <button
                className="button"
                disabled={action.isPending}
                onClick={() =>
                  run(`pulls/${issue.number}/update`, { style: "merge" })
                }
              >
                {t("review.settings.mergeTarget")}
              </button>
            )}
            {data.can_update_rebase && (
              <button
                className="button"
                disabled={action.isPending}
                onClick={() =>
                  run(`pulls/${issue.number}/update`, { style: "rebase" })
                }
              >
                {t("review.settings.rebaseSource")}
              </button>
            )}
          </div>
        )}
        {data.can_edit && !data.closed && (
          <div className="flex flex-wrap items-center gap-2">
            <SelectControl
              label={t("review.settings.targetBranch")}
              value={target}
              onValueChange={setTarget}
              searchable
              options={(branches.data?.results || [targetBranch]).map(
                (value) => ({ value, label: value }),
              )}
            />
            <button
              className="button"
              disabled={target === targetBranch || action.isPending}
              onClick={() =>
                run(`pull/${issue.number}/target_branch`, {
                  target_branch: target,
                })
              }
            >
              {t("review.settings.changeTarget")}
            </button>
          </div>
        )}
        {data.can_edit && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.allow_maintainer_edit}
              disabled={action.isPending}
              onChange={(event) =>
                run(`pulls/${issue.number}/set_allow_maintainer_edit`, {
                  allow_maintainer_edit: event.target.checked
                    ? "true"
                    : "false",
                })
              }
            />
            {t("review.settings.allowMaintainerEdit")}
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {data.can_edit && !data.merged && (
            <button
              className="button"
              disabled={action.isPending}
              onClick={() =>
                run(`pulls/${issue.number}/comments`, {
                  content: "",
                  status: data.closed ? "reopen" : "close",
                })
              }
            >
              {data.closed
                ? t("review.settings.reopen")
                : t("review.settings.close")}
            </button>
          )}
          {data.can_cleanup && (
            <ConfirmAction
              title={t("review.settings.deleteSourceTitle")}
              label={t("review.settings.deleteSource")}
              action={async () => {
                await nativeForm(`${path}/pulls/${issue.number}/cleanup`, {});
                await refresh();
              }}
            >
              {t("review.settings.deleteSourceBody")}
            </ConfirmAction>
          )}
        </div>
      </div>
    </details>
  );
}

function PullWorkflowTrust({
  issue,
  data,
}: {
  issue: Issue;
  data: ReviewData;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path } = useOutletContext<RepoContext>(),
    refresh = useRefreshReview();
  const trust = data.actions_trust;
  if (
    !trust ||
    !(
      trust.needs_approval ||
      (trust.can_delegate && trust.state === "explicitly")
    )
  )
    return null;
  const act = async (value: string) => {
    await nativeForm(`${path}/pulls/${issue.number}/action-user-trust`, {
      trust: value,
    });
    await refresh();
  };
  return (
    <section
      className="my-4 rounded-md border border-line p-4"
      id="pull-request-trust-panel"
    >
      <h3>
        {trust.needs_approval
          ? t("review.trust.approvalRequired")
          : t("review.trust.trusted")}
      </h3>
      <p className="mt-2 mb-4 text-[13px]">
        {trust.needs_approval
          ? t("review.trust.approvalBody")
          : t("review.trust.trustedBody")}
      </p>
      {trust.can_delegate && (
        <div className="flex flex-wrap items-center gap-2">
          {trust.state === "explicitly" ? (
            <ConfirmAction
              label={t("review.trust.revoke.label")}
              title={t("review.trust.revoke.title")}
              action={() => act("revoke")}
            >
              {t("review.trust.revoke.body")}
            </ConfirmAction>
          ) : (
            <>
              <ConfirmAction
                label={t("review.trust.deny.label")}
                title={t("review.trust.deny.title")}
                action={() => act("deny")}
              >
                {t("review.trust.deny.body")}
              </ConfirmAction>
              <ConfirmAction
                label={t("review.trust.once.label")}
                title={t("review.trust.once.title")}
                action={() => act("once")}
              >
                {t("review.trust.once.body")}
              </ConfirmAction>
              <ConfirmAction
                label={t("review.trust.always.label")}
                title={t("review.trust.always.title")}
                action={() => act("always")}
              >
                {t("review.trust.always.body")}
              </ConfirmAction>
            </>
          )}
        </div>
      )}
    </section>
  );
}
