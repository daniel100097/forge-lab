import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CircleDot,
  Download,
  GitBranch,
  GitMerge,
  MessageSquare,
} from "lucide-react";
import { get, native, nativeForm, type Bootstrap, type Issue } from "./api";
import type { RepoContext } from "./App";
import {
  PullChanges,
  PullCommitsTab,
  PullReviewOverview,
  PullStatusChecks,
  PullBlockedReasons,
  usePullReview,
} from "./PullReview";
import { draftPrefix } from "./draft";
import { discussionCommentID } from "./discussionAnchor";
import { IssueEditControls, IssueMetadataPanel } from "./IssueManagement";
import {
  AttachmentPicker,
  AttachmentList,
  submitWithAttachments,
  IssueLifecycleControls,
  IssueExtraSidebar,
  ContentHistory,
  DiscussionEntry,
  Reactions,
  type Lifecycle,
  type TimelineEntry,
} from "./IssueLifecycle";
import { PullMergePanel } from "./PullMerge";
import { ContentReportMenu } from "./ContentReportMenu";
import {
  ActionMenu,
  MenuDownload,
  MenuLink,
  MenuSeparator,
} from "./ActionMenu";
import {
  Feedback,
  Markdown,
  MarkdownEditor,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
interface Pull {
  merged: boolean;
  mergeable: boolean;
  draft: boolean;
  head: {
    label?: string;
    ref: string;
    sha: string;
    name?: string;
    repo?: { full_name: string };
  };
  base: { ref: string; name?: string };
  additions: number;
  deletions: number;
  changed_files: number;
}
interface Discussion {
  issue: Issue;
  pull: Pull | null;
  merge_styles: string[];
  can_merge: boolean;
  can_edit: boolean;
  draft_prefixes: string[];
  lifecycle?: Lifecycle;
  comments: TimelineEntry[];
  total_comments: number;
  page?: number;
  can_comment: boolean;
  can_change_status: boolean;
  can_report: boolean;
}
export function IssuePage({ pulls = false }: { pulls?: boolean }) {
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { t } = useTranslation("issues");
  const { t: mergeText } = useTranslation("mergeRequests");
  const kind = pulls ? "pulls" : "issues";
  const { index } = useParams();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const commentID = discussionCommentID(hash);
  const page = Math.max(1, Number(params.get("page")) || 1),
    tab = params.get("tab") || "overview";
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["discussion", path, pulls, index, page, commentID],
    queryFn: ({ signal }) =>
      get<Discussion>(
        `${dataPath}/${pulls ? "pulls" : "issues"}/${index}?${new URLSearchParams({ page: String(page), ...(commentID ? { comment_id: commentID } : {}) })}`,
        signal,
      ),
  });
  const [content, setContent] = useState("");
  useEffect(() => {
    if (hash && query.data?.issue.id) {
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ block: "center" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [hash, query.data, tab]);
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => {
    const quote = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (!text) return;
      setContent((current) => [current, text].filter(Boolean).join("\n\n"));
      document
        .querySelector<HTMLTextAreaElement>("#discussion-comment-form textarea")
        ?.focus();
    };
    window.addEventListener("forgejo-quote-reply", quote);
    return () => window.removeEventListener("forgejo-quote-reply", quote);
  }, []);
  const mergeReview = usePullReview(index || "", "", "", pulls);
  const blockers = mergeReview.data?.blocked;
  const mergeBlocked = !!(
    blockers &&
    (blockers.approvals ||
      blockers.rejection ||
      blockers.review_requests ||
      blockers.outdated ||
      blockers.checks ||
      blockers.dependencies ||
      blockers.signing_all_styles ||
      blockers.broken ||
      blockers.checking ||
      blockers.ancestor ||
      blockers.conflict ||
      blockers.conflicted_files?.length ||
      blockers.protected_files?.length)
  );
  const comment = useMutation({
    mutationFn: async (status: string) => {
      await submitWithAttachments(
        path,
        `${path}/${pulls ? "pulls" : "issues"}/${index}/comments`,
        { content, status },
        files,
      );
      setContent("");
      setFiles([]);
      await client.invalidateQueries();
    },
  });
  const draft = useMutation({
    mutationFn: async () => {
      const current = query.data!;
      const prefix = draftPrefix(current.issue.title, current.draft_prefixes);
      const newPrefix = current.draft_prefixes[0];
      if (current.pull?.draft && !prefix)
        throw new Error(t("detail.merge.draftChanged"));
      if (!prefix && !newPrefix) return;
      await nativeForm(`${path}/issues/${index}/title`, {
        title: prefix
          ? current.issue.title.slice(prefix.length).trimStart()
          : `${newPrefix} ${current.issue.title}`,
      });
      await client.invalidateQueries();
    },
  });
  useTitle(`${query.data?.issue.title || t(`detail.kind.${kind}`)} #${index}`);
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const { issue, comments, pull } = query.data;
  const state = issue.pull_request?.merged ? "merged" : issue.state;
  const stateLabel =
    state === "merged" || state === "open" || state === "closed"
      ? t(`detail.state.${state}`)
      : state;
  const viewer = client.getQueryData<Bootstrap>(["bootstrap"])?.user;
  const projectRoot = `/projects${path}`;
  const sourceRoot = pull?.head.repo
    ? `/projects/${pull.head.repo.full_name.split("/").map(encodeURIComponent).join("/")}`
    : projectRoot;
  const badge = `inline-flex items-center gap-1.5 rounded-full text-xs capitalize ${pulls ? "px-2 py-0 leading-5 font-normal" : "px-2.5 py-1 font-semibold"} ${state === "merged" ? "bg-merged-bg text-merged" : state === "closed" ? "bg-info-bg text-[#245b9b] dark:text-[#a3cbf5]" : "bg-[#c7e9d4] text-[#0a6635] dark:bg-success-bg dark:text-success"}`;
  const branchCode =
    "rounded bg-[#cbe2f9] px-1 text-xs break-all text-[#1f4d7f] dark:bg-info-bg dark:text-[#a3cbf5]";
  return (
    <div className={pulls ? "pt-1" : "pt-4"}>
      <div className={pulls ? "mb-4" : "mb-5"}>
        {pull ? (
          <>
            <div className="mb-2 flex items-start justify-between gap-4 max-md:flex-wrap">
              <h1 className="m-0 text-[30px] leading-9 font-semibold max-md:text-[22px] max-md:leading-[30px]">
                {issue.title}
              </h1>
              <ActionMenu
                label={t("detail.code.label")}
                trigger={
                  <>
                    {t("detail.code.trigger")}
                    <ChevronDown size={14} />
                  </>
                }
              >
                <MenuLink
                  to={`${sourceRoot}?ref=${encodeURIComponent(pull.head.name || pull.head.ref)}`}
                >
                  <GitBranch size={16} />
                  {t("detail.code.sourceBranch")}
                </MenuLink>
                <MenuLink
                  to={`${projectRoot}?ref=${encodeURIComponent(pull.base.name || pull.base.ref)}`}
                >
                  <GitBranch size={16} />
                  {t("detail.code.targetBranch")}
                </MenuLink>
                <MenuSeparator />
                <MenuDownload href={native(`${path}/pulls/${index}.diff`)}>
                  <Download size={16} />
                  {t("detail.code.downloadDiff")}
                </MenuDownload>
              </ActionMenu>
            </div>
            <div className="merge-request-subtitle flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm text-muted">
              <span className={badge}>
                <GitMerge size={14} />
                {stateLabel}
              </span>
              <span>
                <Trans
                  t={t}
                  i18nKey="detail.requestedToMerge"
                  values={{ user: issue.user.login }}
                  components={{ user: <strong className="text-ink" /> }}
                />
              </span>
              <Link
                to={`${sourceRoot}?ref=${encodeURIComponent(pull.head.name || pull.head.ref)}`}
              >
                <code className={branchCode}>
                  {pull.head.name || pull.head.ref}
                </code>
              </Link>
              <span>{t("detail.into")}</span>
              <Link
                to={`${projectRoot}?ref=${encodeURIComponent(pull.base.name || pull.base.ref)}`}
              >
                <code className={branchCode}>
                  {pull.base.name || pull.base.ref}
                </code>
              </Link>
              <span>{relativeDate(issue.created_at)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className={badge}>
                {pulls ? <GitMerge size={14} /> : <CircleDot size={14} />}{" "}
                {stateLabel}
              </span>
              <span>
                <Trans
                  t={t}
                  i18nKey={`detail.opened.${kind}`}
                  values={{
                    reference: `${pulls ? "!" : "#"}${issue.number}`,
                    date: relativeDate(issue.created_at),
                    user: issue.user.login,
                  }}
                  components={{ user: <strong /> }}
                />
              </span>
              <Link
                className="ml-auto text-primary hover:underline"
                to=".."
                relative="path"
              >
                {t(`detail.all.${kind}`)}
              </Link>
            </div>
            <h1 className="mt-4 mb-3 text-2xl max-md:text-[22px]">
              {issue.title}
            </h1>
          </>
        )}
      </div>
      <IssueLifecycleControls
        issue={issue}
        data={query.data.lifecycle}
        pulls={pulls}
      />
      {pulls && (
        <div
          className="tabs mb-4"
          role="tablist"
          aria-label={t("detail.tabs.label")}
        >
          <button
            role="tab"
            aria-selected={tab === "overview"}
            className={`min-h-11 px-3 py-2 ${tab === "overview" ? "active" : ""}`}
            onClick={() => setParams({ tab: "overview" })}
          >
            {t("detail.tabs.overview")}{" "}
            <span className="counter">{issue.comments}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "commits"}
            className={`min-h-11 px-3 py-2 ${tab === "commits" ? "active" : ""}`}
            onClick={() => setParams({ tab: "commits" })}
          >
            {t("detail.tabs.commits")}
          </button>
          <button
            role="tab"
            aria-selected={tab === "changes"}
            className={`min-h-11 px-3 py-2 ${tab === "changes" ? "active" : ""}`}
            onClick={() => setParams({ tab: "changes" })}
          >
            {t("detail.tabs.changes")}{" "}
            {pull && <span className="counter">{pull.changed_files}</span>}
          </button>
        </div>
      )}
      {pulls && tab === "changes" ? (
        <PullChanges
          key={params.get("commit") || "all"}
          index={index!}
          commit={params.get("commit") || undefined}
        />
      ) : pulls && tab === "commits" ? (
        <PullCommitsTab index={index!} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-8 max-[1200px]:grid-cols-[minmax(0,1fr)_200px] max-[1200px]:gap-5 max-md:grid-cols-1 max-md:gap-6">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[20px] leading-[1.4] font-semibold">
                {t("detail.description")}
              </h2>
              <ContentReportMenu
                id={issue.id}
                type={pulls ? "pull" : "issue"}
                canReport={query.data.can_report}
                body={issue.body}
                reference={native(
                  `${path}/${pulls ? "pulls" : "issues"}/${issue.number}#issue-${issue.id}`,
                )}
                newIssueURL={
                  query.data.lifecycle?.can_react
                    ? `/projects${path}/issues/new`
                    : undefined
                }
                canQuote={query.data.lifecycle?.can_react}
              />
              <IssueEditControls
                issue={issue}
                pulls={pulls}
                canEdit={query.data.can_edit}
                attachments={query.data.lifecycle?.attachments}
                attachmentsEnabled={query.data.lifecycle?.attachments_enabled}
              />
            </div>
            <article
              className={`issue-description pb-6 ${pulls ? "min-h-0" : "min-h-20"}`}
              id={`issue-${issue.id}`}
            >
              <Markdown basePath={`${path}/src/branch/HEAD/`}>
                {issue.body || t("detail.noDescription")}
              </Markdown>
              <AttachmentList files={query.data.lifecycle?.attachments} />
              <div className="flex flex-wrap items-center gap-2">
                <Reactions
                  endpoint={`${path}/${pulls ? "pulls" : "issues"}/${index}/reactions`}
                  values={query.data.lifecycle?.reactions}
                  data={query.data.lifecycle}
                />
                <ContentHistory issue={issue} pulls={pulls} />
              </div>
            </article>
            {pull && (
              <section
                className={`merge-panel overflow-hidden rounded-lg border bg-surface [&>.form-error]:mx-4 [&>.form-error]:mb-4 ${pull.merged ? "border-[#cbbbe8] dark:border-[#7964a3]" : "border-line"}`}
              >
                <div className="flex items-center gap-3 p-4">
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${pull.merged ? "bg-merged-bg text-merged" : pull.mergeable && !mergeBlocked && !pull.draft && issue.state === "open" ? "bg-[#c7e9d4] text-success dark:bg-success-bg" : "bg-canvas text-muted"}`}
                  >
                    {pull.mergeable &&
                    !mergeBlocked &&
                    !pull.merged &&
                    !pull.draft &&
                    issue.state === "open" ? (
                      <Check size={16} />
                    ) : (
                      <GitMerge size={16} />
                    )}
                  </span>
                  <div>
                    <h3 className="text-sm">
                      {pull.merged
                        ? t("detail.merge.merged")
                        : issue.state !== "open"
                          ? t("detail.merge.closed")
                          : pull.draft
                            ? t("detail.merge.draft")
                            : mergeBlocked
                              ? t("detail.merge.blocked")
                              : pull.mergeable
                                ? t("detail.merge.ready")
                                : t("detail.merge.conflict")}
                    </h3>
                    <p className="text-xs text-muted mt-1">
                      {pull.merged
                        ? t("detail.merge.mergedText", {
                            branch: pull.base.name || pull.base.ref,
                          })
                        : pull.draft
                          ? t("detail.merge.draftText")
                          : t("detail.merge.checksText")}
                    </p>
                  </div>
                </div>
                <Feedback error={draft.error} />
                <PullStatusChecks index={index!} />
                <PullBlockedReasons index={index!} />
                {!pull.merged &&
                  issue.state === "open" &&
                  query.data.can_edit &&
                  (pull.draft
                    ? !!draftPrefix(issue.title, query.data.draft_prefixes)
                    : !!query.data.draft_prefixes.length) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-subtle px-4 py-3">
                      <button
                        className="button primary"
                        disabled={draft.isPending}
                        onClick={() => draft.mutate()}
                      >
                        {draft.isPending
                          ? mergeText("mergeOptions.working")
                          : pull.draft
                            ? t("detail.merge.markReady")
                            : mergeText("mergeOptions.markDraft")}
                      </button>
                    </div>
                  )}
                <PullMergePanel index={index!} />
              </section>
            )}
            {pull && (
              <PullReviewOverview
                issue={issue}
                canMerge={query.data.can_merge}
                mergeStyles={query.data.merge_styles}
                targetBranch={pull.base.name || pull.base.ref}
              />
            )}
            <div
              className={`flex items-center justify-between border-line ${pulls ? "mt-5 mb-5 border-0 pt-0" : "mt-6 mb-4 border-t pt-5"}`}
            >
              <h2 className={pulls ? "text-2xl font-semibold" : "text-base"}>
                {t("detail.activity")}
              </h2>
              <span className="text-xs text-muted flex items-center gap-1">
                <MessageSquare size={14} />
                {t("detail.comments", { count: issue.comments })}
              </span>
            </div>
            <div className="relative not-empty:before:absolute not-empty:before:inset-y-0 not-empty:before:left-4 not-empty:before:border-l not-empty:before:border-line">
              {comments.map((item) => (
                <DiscussionEntry
                  key={item.id}
                  item={item}
                  issue={issue}
                  data={query.data.lifecycle}
                  pulls={pulls}
                />
              ))}
            </div>
            <Pagination
              page={query.data.page ?? page}
              total={query.data.total_comments}
              size={50}
              onPage={(nextPage) => {
                const next = new URLSearchParams(params);
                next.set("page", String(nextPage));
                navigate({ search: next.toString(), hash: "" });
              }}
            />
            <Feedback error={comment.error} />
            {query.data.can_comment ? (
              <form
                id="discussion-comment-form"
                className={`workspace-form mt-5 ${pulls ? "relative ml-12 gap-3 max-md:ml-10" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  comment.mutate("");
                }}
              >
                {pulls && viewer && (
                  <img
                    className="absolute top-0 -left-12 size-8 rounded-full max-md:-left-10 max-md:size-7"
                    src={viewer.avatar}
                    alt=""
                  />
                )}
                <h3 className={pulls ? "sr-only" : undefined}>
                  {t("detail.addComment")}
                </h3>
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  label={t("detail.commentLabel")}
                  placeholder={t("detail.commentPlaceholder")}
                  rows={5}
                />
                {query.data.lifecycle?.attachments_enabled && (
                  <AttachmentPicker files={files} onChange={setFiles} />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="button primary"
                    disabled={
                      (!content.trim() && !files.length) || comment.isPending
                    }
                  >
                    {t("detail.comment")}
                  </button>
                  {query.data.can_change_status && (
                    <button
                      type="button"
                      className="button"
                      disabled={comment.isPending}
                      onClick={() =>
                        comment.mutate(
                          issue.state === "open" ? "close" : "reopen",
                        )
                      }
                    >
                      {pulls
                        ? issue.state === "open"
                          ? content.trim() || files.length
                            ? mergeText("mergeOptions.closeWithComment")
                            : mergeText("mergeOptions.closeRequest")
                          : content.trim() || files.length
                            ? mergeText("mergeOptions.reopenWithComment")
                            : mergeText("mergeOptions.reopenRequest")
                        : issue.state === "open"
                          ? t("detail.closeIssue")
                          : t("detail.reopenIssue")}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">
                {t("detail.commentsUnavailable")}
              </p>
            )}
          </div>
          <IssueMetadataPanel issue={issue} pulls={pulls}>
            <IssueExtraSidebar
              issue={issue}
              data={query.data.lifecycle}
              pulls={pulls}
            />
          </IssueMetadataPanel>
        </div>
      )}
    </div>
  );
}
