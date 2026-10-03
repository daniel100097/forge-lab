import { useColorMode } from "./Theme";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { BoardCardContent, BoardCardOrder, type BoardIssue } from "./BoardCard";
import { orderedBoardIssues, type BoardMove } from "./boardOrder";
const NativeNavigationPage = lazy(() => import("./NativeNavigation"));
const FileFinderPage = lazy(() => import("./FileFinder"));
const IssuesPage = lazy(() =>
  import("./IssueList").then((module) => ({ default: module.IssuesPage })),
);
const ApiReferencePage = lazy(() =>
  import("./ApiReference").then((module) => ({
    default: module.ApiReferencePage,
  })),
);
const DashboardActivityPage = lazy(() =>
  import("./WorkspaceActivity").then((module) => ({
    default: module.DashboardActivityPage,
  })),
);
const WorkspaceWorkPage = lazy(() =>
  import("./WorkspaceActivity").then((module) => ({
    default: module.WorkspaceWorkPage,
  })),
);
const WatchedProjectsPage = lazy(() =>
  import("./WorkspaceActivity").then((module) => ({
    default: module.WatchedProjectsPage,
  })),
);
const WorkspaceMilestonesPage = lazy(() =>
  import("./WorkspaceActivity").then((module) => ({
    default: module.WorkspaceMilestonesPage,
  })),
);
const WorkspaceCodeSearchPage = lazy(() =>
  import("./WorkspaceActivity").then((module) => ({
    default: module.WorkspaceCodeSearchPage,
  })),
);
const Installer = lazy(() =>
  import("./Installer").then((module) => ({ default: module.Installer })),
);
import "./navigationGuard";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  FolderGit2,
  GitFork,
  Globe2,
  LayoutGrid,
  List,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Search,
  Star,
  Terminal,
  X,
} from "lucide-react";
import {
  get,
  native,
  post,
  repoPath,
  request,
  RequestError,
  type Board,
  type Bootstrap,
  type Project,
  type Repository,
  type RepoSearch,
} from "./api";
import i18n, { setLanguage } from "./i18n";

const AccountSettingsLayout = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountSettingsLayout,
  })),
);
const AccountDetailsPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountDetailsPage,
  })),
);
const AccountSecurityPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountSecurityPage,
  })),
);
const TwoFactorSettingsPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.TwoFactorSettingsPage,
  })),
);
const AccountKeysPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountKeysPage,
  })),
);
const AccountApplicationsPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountApplicationsPage,
  })),
);
const NewTokenPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.NewTokenPage,
  })),
);
const OAuthApplicationPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.OAuthApplicationPage,
  })),
);
const BlockedUsersPage = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.BlockedUsersPage,
  })),
);
const OwnerBoardsPage = lazy(() =>
  import("./OwnerBoards").then((module) => ({
    default: module.OwnerBoardsPage,
  })),
);
const AdminPage = lazy(() =>
  import("./AdminPages").then((module) => ({ default: module.AdminPage })),
);
const SharedWebhookSettings = lazy(() =>
  import("./WebhookSettings").then((module) => ({
    default: module.SharedWebhookSettings,
  })),
);
const AbuseReportPage = lazy(() =>
  import("./ProjectCreation").then((module) => ({
    default: module.AbuseReportPage,
  })),
);
const UsersDirectoryPage = lazy(() =>
  import("./WorkspaceManagement").then((module) => ({
    default: module.UsersDirectoryPage,
  })),
);
const PublicProfilePage = lazy(() =>
  import("./WorkspaceManagement").then((module) => ({
    default: module.PublicProfilePage,
  })),
);
const NewOrganizationPage = lazy(() =>
  import("./WorkspaceManagement").then((module) => ({
    default: module.NewOrganizationPage,
  })),
);
const OrganizationPage = lazy(() =>
  import("./WorkspaceManagement").then((module) => ({
    default: module.OrganizationPage,
  })),
);
const TeamPage = lazy(() =>
  import("./WorkspaceManagement").then((module) => ({
    default: module.TeamPage,
  })),
);
const ProjectPackages = lazy(() =>
  import("./PackagePages").then((module) => ({
    default: module.ProjectPackages,
  })),
);
const OwnerPackages = lazy(() =>
  import("./PackagePages").then((module) => ({
    default: module.OwnerPackages,
  })),
);
const PackageDetail = lazy(() =>
  import("./PackagePages").then((module) => ({
    default: module.PackageDetail,
  })),
);
const PackageLatest = lazy(() =>
  import("./PackagePages").then((module) => ({
    default: module.PackageLatest,
  })),
);
const SharedPackageSettings = lazy(() =>
  import("./PackagePages").then((module) => ({
    default: module.SharedPackageSettings,
  })),
);
import { RepositoryLifecycle } from "./RepositoryLifecycle";
const AuthenticationExtrasPage = lazy(() =>
  import("./AuthenticationExtras").then((module) => ({
    default: module.AuthenticationExtrasPage,
  })),
);
const OrganizationAdvancedSettingsPage = lazy(() =>
  import("./OrganizationSettings").then((module) => ({
    default: module.OrganizationAdvancedSettingsPage,
  })),
);
const TeamInvitationPage = lazy(() =>
  import("./OrganizationSettings").then((module) => ({
    default: module.TeamInvitationPage,
  })),
);
const SharedStoragePage = lazy(() =>
  import("./OrganizationSettings").then((module) => ({
    default: module.SharedStoragePage,
  })),
);
const AuthPage = lazy(() =>
  import("./Auth").then((module) => ({ default: module.AuthPage })),
);
const AccountRestriction = lazy(() =>
  import("./Auth").then((module) => ({ default: module.AccountRestriction })),
);
const AppearanceSettingsPage = lazy(() =>
  import("./AccountPreferences").then((module) => ({
    default: module.AppearanceSettingsPage,
  })),
);
const AccountResourcesPage = lazy(() =>
  import("./AccountPreferences").then((module) => ({
    default: module.AccountResourcesPage,
  })),
);
const AuthorizedIntegrationsPage = lazy(() =>
  import("./AccountPreferences").then((module) => ({
    default: module.AuthorizedIntegrationsPage,
  })),
);
const ProjectSettingsPage = lazy(() =>
  import("./ProjectSettings").then((module) => ({
    default: module.ProjectSettingsPage,
  })),
);
const SharedActionsSettings = lazy(() =>
  import("./ProjectSettings").then((module) => ({
    default: module.SharedActionsSettings,
  })),
);
import { Shell } from "./Shell";
const AccountPage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.AccountPage })),
);
const NewProjectPage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.NewProjectPage })),
);
const NewIssuePage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.NewIssuePage })),
);
const NewBoardPage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.NewBoardPage })),
);
const WorkPage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.WorkPage })),
);
const NotFoundPage = lazy(() =>
  import("./Pages").then((module) => ({ default: module.NotFoundPage })),
);
import { uiRoute } from "./routes";
const CodePage = lazy(() =>
  import("./Code").then((module) => ({ default: module.CodePage })),
);
const HistoryPage = lazy(() =>
  import("./Code").then((module) => ({ default: module.HistoryPage })),
);
const CommitPage = lazy(() =>
  import("./Code").then((module) => ({ default: module.CommitPage })),
);
const FileEditorPage = lazy(() =>
  import("./FileEditor").then((module) => ({ default: module.FileEditorPage })),
);
const FileOperationsPage = lazy(() =>
  import("./FileOperations").then((module) => ({
    default: module.FileOperationsPage,
  })),
);
const BranchesPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.BranchesPage,
  })),
);
const TagsPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({ default: module.TagsPage })),
);
const ComparePage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.ComparePage,
  })),
);
const BlamePage = lazy(() =>
  import("./RepositoryPages").then((module) => ({ default: module.BlamePage })),
);
const GraphPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({ default: module.GraphPage })),
);
const RepositorySearchPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.RepositorySearchPage,
  })),
);
const RepositoryActivityPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.RepositoryActivityPage,
  })),
);
const RepositoryPeoplePage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.RepositoryPeoplePage,
  })),
);
const ForkPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({ default: module.ForkPage })),
);
const RepositoryAnalyticsPage = lazy(() =>
  import("./RepositoryPages").then((module) => ({
    default: module.RepositoryAnalyticsPage,
  })),
);
const LabelsPage = lazy(() =>
  import("./IssueManagement").then((module) => ({
    default: module.LabelsPage,
  })),
);
const MilestonesPage = lazy(() =>
  import("./IssueManagement").then((module) => ({
    default: module.MilestonesPage,
  })),
);
const MilestonePage = lazy(() =>
  import("./IssueManagement").then((module) => ({
    default: module.MilestonePage,
  })),
);
const MilestoneEditorPage = lazy(() =>
  import("./IssueManagement").then((module) => ({
    default: module.MilestoneEditorPage,
  })),
);
const BoardSettingsPage = lazy(() =>
  import("./IssueManagement").then((module) => ({
    default: module.BoardSettingsPage,
  })),
);
const ReleasePage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.ReleasePage,
  })),
);
const LatestReleasePage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.LatestReleasePage,
  })),
);
const WikiCommitPage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.WikiCommitPage,
  })),
);
const ReleaseEditorPage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.ReleaseEditorPage,
  })),
);
const WikiHistoryPage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.WikiHistoryPage,
  })),
);
const WikiSearchPage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.WikiSearchPage,
  })),
);
const RunPipelinePage = lazy(() =>
  import("./PublishingPages").then((module) => ({
    default: module.RunPipelinePage,
  })),
);
const IssuePage = lazy(() =>
  import("./Discussion").then((module) => ({ default: module.IssuePage })),
);
import {
  emptyStateClass,
  loadingClass,
  pageClass,
  pageHeadingClass,
  paginationClass,
  Pending,
} from "./UI";
import { SelectControl } from "./SelectControl";
const NotificationsPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const ReleasesPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.ReleasesPage,
  })),
);
const WikiPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({ default: module.WikiPage })),
);
const PipelinesPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.PipelinesPage,
  })),
);
const PipelinePage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.PipelinePage,
  })),
);
const OrganizationsPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.OrganizationsPage,
  })),
);
const ImportProjectPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.ImportProjectPage,
  })),
);

