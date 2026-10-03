import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  GitBranch,
  ListChecks,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { uiRoute } from "./routes";
import { timelineDate, timelineDuration } from "./timelineFormat";

export interface IssueRowMetadata {
  target_branch?: string;
  status?: string;
  status_url?: string;
  approvals: number;
  changes_requested: number;
  overdue: boolean;
  tasks: number;
  tasks_done: number;
  tracked_time: number;
  project?: { title: string; url: string };
}

export function IssueRowDetails({
  details,
  dueDate,
}: {
  details?: IssueRowMetadata;
  dueDate?: string;
}) {
  const { t, i18n } = useTranslation("issues");
  const status = details?.status;
  const statusLabel = t(
    status === "success"
      ? "list.details.success"
      : status === "failure" || status === "error"
        ? "list.details.failure"
        : "list.details.pending",
  );
  const statusIcon =
    status === "success" ? (
      <CheckCircle2 size={14} className="text-success" />
    ) : status === "failure" || status === "error" ? (
      <XCircle size={14} className="text-danger" />
    ) : (
      <Circle size={14} className="text-muted" />
    );
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {status &&
        (details?.status_url ? (
          <a
            href={details.status_url}
            title={statusLabel}
            aria-label={statusLabel}
          >
            {statusIcon}
          </a>
        ) : (
          <span title={statusLabel} aria-label={statusLabel}>
            {statusIcon}
          </span>
        ))}
      {details?.target_branch && (
        <span
          className="inline-flex max-w-full items-center gap-1"
          title={t("list.details.targetBranch")}
        >
          <GitBranch size={13} className="shrink-0" />
          <span className="truncate">{details.target_branch}</span>
        </span>
      )}
      {!!details?.approvals && (
        <span>{t("list.details.approvals", { count: details.approvals })}</span>
      )}
      {!!details?.changes_requested && (
        <span className="text-danger">
          {t("list.details.changesRequested", {
            count: details.changes_requested,
          })}
        </span>
      )}
      {dueDate && (
        <span
          className={`inline-flex items-center gap-1 ${details?.overdue ? "text-danger" : ""}`}
          title={t(
            details?.overdue ? "list.details.overdue" : "list.details.due",
          )}
        >
          <CalendarClock size={13} />
          {timelineDate(dueDate.slice(0, 10), i18n.language)}
        </span>
      )}
      {!!details?.tasks && (
        <span className="inline-flex items-center gap-1">
          <ListChecks size={13} />
          {t("list.details.tasks", {
            done: details.tasks_done,
            total: details.tasks,
          })}
          <progress
            className="h-1.5 w-12 accent-primary"
            value={details.tasks_done}
            max={details.tasks}
            aria-label={t("list.details.tasks", {
              done: details.tasks_done,
              total: details.tasks,
            })}
          />
        </span>
      )}
      {details?.project && (
        <Link className="hover:underline" to={uiRoute(details.project.url)}>
          {details.project.title}
        </Link>
      )}
      {!!details?.tracked_time && (
        <span className="inline-flex items-center gap-1">
          <Clock size={13} />
          {t(
            "timeline.duration",
            timelineDuration(String(details.tracked_time))!,
          )}
        </span>
      )}
    </div>
  );
}
