import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  Bell,
  BookMarked,
  Check,
  ChevronDown,
  GitBranch,
  GitFork,
  Search,
} from "lucide-react";
import { native, nativeForm, type Repository } from "./api";
import { uiRoute } from "./routes";
import { CopyButton, Feedback, relativeDate } from "./UI";
import { escapeSegments } from "./RefSwitcher";

/** Repository fields the overlay adds for the code pages (native header/home). */
export interface RepositoryDetails extends Repository {
  website?: string;
  is_template?: boolean;
  is_mirror?: boolean;
  object_format?: string;
  feeds?: boolean;
  archive_downloads?: boolean;
  code_indexer?: boolean;
  upload_enabled?: boolean;
  can_report?: boolean;
  can_create_branch?: boolean;
  open_with?: { name: string; url: string }[];
  fork_parent?: { full_name: string };
  template_repo?: { full_name: string };
  mirror?: { address: string; updated_at?: string };
  external?: { issues?: string; wiki?: string };
}
export const repositoryDetails = (repository: Repository) =>
  repository as RepositoryDetails;

export const commitAvatarClass =
  "grid shrink-0 place-items-center rounded-full bg-[#e1e7fc] text-[11px] text-[#354a9a] dark:bg-[#333c64] dark:text-[#c1cef8]";

export const projectRoute = (fullName: string) =>
  `/projects/${fullName.split("/").map(encodeURIComponent).join("/")}`;

/** Native archive URL; a tree path makes it a directory archive. */
export const archiveUrl = (
  path: string,
  ref: string,
  format: "zip" | "tar.gz" | "bundle",
  directory = "",
) =>
  native(
    `${path}/archive/${escapeSegments(directory ? `${ref}:${directory}` : ref)}.${format}`,
  );

/** "Forked from", "Mirror of" and "Generated from" (native fork-flag lines). */
export function RepositoryOrigin({
  repository,
}: {
  repository: RepositoryDetails;
}) {
  const { t } = useTranslation("repository");
  const { fork_parent, template_repo, mirror } = repository;
  if (!fork_parent && !template_repo && !mirror) return null;
  return (
    <div className="repository-origin col-span-full -mt-2 mb-4 flex flex-col gap-0.5 text-sm text-muted">
      {mirror && (
        <p className="break-all">
          <Trans
            t={t}
            i18nKey={
              mirror.updated_at ? "origin.mirrorSynced" : "origin.mirror"
            }
            values={{
              address: mirror.address,
              date: relativeDate(mirror.updated_at),
            }}
            components={{
              anchor: /^https?:\/\//.test(mirror.address) ? (
                <a
                  className="text-primary hover:underline"
                  href={mirror.address}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ) : (
                <span />
              ),
            }}
          />
        </p>
      )}
      {fork_parent && (
        <p className="flex items-center gap-1">
          <GitFork size={14} className="shrink-0" />
          <Trans
            t={t}
            i18nKey="origin.forkedFrom"
            values={{ name: fork_parent.full_name }}
            components={{
              anchor: (
                <Link
                  className="text-primary hover:underline"
                  to={projectRoute(fork_parent.full_name)}
                />
              ),
            }}
          />
        </p>
      )}
      {template_repo && (
        <p className="flex items-center gap-1">
          <BookMarked size={14} className="shrink-0" />
          <Trans
            t={t}
            i18nKey="origin.generatedFrom"
            values={{ name: template_repo.full_name }}
            components={{
              anchor: (
                <Link
                  className="text-primary hover:underline"
                  to={projectRoute(template_repo.full_name)}
                />
              ),
            }}
          />
        </p>
      )}
    </div>
  );
}

export interface RecentBranch {
  name: string;
  branch: string;
  repository: string;
  commit_time: string;
  compare: string;
}
/** Native "You pushed to … recently" banners with a merge request link. */
export function RecentBranches({ items }: { items?: RecentBranch[] }) {
  const { t } = useTranslation("repository");
  if (!items?.length) return null;
  return (
    <div className="recent-branches col-span-full mb-4 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.name}
          className="flex flex-wrap items-center gap-3 rounded-md border border-[#91d4a8] bg-success-bg px-4 py-2.5 text-sm dark:border-[#24663b]"
        >
          <GitBranch size={16} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <Trans
              t={t}
              i18nKey="recentBranches.pushed"
              values={{ name: item.name, date: relativeDate(item.commit_time) }}
              components={{
                anchor: (
                  <Link
                    className="font-semibold hover:underline"
                    to={`${projectRoute(item.repository)}?${new URLSearchParams({ ref: item.branch })}`}
                  />
                ),
              }}
            />
          </span>
          <Link className="button primary" to={uiRoute(native(item.compare))}>
            {t("recentBranches.createMergeRequest")}
          </Link>
        </div>
      ))}
    </div>
  );
}

