import { useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  GitBranch,
  GitPullRequest,
  MessageCircle,
  CircleDot,
  Tag,
  Globe,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  Star,
  Users,
} from "lucide-react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { native, nativeForm, nativePage } from "./api";
import {
  EmptyState,
  Feedback,
  Markdown,
  Pagination,
  Pending,
  pageClass,
  pageHeadingClass,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { ActionMenu, MenuAction, MenuLink } from "./ActionMenu";

export const workspaceSearchClass = "my-5 flex items-end gap-3";
// Search and add forms placed directly in the organization frame.
const organizationSearchClass =
  "my-4 flex min-w-0 flex-wrap items-end gap-3 border-y border-line bg-surface-subtle p-4";
export const fieldInputClass =
  "w-full min-w-0 rounded border border-input bg-surface px-3 py-2 text-sm";
// Labelled fields inside the organization frame.
export const organizationFieldClass =
  "mb-4 flex min-w-0 flex-col gap-2 text-sm font-semibold";
export const formPanelClass =
  "mt-4 max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4";
export const narrowPageClass =
  "w-full max-w-[900px] pt-2 pr-7 pb-8 pl-3 max-md:px-3 max-md:pt-3 max-md:pb-6";
export const actionsClass = "flex flex-wrap items-center gap-2";
const headingTitleClass = "max-md:text-[22px]";
const membersClass = "organization-members divide-y divide-line";
const memberRowClass = "flex items-center gap-3 py-4 max-md:flex-wrap";
const memberLinkClass = "text-sm font-semibold hover:underline";
const memberTextClass = "mt-1 text-sm text-muted";

interface Person {
  id: number;
  name: string;
  full_name: string;
  avatar?: string;
  description: string;
  location?: string;
  website?: string;
  pronouns?: string;
  created_at?: string;
  organization?: boolean;
  visibility?: number;
}
interface Project {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  stars: number;
  forks: number;
  updated_at: string;
}
interface Team {
  id: number;
  name: string;
  description: string;
  permission: string;
  all_repositories: boolean;
  can_create_repositories: boolean;
  members_count: number;
  repositories_count: number;
  owner_team: boolean;
  is_member?: boolean;
  units: Record<string, number>;
  members: Person[];
  repositories: Project[];
}
export interface WorkspaceData {
  settings_features?: import("./organizationNavigation").OrganizationSettingsFeatures;
  kind: string;
  description_html?: string;
  readme_html?: string;
  viewer_admin?: boolean;
  federation_enabled?: boolean;
  feeds_enabled?: boolean;
  packages_enabled?: boolean;
  email?: string;
  open_ids?: { uri: string }[];
  organizations?: Person[];
  badges?: { image: string; description: string }[];
  federated_activity?: {
    id: number;
    actor: string;
    html: string;
    source: string;
    created_at: string;
  }[];
  profile?: Person;
  viewer_id?: number;
  items: Project[];
  people: Person[];
  teams: Team[];
  team?: Team;
  page: number;
  page_size: number;
  total: number;
  tab?: string;
  followers?: number;
  following?: number;
  is_following?: boolean;
  is_blocked?: boolean;
  readme?: string;
  is_owner?: boolean;
  is_member?: boolean;
  is_team_member?: boolean;
  moderation_enabled?: boolean;
  email_invites?: boolean;
  invites?: { id: number; email: string; user?: Person; created_at: string }[];
  visibility?: number;
  public_members?: Record<string, boolean>;
  owner_members?: Record<string, boolean>;
  members_two_factor?: Record<string, boolean>;
  invite_required?: boolean;
  available_units: { id: number; name: string; readonly: boolean }[];
  settings?: {
    name: string;
    full_name: string;
    email: string;
    description: string;
    website: string;
    location: string;
    visibility: number;
    repo_admin_change_team_access: boolean;
    max_repo_creation: number;
  };
  heatmap?: { timestamp: number; contributions: number }[];
  contributions?: number;
  activity?: {
    id: number;
    type: number;
    repository: string;
    ref: string;
    content: string;
    created_at: string;
  }[];
}
import { WorkspaceRepoFilters } from "./WorkspaceRepoFilters";
import { WorkspacePeopleSort } from "./WorkspacePeopleSort";
import { WorkspaceNativeMenuLink } from "./WorkspaceNativeMenuLink";
import { WorkspaceUserInput } from "./WorkspaceUserInput";
const encode = encodeURIComponent;
const projectRoute = (name: string) =>
  `/projects/${name.split("/").map(encode).join("/")}`;
const validWebsite = (value?: string) => value && /^https?:\/\//i.test(value);
function Avatar({
  person,
  className = "size-12 rounded-full",
}: {
  person: Person;
  className?: string;
}) {
  return person.avatar ? (
    <img
      className={`shrink-0 object-cover ${className}`}
      src={person.avatar}
      alt=""
    />
  ) : (
    <span
      className={`project-avatar color-${person.id % 5} shrink-0 object-cover ${className}`}
    >
      {person.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function ProjectRows({ projects }: { projects: Project[] }) {
  const { t } = useTranslation("workspace");
  return projects?.length ? (
    <div className="repo-list border-t border-line">
      {projects.map((project) => (
        <Link
          to={projectRoute(project.full_name)}
          className="repo-row flex min-h-16 items-center gap-2 border-b border-line px-4 py-3 hover:bg-[#fafafa] max-md:gap-3 dark:hover:bg-hover"
          key={project.id}
        >
          <span
            className={`project-avatar color-${project.id % 5} size-8 rounded text-lg font-normal`}
          >
            {project.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-semibold text-heading">
              <span className="truncate">{project.full_name}</span>
              {project.private && (
                <LockKeyhole
                  size={13}
                  aria-label={t("shared.private")}
                  className="shrink-0 text-muted"
                />
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {project.description}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
            <Star size={14} />
            {project.stars}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs whitespace-nowrap text-muted max-md:hidden">
            {t("shared.updated", { date: relativeDate(project.updated_at) })}
          </span>
        </Link>
      ))}
    </div>
  ) : (
    <EmptyState title={t("profile.noProjects")} />
  );
}
function PeopleRows({ people }: { people: Person[] }) {
  const { t } = useTranslation("workspace");
  return people?.length ? (
    <div className="workspace-people divide-y divide-line">
      {people.map((person) => (
        <Link
          className="flex items-center gap-4 py-5"
          to={`/users/${encode(person.name)}`}
          key={person.id}
        >
          <Avatar person={person} />
          <div>
            <strong>{person.full_name || person.name}</strong>
            <p className="mt-1 text-sm text-muted">@{person.name}</p>
            {person.description && (
              <p className="mt-1 text-sm text-muted">{person.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  ) : (
    <EmptyState title={t("users.empty")} />
  );
}
function SearchForm({
  label,
  placeholder,
  value,
  onSearch,
  className = workspaceSearchClass,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSearch: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("workspace");
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(String(new FormData(event.currentTarget).get("q") || ""));
      }}
    >
      <label className="filter-input flex-1">
        <Search size={16} />
        <input
          name="q"
          aria-label={label}
          placeholder={placeholder}
          defaultValue={value}
        />
      </label>
      <button className="button">{t("shared.search")}</button>
    </form>
  );
}
export function UsersDirectoryPage() {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page")) || 1,
    q = params.get("q") || "";
  const query = useQuery({
    queryKey: ["users-directory", params.toString()],
    queryFn: ({ signal }) =>
      nativePage<{ items: Person[]; total: number; page_size: number }>(
        `/explore/users?${new URLSearchParams({ ...Object.fromEntries(params), q, page: String(page) })}`,
        signal,
      ),
  });
  useTitle(t("users.title"));
  return (
    <section className={pageClass}>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("users.title")}</h1>
        <Link className="button" to="/organizations">
          {t("shared.organizations")}
        </Link>
      </div>
      <SearchForm
        label={t("users.search")}
        placeholder={t("users.searchPlaceholder")}
        value={q}
        onSearch={(value) =>
          setParams({ ...Object.fromEntries(params), q: value, page: "1" })
        }
      />
      <WorkspacePeopleSort />
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <PeopleRows people={query.data.items} />
            <Pagination
              page={page}
              size={query.data.page_size}
              total={query.data.total}
              onPage={(value) =>
                setParams({
                  ...Object.fromEntries(params),
                  q,
                  page: String(value),
                })
              }
            />
          </>
        )
      )}
    </section>
  );
}
// Forgejo action types and their feed sentences. Sentences with an issue or
// reference slot place it themselves; other types append it when present.
const activityEvents: Record<
  number,
  { key: ActivityEvent; issue?: boolean; ref?: boolean }
> = {
  1: { key: "createdProject" },
  2: { key: "renamedProject" },
  3: { key: "starred" },
  4: { key: "startedWatching" },
  5: { key: "pushedCommits", ref: true },
  6: { key: "openedIssue", issue: true },
  7: { key: "openedMergeRequest", issue: true },
  8: { key: "transferred" },
  9: { key: "createdTag", ref: true },
  10: { key: "commented", issue: true },
  11: { key: "mergedMergeRequest", issue: true },
  12: { key: "closedIssue", issue: true },
  13: { key: "reopenedIssue", issue: true },
  14: { key: "closedMergeRequest", issue: true },
  15: { key: "reopenedMergeRequest", issue: true },
  16: { key: "deletedTag", ref: true },
  17: { key: "deletedBranch", ref: true },
  18: { key: "syncedMirror", ref: true },
  19: { key: "createdMirrorBranch", ref: true },
  20: { key: "deletedMirrorBranch", ref: true },
  21: { key: "approvedMergeRequest", issue: true },
  22: { key: "requestedChanges", issue: true },
  23: { key: "commentedMergeRequest", issue: true },
  24: { key: "publishedRelease", ref: true },
  25: { key: "dismissedReview", issue: true },
  26: { key: "markedReady", issue: true },
  27: { key: "enabledAutoMerge", issue: true },
};
type ActivityEvent =
  | "createdProject"
  | "renamedProject"
  | "starred"
  | "startedWatching"
  | "pushedCommits"
  | "openedIssue"
  | "openedMergeRequest"
  | "transferred"
  | "createdTag"
  | "commented"
  | "mergedMergeRequest"
  | "closedIssue"
  | "reopenedIssue"
  | "closedMergeRequest"
  | "reopenedMergeRequest"
  | "deletedTag"
  | "deletedBranch"
  | "syncedMirror"
  | "createdMirrorBranch"
  | "deletedMirrorBranch"
  | "approvedMergeRequest"
  | "requestedChanges"
  | "commentedMergeRequest"
  | "publishedRelease"
  | "dismissedReview"
  | "markedReady"
  | "enabledAutoMerge"
  | "updated";
export function ContributionGrid({
  entries,
  total,
  onDate,
}: {
  onDate?: (date: string) => void;
  entries: NonNullable<WorkspaceData["heatmap"]>;
  total: number;
}) {
  const { t } = useTranslation("workspace");
  const days = new Map<string, number>();
  entries.forEach((entry) => {
    const key = new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
    days.set(key, (days.get(key) || 0) + entry.contributions);
  });
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 370);
  return (
    <section className="my-5 overflow-auto rounded-md border border-line p-4">
      <h2 className="mb-4 text-sm font-semibold">
        {t("activity.contributions", { count: total })}
      </h2>
      <div className="grid min-w-[640px] grid-flow-col grid-cols-[repeat(53,minmax(0,1fr))] grid-rows-7 gap-1">
        {Array.from({ length: 371 }, (_, index) => {
          const date = new Date(start);
          date.setUTCDate(date.getUTCDate() + index);
          const key = date.toISOString().slice(0, 10),
            count = days.get(key) || 0;
          return (
            <button
              type="button"
              onClick={() => onDate?.(key)}
              className="aspect-square rounded-xs bg-hover data-[level=1]:bg-[#acd5ad] data-[level=2]:bg-[#74b976] data-[level=3]:bg-[#488f4b] data-[level=4]:bg-[#25662b]"
              key={key}
              tabIndex={0}
              title={t("activity.dayContributions", { date: key, count })}
              aria-label={t("activity.dayContributions", { date: key, count })}
              data-level={
                count === 0 ? 0 : Math.min(4, Math.ceil(Math.log2(count + 1)))
              }
            />
          );
        })}
      </div>
    </section>
  );
}
export function PublicProfilePage() {
  const { t, i18n } = useTranslation("workspace");
  const { username = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const tab = params.get("tab") || "overview",
    page = Number(params.get("page")) || 1,
    q = params.get("q") || "";
  const query = useQuery({
    queryKey: ["public-profile", username, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(
        `/${encode(username)}?${new URLSearchParams({ ...Object.fromEntries(params), tab, q, page: String(page) })}`,
        signal,
      ),
  });
  const overviewActivity = useQuery({
    queryKey: ["public-profile", username, "activity", 1, ""],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(`/${encode(username)}?tab=activity`, signal),
    enabled: tab === "overview",
  });
  const action = useMutation({
    mutationFn: (value: string) =>
      nativeForm(`/${encode(username)}`, { action: value }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["public-profile", username] }),
  });
  useTitle(username);
  if (query.isPending)
    return (
      <section className={pageClass}>
        <Pending />
      </section>
    );
  if (query.error || !query.data.profile)
    return (
      <section className={pageClass}>
        <Feedback error={query.error} />
      </section>
    );
  const data = query.data,
    user = data.profile!;
  if (user.organization || data.kind === "org")
    return (
      <Navigate
        to={`/organizations/${encode(user.name)}${window.location.search}`}
        replace
      />
    );
  const tabs = [
    ["overview", t("profile.tabs.overview")],
    ["activity", t("profile.tabs.activity")],
    ["repositories", t("profile.tabs.repositories")],
    ["stars", t("profile.tabs.stars")],
    ["watching", t("profile.tabs.watching")],
    ["followers", t("profile.tabs.followers")],
    ["following", t("profile.tabs.following")],
    ...(data.federation_enabled && data.viewer_id === user.id
      ? [["feed", t("profile.tabs.feed")]]
      : []),
  ];
  return (
    <section className="mx-auto grid w-full max-w-[1312px] grid-cols-[minmax(0,1fr)_290px] gap-x-8 gap-y-6 pt-8 pr-7 pb-8 pl-3 max-md:grid-cols-1 max-md:gap-5 max-md:px-3 max-md:pb-6">
      <header className="col-span-2 flex items-center gap-5 max-md:col-span-1 max-md:flex-wrap">
        <Avatar
          person={user}
          className="size-[88px] rounded-full text-3xl max-md:size-16"
        />
        <div className="min-w-0 flex-1 max-md:basis-[calc(100%-84px)]">
          <h1 className="text-[28px] leading-9 font-semibold wrap-anywhere">
            {user.full_name || user.name}
          </h1>
          <p className="profile-username mt-0.5 text-lg text-muted">
            @{user.name}
            {user.pronouns && <> · {user.pronouns}</>}
          </p>
        </div>
        <ActionMenu label={t("profile.actions")} trigger={t("profile.more")}>
          <WorkspaceNativeMenuLink href={native(`/${encode(username)}.keys`)}>
            {t("profile.keys")}
          </WorkspaceNativeMenuLink>
          <WorkspaceNativeMenuLink href={native(`/${encode(username)}.gpg`)}>
            {t("profile.gpg")}
          </WorkspaceNativeMenuLink>
          {data.feeds_enabled && (
            <>
              <WorkspaceNativeMenuLink
                href={native(`/${encode(username)}.rss`)}
              >
                {t("profile.rss")}
              </WorkspaceNativeMenuLink>
              <WorkspaceNativeMenuLink
                href={native(`/${encode(username)}.atom`)}
              >
                {t("profile.atom")}
              </WorkspaceNativeMenuLink>
            </>
          )}
          {data.viewer_admin && (
            <MenuLink to={`/admin/users/${user.id}`}>
              {t("profile.adminDetails")}
            </MenuLink>
          )}
          {data.viewer_id && data.viewer_id !== user.id && (
            <>
              {data.moderation_enabled && (
                <MenuLink
                  to={`/report-abuse?${new URLSearchParams({ type: "user", id: String(user.id) })}`}
                >
                  {t("profile.reportAbuse")}
                </MenuLink>
              )}
              <MenuAction
                onClick={() => {
                  if (
                    window.confirm(
                      data.is_blocked
                        ? t("profile.confirmUnblock", { name: user.name })
                        : t("profile.confirmBlock", { name: user.name }),
                    )
                  )
                    action.mutate(data.is_blocked ? "unblock" : "block");
                }}
              >
                {data.is_blocked
                  ? t("profile.unblockUser")
                  : t("profile.blockUser")}
              </MenuAction>
            </>
          )}
        </ActionMenu>
        {data.viewer_id === user.id ? (
          <Link className="button" to="/account">
            {t("profile.edit")}
          </Link>
        ) : (
          data.viewer_id && (
            <div className={actionsClass}>
              <button
                className="button"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(data.is_following ? "unfollow" : "follow")
                }
              >
                {data.is_following
                  ? t("profile.unfollow")
                  : t("profile.follow")}
              </button>
            </div>
          )
        )}
      </header>
      <aside className="col-start-2 row-start-2 pt-1 text-sm max-md:col-start-1 max-md:row-start-3 max-md:border-t max-md:border-line max-md:pt-5 [&_.markdown]:text-sm [&_.markdown]:leading-5 [&_section+section]:mt-6">
        <Feedback error={action.error} />
        {user.description && (
          <section>
            <h2 className="mb-1 text-sm font-semibold">{t("profile.about")}</h2>
            <Markdown html={data.description_html}>{user.description}</Markdown>
          </section>
        )}
        {data.email && (
          <p>
            <a className="break-all text-primary" href={`mailto:${data.email}`}>
              {data.email}
            </a>
          </p>
        )}
        {!!data.open_ids?.length && (
          <section>
            <h2>{t("profile.openIDs")}</h2>
            {data.open_ids.map((identity) => (
              <p key={identity.uri}>
                <a
                  className="break-all text-primary"
                  href={identity.uri}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {identity.uri}
                </a>
              </p>
            ))}
          </section>
        )}
        {!!data.organizations?.length && (
          <section>
            <h2>{t("shared.organizations")}</h2>
            {data.organizations.map((organization) => (
              <p key={organization.id}>
                <Link to={`/organizations/${encode(organization.name)}`}>
                  {organization.full_name || organization.name}
                </Link>
              </p>
            ))}
          </section>
        )}
        {!!data.badges?.length && (
          <section>
            <h2>{t("profile.badges")}</h2>
            <div className="flex flex-wrap gap-2">
              {data.badges.map((badge) => (
                <img
                  key={badge.image}
                  src={badge.image}
                  alt={badge.description}
                  title={badge.description}
                  width={64}
                  height={64}
                />
              ))}
            </div>
          </section>
        )}
        {data.packages_enabled && (
          <Link className="button" to={`/users/${encode(username)}/packages`}>
            {t("profile.packages")}
          </Link>
        )}
        <section>
          <h2 className="mb-1 text-sm font-semibold">{t("profile.info")}</h2>
          <div className="space-y-2 text-sm text-muted">
            {user.location && (
              <span className="flex items-center gap-2 break-all">
                <MapPin size={15} className="shrink-0" />
                {user.location}
              </span>
            )}
            {validWebsite(user.website) && (
              <a
                className="flex items-center gap-2 break-all text-primary hover:underline"
                href={user.website}
                target="_blank"
                rel="noreferrer"
              >
                <Globe size={15} className="shrink-0" />
                {user.website}
              </a>
            )}
            {user.created_at && (
              <span className="flex items-center gap-2 break-all">
                <Calendar size={15} className="shrink-0" />
                {t("profile.joined", {
                  date: new Date(user.created_at).toLocaleDateString(
                    i18n.language,
                    { month: "long", year: "numeric" },
                  ),
                })}
              </span>
            )}
            <span className="flex items-center gap-2 break-all">
              <Users size={15} className="shrink-0" />
              {t("profile.followers", { count: data.followers || 0 })} ·{" "}
              {t("profile.following", { count: data.following || 0 })}
            </span>
          </div>
        </section>
      </aside>
      <div className="col-start-1 row-start-2 min-w-0">
        <nav
          className="tabs mb-5 overflow-auto md:hidden"
          aria-label={t("profile.sections")}
        >
          {tabs.map(([value, label]) => (
            <button
              key={value}
              className={
                tab === value ? "active whitespace-nowrap" : "whitespace-nowrap"
              }
              onClick={() => setParams({ tab: value })}
            >
              {label}
            </button>
          ))}
          <Link to={`/users/${encode(username)}/boards`}>
            {t("shared.issueBoards")}
          </Link>
        </nav>
        {["repositories", "stars", "watching"].includes(tab) && (
          <SearchForm
            label={t("profile.searchProjects")}
            placeholder={t("profile.searchProjectsPlaceholder")}
            value={q}
            onSearch={(value) =>
              setParams({
                ...Object.fromEntries(params),
                tab,
                q: value,
                page: "1",
              })
            }
          />
        )}
        {["repositories", "stars", "watching"].includes(tab) && (
          <WorkspaceRepoFilters />
        )}
        {tab === "feed" ? (
          data.federated_activity?.length ? (
            data.federated_activity.map((entry) => (
              <article className="border-b border-line py-4" key={entry.id}>
                <a className="break-all text-primary" href={entry.actor}>
                  {entry.actor}
                </a>
                <Markdown html={entry.html}>{""}</Markdown>
                {entry.source && (
                  <a href={entry.source}>{t("profile.originalSource")}</a>
                )}
              </article>
            ))
          ) : (
            <EmptyState title={t("profile.feedEmpty")} />
          )
        ) : ["overview", "activity"].includes(tab) ? (
          <>
            {tab === "overview" && data.readme && (
              <div className="my-5 rounded-md border border-line p-6">
                <Markdown html={data.readme_html}>{data.readme}</Markdown>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {t("profile.tabs.activity")}
              </h2>
              {tab === "overview" && (
                <button onClick={() => setParams({ tab: "activity" })}>
                  {t("profile.viewAll")}
                </button>
              )}
            </div>
            {tab === "overview" && <Feedback error={overviewActivity.error} />}
            {tab === "overview" && overviewActivity.isPending ? (
              <Pending />
            ) : (
              <>
                {(tab === "overview" ? overviewActivity.data : data)
                  ?.heatmap && (
                  <ContributionGrid
                    onDate={(date) => setParams({ tab: "activity", date })}
                    entries={
                      (tab === "overview" ? overviewActivity.data : data)
                        ?.heatmap || []
                    }
                    total={
                      (tab === "overview" ? overviewActivity.data : data)
                        ?.contributions || 0
                    }
                  />
                )}
                <ProfileActivity
                  items={
                    (tab === "overview" ? overviewActivity.data : data)
                      ?.activity || []
                  }
                />
              </>
            )}
          </>
        ) : ["followers", "following"].includes(tab) ? (
          <PeopleRows people={data.people} />
        ) : (
          <ProjectRows projects={data.items} />
        )}
        <Pagination
          page={page}
          size={data.page_size}
          total={tab === "overview" ? 0 : data.total || 0}
          onPage={(value) =>
            setParams({
              ...Object.fromEntries(params),
              tab,
              q,
              page: String(value),
            })
          }
        />
      </div>
    </section>
  );
}

export function ProfileActivity({
  items,
}: {
  items: (NonNullable<WorkspaceData["activity"]>[number] & {
    actor?: string;
  })[];
}) {
  const { t } = useTranslation("workspace");
  return (
    <div className="profile-activity">
      {items.length ? (
        items.map((item) => {
          let details: unknown;
          try {
            details = JSON.parse(item.content);
          } catch {
            details = item.content.match(/^(\d+)\|(.+)$/s)?.slice(1);
          }
          const issueDetails =
            Array.isArray(details) && /^\d+$/.test(String(details[0]))
              ? details
              : null;
          const pull = [7, 11, 14, 15, 21, 22, 23, 25, 26, 27].includes(
            item.type,
          );
          const issueType = pull ? "merge-requests" : "issues";
          const Icon = [10, 23].includes(item.type)
            ? MessageCircle
            : pull
              ? GitPullRequest
              : [6, 12, 13].includes(item.type)
                ? CircleDot
                : [9, 16, 24].includes(item.type)
                  ? Tag
                  : GitBranch;
          const push =
            details &&
            typeof details === "object" &&
            "Commits" in details &&
            Array.isArray(details.Commits)
              ? (details.Commits.slice(0, 3) as {
                  Sha1: string;
                  Message: string;
                }[])
              : [];
          const event = activityEvents[item.type] || { key: "updated" };
          const ref = (item.ref || "").replace(/^refs\/(heads|tags)\//, "");
          const issueLink = issueDetails && (
            <Link
              className={activityLinkClass}
              to={`${projectRoute(item.repository)}/${issueType}/${issueDetails[0]}`}
            >
              {`${pull ? "!" : "#"}${issueDetails[0]}`}
            </Link>
          );
          const refCode = item.ref && <code>{ref}</code>;
          return (
            <article
              className="relative flex items-start gap-3 py-3 text-sm before:absolute before:top-7 before:bottom-0 before:left-2 before:border-l before:border-line before:content-[''] last:before:hidden max-md:flex-wrap"
              key={item.id}
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p>
                  {/* User text is passed as component children so it is
                      never parsed as translation markup. */}
                  <Trans
                    t={t}
                    i18nKey={`activity.events.${event.key}.${item.actor ? "actor" : "self"}`}
                    components={{
                      actor: (
                        <Link
                          className={activityLinkClass}
                          to={`/users/${encode(item.actor || "")}`}
                        >
                          {item.actor}
                        </Link>
                      ),
                      repo: (
                        <Link
                          className={activityLinkClass}
                          to={projectRoute(item.repository)}
                        >
                          {item.repository}
                        </Link>
                      ),
                      issue: <>{event.issue && issueLink}</>,
                      ref: <>{event.ref && refCode}</>,
                    }}
                  />
                  {!event.issue && issueLink && <> {issueLink}</>}
                  {!event.ref && refCode && <> · {refCode}</>}
                </p>
                {issueDetails?.[1] && (
                  <p className="mt-1">
                    {String(issueDetails[1]).slice(0, 240)}
                  </p>
                )}
                {push.map((commit) => (
                  <p key={commit.Sha1} className="mt-1">
                    <Link
                      className={activityLinkClass}
                      to={`${projectRoute(item.repository)}/commit/${commit.Sha1}`}
                    >
                      <code>{commit.Sha1.slice(0, 8)}</code>
                    </Link>{" "}
                    {commit.Message.split("\n")[0]}
                  </p>
                ))}
              </div>
              <time
                className="shrink-0 text-xs text-muted max-md:ml-7"
                dateTime={item.created_at}
              >
                {relativeDate(item.created_at)}
              </time>
            </article>
          );
        })
      ) : (
        <EmptyState title={t("activity.empty")} />
      )}
    </div>
  );
}

const activityLinkClass = "text-primary underline hover:no-underline";
// Team permissions come from Forgejo; unknown values are shown as is.
const permissionLabel = (t: TFunction<"workspace">, permission: string) =>
  permission === "none" ||
  permission === "read" ||
  permission === "write" ||
  permission === "admin" ||
  permission === "owner"
    ? t(`organization.teams.permission.${permission}`)
    : permission;
const visibilityOptions = (t: TFunction<"workspace">) => [
  {
    value: "0",
    label: t("organization.visibility.public"),
    description: t("organization.visibility.publicDescription"),
  },
  {
    value: "1",
    label: t("organization.visibility.limited"),
    description: t("organization.visibility.limitedDescription"),
  },
  {
    value: "2",
    label: t("organization.visibility.private"),
    description: t("organization.visibility.privateDescription"),
  },
];
export function NewOrganizationPage() {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["new-organization"],
    queryFn: ({ signal }) => nativePage<WorkspaceData>("/org/create", signal),
  });
  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      nativeForm("/org/create", values),
    onSuccess: (_result, values) =>
      navigate(`/organizations/${encode(values.org_name)}`),
  });
  useTitle(t("organization.new.title"));
  return (
    <section className={narrowPageClass}>
      <div className={pageHeadingClass}>
        <h1 className={headingTitleClass}>{t("organization.new.title")}</h1>
      </div>
      <p className="text-sm text-muted mb-5">
        {t("organization.new.description")}
      </p>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(
                Object.fromEntries(new FormData(event.currentTarget)) as Record<
                  string,
                  string
                >,
              );
            }}
          >
            <div className={`${formPanelClass} flex flex-col gap-4`}>
              <label>
                {t("organization.name")}
                <input name="org_name" required maxLength={40} autoFocus />
              </label>
              <label>
                {t("shared.visibility")}
                <SelectControl
                  label={t("organization.visibility.label")}
                  name="visibility"
                  defaultValue={String(query.data.visibility || 0)}
                  options={visibilityOptions(t)}
                />
              </label>
              <label className="check-field">
                <input
                  name="repo_admin_change_team_access"
                  type="checkbox"
                  defaultChecked
                />
                {t("organization.allowTeamAccessChange")}
              </label>
            </div>
            <Feedback error={save.error} />
            <div className={`mt-5 ${actionsClass}`}>
              <button className="button primary" disabled={save.isPending}>
                {save.isPending
                  ? t("organization.new.creating")
                  : t("organization.new.create")}
              </button>
              <Link className="button" to="/organizations">
                {t("shared.cancel")}
              </Link>
            </div>
          </form>
        )
      )}
    </section>
  );
}
export function OrganizationFrame({
  data,
  selected,
  children,
}: {
  data: WorkspaceData;
  selected: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("workspace");
  const client = useQueryClient();
  const follow = useMutation({
    mutationFn: () =>
      nativeForm(`/${encode(org)}`, {
        action: data.is_following ? "unfollow" : "follow",
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["organization"] }),
  });
  const { org = "" } = useParams(),
    root = `/organizations/${encode(org)}`;
  const tabs = [
    ["", t("shared.projects")],
    ["boards", t("shared.issueBoards")],
    ["members", t("shared.members")],
    ...(data.is_member ? [["teams", t("organization.teams.title")]] : []),
    ...(data.is_owner ? [["settings", t("organization.settings.title")]] : []),
  ];
  return (
    <section className="mx-auto [&_h2:not(summary_*)]:text-xl [&_h2:not(summary_*)]:font-semibold w-full max-w-[1312px] pt-2 pr-7 pb-8 pl-3 max-md:px-3 max-md:pt-3 max-md:pb-6">
      <header className="mb-5 grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 py-3 max-md:grid-cols-[40px_minmax(0,1fr)] max-md:gap-x-3">
        {data.profile && (
          <Avatar
            person={data.profile}
            className="col-start-1 row-start-1 size-12 rounded-md max-md:size-10"
          />
        )}
        <div className="contents">
          <h1 className="col-start-2 row-start-1 text-[28px] font-semibold">
            {data.profile?.full_name || org}
          </h1>
          {data.profile?.description && (
            <div className="col-span-full text-sm text-muted">
              <Markdown html={data.description_html}>
                {data.profile.description}
              </Markdown>
            </div>
          )}
        </div>
        {data.is_owner && selected === "" && (
          <Link
            className="button primary col-start-3 row-start-1 ml-auto max-md:col-span-full max-md:col-start-1 max-md:row-auto max-md:ml-0 max-md:justify-self-start"
            to={`/projects/new?owner=${encode(org)}`}
          >
            {t("organization.newProject")}
          </Link>
        )}
        <div className="col-span-full flex flex-wrap items-center gap-3 text-sm text-muted">
          {data.profile?.location && <span>{data.profile.location}</span>}
          {validWebsite(data.profile?.website) && (
            <a
              className="break-all text-primary"
              href={data.profile?.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              {data.profile?.website}
            </a>
          )}
          {data.profile?.visibility !== undefined && (
            <span className="badge">
              {t(
                data.profile.visibility === 2
                  ? "shared.private"
                  : data.profile.visibility === 1
                    ? "profile.signedIn"
                    : "shared.public",
              )}
            </span>
          )}
          {!!data.viewer_id && (
            <button
              className="button"
              disabled={follow.isPending}
              onClick={() => follow.mutate()}
            >
              {t(data.is_following ? "profile.unfollow" : "profile.follow")}
            </button>
          )}
          {data.feeds_enabled && (
            <>
              <a className="button" href={native(`/${encode(org)}.rss`)}>
                {t("profile.rss")}
              </a>
              <a className="button" href={native(`/${encode(org)}.atom`)}>
                {t("profile.atom")}
              </a>
            </>
          )}
          {data.moderation_enabled && data.viewer_id && !data.is_owner && (
            <Link
              className="button"
              to={`/report-abuse?type=org&id=${data.profile?.id}`}
            >
              {t("profile.reportAbuse")}
            </Link>
          )}
          <Feedback error={follow.error} />
        </div>
      </header>
      <nav className="tabs md:hidden" aria-label={t("organization.sections")}>
        {tabs.map(([value, label]) => (
          <Link
            className={selected === value ? "active" : ""}
            key={value}
            to={`${root}${value ? "/" + value : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </section>
  );
}
export function OrganizationPage({
  section = "",
}: {
  section?: "" | "members" | "teams" | "settings";
}) {
  const { t } = useTranslation("workspace");
  const { org = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const page = Number(params.get("page")) || 1,
    q = params.get("q") || "";
  const endpoint = section
    ? `/org/${encode(org)}/${section}`
    : `/${encode(org)}`;
  const query = useQuery({
    queryKey: ["organization", org, section, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(
        `${endpoint}?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page), q })}`,
        signal,
      ),
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      values,
    }: {
      action: string;
      values: Record<string, string>;
    }) => nativeForm(`/org/${encode(org)}/members/action/${action}`, values),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["organization", org] }),
  });
  const teamAction = useMutation({
    mutationFn: ({ team, action }: { team: string; action: string }) =>
      nativeForm(`/org/${encode(org)}/teams/${encode(team)}/action/${action}`, {
        uid: String(query.data?.viewer_id),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["organization", org] }),
  });
  useTitle(t(`organization.documentTitle.${section || "projects"}`, { org }));
  if (query.isPending)
    return (
      <section className={pageClass}>
        <Pending />
      </section>
    );
  if (query.error)
    return (
      <section className={pageClass}>
        <Feedback error={query.error} />
      </section>
    );
  const data = query.data,
    root = `/organizations/${encode(org)}`;
  return (
    <OrganizationFrame data={data} selected={section}>
      <Feedback error={mutation.error} />
      {section === "" ? (
        <>
          <SearchForm
            label={t("organization.searchProjects")}
            placeholder={t("organization.searchProjectsPlaceholder")}
            value={q}
            onSearch={(value) =>
              setParams({ ...Object.fromEntries(params), q: value, page: "1" })
            }
            className={organizationSearchClass}
          />
          {data.readme && (
            <div className="my-5 rounded-md border border-line p-6">
              <Markdown html={data.readme_html}>{data.readme}</Markdown>
            </div>
          )}
          <WorkspaceRepoFilters />
          <ProjectRows projects={data.items} />
          <Pagination
            page={page}
            size={data.page_size}
            total={data.total || 0}
            onPage={(value) =>
              setParams({
                ...Object.fromEntries(params),
                q,
                page: String(value),
              })
            }
          />
        </>
      ) : section === "teams" ? (
        <>
          <div className={pageHeadingClass}>
            <h2>{t("organization.teams.title")}</h2>
            {data.is_owner && (
              <Link className="button primary" to={`${root}/teams/new`}>
                <Plus size={15} />
                {t("organization.teams.new")}
              </Link>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.teams.map((team) => (
              <article
                className="flex items-start gap-3 rounded-md border border-line p-5"
                key={team.id}
              >
                <Users size={22} />
                <div>
                  <h3 className="text-base font-semibold">
                    <Link to={`${root}/teams/${encode(team.name)}`}>
                      {team.name}
                    </Link>
                  </h3>
                  {(team.is_member || data.is_owner) && (
                    <button
                      type="button"
                      className="button"
                      disabled={teamAction.isPending}
                      onClick={() => {
                        if (
                          !team.is_member ||
                          window.confirm(
                            t("organization.teams.confirmLeave", {
                              team: team.name,
                            }),
                          )
                        )
                          teamAction.mutate({
                            team: team.name,
                            action: team.is_member ? "leave" : "join",
                          });
                      }}
                    >
                      {t(
                        team.is_member
                          ? "organization.teams.leave"
                          : "organization.teams.join",
                      )}
                    </button>
                  )}
                  <p className="my-2 text-sm text-muted">{team.description}</p>
                  <span className="text-xs text-muted">
                    {t("organization.teams.members", {
                      count: team.members_count,
                    })}{" "}
                    ·{" "}
                    {team.all_repositories
                      ? t("shared.allProjects")
                      : t("organization.teams.projects", {
                          count: team.repositories_count,
                        })}{" "}
                    · {permissionLabel(t, team.permission)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : section === "settings" ? (
        <OrganizationSettings data={data} org={org} />
      ) : (
        <>
          <div className={pageHeadingClass}>
            <h2>
              {t("shared.members")}{" "}
              <span className="counter">{data.total || 0}</span>
            </h2>
            {data.is_member && (
              <button
                className="button"
                onClick={() => {
                  if (
                    window.confirm(
                      t("organization.members.confirmLeave", { org }),
                    )
                  )
                    mutation.mutate({
                      action: "leave",
                      values: { uid: String(data.viewer_id) },
                    });
                }}
              >
                {t("organization.members.leave")}
              </button>
            )}
          </div>
          {data.is_owner && (
            <form
              className="mb-6 flex flex-wrap items-end gap-4 rounded-md border border-line bg-surface-subtle p-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({
                  action: "add",
                  values: {
                    uid: String(data.viewer_id),
                    ...Object.fromEntries(new FormData(event.currentTarget)),
                  } as Record<string, string>,
                });
              }}
            >
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {data.email_invites
                  ? t("shared.usernameOrEmail")
                  : t("shared.username")}
                <WorkspaceUserInput
                  placeholder={
                    data.email_invites
                      ? t("shared.usernameOrEmail")
                      : t("shared.username")
                  }
                />
              </label>
              <fieldset className="flex flex-wrap gap-3 text-sm">
                <legend className="mb-2 text-sm font-semibold">
                  {t("organization.members.addToTeams")}
                </legend>
                {data.teams.map((team) => (
                  <label key={team.id}>
                    <input name={`team_${team.id}`} type="checkbox" />
                    {team.name}
                  </label>
                ))}
              </fieldset>
              <button className="button primary" disabled={mutation.isPending}>
                {data.invite_required
                  ? t("organization.members.invite")
                  : t("organization.members.add")}
              </button>
            </form>
          )}
          <div className={membersClass}>
            {data.people.map((person) => (
              <article className={memberRowClass} key={person.id}>
                <Avatar person={person} className="size-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Link
                    className={memberLinkClass}
                    to={`/users/${encode(person.name)}`}
                  >
                    {person.full_name || person.name}
                  </Link>
                  <p className={memberTextClass}>
                    @{person.name} ·{" "}
                    {data.owner_members?.[person.id]
                      ? t("organization.members.owner")
                      : t("organization.members.member")}
                  </p>
                </div>
                {data.is_owner && (
                  <span className="text-xs text-muted">
                    {t("organization.members.twoFactor")}:{" "}
                    {t(
                      data.members_two_factor?.[person.id]
                        ? "organization.members.twoFactorEnabled"
                        : "organization.members.twoFactorDisabled",
                    )}
                  </span>
                )}
                <span className="label">
                  {data.public_members?.[person.id]
                    ? t("shared.public")
                    : t("shared.private")}
                </span>
                {(data.is_owner || data.viewer_id === person.id) && (
                  <ActionMenu
                    label={t("organization.members.actions", {
                      name: person.name,
                    })}
                    trigger={t("organization.members.manage")}
                  >
                    <MenuAction
                      onClick={() =>
                        mutation.mutate({
                          action: data.public_members?.[person.id]
                            ? "private"
                            : "public",
                          values: { uid: String(person.id) },
                        })
                      }
                    >
                      {data.public_members?.[person.id]
                        ? t("organization.members.makePrivate")
                        : t("organization.members.makePublic")}
                    </MenuAction>
                    {data.is_owner && (
                      <MenuAction
                        onClick={() => {
                          if (
                            window.confirm(
                              t("organization.members.confirmRemove", {
                                name: person.name,
                                org,
                              }),
                            )
                          )
                            mutation.mutate({
                              action: "remove",
                              values: { uid: String(person.id) },
                            });
                        }}
                      >
                        {t("organization.members.remove")}
                      </MenuAction>
                    )}
                  </ActionMenu>
                )}
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            size={data.page_size}
            total={data.total || 0}
            onPage={(value) => setParams({ page: String(value) })}
          />
        </>
      )}
    </OrganizationFrame>
  );
}
function OrganizationSettings({
  data,
  org,
}: {
  data: WorkspaceData;
  org: string;
}) {
  const { t } = useTranslation("workspace");
  const client = useQueryClient(),
    navigate = useNavigate();
  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      nativeForm(`/org/${encode(org)}/settings`, values),
    onSuccess: async (_result, values) => {
      await client.invalidateQueries({ queryKey: ["organization"] });
      if (values.name !== org)
        navigate(`/organizations/${encode(values.name)}/settings`);
    },
  });
  if (!data.settings) return null;
  const s = data.settings;
  return (
    <form
      className="workspace-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          ...Object.fromEntries(new FormData(event.currentTarget)),
          max_repo_creation: String(
            new FormData(event.currentTarget).get("max_repo_creation") ??
              s.max_repo_creation,
          ),
        } as Record<string, string>);
      }}
    >
      <section className="grid grid-cols-[minmax(150px,1fr)_minmax(0,2fr)] gap-10 border-t border-line py-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6">
        <div>
          <h2>{t("organization.settings.general")}</h2>
          <p>{t("organization.settings.generalDescription")}</p>
        </div>
        <div>
          {data.viewer_admin && (
            <label className={organizationFieldClass}>
              {t("organization.settings.maxRepositories")}
              <input
                className={fieldInputClass}
                type="number"
                name="max_repo_creation"
                min={-1}
                defaultValue={s.max_repo_creation}
              />
            </label>
          )}
          <label className={organizationFieldClass}>
            {t("organization.name")}
            <input
              className={fieldInputClass}
              required
              name="name"
              maxLength={40}
              defaultValue={s.name}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("organization.settings.displayName")}
            <input
              className={fieldInputClass}
              name="full_name"
              maxLength={100}
              defaultValue={s.full_name}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.description")}
            <textarea
              className={fieldInputClass}
              name="description"
              maxLength={255}
              defaultValue={s.description}
              rows={3}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.email")}
            <input
              className={fieldInputClass}
              name="email"
              type="email"
              defaultValue={s.email}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.website")}
            <input
              className={fieldInputClass}
              name="website"
              type="url"
              defaultValue={s.website}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.location")}
            <input
              className={fieldInputClass}
              name="location"
              maxLength={50}
              defaultValue={s.location}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.visibility")}
            <SelectControl
              label={t("organization.visibility.label")}
              name="visibility"
              defaultValue={String(s.visibility)}
              options={visibilityOptions(t)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="repo_admin_change_team_access"
              defaultChecked={s.repo_admin_change_team_access}
            />
            {t("organization.allowTeamAccessChange")}
          </label>
          <Feedback error={save.error} />
          {save.isSuccess && (
            <p role="status" className="form-success">
              {t("organization.settings.saved")}
            </p>
          )}
          <button className="button primary" disabled={save.isPending}>
            {t("shared.saveChanges")}
          </button>
        </div>
      </section>
    </form>
  );
}

export function TeamPage({
  mode = "members",
}: {
  mode?: "members" | "repositories" | "new" | "edit";
}) {
  const { t } = useTranslation("workspace");
  const { org = "", team: teamName = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page")) || 1;
  const client = useQueryClient(),
    navigate = useNavigate(),
    root = `/organizations/${encode(org)}`;
  const endpoint =
    mode === "new"
      ? `/org/${encode(org)}/teams/new`
      : `/org/${encode(org)}/teams/${encode(teamName)}${mode === "members" ? "" : "/" + mode}`;
  const query = useQuery({
    queryKey: ["organization-team", org, teamName, mode, page],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(`${endpoint}?page=${page}`, signal),
  });
  const action = useMutation({
    mutationFn: ({
      route,
      values,
    }: {
      route: string;
      values?: Record<string, string>;
    }) =>
      nativeForm(
        `/org/${encode(org)}/teams/${encode(teamName)}/${route}`,
        values || {},
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["organization-team", org] }),
        client.invalidateQueries({ queryKey: ["organization", org] }),
      ]);
      if (input.route === "delete" || input.route === "action/leave")
        navigate(`${root}/teams`);
    },
  });
  useTitle(
    mode === "new"
      ? t("organization.teams.newTitle", { org })
      : `${teamName} · ${org}`,
  );
  if (query.isPending)
    return (
      <section className={pageClass}>
        <Pending />
      </section>
    );
  if (query.error)
    return (
      <section className={pageClass}>
        <Feedback error={query.error} />
      </section>
    );
  const data = query.data,
    current = data.team;
  if (mode === "new" || mode === "edit")
    return (
      <OrganizationFrame data={data} selected="teams">
        <TeamForm
          key={mode + teamName}
          data={data}
          endpoint={endpoint}
          org={org}
          create={mode === "new"}
        />
      </OrganizationFrame>
    );
  if (!current)
    return (
      <section className={pageClass}>
        <EmptyState title={t("organization.teams.notFound")} />
      </section>
    );
  return (
    <OrganizationFrame data={data} selected="teams">
      <div className={pageHeadingClass}>
        <div>
          <h2>{current.name}</h2>
          <p className="mt-2 text-sm text-muted">{current.description}</p>
        </div>
        <div className={actionsClass}>
          {data.is_owner && (
            <Link
              className="button"
              to={`${root}/teams/${encode(teamName)}/edit`}
            >
              {t("organization.teams.edit")}
            </Link>
          )}
          {data.is_team_member ? (
            <button
              className="button"
              onClick={() => {
                if (
                  window.confirm(
                    t("organization.teams.confirmLeave", { team: teamName }),
                  )
                )
                  action.mutate({ route: "action/leave" });
              }}
            >
              {t("organization.teams.leave")}
            </button>
          ) : (
            data.is_owner && (
              <button
                className="button"
                onClick={() => action.mutate({ route: "action/join" })}
              >
                {t("organization.teams.join")}
              </button>
            )
          )}
        </div>
      </div>
      <nav
        className="tabs md:hidden"
        aria-label={t("organization.teams.sections")}
      >
        <Link
          className={mode === "members" ? "active" : ""}
          to={`${root}/teams/${encode(teamName)}`}
        >
          {t("shared.members")}{" "}
          <span className="counter">{current.members_count}</span>
        </Link>
        <Link
          className={mode === "repositories" ? "active" : ""}
          to={`${root}/teams/${encode(teamName)}/repositories`}
        >
          {t("shared.projects")}{" "}
          <span className="counter">{current.repositories_count}</span>
        </Link>
      </nav>
      <section className="my-4 overflow-auto rounded border border-line p-4">
        <h3 className="mb-3 font-semibold">
          {t("organization.teams.unitsTitle")}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">{t("organization.teams.unit")}</th>
              <th className="text-left">
                {t("organization.teams.unitAccess")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.available_units.map((unit) => (
              <tr key={unit.id}>
                <td className="py-2">{unit.name}</td>
                <td>
                  {t(
                    (current.units[unit.id] || 0) >= 3
                      ? "organization.teams.adminAccess"
                      : current.units[unit.id] === 2
                        ? "organization.teams.writeAccess"
                        : current.units[unit.id] === 1
                          ? "organization.teams.readAccess"
                          : "organization.teams.noAccess",
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {mode === "repositories" &&
        data.is_owner &&
        !current.all_repositories && (
          <div className="my-4 flex flex-wrap gap-3">
            {["addall", "removeall"].map((route) => (
              <button
                type="button"
                className="button"
                key={route}
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm(t("organization.teams.confirmAll")))
                    action.mutate({ route: `action/repo/${route}` });
                }}
              >
                {t(
                  route === "addall"
                    ? "organization.teams.addAll"
                    : "organization.teams.removeAll",
                )}
              </button>
            ))}
          </div>
        )}
      <Feedback error={action.error} />
      {mode === "members" ? (
        <>
          {data.is_owner && (
            <form
              className={organizationSearchClass}
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate({
                  route: "action/add",
                  values: {
                    uname: String(
                      new FormData(event.currentTarget).get("uname"),
                    ),
                    page: "team",
                  },
                });
              }}
            >
              <label className={`flex-1 ${organizationFieldClass}`}>
                {data.email_invites
                  ? t("shared.usernameOrEmail")
                  : t("shared.username")}
                <WorkspaceUserInput
                  placeholder={
                    data.email_invites
                      ? t("shared.usernameOrEmail")
                      : t("shared.username")
                  }
                />
              </label>
              <button className="button primary" disabled={action.isPending}>
                {data.invite_required
                  ? t("organization.teams.invite")
                  : t("organization.teams.add")}
              </button>
            </form>
          )}
          <div className={membersClass}>
            {current.members.map((person) => (
              <article className={memberRowClass} key={person.id}>
                <Avatar person={person} className="size-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Link
                    className={memberLinkClass}
                    to={`/users/${encode(person.name)}`}
                  >
                    {person.full_name || person.name}
                  </Link>
                  <p className={memberTextClass}>@{person.name}</p>
                </div>
                {data.is_owner && (
                  <button
                    className="button"
                    disabled={action.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          t("organization.teams.confirmRemove", {
                            name: person.name,
                            team: current.name,
                          }),
                        )
                      )
                        action.mutate({
                          route: "action/remove",
                          values: { uid: String(person.id), page: "team" },
                        });
                    }}
                  >
                    {t("shared.remove")}
                  </button>
                )}
              </article>
            ))}
          </div>
          {!!data.invites?.length && (
            <section className="mt-6">
              <h3>{t("organization.teams.pendingInvitations")}</h3>
              {data.invites.map((invite) => (
                <article
                  className="account-row flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0"
                  key={invite.id}
                >
                  <div className="min-w-0 flex-1">
                    <strong>
                      {invite.user?.full_name ||
                        invite.user?.name ||
                        invite.email}
                    </strong>
                    <p className="mt-1 text-xs break-all text-muted">
                      {t("organization.teams.invited", {
                        date: relativeDate(invite.created_at),
                      })}
                    </p>
                  </div>
                  <button
                    className="button ml-auto"
                    onClick={() =>
                      action.mutate({
                        route: "action/remove_invite",
                        values: { iid: String(invite.id), page: "team" },
                      })
                    }
                  >
                    {t("organization.teams.cancelInvitation")}
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          {current.all_repositories ? (
            <p className="form-success">
              {t("organization.teams.allProjectsAccess")}
            </p>
          ) : (
            data.is_owner && (
              <form
                className={organizationSearchClass}
                onSubmit={(event) => {
                  event.preventDefault();
                  action.mutate({
                    route: "action/repo/add",
                    values: {
                      repo_name: String(
                        new FormData(event.currentTarget).get("repo_name"),
                      ),
                    },
                  });
                }}
              >
                <label className={`flex-1 ${organizationFieldClass}`}>
                  {t("organization.teams.projectName")}
                  <input
                    className={fieldInputClass}
                    name="repo_name"
                    required
                    placeholder={t("organization.teams.projectPlaceholder", {
                      org,
                    })}
                  />
                </label>
                <button className="button primary" disabled={action.isPending}>
                  {t("organization.teams.addProject")}
                </button>
              </form>
            )
          )}
          <div className={membersClass}>
            {current.repositories.map((project) => (
              <article className={memberRowClass} key={project.id}>
                <span className={`project-avatar color-${project.id % 5}`}>
                  {project.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    className={memberLinkClass}
                    to={projectRoute(project.full_name)}
                  >
                    {project.full_name}
                  </Link>
                  <p className={memberTextClass}>{project.description}</p>
                </div>
                {data.is_owner && !current.all_repositories && (
                  <button
                    className="button"
                    onClick={() =>
                      action.mutate({
                        route: "action/repo/remove",
                        values: { repoid: String(project.id) },
                      })
                    }
                  >
                    {t("shared.remove")}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <Pagination
        page={page}
        size={data.page_size}
        total={data.total || 0}
        onPage={(value) => setParams({ page: String(value) })}
      />
    </OrganizationFrame>
  );
}
function TeamForm({
  data,
  endpoint,
  org,
  create,
}: {
  data: WorkspaceData;
  endpoint: string;
  org: string;
  create: boolean;
}) {
  const { t } = useTranslation("workspace");
  const team = data.team;
  const client = useQueryClient(),
    navigate = useNavigate();
  const [permission, setPermission] = useState(
    team?.permission === "admin" || team?.permission === "owner"
      ? "admin"
      : "read",
  );
  const [access, setAccess] = useState(
    team?.all_repositories ? "all" : "specific",
  );
  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      nativeForm(endpoint, values),
    onSuccess: async (_result, values) => {
      await client.invalidateQueries({ queryKey: ["organization", org] });
      await client.invalidateQueries({ queryKey: ["organization-team", org] });
      navigate(
        `/organizations/${encode(org)}/teams/${encode(values.team_name)}`,
      );
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      nativeForm(
        `/org/${encode(org)}/teams/${encode(team?.name || "")}/delete`,
        {},
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["organization", org] });
      navigate(`/organizations/${encode(org)}/teams`);
    },
  });
  return (
    <div className="max-w-[900px]">
      <div className={pageHeadingClass}>
        <h2>
          {create
            ? t("organization.teams.new")
            : t("organization.teams.editTitle", { team: team?.name })}
        </h2>
      </div>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(
            Object.fromEntries(new FormData(event.currentTarget)) as Record<
              string,
              string
            >,
          );
        }}
      >
        <div className={formPanelClass}>
          <label className={organizationFieldClass}>
            {t("organization.teams.name")}
            <input
              className={fieldInputClass}
              required
              name="team_name"
              maxLength={255}
              defaultValue={team?.name}
              readOnly={team?.owner_team}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("shared.description")}
            <textarea
              className={fieldInputClass}
              name="description"
              maxLength={255}
              rows={3}
              defaultValue={team?.description}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("organization.teams.projectAccess")}
            <SelectControl
              label={t("organization.teams.projectAccess")}
              name="repo_access"
              value={access}
              onValueChange={setAccess}
              disabled={team?.owner_team}
              options={[
                {
                  value: "specific",
                  label: t("organization.teams.selectedProjects"),
                },
                { value: "all", label: t("shared.allProjects") },
              ]}
            />
          </label>
          <label className={organizationFieldClass}>
            {t("organization.teams.role")}
            <SelectControl
              label={t("organization.teams.role")}
              name="permission"
              value={permission}
              onValueChange={setPermission}
              disabled={team?.owner_team}
              options={[
                {
                  value: "read",
                  label: t("organization.teams.customAccess"),
                  description: t("organization.teams.customAccessDescription"),
                },
                {
                  value: "admin",
                  label: t("organization.teams.administrator"),
                  description: t("organization.teams.administratorDescription"),
                },
              ]}
            />
          </label>
          {!team?.owner_team && (
            <label>
              <input
                type="checkbox"
                name="can_create_org_repo"
                defaultChecked={team?.can_create_repositories}
              />
              {t("organization.teams.canCreateProjects")}
            </label>
          )}
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-4 text-base font-semibold">
              {t("organization.teams.permissions")}
            </h3>
            {data.available_units.map((unit) => (
              <label
                className="mb-4 grid grid-cols-[minmax(0,1fr)_200px] items-center gap-2 text-sm font-semibold max-md:grid-cols-1"
                key={unit.id}
              >
                {unit.name}
                <SelectControl
                  label={t("organization.teams.unitAccess", {
                    unit: unit.name,
                  })}
                  name={`unit_${unit.id}`}
                  defaultValue={String(
                    team?.units[unit.id] ??
                      (permission === "admin" ? 2 : create ? 1 : 0),
                  )}
                  options={[
                    { value: "0", label: t("organization.teams.noAccess") },
                    { value: "1", label: t("organization.teams.read") },
                    ...(!unit.readonly
                      ? [{ value: "2", label: t("organization.teams.write") }]
                      : []),
                  ]}
                />
              </label>
            ))}
          </div>
        </div>
        <Feedback error={save.error || remove.error} />
        <div className={`mt-5 ${actionsClass}`}>
          <button className="button primary" disabled={save.isPending}>
            {create
              ? t("organization.teams.create")
              : t("organization.teams.save")}
          </button>
          <Link className="button" to={`/organizations/${encode(org)}/teams`}>
            {t("shared.cancel")}
          </Link>
          {!create && !team?.owner_team && (
            <button
              type="button"
              className="button ml-auto"
              onClick={() => {
                if (
                  window.confirm(
                    t("organization.teams.confirmDelete", { team: team?.name }),
                  )
                )
                  remove.mutate();
              }}
            >
              {t("organization.teams.delete")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
