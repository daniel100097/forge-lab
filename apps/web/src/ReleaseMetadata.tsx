import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { escapeSegments } from "./RefSwitcher";

export interface ReleaseMetadataData {
  archive_download_count?: { zip: number; tar_gz: number };
  draft: boolean;
  prerelease: boolean;
  author?: { login: string; avatar_url: string; full_name: string };
  sha?: string;
  target?: string;
  commits_since?: number;
  status?: string;
  signature?: { verified: boolean; reason: string };
}

export function ReleaseMetadata({
  release,
  path,
}: {
  release: ReleaseMetadataData;
  path: string;
}) {
  const { t } = useTranslation("repository");
  const statuses: Record<string, string> = {
    success: t("releases.status.success"),
    pending: t("releases.status.pending"),
    failure: t("releases.status.failure"),
    error: t("releases.status.error"),
    warning: t("releases.status.warning"),
  };
  return (
    <div className="my-3 flex flex-wrap items-center gap-3 text-sm text-muted">
      {!release.draft && !release.prerelease && (
        <span className="badge bg-success-bg text-success">
          {t("releases.stable")}
        </span>
      )}
      {release.author && (
        <Link
          className="inline-flex items-center gap-2 text-primary"
          to={`/users/${encodeURIComponent(release.author.login)}`}
        >
          <img
            className="size-5 rounded-full"
            alt=""
            src={release.author.avatar_url}
          />
          {release.author.full_name || release.author.login}
        </Link>
      )}
      {release.sha && (
        <Link
          className="text-primary"
          to={`/projects${path}/commits/${release.sha}`}
        >
          <code>{release.sha.slice(0, 8)}</code>
        </Link>
      )}
      {!!release.commits_since && release.target && (
        <Link
          className="text-primary"
          to={`/projects${path}/compare/${release.sha}...${escapeSegments(release.target)}`}
        >
          {t("releases.commitsSince", {
            count: release.commits_since,
            branch: release.target,
          })}
        </Link>
      )}
      {release.status && (
        <span className="badge">
          {t("releases.ciStatus", {
            status: statuses[release.status] || release.status,
          })}
        </span>
      )}
      {release.signature && (
        <span
          className={release.signature.verified ? "text-success" : "text-muted"}
        >
          {release.signature.reason}
        </span>
      )}
    </div>
  );
}