const signIn = () => "/login";
const initials = (name: string) =>
  name
    .split(/[-_ /]/)
    .filter(Boolean)
    .map((v) => v[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
function when(date?: string) {
  if (!date) return "";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000),
  );
  return days < 30
    ? new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }).format(
        -days,
        "day",
      )
    : new Date(date).toLocaleDateString(i18n.language, {
        month: "short",
        day: "numeric",
      });
}
function ErrorView({ error, retry }: { error: Error; retry?: () => void }) {
  const { t } = useTranslation("shell");
  return (
    <div className={emptyStateClass} role="alert">
      <CircleDot size={30} />
      <h2 className="text-xl font-semibold text-ink">{t("app.errorTitle")}</h2>
      <p className="max-w-lg text-sm leading-6 text-muted">{error.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {error instanceof RequestError && error.loginRequired ? (
          <Link className="button primary" to={signIn()}>
            {t("app.signIn")}
          </Link>
        ) : (
          <button className="button" onClick={retry}>
            {t("app.tryAgain")}
          </button>
        )}
      </div>
    </div>
  );
}
function Loading() {
  const { t } = useTranslation("shell");
  return (
    <div className={loadingClass} role="status">
      <LoaderCircle size={22} className="animate-spin" />
      <span>{t("app.loading")}</span>
    </div>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={emptyStateClass}>
      <FolderGit2 size={34} />
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="max-w-lg text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}
function PageLink({
  to,
  children,
  className = "",
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return /\/raw\//.test(to) ? (
    <a href={native(to)} className={className} download>
      {children}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <Link to={uiRoute(native(to))} className={className}>
      {children}
    </Link>
  );
}
function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Forgejo`;
  }, [title]);
}

export function App() {
  const { t } = useTranslation("shell");
  const current = useLocation();
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async ({ signal }) => {
      const data = await get<Bootstrap>("/-/ui/data/bootstrap", signal);
      // Render in the user's language from the first frame.
      await setLanguage(data.locale ?? navigator.language);
      return data;
    },
  });
  const { applyServerTheme } = useColorMode();
  useEffect(() => {
    if (bootstrap.data?.user?.theme)
      applyServerTheme(bootstrap.data.user.theme, true);
  }, [bootstrap.data?.user?.theme, bootstrap.dataUpdatedAt, applyServerTheme]);
  if (bootstrap.isPending) return <Loading />;
  if (bootstrap.error)
    return (
      <ErrorView
        error={bootstrap.error}
        retry={() => void bootstrap.refetch()}
      />
    );
  if (bootstrap.data.install)
    return (
      <Suspense fallback={<Loading />}>
        <Installer />
      </Suspense>
    );
  if (bootstrap.data.contract !== 1)
    return (
      <ErrorView
        error={new Error(t("app.versionMismatch"))}
        retry={() => location.reload()}
      />
    );
  if (
    bootstrap.data.auth_state === "password_change" &&
    current.pathname !== "/login/password"
  )
    return <Navigate to="/login/password" replace />;
  if (
    !(
      bootstrap.data.auth_state === "inactive" &&
      current.pathname.startsWith("/activate")
    ) &&
    !(
      bootstrap.data.auth_state === "security_setup" &&
      current.pathname.startsWith("/account/security")
    ) &&
    ["inactive", "blocked", "security_setup"].includes(
      bootstrap.data.auth_state,
    )
  )
    return (
      <Suspense fallback={<Loading />}>
        <AccountRestriction state={bootstrap.data.auth_state} />
      </Suspense>
    );
  if (
    bootstrap.data.auth.require_sign_in &&
    bootstrap.data.auth_state === "anonymous" &&
    !bootstrap.data.user &&
    !current.pathname.startsWith("/login") &&
    ![
      "/forgot-password",
      "/register",
      "/recover-account",
      "/activate",
      "/activate-email",
    ].includes(current.pathname)
  )
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(current.pathname + current.search)}`}
        replace
      />
    );
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {[
          "register",
          "recover-account",
          "activate",
          "activate-email",
          "login/openid",
          "login/openid/connect",
          "login/openid/register",
          "login/webauthn",
          "login/link-account",
          "oauth/authorize",
        ].map((path) => (
          <Route
            key={path}
            path={path}
            element={<AuthenticationExtrasPage />}
          />
        ))}
        <Route
          path="login/*"
          element={<AuthPage bootstrap={bootstrap.data} />}
        />
        <Route
          path="forgot-password"
          element={<AuthPage bootstrap={bootstrap.data} />}
        />
        <Route element={<Shell bootstrap={bootstrap.data} />}>
          <Route path="admin/*" element={<AdminPage />} />
          <Route
            path="admin/actions"
            element={<Navigate to="/admin/actions/runners" replace />}
          />
          <Route index element={<Navigate to="/projects" replace />} />
          <Route
            path="projects"
            element={<ProjectsPage bootstrap={bootstrap.data} />}
          />
          <Route
            path="projects/new"
            element={<NewProjectPage bootstrap={bootstrap.data} />}
          />
          <Route
            path="account"
            element={<AccountSettingsLayout bootstrap={bootstrap.data} />}
          >
            <Route index element={<AccountPage bootstrap={bootstrap.data} />} />
            <Route path="account" element={<AccountDetailsPage />} />
            <Route path="security" element={<AccountSecurityPage />} />
            <Route
              path="security/two-factor/:mode"
              element={<TwoFactorSettingsPage />}
            />
            <Route path="keys" element={<AccountKeysPage />} />
            <Route path="applications" element={<AccountApplicationsPage />} />
            <Route path="applications/tokens/new" element={<NewTokenPage />} />
            <Route
              path="applications/oauth2/:id"
              element={<OAuthApplicationPage />}
            />
            <Route path="blocked" element={<BlockedUsersPage />} />
            <Route
              path="packages/*"
              element={
                <SharedPackageSettings
                  nativeRoot="/user/settings/packages"
                  uiRoot="/account/packages"
                />
              }
            />
            <Route path="storage_overview" element={<SharedStoragePage />} />
            <Route path="appearance" element={<AppearanceSettingsPage />} />
            <Route
              path="organization"
              element={<AccountResourcesPage organizations />}
            />
            <Route path="repos" element={<AccountResourcesPage />} />
            <Route
              path="authorized-integrations"
              element={<AuthorizedIntegrationsPage />}
            />
            <Route
              path="authorized-integrations/:ui/new"
              element={<AuthorizedIntegrationsPage />}
            />
            <Route
              path="authorized-integrations/:ui/:id"
              element={<AuthorizedIntegrationsPage />}
            />
            <Route path="actions/*" element={<PersonalActionsSettings />} />
            <Route
              path="actions"
              element={<Navigate to="/account/actions/runners" replace />}
            />
            <Route path="hooks/*" element={<PersonalWebhookSettings />} />
          </Route>
          <Route
            path="work/issues"
            element={<WorkPage bootstrap={bootstrap.data} />}
          />
          <Route
            path="work/merge-requests"
            element={<WorkPage bootstrap={bootstrap.data} pulls />}
          />
          <Route
            path="notifications"
            element={<NotificationsPage bootstrap={bootstrap.data} />}
          />
          <Route path="packages/:owner" element={<OwnerPackages />} />
          <Route
            path="packages/:owner/:type/:name"
            element={<PackageLatest />}
          />
          <Route
            path="packages/:owner/:type/:name/versions"
            element={<PackageDetail />}
          />
          <Route
            path="packages/:owner/:type/:name/:version"
            element={<PackageDetail />}
          />
          <Route
            path="packages/:owner/:type/:name/:version/settings"
            element={<PackageDetail />}
          />
          <Route
            path="organizations/:org/settings/packages/*"
            element={<OrganizationPackages />}
          />
          <Route path="activity" element={<DashboardActivityPage />} />
          <Route path="work/milestones" element={<WorkspaceMilestonesPage />} />
          <Route path="search" element={<WorkspaceCodeSearchPage />} />
          <Route
            path="users/:username/search"
            element={<WorkspaceCodeSearchPage />}
          />
          <Route
            path="notifications/subscriptions"
            element={
              <WorkspaceWorkPage bootstrap={bootstrap.data} subscriptions />
            }
          />
          <Route
            path="notifications/watching"
            element={<WatchedProjectsPage />}
          />
          <Route
            path="organizations/:org/activity"
            element={<DashboardActivityPage />}
          />
          <Route
            path="organizations/:org/issues"
            element={<WorkspaceWorkPage bootstrap={bootstrap.data} />}
          />
          <Route
            path="organizations/:org/merge-requests"
            element={<WorkspaceWorkPage bootstrap={bootstrap.data} pulls />}
          />
          <Route
            path="organizations/:org/milestones"
            element={<WorkspaceMilestonesPage />}
          />
          <Route
            path="organizations/:org/search"
            element={<WorkspaceCodeSearchPage />}
          />
          <Route path="users" element={<UsersDirectoryPage />} />
          <Route path="report-abuse" element={<AbuseReportPage />} />
          <Route path="users/:username/boards" element={<OwnerBoardsPage />} />
          <Route
            path="users/:username/boards/new"
            element={<OwnerBoardsPage mode="new" />}
          />
          <Route
            path="users/:username/boards/:board/edit"
            element={<OwnerBoardsPage mode="edit" />}
          />
          <Route
            path="users/:username/boards/:board"
            element={<OwnerBoardsPage mode="view" />}
          />
          <Route
            path="organizations/:org/boards"
            element={<OwnerBoardsPage />}
          />
          <Route
            path="organizations/:org/boards/new"
            element={<OwnerBoardsPage mode="new" />}
          />
          <Route
            path="organizations/:org/boards/:board/edit"
            element={<OwnerBoardsPage mode="edit" />}
          />
          <Route
            path="organizations/:org/boards/:board"
            element={<OwnerBoardsPage mode="view" />}
          />
          <Route path="users/:username" element={<PublicProfilePage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route
            path="organizations/invite/:token"
            element={<TeamInvitationPage />}
          />
          <Route
            path="organizations/:org/settings/actions"
            element={<Navigate to="runners" replace />}
          />
          <Route
            path="organizations/:org/settings/*"
            element={<OrganizationAdvancedSettingsPage />}
          />
          <Route path="organizations/new" element={<NewOrganizationPage />} />
          <Route
            path="organizations/:org"
            element={<OrganizationPage section="" />}
          />
          <Route
            path="organizations/:org/members"
            element={<OrganizationPage section="members" />}
          />
          <Route
            path="organizations/:org/teams"
            element={<OrganizationPage section="teams" />}
          />
          <Route
            path="organizations/:org/settings"
            element={<OrganizationPage section="settings" />}
          />
          <Route
            path="organizations/:org/teams/new"
            element={<TeamPage mode="new" />}
          />
          <Route
            path="organizations/:org/teams/:team"
            element={<TeamPage mode="members" />}
          />
          <Route
            path="organizations/:org/teams/:team/repositories"
            element={<TeamPage mode="repositories" />}
          />
          <Route
            path="organizations/:org/teams/:team/edit"
            element={<TeamPage mode="edit" />}
          />
          <Route
            path="projects/import"
            element={<ImportProjectPage bootstrap={bootstrap.data} />}
          />
          <Route path="help/api" element={<ApiReferencePage />} />
          <Route
            path="help/api/forgejo"
            element={<ApiReferencePage forgejo />}
          />
          <Route path="resolve" element={<NativeNavigationPage />} />
          <Route path="not-found" element={<NotFoundPage />} />
          <Route path="unavailable" element={<NotFoundPage />} />
          <Route path="projects/:owner/:repo" element={<RepositoryLayout />}>
            <Route index element={<CodePage />} />
            <Route
              path="edit"
              element={
                <Suspense fallback={<Pending />}>
                  <FileEditorPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<Pending />}>
                  <FileEditorPage create />
                </Suspense>
              }
            />
            <Route
              path="patch"
              element={
                <Suspense fallback={<Pending />}>
                  <FileOperationsPage operation="patch" />
                </Suspense>
              }
            />
            <Route
              path="cherry-pick"
              element={
                <Suspense fallback={<Pending />}>
                  <FileOperationsPage operation="cherry-pick" />
                </Suspense>
              }
            />
            <Route
              path="revert"
              element={
                <Suspense fallback={<Pending />}>
                  <FileOperationsPage operation="revert" />
                </Suspense>
              }
            />
            <Route
              path="upload"
              element={
                <Suspense fallback={<Pending />}>
                  <FileOperationsPage operation="upload" />
                </Suspense>
              }
            />
            <Route
              path="delete"
              element={
                <Suspense fallback={<Pending />}>
                  <FileOperationsPage operation="delete" />
                </Suspense>
              }
            />
            <Route path="history" element={<HistoryPage />} />
            <Route path="commit/:sha" element={<CommitPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="blame" element={<BlamePage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="search" element={<RepositorySearchPage />} />
            <Route path="activity" element={<RepositoryActivityPage />} />
            <Route path="fork" element={<ForkPage />} />
            <Route path="labels" element={<LabelsPage />} />
            <Route path="milestones" element={<MilestonesPage />} />
            <Route path="milestones/new" element={<MilestoneEditorPage />} />
            <Route
              path="milestones/:milestone/edit"
              element={<MilestoneEditorPage />}
            />
            <Route path="milestones/:milestone" element={<MilestonePage />} />
            <Route
              path="boards/:board/settings"
              element={<BoardSettingsPage />}
            />
            <Route
              path="boards/:board/edit"
              element={<Navigate to="../settings" relative="path" replace />}
            />
            <Route path="releases/latest" element={<LatestReleasePage />} />
            <Route path="wiki/commit/:sha" element={<WikiCommitPage />} />
            <Route path="releases/tag/*" element={<ReleasePage />} />
            <Route
              path="releases/edit/*"
              element={<ReleaseEditorPage edit />}
            />
            <Route path="wiki/history" element={<WikiHistoryPage />} />
            <Route path="wiki/search" element={<WikiSearchPage />} />
            <Route path="actions/new" element={<RunPipelinePage />} />
            <Route
              path="stars"
              element={<RepositoryPeoplePage kind="stars" />}
            />
            <Route
              path="watchers"
              element={<RepositoryPeoplePage kind="watchers" />}
            />
            <Route
              path="forks"
              element={<RepositoryPeoplePage kind="forks" />}
            />
            <Route
              path="activity/contributors"
              element={<RepositoryAnalyticsPage kind="contributors" />}
            />
            <Route
              path="activity/code-frequency"
              element={<RepositoryAnalyticsPage kind="code-frequency" />}
            />
            <Route
              path="activity/recent-commits"
              element={<RepositoryAnalyticsPage kind="recent-commits" />}
            />
            <Route path="packages" element={<ProjectPackages />} />
            <Route path="releases" element={<ReleasesPage />} />
            <Route path="releases/new" element={<ReleaseEditorPage />} />
            <Route path="wiki" element={<WikiPage />} />
            <Route path="settings/*" element={<ProjectSettingsPage />} />
            <Route
              path="settings/actions"
              element={<Navigate to="runners" replace />}
            />
            <Route
              path="find"
              element={
                <Suspense fallback={<Pending />}>
                  <FileFinderPage />
                </Suspense>
              }
            />
            <Route path="actions" element={<PipelinesPage />} />
            <Route path="actions/runs/:run" element={<PipelinePage />} />
            <Route
              path="actions/runs/:run/jobs/:job"
              element={<PipelinePage />}
            />
            <Route
              path="actions/runs/:run/jobs/:job/attempt/:attempt"
              element={<PipelinePage />}
            />
            <Route path="issues" element={<IssuesPage />} />
            <Route path="issues/new" element={<NewIssuePage />} />
            <Route path="issues/new/choose" element={<NewIssuePage />} />
            <Route path="issues/:index" element={<IssuePage />} />
            <Route path="merge-requests/new" element={<NewIssuePage pulls />} />
            <Route path="merge-requests/:index" element={<IssuePage pulls />} />
            <Route path="boards/new" element={<NewBoardPage />} />
            <Route path="merge-requests" element={<IssuesPage pulls />} />
            <Route path="boards" element={<BoardsPage />} />
            <Route path="boards/:board" element={<BoardPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
import {
  WorkspaceRepoFilters,
  repositorySorts,
  normalizeRepositorySort,
} from "./WorkspaceRepoFilters";
function ProjectsPage({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("shell");
  useTitle(t("projects.title"));
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("q") ?? "");
  const tab = bootstrap.user ? (params.get("tab") ?? "yours") : "explore";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("q") ?? "";
  const sort = normalizeRepositorySort(params.get("sort") || "recentupdate");
  const topic = ["1", "true"].includes(params.get("topic") || "");
  const ownerId = params.get("uid") || "";
  const ownerName = params.get("owner") || "";
  useEffect(() => setInput(query), [query]);
  const [view, setView] = useState<"list" | "grid">("list");
  useEffect(() => {
    if (params.get("focus") === "search")
      document.getElementById("project-search")?.focus();
  }, [params]);
  const repos = useQuery({
    queryKey: [
      "projects",
      tab,
      page,
      query,
      params.toString(),
      ownerId,
      topic,
      bootstrap.user?.id,
    ],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({
        ...Object.fromEntries(params),
        q: query,
        ...(topic ? { topic: "true" } : {}),
        page: String(page),
        limit: "20",
        includeDesc: "true",
        sort,
      });
      if (topic) p.set("topic", "true");
      if (tab === "explore" && ownerId) p.set("uid", ownerId);
      if (tab === "yours") p.set("uid", String(bootstrap.user!.id));
      if (tab === "starred") p.set("starredBy", String(bootstrap.user!.id));
      if (tab === "explore")
        return request<ProjectDirectoryResult>(`/explore/repos?${p}`, {
          signal,
          headers: { "X-Forgejo-UI": "1" },
        });
      const order = repositorySorts[sort as keyof typeof repositorySorts] || [
        "updated",
        "desc",
      ];
      p.set("sort", order[0]);
      p.set("order", order[1]);
      if (params.has("private")) p.set("is_private", params.get("private")!);
      return request<ProjectDirectoryResult>(`/repo/search?${p}`, { signal });
    },
  });
  type ProjectDirectoryResult = Omit<RepoSearch, "data"> & {
    only_show_relevant?: boolean;
    data: {
      repository: Repository & { topics?: string[] };
      latest_commit_status?: { status: string };
    }[];
  };
  const relevantOverride = params.get("only_show_relevant");
  const [onlyRelevant, setOnlyRelevant] = useState(() =>
    ["true", "1"].includes(relevantOverride || ""),
  );
  useEffect(() => {
    setOnlyRelevant(
      relevantOverride === null
        ? repos.data?.data.only_show_relevant === true
        : ["true", "1"].includes(relevantOverride),
    );
  }, [relevantOverride, repos.data?.data.only_show_relevant]);
  const setTab = (value: string) =>
    setParams(value === "yours" ? {} : { tab: value });
  function search(e: React.FormEvent) {
    e.preventDefault();
    setParams({
      ...Object.fromEntries(params),
      tab,
      uid: ownerId,
      owner: ownerName,
      q: input,
      sort,
      ...(topic ? { topic: "true" } : {}),
    });
  }
  return (
    <section className={pageClass}>
      <div className={pageHeadingClass}>
        <div>
          <h1 className="text-[28px] leading-9 max-md:text-[22px]">
            {ownerName
              ? t("projects.ownerTitle", { owner: ownerName })
              : t("projects.title")}
          </h1>
        </div>
        <PageLink
          to={bootstrap.user ? "/repo/create" : "/user/login"}
          className="button primary"
        >
          <Plus size={17} />
          {t("projects.newProject")}
        </PageLink>
      </div>
      <div className="tabs" role="tablist" aria-label={t("projects.filter")}>
        {[
          ["yours", t("projects.tabs.yours")],
          ["starred", t("projects.tabs.starred")],
          ["explore", t("projects.tabs.explore")],
        ]
          .filter(([key]) => bootstrap.user || key === "explore")
          .map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {key === "starred" && <Star size={15} />} {label}
              {key === tab && repos.data && (
                <span className="counter">{repos.data.total}</span>
              )}
            </button>
          ))}
      </div>
      <WorkspaceRepoFilters
        dashboard={tab !== "explore"}
        projectTypes={tab === "yours"}
        language={tab === "explore"}
      />
      {tab === "explore" && (
        <label className="check-field my-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyRelevant}
            onChange={(event) => {
              setOnlyRelevant(event.target.checked);
              const next = new URLSearchParams(params);
              next.set("only_show_relevant", String(event.target.checked));
              next.delete("page");
              setParams(next);
            }}
          />
          {t("projects.onlyRelevant")}
        </label>
      )}
      <div className="my-4 flex min-w-0 flex-wrap items-center justify-between gap-3 max-md:gap-2">
        <form className="filter-input w-auto flex-1" onSubmit={search}>
          <Search size={17} />
          <input
            id="project-search"
            placeholder={t("projects.searchPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {input && (
            <button
              type="button"
              className="icon-button"
              aria-label={t("projects.clearSearch")}
              onClick={() => {
                setInput("");
                setParams({ tab, uid: ownerId, owner: ownerName });
              }}
            >
              <X size={15} />
            </button>
          )}
        </form>
        <div className="flex shrink-0 items-center gap-3 max-md:gap-2">
          <div className="segmented">
            <button
              aria-label={t("projects.listView")}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={17} />
            </button>
            <button
              aria-label={t("projects.gridView")}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>
      {topic && (
        <div className="mb-3">
          <button
            className="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("topic");
              next.delete("q");
              setParams(next);
            }}
          >
            {t("projects.topic", { topic: query })} <X size={14} />
          </button>
        </div>
      )}
      {repos.isPending ? (
        <Loading />
      ) : repos.error ? (
        <ErrorView error={repos.error} retry={() => void repos.refetch()} />
      ) : repos.data.data.data.length === 0 ? (
        <Empty
          title={
            query ? t("projects.empty.searchTitle") : t("projects.empty.title")
          }
        >
          {query ? t("projects.empty.searchBody") : t("projects.empty.body")}
        </Empty>
      ) : (
        <div
          className={`repo-list ${view === "grid" ? "grid-view grid grid-cols-2 gap-4 border-0 max-md:grid-cols-[1fr]" : topic ? "border-t border-line" : "border-t-0"}`}
        >
          <div className="hidden">
            <span>{t("projects.columns.project")}</span>
            <span>{t("projects.columns.activity")}</span>
          </div>
          {repos.data.data.data.map(
            ({ repository: r, latest_commit_status: status }) => (
              <Link
                className={`repo-row flex min-h-16 items-center gap-2 border-line hover:bg-[#fafafa] max-md:gap-3 dark:hover:bg-hover ${view === "grid" ? "flex-wrap rounded border p-4" : "border-b px-4 py-3"}`}
                key={r.id}
                to={`/projects/${r.full_name.split("/").map(encodeURIComponent).join("/")}`}
              >
                <FolderGit2 size={16} className="shrink-0 text-muted" />
                <span
                  className={`project-avatar color-${r.id % 5} size-8 rounded text-lg font-normal`}
                >
                  {initials(r.name || r.full_name.split("/")[1])}
                </span>
                <div
                  className={`min-w-0 ${view === "grid" ? "w-[calc(100%-80px)] flex-auto" : "flex-1"}`}
                >
                  <div className="flex items-center gap-1 text-sm font-semibold text-heading">
                    <span className="truncate">
                      {r.full_name.split("/")[0]}{" "}
                      <span className="mx-1 text-muted">/</span>{" "}
                      <strong className="font-semibold">
                        {r.name || r.full_name.split("/")[1]}
                      </strong>
                    </span>
                    {r.private ? (
                      <LockKeyhole
                        size={13}
                        aria-label={t("projects.private")}
                        className="shrink-0 text-muted"
                      />
                    ) : (
                      <Globe2
                        size={13}
                        aria-label={t("projects.public")}
                        className="shrink-0 text-muted"
                      />
                    )}
                    {r.archived && (
                      <span className="badge">{t("projects.archived")}</span>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {r.description}
                    </p>
                  )}
                  {!!r.topics?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.topics.map((topicName) => (
                        <button
                          type="button"
                          className="badge text-primary"
                          key={topicName}
                          onClick={(event) => {
                            event.preventDefault();
                            setParams({
                              tab: "explore",
                              q: topicName,
                              topic: "1",
                            });
                          }}
                        >
                          {topicName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`flex shrink-0 flex-col items-end gap-0.5 text-xs whitespace-nowrap text-muted max-md:hidden ${view === "grid" ? "w-full border-t border-line pt-3" : ""}`}
                >
                  <div className="flex gap-2 text-sm text-muted">
                    <span
                      title={t("projects.stars")}
                      className="flex items-center gap-1"
                    >
                      <Star size={15} />
                      {r.stars_count}
                    </span>
                    {r.forks_count !== undefined && (
                      <span
                        title={t("projects.forks")}
                        className="flex items-center gap-1"
                      >
                        <GitFork size={15} />
                        {r.forks_count}
                      </span>
                    )}
                    {status && (
                      <span
                        className={`flex items-center gap-1 ${status.status === "success" ? "text-success" : status.status === "failure" ? "text-danger" : ""}`}
                      >
                        <span />
                        {(
                          {
                            success: t("projects.status.success"),
                            failure: t("projects.status.failure"),
                            pending: t("projects.status.pending"),
                            error: t("projects.status.error"),
                            warning: t("projects.status.warning"),
                          } as Record<string, string>
                        )[status.status] ?? status.status}
                      </span>
                    )}
                  </div>
                  <span>
                    {t("projects.updated", { date: when(r.updated_at) })}
                  </span>
                </div>
              </Link>
            ),
          )}
        </div>
      )}
      {repos.data && repos.data.total > 20 && (
        <div className={paginationClass}>
          <span>
            {t("projects.range", {
              from: (page - 1) * 20 + 1,
              to: Math.min(page * 20, repos.data.total),
              total: repos.data.total,
            })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button"
              disabled={page <= 1}
              onClick={() =>
                setParams({
                  ...Object.fromEntries(params),
                  tab,
                  uid: ownerId,
                  owner: ownerName,
                  q: query,
                  ...(topic ? { topic: "true" } : {}),
                  sort,
                  page: String(page - 1),
                })
              }
            >
              {t("projects.previous")}
            </button>
            <button
              className="button"
              disabled={page * 20 >= repos.data.total}
              onClick={() =>
                setParams({
                  ...Object.fromEntries(params),
                  tab,
                  uid: ownerId,
                  owner: ownerName,
                  q: query,
                  ...(topic ? { topic: "true" } : {}),
                  sort,
                  page: String(page + 1),
                })
              }
            >
              {t("projects.next")}
            </button>
          </div>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 py-2 text-sm text-muted">
        <Terminal size={16} />
        <PageLink
          to="/repo/migrate"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {t("projects.importExisting")}
        </PageLink>
      </div>
    </section>
  );
}
export interface RepoContext {
  repository: Repository;
  path: string;
  dataPath: string;
}
function RepositoryLayout() {
  const current = useLocation();
  const { owner = "", repo = "" } = useParams();
  const path = repoPath(owner, repo);
  const dataPath = `/-/ui/data/repos${path}`;
  const result = useQuery({
    queryKey: ["repo", owner, repo],
    queryFn: ({ signal }) => get<Repository>(dataPath, signal),
  });
  useTitle(repo);
  if (result.isPending) return <Loading />;
  if (result.error)
    return (
      <ErrorView error={result.error} retry={() => void result.refetch()} />
    );
  const r = result.data;
  return (
    <section className="mx-auto w-full min-w-0 max-w-[1272px] pt-0 pr-7 pb-8 pl-3 has-[>.project-overview]:max-w-[1312px] has-[>.repository-workspace]:max-w-none has-[>.repository-workspace]:pt-2 has-[>.repository-workspace]:pr-14 has-[>.repository-workspace]:pl-10 max-[1440px]:has-[>.repository-workspace]:pr-7 max-[1440px]:has-[>.repository-workspace]:pl-3 max-md:pr-3 max-md:pb-6 max-md:has-[>.repository-workspace]:pr-3 max-md:has-[>.repository-workspace]:pb-6">
      <RepositoryLifecycle path={path} repository={r} />
      {(![1, 3].includes(r.status || 0) ||
        current.pathname.includes("/settings")) && (
        <Outlet
          context={{ repository: r, path, dataPath } satisfies RepoContext}
        />
      )}
    </section>
  );
}
function BoardsPage() {
  const { t } = useTranslation("shell");
  const { path, dataPath } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const state = params.get("state") || "open",
    q = params.get("q") || "",
    sort = params.get("sort") || "newest";
  const update = (values: Record<string, string>) =>
    setParams({ state, q, sort, ...values });
  const boards = useQuery({
    queryKey: ["boards", path, page, state, q, sort],
    queryFn: ({ signal }) =>
      get<{
        items: (Project & { open_count: number; closed_count: number })[];
        total: number;
        open_count: number;
        closed_count: number;
        can_write: boolean;
      }>(
        `${dataPath}/projects?${new URLSearchParams({ page: String(page), state, q, sort })}`,
        signal,
      ),
  });
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 py-3">
        <div>
          <h1>{t("boards.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("boards.tagline")}</p>
        </div>
        {boards.data?.can_write && (
          <PageLink className="button primary" to={`${path}/projects/new`}>
            <Plus size={15} />
            {t("boards.newBoard")}
          </PageLink>
        )}
      </div>
      <nav className="tabs" aria-label={t("boards.parity.stateTabs")}>
        {["open", "closed"].map((value) => (
          <button
            key={value}
            className={state === value ? "active" : ""}
            onClick={() => update({ state: value })}
          >
            {value === "open"
              ? t("boards.parity.open")
              : t("boards.parity.closed")}{" "}
            <span className="counter">
              {value === "open"
                ? boards.data?.open_count || 0
                : boards.data?.closed_count || 0}
            </span>
          </button>
        ))}
      </nav>
      <div className="my-4 flex flex-wrap items-center gap-3">
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
              key={q}
              name="q"
              defaultValue={q}
              aria-label={t("boards.parity.search")}
              placeholder={t("boards.parity.search")}
            />
          </label>
          <button className="button">{t("boards.parity.searchButton")}</button>
        </form>
        <SelectControl
          label={t("boards.parity.sortLabel")}
          value={sort}
          onValueChange={(value) => update({ sort: value })}
          options={["newest", "oldest", "recentupdate", "leastupdate"].map(
            (value) => ({
              value,
              label: t(`boards.parity.sort.${value as "newest"}`),
            }),
          )}
        />
      </div>
      {boards.isPending ? (
        <Loading />
      ) : boards.error ? (
        <ErrorView error={boards.error} retry={() => void boards.refetch()} />
      ) : boards.data.items.length === 0 ? (
        <Empty title={t("boards.empty.title")}>{t("boards.empty.body")}</Empty>
      ) : (
        <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 max-[1101px]:grid-cols-2 max-md:grid-cols-[1fr]">
          {boards.data.items.map((board) => (
            <Link
              key={board.id}
              to={String(board.id)}
              className="rounded border border-line bg-surface p-5 hover:border-[#89888d]"
            >
              <LayoutGrid size={23} className="text-muted" />
              <h3 className="mt-3 mb-2">{board.title}</h3>
              <p className="text-sm text-muted">
                {board.description || t("boards.defaultDescription")}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                <span>
                  {t("boards.parity.openCount", {
                    count: board.open_count || 0,
                  })}
                </span>
                <span>
                  {t("boards.parity.closedCount", {
                    count: board.closed_count || 0,
                  })}
                </span>
              </div>
              <span className="mt-4 flex items-center gap-1 text-sm text-primary">
                {t("boards.open")} <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      )}
      {boards.data && boards.data.total > 30 && (
        <div className={paginationClass}>
          <span>{t("boards.count", { count: boards.data.total })}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) })}
            >
              {t("boards.previous")}
            </button>
            <button
              className="button"
              disabled={page * 30 >= boards.data.total}
              onClick={() => update({ page: String(page + 1) })}
            >
              {t("boards.next")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function BoardPage() {
  const { t } = useTranslation("shell");
  const { t: cardText } = useTranslation("issues");
  const { path, dataPath } = useOutletContext<RepoContext>();
  const { board = "" } = useParams();
  const client = useQueryClient();
  const [filter, setFilter] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["board", path, board],
    queryFn: ({ signal }) =>
      get<
        Board & {
          project: Project & { card_type: number };
          columns: {
            id: number;
            title: string;
            color: string;
            issues: BoardIssue[];
          }[];
        }
      >(`${dataPath}/projects/${board}`, signal),
  });
  const move = useMutation({
    mutationFn: (move: BoardMove) => {
      const issues = orderedBoardIssues(query.data!.columns, move);
      if (!issues) throw new Error(cardText("boardParity.invalidMove"));
      return post(`${path}/projects/${board}/${move.column}/move`, { issues });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["board", path, board] }),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorView error={query.error} retry={() => void query.refetch()} />;
  return (
    <>
      <div className="mb-3 flex min-h-14 items-center gap-3 border-b border-line pt-1 pb-3 max-md:flex-wrap">
        <div
          className="flex min-w-0 items-center gap-1"
          title={query.data.project.description}
        >
          <Link
            className="icon-button"
            to=".."
            relative="path"
            aria-label={t("board.allBoards")}
            title={t("board.allBoards")}
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="max-w-60 truncate text-sm font-semibold max-md:max-w-[180px]">
            {query.data.project.title}
          </h1>
          {query.data.project.closed && (
            <span className="badge">{t("boards.parity.closed")}</span>
          )}
        </div>
        <label className="filter-input w-auto min-w-0 flex-1 max-md:order-3 max-md:basis-full">
          <Search size={16} />
          <input
            aria-label={t("board.filter")}
            placeholder={t("board.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              type="button"
              className="icon-button"
              aria-label={t("board.clearFilter")}
              onClick={() => setFilter("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        {query.data.can_write && (
          <Link
            className="button max-md:ml-auto"
            to={`/projects${path}/boards/${board}/settings`}
          >
            {t("board.settings")}
          </Link>
        )}
        {query.data.can_write && (
          <PageLink
            className="button max-md:ml-auto"
            to={`${path}/issues/new?project_id=${board}`}
          >
            <Plus size={15} />
            {t("board.newIssue")}
          </PageLink>
        )}
      </div>
      {move.error && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-[#a34a44] dark:bg-danger-bg dark:text-danger"
          role="alert"
        >
          {move.error.message}
          <button
            className="border-0 bg-transparent"
            onClick={() => move.reset()}
            aria-label={t("board.dismissError")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="flex min-h-[calc(100vh-178px)] gap-2 overflow-x-auto pb-2">
        {query.data.columns.map((column) => (
          <div
            className="kanban-column w-100 shrink-0 rounded-lg bg-[#ececef] max-md:w-80 dark:bg-surface-subtle"
            key={column.id}
            onDragOver={(e) => {
              if (query.data.can_write && !move.isPending) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged !== null && query.data.can_write && !move.isPending)
                move.mutate({ issue: dragged, column: column.id });
              setDragged(null);
            }}
          >
            <div className="flex h-13 items-center gap-2 px-4 py-3">
              <i
                className="size-2 rounded-full"
                style={{ background: column.color || "#8d82b3" }}
              />
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <span className="ml-auto text-xs font-semibold text-muted">
                {column.issues.length}
              </span>
            </div>
            {column.issues
              .filter((issue) =>
                `${issue.title} #${issue.number} ${issue.labels?.map((l) => l.name).join(" ")}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((issue) => (
                <article
                  key={issue.id}
                  className={`kanban-card mx-2 mb-2 rounded-lg border border-line bg-surface p-3 shadow-xs ${query.data.can_write && !move.isPending ? "cursor-grab" : ""}`}
                  draggable={query.data.can_write && !move.isPending}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", String(issue.id));
                    event.dataTransfer.effectAllowed = "move";
                    setDragged(issue.id);
                  }}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={(event) => {
                    if (query.data.can_write && !move.isPending) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (
                      dragged !== null &&
                      query.data.can_write &&
                      !move.isPending
                    )
                      move.mutate({
                        issue: dragged,
                        column: column.id,
                        before: issue.id,
                      });
                    setDragged(null);
                  }}
                  data-issue-id={issue.id}
                >
                  <BoardCardContent
                    issue={issue}
                    cardType={query.data.project.card_type}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {query.data.can_write && (
                      <BoardCardOrder
                        issue={issue.id}
                        column={column}
                        disabled={move.isPending}
                        onMove={(value) => move.mutate(value)}
                      />
                    )}
                    {query.data.can_write && (
                      <SelectControl
                        className="min-h-6 max-w-36 rounded-full border-transparent bg-[#ececef] px-2 py-0 text-xs hover:border-[#89888d] hover:bg-[#f2f1f5] data-popup-open:border-[#89888d] data-popup-open:bg-[#ececef] dark:bg-hover dark:text-ink dark:hover:bg-hover dark:data-popup-open:border-control dark:data-popup-open:bg-hover dark:data-popup-open:hover:border-[#89888d]"
                        label={t("board.moveLabel", { title: issue.title })}
                        menuTitle={t("board.moveTitle")}
                        value={String(column.id)}
                        disabled={move.isPending}
                        onValueChange={(value) =>
                          move.mutate({
                            issue: issue.id,
                            column: Number(value),
                          })
                        }
                        options={query.data.columns.map((c) => ({
                          value: String(c.id),
                          label: c.title,
                        }))}
                      />
                    )}
                  </div>
                </article>
              ))}
            {column.issues.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted">
                {t("board.noIssues")}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function PersonalActionsSettings() {
  const params = useParams();
  return (
    <SharedActionsSettings
      nativeRoot="/user/settings"
      uiRoot="/account"
      section={params["*"] || "runners"}
    />
  );
}

function PersonalWebhookSettings() {
  const params = useParams();
  return (
    <SharedWebhookSettings
      nativeRoot="/user/settings"
      uiRoot="/account"
      section={`hooks${params["*"] ? `/${params["*"]}` : ""}`}
    />
  );
}

function OrganizationPackages() {
  const { org = "" } = useParams();
  return (
    <SharedPackageSettings
      nativeRoot={`/org/${encodeURIComponent(org)}/settings/packages`}
      uiRoot={`/organizations/${encodeURIComponent(org)}/settings/packages`}
    />
  );
}
