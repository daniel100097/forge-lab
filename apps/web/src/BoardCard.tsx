import { Link } from "react-router-dom";
import { CheckSquare, CircleDot, GitMerge, Milestone } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Issue } from "./api";
import { IssueLabel } from "./UI";
import { uiRoute } from "./routes";
import type { BoardMove } from "./boardOrder";

export interface BoardIssue extends Issue {
  image?: string;
  image_name?: string;
  tasks?: number;
  tasks_done?: number;
  linked_pulls?: {
    id: number;
    number: number;
    title: string;
    url: string;
    state: string;
    merged: boolean;
  }[];
}

export function BoardCardContent({
  issue,
  cardType = 0,
}: {
  issue: BoardIssue;
  cardType?: number;
}) {
  const { t } = useTranslation("issues");
  const state = issue.pull_request?.merged
    ? "merged"
    : issue.state === "closed"
      ? "closed"
      : "open";
  const root = uiRoute(issue.html_url).replace(
    /\/(?:issues|merge-requests)\/\d+.*$/,
    "",
  );
  return (
    <>
      {cardType === 1 && issue.image && (
        <img
          src={issue.image}
          alt={issue.image_name || ""}
          loading="lazy"
          className="mb-2.5 max-h-40 w-full rounded object-cover"
        />
      )}
      <div className="flex items-start gap-1.5">
        {issue.pull_request ? (
          <GitMerge
            size={15}
            className={
              state === "merged"
                ? "shrink-0 text-merged"
                : state === "closed"
                  ? "shrink-0 text-danger"
                  : "shrink-0 text-success"
            }
          />
        ) : (
          <CircleDot
            size={15}
            className={
              state === "closed"
                ? "shrink-0 text-muted"
                : "shrink-0 text-success"
            }
          />
        )}
        <Link
          className="min-w-0 break-words text-sm leading-5 font-semibold hover:underline"
          to={uiRoute(issue.html_url)}
        >
          {issue.title}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {issue.pull_request ? "!" : "#"}
          {issue.number}
        </span>
        <span>{t(`boardParity.state.${state}`)}</span>
      </div>
      {issue.milestone && (
        <Link
          className="mt-2 flex items-center gap-1 text-xs hover:underline"
          to={`${root}/milestones/${(issue.milestone as { id?: number }).id || ""}`}
        >
          <Milestone size={13} />
          {issue.milestone.title}
        </Link>
      )}
      {issue.linked_pulls?.map((pull) => (
        <Link
          key={pull.id}
          className="mt-2 flex items-start gap-1 text-xs hover:underline"
          to={uiRoute(pull.url)}
        >
          <GitMerge
            size={13}
            className={
              pull.merged
                ? "shrink-0 text-merged"
                : pull.state === "closed"
                  ? "shrink-0 text-danger"
                  : "shrink-0 text-success"
            }
          />
          <span className="min-w-0 break-words">
            {pull.title} !{pull.number}
          </span>
        </Link>
      ))}
      {!!issue.tasks && (
        <span className="mt-2 flex items-center gap-1 text-xs text-muted">
          <CheckSquare size={13} />
          {t("boardParity.tasks", {
            done: issue.tasks_done || 0,
            total: issue.tasks,
          })}
        </span>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {issue.labels?.map((label) => (
          <IssueLabel key={label.id} name={label.name} color={label.color} />
        ))}
        <div className="ml-auto flex -space-x-1">
          {issue.assignees?.map((user) => (
            <Link
              key={user.login}
              to={`/users/${encodeURIComponent(user.login)}`}
              title={t("boardParity.assignedTo", { name: user.login })}
            >
              {user.avatar_url ? (
                <img
                  className="size-6 rounded-full border border-surface"
                  src={user.avatar_url}
                  alt={user.login}
                />
              ) : (
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-canvas text-xs">
                  {user.login.slice(0, 1)}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export function BoardCardOrder({
  issue,
  column,
  onMove,
  disabled,
}: {
  issue: number;
  column: { id: number; issues: { id: number; title: string }[] };
  onMove: (move: BoardMove) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("issues");
  const index = column.issues.findIndex((card) => card.id === issue);
  return (
    <div className="mt-2 flex gap-1">
      <button
        className="button small"
        type="button"
        disabled={disabled || index <= 0}
        onClick={() =>
          onMove({
            issue,
            column: column.id,
            before: column.issues[index - 1].id,
          })
        }
      >
        {t("boardParity.moveUp")}
      </button>
      <button
        className="button small"
        type="button"
        disabled={disabled || index < 0 || index >= column.issues.length - 1}
        onClick={() =>
          onMove({
            issue,
            column: column.id,
            before: column.issues[index + 2]?.id,
          })
        }
      >
        {t("boardParity.moveDown")}
      </button>
    </div>
  );
}
