import { WorkspaceNavigation } from "./WorkspaceNavigation";
import type { WorkspaceData } from "./WorkspaceManagement";
import { useWorkspaceEvents } from "./useWorkspaceEvents";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleDot,
  FolderGit2,
  GitFork,
  GitMerge,
  Globe2,
  Import,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  get,
  nativeForm,
  nativePage,
  repoPath,
  type Bootstrap,
  type Repository,
} from "./api";
import {
  ProjectNavigation,
  projectSwitch,
  sidebarCount,
  sidebarDivider,
  sidebarLink,
  sidebarUtility,
} from "./ProjectNavigation";
import { AppearanceMenu } from "./Theme";
import { StopwatchIndicator } from "./Stopwatch";
import {
  ActionMenu,
  MenuAction,
  MenuGroup,
  MenuLink,
  MenuSeparator,
} from "./ActionMenu";

const headerLink =
  "rounded px-2 py-1.5 text-sm transition-[background-color,border-color,color] duration-100 ease-[ease] hover:bg-black/5 max-[1101px]:hidden dark:hover:bg-hover";
const breadcrumbLink =
  "flex min-w-0 items-center gap-1.5 truncate text-muted hover:underline";
const navLink = ({ isActive }: { isActive: boolean }) => sidebarLink(isActive);