/**
 * The native watch dropdown: participate, watch everything or choose issues,
 * merge requests and releases; the count links to the watchers page.
 */
export function WatchMenu({
  path,
  watching,
  selection,
  count,
  signedIn,
  buttonClass,
}: {
  path: string;
  watching: boolean;
  selection: { issues: boolean; pulls: boolean; releases: boolean };
  count: number;
  signedIn: boolean;
  buttonClass: string;
}) {
  const { t } = useTranslation("repository");
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(selection);
  const all = selection.issues && selection.pulls && selection.releases;
  const mode = !watching ? "none" : all ? "all" : "custom";
  const save = useMutation({
    mutationFn: (next: "none" | "all" | typeof selection) =>
      nativeForm(
        `${path}/action/${next === "none" ? "unwatch" : next === "all" ? "watch" : "watch/select"}`,
        typeof next === "object"
          ? Object.fromEntries(
              (
                [
                  ["watch_issues", next.issues],
                  ["watch_pull_requests", next.pulls],
                  ["watch_releases", next.releases],
                ] as const
              )
                .filter(([, enabled]) => enabled)
                .map(([name]) => [name, "true"]),
            )
          : {},
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["repo-overview", path] });
      setOpen(false);
    },
  });
  const option = (
    value: "none" | "all",
    label: string,
    description: string,
  ) => (
    <button
      type="button"
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-hover disabled:opacity-60"
      disabled={save.isPending}
      onClick={() => save.mutate(value)}
    >
      <span className="mt-0.5 inline-flex w-4 shrink-0">
        {mode === value && <Check size={14} />}
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
  return (
    <span className="watch-menu inline-flex h-8 items-stretch overflow-hidden rounded-md border border-control dark:border-transparent">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setCustom(selection);
        }}
      >
        <Popover.Trigger
          className={`${buttonClass} rounded-none border-0`}
          disabled={!signedIn}
          aria-label={t("code.header.notificationSettings")}
          title={
            signedIn
              ? t("code.header.notificationSettings")
              : t("watch.signInHint")
          }
        >
          <Bell size={15} fill={watching ? "currentColor" : "none"} />
          <span className="max-md:sr-only">
            {t(watching ? "watch.watching" : "watch.watch")}
          </span>
          <ChevronDown size={12} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="dropdown-positioner"
            align="end"
            sideOffset={4}
            collisionPadding={12}
          >
            <Popover.Popup
              className="dropdown-popup w-72 p-1"
              aria-label={t("code.header.notifications")}
            >
              <p className="menu-group-label">
                {t("code.header.notifications")}
              </p>
              {option(
                "none",
                t("code.header.participate"),
                t("watch.participateHint"),
              )}
              {option(
                "all",
                t("code.header.watch"),
                t("code.header.watchHint"),
              )}
              <div className="mt-1 border-t border-line px-2 pt-2 pb-1">
                <span className="flex items-center gap-2 text-sm">
                  <span className="inline-flex w-4 shrink-0">
                    {mode === "custom" && <Check size={14} />}
                  </span>
                  {t("watch.custom")}
                </span>
                <fieldset className="mt-1 ml-6 flex flex-col gap-1 text-sm">
                  {(
                    [
                      ["issues", t("watch.issues")],
                      ["pulls", t("watch.pulls")],
                      ["releases", t("watch.releases")],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={custom[key]}
                        onChange={(event) =>
                          setCustom({ ...custom, [key]: event.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <span className="text-xs text-muted">
                    {t("watch.releasesHint")}
                  </span>
                </fieldset>
                <button
                  type="button"
                  className="button primary mt-2 ml-6"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate(
                      custom.issues || custom.pulls || custom.releases
                        ? custom
                        : "none",
                    )
                  }
                >
                  {t("watch.save")}
                </button>
              </div>
              <Feedback error={save.error} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Link
        to={`/projects${path}/watchers`}
        className="flex min-w-7 items-center justify-center border-l border-line px-2 text-sm hover:bg-hover dark:bg-[#48474d] dark:hover:bg-[#535258]"
        aria-label={t("watch.watchers", { count })}
        title={t("watch.watchers", { count })}
      >
        {count}
      </Link>
    </span>
  );
}

/** Native empty repository quick guide (repo/empty.tmpl). */
export function EmptyRepositoryGuide({
  repository,
}: {
  repository: RepositoryDetails;
}) {
  const { t } = useTranslation("repository");
  const url = repository.clone?.HTTPS || repository.clone?.SSH || "";
  if (!repository.permissions?.write_code)
    return (
      <div className="empty-repository rounded-md border border-line p-6 text-center text-sm text-muted">
        {t("emptyGuide.noAccess")}
      </div>
    );
  const branch = repository.default_branch;
  const create = [
    "touch README.md",
    `git init${repository.object_format === "sha256" ? " --object-format=sha256" : ""}`,
    ...(branch !== "master" ? [`git switch -c ${branch}`] : []),
    "git add README.md",
    'git commit -m "first commit"',
    `git remote add origin ${url}`,
    `git push -u origin ${branch}`,
  ].join("\n");
  const push = [
    `git remote add origin ${url}`,
    `git push -u origin ${branch}`,
  ].join("\n");
  const block = (title: string, code: string) => (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span title={t("emptyGuide.copy", { title })}>
          <CopyButton value={code} label={t("emptyGuide.copyCommands")} />
        </span>
      </div>
      <pre className="overflow-auto rounded-md bg-code p-3 font-mono text-[13px] leading-6">
        {code}
      </pre>
    </section>
  );
  return (
    <div className="empty-repository overflow-hidden rounded-md border border-line">
      <section className="px-5 py-4">
        <h2 className="text-base font-semibold">{t("emptyGuide.title")}</h2>
        <p className="mt-1 text-sm text-muted">
          <Trans
            t={t}
            i18nKey="emptyGuide.cloneHelp"
            components={{
              anchor: (
                <a
                  className="text-primary hover:underline"
                  href="https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          />
        </p>
        {!repository.archived && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              className="button"
              to={`new?${new URLSearchParams({ ref: branch, path: "" })}`}
            >
              {t("code.toolbar.newFile")}
            </Link>
            {repository.upload_enabled && (
              <Link
                className="button"
                to={`upload?${new URLSearchParams({ ref: branch, path: "" })}`}
              >
                {t("code.toolbar.uploadFiles")}
              </Link>
            )}
            {url && (
              <span className="flex min-w-0 flex-1 overflow-hidden rounded border border-input [&_.copy-icon]:h-auto">
                <input
                  className="w-full min-w-48 border-0 bg-code p-2 font-mono text-xs"
                  readOnly
                  aria-label={t("emptyGuide.cloneUrl")}
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <CopyButton
                  value={url}
                  label={t("emptyGuide.copyUrl")}
                  compact
                />
              </span>
            )}
          </div>
        )}
      </section>
      {!repository.archived && (
        <>
          {block(t("emptyGuide.newRepository"), create)}
          {block(t("emptyGuide.existingRepository"), push)}
        </>
      )}
    </div>
  );
}

/** The native code search bar of directory views. */
export function CodeSearchBar({
  path,
  directory,
  refName,
  refKind,
  indexed,
}: {
  path: string;
  directory: string;
  refName: string;
  refKind: string;
  indexed: boolean;
}) {
  const { t } = useTranslation("repository");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  return (
    <form
      className="code-search-bar mb-3 flex items-center gap-2"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        navigate(
          `/projects${path}/search?${new URLSearchParams({
            q: query.trim(),
            ...(directory ? { path: directory } : {}),
            ...(indexed ? {} : { ref: refName, type: refKind }),
          })}`,
        );
      }}
    >
      <label className="filter-input w-auto min-w-0 flex-1">
        <Search size={15} />
        <input
          aria-label={t("search.label")}
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <button className="button">{t("shared.search")}</button>
    </form>
  );
}