export function Shell({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("shell");
  useWorkspaceEvents(!!bootstrap.user);
  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch("/projects/:owner/:repo/*");
  const organizationMatch = useMatch("/organizations/:org/*"),
    profileMatch = useMatch("/users/:username/*");
  const scopeName =
    organizationMatch &&
    !["new", "invite"].includes(organizationMatch.params.org || "")
      ? organizationMatch.params.org
      : profileMatch?.params.username;
  const scopeKind = organizationMatch ? "organization" : "profile";
  const scopeRoot = scopeName
    ? `/${scopeKind === "organization" ? "organizations" : "users"}/${encodeURIComponent(scopeName)}`
    : "";
  const scope = useQuery({
    queryKey: [
      scopeKind === "organization" ? "organization" : "public-profile",
      scopeName,
      "navigation",
    ],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(
        `/${encodeURIComponent(scopeName || "")}`,
        signal,
      ),
    enabled: !!scopeName,
  });
  const owner = match?.params.owner ?? "";
  const repo = match?.params.repo ?? "";
  const section = match?.params["*"]?.split("/")[0] ?? "";
  const workNumber = ["issues", "merge-requests"].includes(section)
    ? match?.params["*"]?.split("/")[1]
    : undefined;
  const hasWorkNumber = !!workNumber && /^\d+$/.test(workNumber);
  const root = `/projects/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const user = bootstrap.user;
  const client = useQueryClient();
  const logout = useMutation({
    mutationFn: async () => {
      await nativeForm("/user/logout", {});
      const data = await get<Bootstrap>("/-/ui/data/bootstrap");
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "bootstrap" });
      client.setQueryData(["bootstrap"], data);
      navigate("/login", { replace: true });
    },
  });
  const project = useQuery({
    queryKey: ["repo", owner, repo],
    queryFn: ({ signal }) =>
      get<Repository>(`/-/ui/data/repos${repoPath(owner, repo)}`, signal),
    enabled: !!match,
  });
  const r = project.data;
  const count = useQuery({
    queryKey: ["notification-count"],
    queryFn: ({ signal }) => get<{ new: number }>("/notifications/new", signal),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  useEffect(() => setMobileOpen(false), [location.key]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        ) &&
        !(event.target as HTMLElement).isContentEditable
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  const labels: Record<string, string> = {
    "": t("breadcrumb.sections.overview"),
    issues: t("breadcrumb.sections.issues"),
    "merge-requests": t("breadcrumb.sections.mergeRequests"),
    boards: t("breadcrumb.sections.boards"),
    actions: t("breadcrumb.sections.actions"),
    releases: t("breadcrumb.sections.releases"),
    wiki: t("breadcrumb.sections.wiki"),
    settings: t("breadcrumb.sections.settings"),
    history: t("breadcrumb.sections.history"),
    commit: t("breadcrumb.sections.commit"),
    edit: t("breadcrumb.sections.edit"),
    new: t("breadcrumb.sections.new"),
    upload: t("breadcrumb.sections.upload"),
    delete: t("breadcrumb.sections.delete"),
    branches: t("breadcrumb.sections.branches"),
    tags: t("breadcrumb.sections.tags"),
    compare: t("breadcrumb.sections.compare"),
    graph: t("breadcrumb.sections.graph"),
    search: t("breadcrumb.sections.search"),
    find: t("breadcrumb.sections.find"),
    activity: t("breadcrumb.sections.activity"),
    labels: t("breadcrumb.sections.labels"),
    milestones: t("breadcrumb.sections.milestones"),
    fork: t("breadcrumb.sections.fork"),
    forks: t("breadcrumb.sections.forks"),
    stars: t("breadcrumb.sections.stars"),
    watchers: t("breadcrumb.sections.watchers"),
    packages: t("breadcrumb.sections.packages"),
  };
  // Organization and profile pages have their own sections; settings pages
  // use the organization settings navigation names.
  const scopeSections: Record<string, string> = {
    activity: t("breadcrumb.sections.activity"),
    issues: t("breadcrumb.sections.issues"),
    "merge-requests": t("breadcrumb.sections.mergeRequests"),
    milestones: t("breadcrumb.sections.milestones"),
    search: t("breadcrumb.sections.search"),
    boards: t("breadcrumb.sections.boards"),
    members: t("breadcrumb.members"),
    teams: t("breadcrumb.teams"),
    settings: t("breadcrumb.sections.settings"),
  };
  const settingsSections: Record<string, string> = {
    avatar: t("breadcrumb.scope.avatar"),
    labels: t("breadcrumb.sections.labels"),
    applications: t("breadcrumb.scope.applications"),
    hooks: t("breadcrumb.scope.webhooks"),
    blocked_users: t("breadcrumb.scope.blockedUsers"),
    storage_overview: t("breadcrumb.scope.storage"),
    packages: t("breadcrumb.sections.packages"),
    "actions/runners": t("breadcrumb.scope.runners"),
    "actions/secrets": t("breadcrumb.scope.secrets"),
    "actions/variables": t("breadcrumb.scope.variables"),
    delete: t("breadcrumb.scope.deleteOrganization"),
  };
  const decodeSegment = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  function scopeTrail([section, ...rest]: string[]) {
    if (!section) return [];
    const trail = [scopeSections[section] ?? decodeSegment(section)];
    if (section === "boards" && rest[0] === "new")
      trail.push(t("breadcrumb.scope.newBoard"));
    else if (section === "boards" && rest[1] === "edit")
      trail.push(t("breadcrumb.scope.editBoard"));
    else if (section === "teams" && rest[0] === "new")
      trail.push(t("breadcrumb.scope.newTeam"));
    else if (section === "teams" && rest[0]) {
      trail.push(decodeSegment(rest[0]));
      if (rest[1] === "edit") trail.push(t("breadcrumb.scope.editTeam"));
      if (rest[1] === "repositories")
        trail.push(t("breadcrumb.scope.teamProjects"));
    } else if (section === "settings" && rest[0]) {
      const label =
        settingsSections[
          rest[0] === "actions" ? `actions/${rest[1]}` : rest[0]
        ];
      if (label) trail.push(label);
    }
    return trail;
  }
  // Most specific prefix first; nested pages keep their section's name.
  const globalLabel =
    (
      [
        ["/work/merge-requests", t("breadcrumb.global.mergeRequests")],
        ["/work/milestones", t("breadcrumb.global.milestones")],
        ["/work/issues", t("breadcrumb.global.issues")],
        ["/notifications/subscriptions", t("breadcrumb.global.subscriptions")],
        ["/notifications/watching", t("breadcrumb.global.watching")],
        ["/notifications", t("breadcrumb.global.notifications")],
        ["/projects/new", t("breadcrumb.global.newProject")],
        ["/projects/import", t("breadcrumb.global.importProject")],
        ["/projects", t("breadcrumb.global.projects")],
        ["/organizations/new", t("breadcrumb.global.newOrganization")],
        ["/organizations", t("breadcrumb.global.organizations")],
        ["/activity", t("breadcrumb.global.activity")],
        ["/search", t("breadcrumb.global.searchCode")],
        ["/users", t("breadcrumb.global.people")],
        ["/account", t("breadcrumb.global.userSettings")],
        ["/admin", t("breadcrumb.global.adminArea")],
        ["/help/api", t("breadcrumb.global.api")],
        ["/not-found", t("breadcrumb.global.notFound")],
      ] as const
    ).find(
      ([prefix]) =>
        location.pathname === prefix ||
        location.pathname.startsWith(`${prefix}/`),
    )?.[1] ?? t("breadcrumb.global.workspace");
  return (
    <div className="min-h-screen pt-12">
      <a
        href="#main-content"
        className="fixed -top-20 left-4 z-50 rounded border border-line bg-surface p-3 focus:top-2"
      >
        {t("header.skipToContent")}
      </a>
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-4 bg-canvas px-3 max-md:gap-2 max-md:px-2">
        <button
          className="icon-button hidden max-md:inline-flex"
          aria-label={t("header.openNavigation")}
          aria-expanded={mobileOpen}
          aria-controls="workspace-navigation"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
        </button>
        {collapsed && (
          <button
            className="icon-button max-md:hidden"
            aria-label={t("header.expandSidebar")}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen size={19} />
          </button>
        )}
        <Link
          to="/projects"
          className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight"
          aria-label={t("header.home")}
        >
          <GitFork size={25} strokeWidth={2.4} className="text-[#e86327]" />
          <span className="max-md:hidden">Forgejo</span>
        </Link>
        <Link to="/projects" className={headerLink}>
          {t("header.yourWork")}
        </Link>
        <Link to="/projects?tab=explore" className={headerLink}>
          {t("header.explore")}
        </Link>
        <form
          className="absolute left-1/2 -ml-62.5 flex h-8 w-125 items-center gap-2 rounded-lg border border-control bg-surface px-2 text-muted focus-within:ring-2 focus-within:ring-primary max-[1101px]:static max-[1101px]:ml-auto max-[1101px]:w-auto max-[1101px]:max-w-[344px] max-[1101px]:min-w-0 max-[1101px]:flex-1 max-md:ml-0"
          onSubmit={(event) => {
            event.preventDefault();
            const value = search.current?.value ?? "";
            navigate(`/projects?q=${encodeURIComponent(value)}`);
          }}
        >
          <Search size={16} />
          <input
            ref={search}
            aria-label={t("header.searchLabel")}
            name="q"
            placeholder={t("header.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-line px-1 text-xs text-primary max-md:hidden">
            /
          </kbd>
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-1 max-[1101px]:ml-0">
          {user ? (
            <>
              <ActionMenu
                label={t("header.createNew")}
                className="icon-button w-auto gap-0.5 px-1.5"
                trigger={
                  <>
                    <Plus size={18} />
                    <ChevronDown size={12} />
                  </>
                }
              >
                {match && (
                  <>
                    <MenuGroup label={t("header.thisProject")}>
                      {r?.units?.issues && (
                        <MenuLink to={`${root}/issues/new`}>
                          <CircleDot size={16} />
                          {t("header.newIssue")}
                        </MenuLink>
                      )}
                      {r?.units?.pulls && (
                        <MenuLink to={`${root}/merge-requests/new`}>
                          <GitMerge size={16} />
                          {t("header.newMergeRequest")}
                        </MenuLink>
                      )}
                      {r?.units?.projects && r.permissions?.write_projects && (
                        <MenuLink to={`${root}/boards/new`}>
                          <LayoutGrid size={16} />
                          {t("header.newBoard")}
                        </MenuLink>
                      )}
                    </MenuGroup>
                    <MenuSeparator />
                  </>
                )}
                <MenuGroup label={t("header.create")}>
                  <MenuLink to="/projects/new">
                    <FolderGit2 size={16} />
                    {t("header.newProject")}
                  </MenuLink>
                  <MenuLink to="/projects/import">
                    <Import size={16} />
                    {t("header.importProject")}
                  </MenuLink>
                  {user.can_create_org && (
                    <MenuLink to="/organizations/new">
                      <Building2 size={16} />
                      {t("header.newOrganization")}
                    </MenuLink>
                  )}
                </MenuGroup>
              </ActionMenu>
              <StopwatchIndicator initial={bootstrap.stopwatch} />
              <Link
                to="/notifications"
                className="icon-button"
                aria-label={t("header.notifications")}
              >
                <Bell size={18} />
                {(count.data?.new ?? 0) > 0 && (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
                )}
              </Link>
              <ActionMenu
                label={t("header.account", { username: user.username })}
                className="ml-1 flex items-center gap-1 rounded p-1 transition-[background-color,border-color,color] duration-100 ease-[ease] hover:bg-black/5 dark:hover:bg-hover"
                popupClassName="w-72"
                trigger={
                  <>
                    <img
                      src={user.avatar}
                      alt=""
                      className="size-7 rounded-full border border-line"
                    />
                    <ChevronDown size={12} />
                  </>
                }
              >
                <div className="flex items-center gap-3 p-3">
                  <img
                    src={user.avatar}
                    alt=""
                    className="size-10 rounded-full"
                  />
                  <div className="min-w-0">
                    <strong className="block truncate">
                      {user.name || user.username}
                    </strong>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      @{user.username}
                    </span>
                  </div>
                </div>
                <MenuSeparator />
                <MenuLink to={`/users/${encodeURIComponent(user.username)}`}>
                  <UserRound size={16} />
                  {t("header.yourProfile")}
                </MenuLink>
                <MenuLink to="/account">
                  <UserRound size={16} />
                  {t("header.editProfile")}
                </MenuLink>
                <MenuLink to="/projects">
                  <FolderGit2 size={16} />
                  {t("header.yourProjects")}
                </MenuLink>
                <MenuLink to="/projects?tab=starred">
                  <Star size={16} />
                  {t("header.starredProjects")}
                </MenuLink>
                <MenuSeparator />
                <MenuLink to="/account/appearance">
                  <Settings size={16} />
                  {t("header.preferences")}
                </MenuLink>
                <AppearanceMenu />
                {user.admin && (
                  <MenuLink to="/admin">
                    <Settings size={16} />
                    {t("header.adminArea")}
                  </MenuLink>
                )}
                <MenuSeparator />
                <MenuAction
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  <LogOut size={16} />
                  {logout.isPending
                    ? t("header.signingOut")
                    : t("header.signOut")}
                </MenuAction>
              </ActionMenu>
            </>
          ) : (
            <Link to="/login" className="button">
              {t("header.signIn")}
            </Link>
          )}
        </div>
      </header>
      {logout.error && (
        <div
          className="fixed top-14 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 shadow-lg dark:border-[#a34a44] dark:bg-danger-bg dark:text-danger"
          role="alert"
        >
          {logout.error.message}
          <button
            className="icon-button"
            aria-label={t("header.dismissSignOutError")}
            onClick={() => logout.reset()}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar fixed top-12 bottom-0 left-0 z-30 flex w-60 flex-col bg-canvas px-2 text-muted [transition:transform_180ms_ease,visibility_180ms] max-md:w-64 max-md:shadow-[4px_0_16px_#0002] ${mobileOpen ? "max-md:visible max-md:[transform:translateX(0)]" : "max-md:invisible max-md:[transform:translateX(-100%)]"} ${collapsed ? "md:invisible md:[transform:translateX(-100%)]" : ""}`}
        inert={collapsed && !mobileOpen}
      >
        <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:thin]">
          <div className="flex items-center justify-between px-2 py-3">
            <strong className="text-sm font-semibold text-ink">
              {match
                ? t("sidebar.project")
                : scopeName
                  ? scopeKind === "organization"
                    ? t("sidebar.group")
                    : t("sidebar.profile")
                  : t("sidebar.yourWork")}
            </strong>
            <button
              className="icon-button hidden max-md:inline-flex"
              aria-label={t("sidebar.closeNavigation")}
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {match ? (
            <>
              <Link
                to={root}
                className={projectSwitch(!section && !location.search)}
                aria-current={!section && !location.search ? "page" : undefined}
              >
                <span
                  className={`project-avatar color-${(r?.id ?? 0) % 5} size-5 rounded text-[10px]`}
                >
                  {repo.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate">{repo}</span>
              </Link>
              <ProjectNavigation
                repository={r}
                root={root}
                section={
                  match.params["*"] || (location.search ? "files" : "overview")
                }
              />
            </>
          ) : scopeName ? (
            <WorkspaceNavigation
              kind={scopeKind}
              name={scopeName}
              data={scope.data}
            />
          ) : (
            <nav aria-label={t("sidebar.workspaceNavigation")}>
              <Link
                to="/projects"
                className={sidebarLink(
                  location.pathname === "/projects" &&
                    !location.search.includes("tab=explore"),
                )}
                aria-current={
                  location.pathname === "/projects" &&
                  !location.search.includes("tab=explore")
                    ? "page"
                    : undefined
                }
              >
                <FolderGit2 size={16} />
                {t("sidebar.projects")}
              </Link>
              <NavLink to="/activity" className={navLink}>
                <LayoutGrid size={16} />
                {t("sidebar.activity")}
              </NavLink>
              <NavLink to="/work/issues" className={navLink}>
                <CircleDot size={16} />
                {t("sidebar.issues")}
              </NavLink>
              <NavLink to="/work/merge-requests" className={navLink}>
                <GitMerge size={16} />
                {t("sidebar.mergeRequests")}
              </NavLink>
              <NavLink to="/work/milestones" className={navLink}>
                <CircleDot size={16} />
                {t("sidebar.milestones")}
              </NavLink>
              <NavLink to="/notifications" className={navLink}>
                <Bell size={16} />
                {t("sidebar.notifications")}
                {(count.data?.new ?? 0) > 0 && (
                  <span className={sidebarCount}>{count.data?.new}</span>
                )}
              </NavLink>
              <div className={sidebarDivider} />
              <Link
                to="/projects?tab=explore"
                className={sidebarLink(
                  location.pathname === "/projects" &&
                    location.search.includes("tab=explore"),
                )}
                aria-current={
                  location.pathname === "/projects" &&
                  location.search.includes("tab=explore")
                    ? "page"
                    : undefined
                }
              >
                <Globe2 size={16} />
                {t("sidebar.exploreProjects")}
              </Link>
              <NavLink to="/users" className={navLink}>
                <UserRound size={16} />
                {t("sidebar.people")}
              </NavLink>
              <NavLink to="/search" className={navLink}>
                <Search size={16} />
                {t("sidebar.searchCode")}
              </NavLink>
              <NavLink to="/organizations" className={navLink}>
                <Users size={16} />
                {t("sidebar.organizations")}
              </NavLink>
            </nav>
          )}
        </div>
        <div className="border-t border-line py-2">
          <Link to="/projects" className={sidebarUtility}>
            <FolderGit2 size={16} />
            {t("sidebar.allProjects")}
          </Link>
          <Link to={user ? "/account" : "/login"} className={sidebarUtility}>
            <Settings size={16} />
            {user ? t("sidebar.preferences") : t("sidebar.signIn")}
          </Link>
          <button
            className={`${sidebarUtility} max-md:hidden`}
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose size={16} />
            {t("sidebar.collapseSidebar")}
          </button>
        </div>
      </aside>
      <button
        className={`hidden max-md:fixed max-md:inset-x-0 max-md:top-12 max-md:bottom-0 max-md:z-25 max-md:block max-md:border-0 max-md:bg-[#0004] max-md:[transition:opacity_180ms_ease,visibility_180ms] ${mobileOpen ? "max-md:pointer-events-auto max-md:visible max-md:opacity-100" : "max-md:pointer-events-none max-md:invisible max-md:opacity-0"}`}
        aria-label={t("sidebar.closeNavigation")}
        tabIndex={-1}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />
      <div
        className={`main mr-2 mb-2 min-h-[calc(100vh-56px)] min-w-0 rounded-xl border border-[#d2d2d5] bg-white shadow-sm transition-[margin-left] duration-[180ms] ease-[ease] max-md:ml-2 dark:border-line dark:bg-[#18171d] ${collapsed ? "ml-2" : "ml-60"}`}
      >
        <div className="flex min-h-10 items-center justify-between gap-4 px-3 py-2">
          <nav
            aria-label={t("breadcrumb.label")}
            className="flex min-w-0 items-center gap-2 text-xs"
          >
            <Link
              to={scopeName ? scopeRoot : "/projects"}
              className={breadcrumbLink}
            >
              <FolderGit2 size={14} />
              {match
                ? owner
                : scopeName
                  ? scope.data?.profile?.full_name || scopeName
                  : t("breadcrumb.yourWork")}
            </Link>
            <span className="text-[#89888d]">/</span>
            {match ? (
              <>
                <Link
                  to={root}
                  className={`${breadcrumbLink} aria-[current=page]:font-semibold`}
                  aria-current={!section ? "page" : undefined}
                >
                  {repo}
                </Link>
                {section && <span className="text-[#89888d]">/</span>}
                {hasWorkNumber ? (
                  <>
                    <Link to={`${root}/${section}`} className={breadcrumbLink}>
                      {labels[section]}
                    </Link>
                    <span className="text-[#89888d]">/</span>
                    <span
                      aria-current="page"
                      className="truncate font-semibold"
                    >
                      {section === "merge-requests" ? "!" : "#"}
                      {workNumber}
                    </span>
                  </>
                ) : section ? (
                  <span aria-current="page" className="truncate font-semibold">
                    {labels[section] ?? t("breadcrumb.project")}
                  </span>
                ) : null}
              </>
            ) : (
              <span aria-current="page" className="truncate font-semibold">
                {scopeName
                  ? scopeTrail(
                      location.pathname
                        .slice(scopeRoot.length)
                        .split("/")
                        .filter(Boolean),
                    ).join(" / ") ||
                    (scopeKind === "organization"
                      ? t("breadcrumb.projects")
                      : t("breadcrumb.overview"))
                  : globalLabel}
              </span>
            )}
          </nav>
          <span className="truncate text-xs text-muted max-[1101px]:hidden">
            {bootstrap.app_name}
          </span>
        </div>
        <main id="main-content" tabIndex={-1} className="min-w-0 outline-none">
          {bootstrap.flash_error && (
            <div className="form-error m-5" role="alert">
              {bootstrap.flash_error}
            </div>
          )}
          <Suspense
            fallback={
              <div
                className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted"
                role="status"
              >
                {t("loading")}
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
