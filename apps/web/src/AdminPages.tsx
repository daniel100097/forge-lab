import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Building2,
  Cog,
  Database,
  GitFork,
  KeyRound,
  Mail,
  Package,
  Play,
  Search,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { native, nativeForm, nativePage, request } from "./api";
import { uiRoute } from "./routes";
import { ConfirmAction } from "./IssueManagement";
import { actionsClass, OAuthApplicationPage } from "./AccountSettings";
import {
  SharedActionsSettings,
  SettingsForm,
  SettingsFields,
} from "./ProjectSettings";
import { SharedWebhookSettings } from "./WebhookSettings";
import { SelectControl } from "./SelectControl";
import {
  EmptyState,
  Feedback,
  Pagination,
  Pending,
  pageHeadingClass,
  useTitle,
} from "./UI";

// Admin area breakpoints: two narrower columns up to 1050px, stacked up to 700px.
// Card headings include the empty-state heading of tables rendered in a card.
const adminCard =
  "mb-6 min-w-0 rounded-lg border border-line bg-surface p-6 max-[701px]:p-4 [&_h2]:mb-[18px] [&_h2]:text-[16px]";
const adminSummary = "cursor-pointer font-semibold";
const adminToolbar = "mt-4 mb-6 flex flex-wrap items-center gap-3";
const adminOperationRow =
  "flex items-center justify-between gap-6 border-b border-line py-4 last:border-0 max-[701px]:flex-wrap max-[701px]:items-start max-[701px]:gap-3";
const adminForm = "max-w-[900px]";
const adminNavLink = (active: boolean) =>
  active
    ? "flex items-center gap-[9px] rounded-[5px] bg-selected px-[10px] py-2 text-[13px] font-semibold text-ink max-[701px]:whitespace-nowrap"
    : "flex items-center gap-[9px] rounded-[5px] px-[10px] py-2 text-[13px] text-ink hover:bg-hover max-[701px]:whitespace-nowrap";
const adminCell = "border-b border-line px-4 py-[13px] max-[701px]:p-[10px]";
const adminHeaderCell = `${adminCell} bg-surface-subtle text-left font-semibold whitespace-nowrap text-muted`;
const adminDataCell = `${adminCell} min-w-[100px] max-w-[400px] align-middle [overflow-wrap:anywhere] group-hover/row:bg-hover`;
type Row = Record<string, string | number | boolean>;
interface AdminData {
  page: string;
  title: string;
  page_size: number;
  total: number;
  Users: Row[];
  User: Row;
  LoginSource?: Row;
  PackageTypes?: { value: string; label: string }[];
  NeedMajorUpdate?: boolean;
  NeedMinorUpdate?: boolean;
  RemoteVersion?: string;
  UpdateCheckerError?: string;
  Repos: Row[];
  Emails: Row[];
  Sources: Row[];
  Source: Row;
  Notices: Row[];
  Packages: Row[];
  Hosts: Row[];
  Host: Row;
  Reports: Row[];
  SysStatus: Row;
  Stats: Row;
  Operations: { Name: string; Label: string }[];
  Tasks: Row[];
  Queues: Row[];
  Queue: Row;
  Dirs: string[];
  ProcessStacks: Process[];
  Config: Record<string, unknown>;
  DynamicConfig: Row;
  DefaultEditorApps: string;
  AuthFields: Row;
  AuthProviders: string[];
  SMTPAuths?: string[];
  AuthTypes: { value: number; label: string }[];
  DefaultHooks: Row[];
  SystemHooks: Row[];
  WebhookProviders: string[];
  CanSendEmail: boolean;
  TwoFactorEnabled: boolean;
  ContentReference: string;
  ContentURL: string;
  PackagesEnabled: boolean;
  ActionsEnabled: boolean;
  ModerationEnabled: boolean;
  FederationEnabled: boolean;
  OAuth2Enabled: boolean;
  SelfCheckEnabled: boolean;
  DisableGravatar: boolean;
  ReportSnapshots?: Record<string, { Key: string; Value: unknown }[]>;
}
interface Process {
  PID: string;
  Description: string;
  Start: string;
  Type: string;
  Children: Process[];
  Stacks: {
    Count: number;
    Description: string;
    Entries: { Function: string; File: string; Line: number }[];
  }[];
}
// Forgejo reports the start time and raw byte counts; show them like the
// native dashboard does.
function uptime(t: TFunction<"admin">, start?: string) {
  if (!start) return "";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(start).getTime()) / 60000),
  );
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    rest = minutes % 60;
  return [
    days && t("dashboard.uptime.days", { count: days }),
    hours && t("dashboard.uptime.hours", { count: hours }),
    t("dashboard.uptime.minutes", { count: rest }),
  ]
    .filter(Boolean)
    .join(t("dashboard.uptime.separator"));
}
function bytes(value: number, language?: string) {
  const decimal = (number: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
      number,
    );
  return value >= 1024 * 1024 * 1024
    ? `${decimal(value / 1024 / 1024 / 1024)} GiB`
    : value >= 1024 * 1024
      ? `${decimal(value / 1024 / 1024)} MiB`
      : value >= 1024
        ? `${decimal(value / 1024)} KiB`
        : `${value} B`;
}
// Federated users are links between a local account (UserID) and a remote
// actor; their own ID is not a user ID.
const federatedUserColumns = ["ID", "UserID", "ExternalID", "InboxPath"];
const federatedUserCell = (row: Row, key: string) =>
  key === "UserID" ? (
    <Link to={`/admin/users/${row.UserID}`}>{String(row.UserID)}</Link>
  ) : undefined;
const human = (text: string) =>
  text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\.]/g, " ");
function adminFieldLabel(t: TFunction<"admin">, key: string) {
  const labels: Record<string, string> = {
    "picture.disable_gravatar": t("config.dynamic.picture.disable_gravatar"),
    "picture.enable_federated_avatar": t(
      "config.dynamic.picture.enable_federated_avatar",
    ),
    "repository.open_with_editor_apps": t(
      "config.dynamic.repository.open_with_editor_apps",
    ),
    DefaultOrgVisibility: t("fields.defaultOrgVisibility"),
    AllowOnlyExternalRegistration: t("fields.allowOnlyExternalRegistration"),
    AllowOnlyInternalRegistration: t("fields.allowOnlyInternalRegistration"),
    ShowRegistrationButton: t("fields.showRegistrationButton"),
    EnableCaptcha: t("fields.enableCaptcha"),
    EnableOpenIDSignIn: t("fields.enableOpenIDSignIn"),
    EnableOpenIDSignUp: t("fields.enableOpenIDSignUp"),
    ActiveCodeLives: t("fields.activeCodeLives"),
    ResetPwdCodeLives: t("fields.resetPwdCodeLives"),
    AllowDotsInUsernames: t("fields.allowDotsInUsernames"),
    EnableTimetracking: t("fields.enableTimetracking"),
    DefaultEnableTimetracking: t("fields.defaultEnableTimetracking"),
    DefaultAllowOnlyContributorsToTrackTime: t(
      "fields.defaultAllowOnlyContributorsToTrackTime",
    ),
    DefaultEnableDependencies: t("fields.defaultEnableDependencies"),
    NoReplyAddress: t("fields.noReplyAddress"),
    GCArgs: t("fields.gcArgs"),
    MaxGitDiffLines: t("fields.maxGitDiffLines"),
    MaxGitDiffLineCharacters: t("fields.maxGitDiffLineCharacters"),
    MaxGitDiffFiles: t("fields.maxGitDiffFiles"),
    DisableDiffHighlight: t("fields.disableDiffHighlight"),
    "Timeout.Default": t("fields.timeoutDefault"),
    "Timeout.Migrate": t("fields.timeoutMigrate"),
    "Timeout.Mirror": t("fields.timeoutMirror"),
    "Timeout.Clone": t("fields.timeoutClone"),
    "Timeout.Pull": t("fields.timeoutPull"),
    "Timeout.GC": t("fields.timeoutGC"),
    SameSite: t("fields.sameSite"),
    Adapter: t("fields.adapter"),
    Interval: t("fields.interval"),
    TTL: t("fields.tTL"),
    IsEnabled: t("fields.isEnabled"),
    EventWriters: t("fields.eventWriters"),
    WriterType: t("fields.writerType"),
    Level: t("fields.level"),
    BufferLen: t("fields.bufferLen"),
    Colorize: t("fields.colorize"),
    Flags: t("fields.flags"),
    StacktraceLevel: t("fields.stacktraceLevel"),
    ID: t("fields.iD"),
    Name: t("fields.name"),
    FullName: t("fields.fullName"),
    Email: t("fields.email"),
    IsActive: t("fields.isActive"),
    IsAdmin: t("fields.isAdmin"),
    IsRestricted: t("fields.isRestricted"),
    TwoFactorEnabled: t("fields.twoFactorEnabled"),
    CreatedUnix: t("fields.createdUnix"),
    LastLoginUnix: t("fields.lastLoginUnix"),
    OwnerName: t("fields.ownerName"),
    IsPrivate: t("fields.isPrivate"),
    IsArchived: t("fields.isArchived"),
    NumMembers: t("fields.numMembers"),
    NumRepos: t("fields.numRepos"),
    NumWatches: t("fields.numWatches"),
    NumStars: t("fields.numStars"),
    NumForks: t("fields.numForks"),
    NumIssues: t("fields.numIssues"),
    GitSize: t("fields.gitSize"),
    LFSSize: t("fields.lFSSize"),
    Size: t("fields.size"),
    IsPrimary: t("fields.isPrimary"),
    IsActivated: t("fields.isActivated"),
    "Package.Name": t("fields.packageName"),
    "Package.Type": t("fields.packageType"),
    "Version.Version": t("fields.versionVersion"),
    "Owner.Name": t("fields.ownerName"),
    "Creator.Name": t("fields.creatorName"),
    "Version.CreatedUnix": t("fields.versionCreatedUnix"),
    "Version.DownloadCount": t("fields.versionDownloadCount"),
    Select: t("fields.select"),
    LastMessage: t("fields.lastMessage"),
    ExecTimes: t("fields.execTimes"),
    Status: t("fields.status"),
    Spec: t("fields.spec"),
    Next: t("fields.next"),
    Prev: t("fields.prev"),
    Description: t("fields.description"),
    Type: t("fields.type"),
  };
  const configLabels = t("config.fields", { returnObjects: true }) as Record<
    string,
    string
  >;
  return labels[key] || configLabels[key] || human(key);
}
const display = (t: TFunction<"admin">, value: unknown): string =>
  typeof value === "boolean"
    ? value
      ? t("values.yes")
      : t("values.no")
    : value == null
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
function adminQuery(path: string) {
  return {
    queryKey: ["admin", path],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      nativePage<AdminData>(path, signal),
  };
}
export function AdminPage() {
  const { t } = useTranslation("admin");
  const location = useLocation(),
    section = location.pathname.replace(/^\/admin\/?/, "");
  useTitle(t("title"));
  const access = useQuery(adminQuery("/admin"));
  if (access.isPending) return <Pending />;
  if (access.error) return <Feedback error={access.error} />;
  const nav = [
    ["", t("nav.overview"), Server],
    ["users", t("nav.users"), Users],
    ["orgs", t("nav.orgs"), Building2],
    ["repos", t("nav.repos"), GitFork],
    ["emails", t("nav.emails"), Mail],
    ["packages", t("nav.packages"), Package],
    ["auths", t("nav.auths"), KeyRound],
    ["applications", t("nav.applications"), KeyRound],
    ["hooks", t("nav.hooks"), Activity],
    ["actions/runners", t("nav.runners"), Play],
    ["actions/variables", t("nav.variables"), Cog],
    ["notices", t("nav.notices"), Shield],
    ["monitor/stats", t("nav.stats"), Database],
    ["monitor/cron", t("nav.cron"), Activity],
    ["monitor/queue", t("nav.queues"), Database],
    ["monitor/stacktrace", t("nav.processes"), Activity],
    ["config", t("nav.config"), Cog],
    ["system_status", t("nav.systemStatus"), Activity],
    ["self_check", t("nav.selfCheck"), Database],
    ["config/settings", t("nav.settings"), Cog],
    ["moderation/reports", t("nav.reports"), Shield],
    ["federation/hosts", t("nav.federationHosts"), Server],
    ["federation/users", t("nav.federationUsers"), Users],
  ] as const;
  return (
    <div className="m-auto grid max-w-[1600px] grid-cols-[224px_minmax(0,1fr)] gap-8 pt-2 pr-7 pb-8 pl-3 max-md:px-3 max-md:pt-3 max-md:pb-6 max-[1051px]:grid-cols-[180px_minmax(0,1fr)] max-[1051px]:gap-5 max-[701px]:block">
      <aside className="border-r border-line pr-4 max-[701px]:mb-6 max-[701px]:border-r-0 max-[701px]:border-b max-[701px]:pr-0 max-[701px]:pb-4">
        <h2 className="mb-5 flex items-center gap-2 text-[15px] font-semibold">
          <Shield size={18} />
          {t("title")}
        </h2>
        <nav
          className="grid gap-[3px] max-[701px]:flex max-[701px]:overflow-auto"
          aria-label={t("administration")}
        >
          {nav
            .filter(
              ([path]) =>
                !(
                  (path === "packages" && !access.data.PackagesEnabled) ||
                  (path === "applications" && !access.data.OAuth2Enabled) ||
                  (path === "self_check" && !access.data.SelfCheckEnabled) ||
                  (path.startsWith("actions/") &&
                    !access.data.ActionsEnabled) ||
                  (path.startsWith("moderation/") &&
                    !access.data.ModerationEnabled) ||
                  (path.startsWith("federation/") &&
                    !access.data.FederationEnabled)
                ),
            )
            .map(([path, label, Icon]) => (
              <NavLink
                key={path}
                to={`/admin${path ? "/" + path : ""}`}
                end
                className={({ isActive }) => adminNavLink(isActive)}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <main className="admin-content min-w-0">
        {section.startsWith("actions/") ? (
          <SharedActionsSettings
            nativeRoot="/admin"
            uiRoot="/admin"
            section={section.slice("actions/".length)}
          />
        ) : section.startsWith("hooks/") ||
          section.startsWith("default-hooks/") ||
          section.startsWith("system-hooks/") ? (
          <SharedWebhookSettings
            nativeRoot="/admin"
            uiRoot="/admin"
            section={section}
          />
        ) : section.startsWith("applications/oauth2/") ? (
          <OAuthApplicationPage
            frame="admin"
            nativeRoot="/admin"
            applicationId={section.split("/")[2]}
          />
        ) : (
          <AdminNativePage key={section} section={section} />
        )}
      </main>
    </div>
  );
}
function AdminNativePage({ section }: { section: string }) {
  const { t } = useTranslation("admin");
  const [params, setParams] = useSearchParams(),
    query = useQuery(
      adminQuery(`/admin${section ? "/" + section : ""}?${params}`),
    );
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  let content: ReactNode;
  if (!section) content = <AdminDashboard data={data} />;
  else if (/^users\/(new|\d+\/edit)$/.test(section))
    content = <AdminUserForm data={data} endpoint={`/admin/${section}`} />;
  else if (/^users\/\d+$/.test(section))
    content = <AdminUserDetail data={data} />;
  else if (/^auths\/(new|\d+)$/.test(section))
    content = <AdminAuthForm data={data} endpoint={`/admin/${section}`} />;
  else if (section === "config" || section === "config/settings")
    content = (
      <AdminConfiguration
        data={data}
        settings={section.endsWith("/settings")}
      />
    );
  else if (section === "system_status")
    content = <AdminValues data={data.SysStatus} />;
  else if (section === "self_check") content = <AdminHealth data={data} />;
  else if (section === "monitor/stats")
    content = <AdminValues data={data.Stats} />;
  else if (section === "monitor/cron") content = <AdminJobs data={data} />;
  else if (section === "monitor/queue" || section.startsWith("monitor/queue/"))
    content = <AdminQueues data={data} detail={section !== "monitor/queue"} />;
  else if (section === "monitor/stacktrace")
    content = <AdminProcesses data={data} />;
  else if (section === "hooks") content = <AdminHooks data={data} />;
  else if (section === "applications") content = <AdminApplications />;
  else if (section === "repos/unadopted")
    content = <AdminUnadopted data={data} />;
  else if (section.startsWith("moderation/reports"))
    content = <AdminReports data={data} />;
  else if (/^federation\/hosts\/\d+$/.test(section))
    content = (
      <>
        <AdminValues data={data.Host} />
        <AdminTable
          columns={federatedUserColumns}
          rows={data.Users}
          cell={federatedUserCell}
        />
      </>
    );
  else content = <AdminResourceList section={section} data={data} />;
  return (
    <>
      <div className="mb-6 flex min-h-10 flex-wrap items-center justify-between gap-4 max-md:gap-3 [&_.button]:max-w-full [&_.button]:whitespace-normal">
        <div>
          <h1 className="wrap-anywhere">
            {section === "monitor/stats"
              ? t("nav.stats")
              : data.title || t("administration")}
          </h1>
        </div>
        <div className={actionsClass}>
          {section === "users" && (
            <Link className="button primary" to="/admin/users/new">
              {t("header.newUser")}
            </Link>
          )}
          {section === "auths" && (
            <Link className="button primary" to="/admin/auths/new">
              {t("header.addAuthSource")}
            </Link>
          )}
          {section === "repos" && (
            <Link className="button" to="/admin/repos/unadopted">
              {t("header.unadopted")}
            </Link>
          )}
        </div>
      </div>
      {content}
      <Pagination
        page={Number(params.get("page") || 1)}
        total={data.total || 0}
        size={data.page_size}
        onPage={(page) => {
          const next = new URLSearchParams(params);
          next.set("page", String(page));
          setParams(next);
        }}
      />
    </>
  );
}
function AdminTable({
  rows,
  columns,
  cell,
  header,
  actions,
}: {
  rows: Row[];
  columns: string[];
  cell?: (row: Row, column: string) => ReactNode;
  header?: (column: string) => ReactNode;
  actions?: (row: Row) => ReactNode;
}) {
  const { t } = useTranslation("admin");
  if (!rows?.length) return <EmptyState title={t("table.empty")} />;
  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] border-collapse text-[13px] [&_.button]:px-[9px] [&_.button]:py-[5px] [&_.button]:text-[12px]">
        <thead>
          <tr>
            {columns.map((key) => (
              <th className={adminHeaderCell} key={key}>
                {header?.(key) ?? adminFieldLabel(t, key)}
              </th>
            ))}
            {actions && (
              <th className={adminHeaderCell}>{t("table.actions")}</th>
            )}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-0">
          {rows.map((row, index) => (
            <tr className="group/row" key={String(row.ID || index)}>
              {columns.map((key) => (
                <td className={adminDataCell} key={key}>
                  {cell?.(row, key) ?? display(t, row[key])}
                </td>
              ))}
              {actions && (
                <td className={adminDataCell}>
                  <div className={actionsClass}>{actions(row)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AdminValues({
  data,
  nested = false,
}: {
  data: Record<string, unknown>;
  nested?: boolean;
}) {
  const { t } = useTranslation("admin");
  return (
    <dl className={nested ? undefined : "mb-6"}>
      {Object.entries(data || {}).map(([key, value]) => (
        <div
          className={
            value && typeof value === "object"
              ? "border-b border-line py-3 text-[13px]"
              : "grid grid-cols-[minmax(180px,1fr)_minmax(0,2fr)] gap-6 border-b border-line py-3 text-[13px] max-[1051px]:grid-cols-[1fr] max-[1051px]:gap-2"
          }
          key={key}
        >
          <dt className="font-semibold">{adminFieldLabel(t, key)}</dt>
          <dd
            className={
              value && typeof value === "object"
                ? "mt-2 border-l border-line pl-3 [overflow-wrap:anywhere]"
                : "[overflow-wrap:anywhere]"
            }
          >
            {value && typeof value === "object" ? (
              <AdminValues nested data={value as Record<string, unknown>} />
            ) : (
              display(t, value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function AdminAction({
  path,
  values,
  label,
  confirm = false,
  onDone,
}: {
  path: string;
  values?: Record<string, string>;
  label: string;
  confirm?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation("admin");
  const client = useQueryClient();
  const run = async () => {
    await nativeForm(path, values || {});
    await client.invalidateQueries({ queryKey: ["admin"] });
    onDone?.();
  };
  const action = useMutation({ mutationFn: run });
  return confirm ? (
    <ConfirmAction
      label={label}
      title={t("action.confirmTitle", { label })}
      action={run}
    >
      {t("action.confirmText")}
    </ConfirmAction>
  ) : (
    <>
      <button
        className="button"
        disabled={action.isPending}
        onClick={() => action.mutate()}
      >
        {label}
      </button>
      <Feedback error={action.error} />
      {action.isSuccess && (
        <span className="text-[12px] text-success" role="status">
          {t("action.completed")}
        </span>
      )}
    </>
  );
}
function AdminFilters({
  section,
  types,
}: {
  section: string;
  types?: { value: string; label: string }[];
}) {
  const { t } = useTranslation("admin");
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("q") || "");
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete("page");
    setParams(next);
  };
  return (
    <div className="mb-4 flex flex-wrap gap-3 [&_input]:min-w-0 [&_input]:flex-1">
      <form
        className="flex min-w-[220px] flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          change("q", search);
        }}
      >
        <label className="filter-input w-auto min-w-0 flex-1">
          <Search size={16} />
          <input
            aria-label={t("filters.searchLabel")}
            value={search}
            placeholder={t("filters.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="button">{t("filters.search")}</button>
      </form>
      {section === "users" && (
        <>
          {[
            [
              "is_active",
              t("filters.active.label"),
              t("filters.active.yes"),
              t("filters.active.no"),
              t("filters.active.any"),
            ],
            [
              "is_admin",
              t("filters.admin.label"),
              t("filters.admin.yes"),
              t("filters.admin.no"),
              t("filters.admin.any"),
            ],
            [
              "is_restricted",
              t("filters.restricted.label"),
              t("filters.restricted.yes"),
              t("filters.restricted.no"),
              t("filters.restricted.any"),
            ],
            [
              "is_prohibit_login",
              t("filters.prohibitLogin.label"),
              t("filters.prohibitLogin.yes"),
              t("filters.prohibitLogin.no"),
              t("filters.prohibitLogin.any"),
            ],
            [
              "is_2fa_enabled",
              t("filters.twoFactor.label"),
              t("filters.twoFactor.yes"),
              t("filters.twoFactor.no"),
              t("filters.twoFactor.any"),
            ],
          ].map(([key, label, yes, no, any]) => (
            <SelectControl
              key={key}
              label={label}
              value={params.get(`status_filter[${key}]`) || ""}
              onValueChange={(value) => change(`status_filter[${key}]`, value)}
              options={[
                { value: "", label: any },
                { value: "1", label: yes },
                { value: "0", label: no },
              ]}
            />
          ))}
          <SelectControl
            label={t("filters.accountType.label")}
            value={params.get("status_filter[account_type]") || ""}
            onValueChange={(value) =>
              change("status_filter[account_type]", value)
            }
            options={[
              { value: "", label: t("filters.accountType.all") },
              { value: "0", label: t("filters.accountType.local") },
              { value: "2", label: t("filters.accountType.reserved") },
              { value: "4", label: t("filters.accountType.bot") },
              { value: "5", label: t("filters.accountType.remote") },
            ]}
          />
        </>
      )}
      {["users", "repos", "orgs"].includes(section) && (
        <SelectControl
          label={t("filters.sort.label")}
          value={params.get("sort") || "alphabetically"}
          onValueChange={(value) => change("sort", value)}
          options={[
            {
              value: "alphabetically",
              label: t("filters.sort.alphabetically"),
            },
            {
              value: "reversealphabetically",
              label: t("filters.sort.reversealphabetically"),
            },
            { value: "newest", label: t("filters.sort.newest") },
            { value: "oldest", label: t("filters.sort.oldest") },
            { value: "recentupdate", label: t("filters.sort.recentupdate") },
            { value: "leastupdate", label: t("filters.sort.leastupdate") },
            ...(section === "repos"
              ? [
                  ["gitsize", t("filters.gitSizeAsc")],
                  ["reversegitsize", t("filters.gitSizeDesc")],
                  ["lfssize", t("filters.lfsSizeAsc")],
                  ["reverselfssize", t("filters.lfsSizeDesc")],
                  ["moststars", t("filters.mostStars")],
                  ["feweststars", t("filters.fewestStars")],
                  ["mostforks", t("filters.mostForks")],
                  ["fewestforks", t("filters.fewestForks")],
                ].map(([value, label]) => ({ value, label }))
              : []),
            ...(section === "users"
              ? [
                  { value: "lastlogin", label: t("filters.sort.lastlogin") },
                  {
                    value: "reverselastlogin",
                    label: t("filters.sort.reverselastlogin"),
                  },
                ]
              : []),
          ]}
        />
      )}
      {section === "packages" && (
        <SelectControl
          label={t("filters.packageType")}
          value={params.get("type") || ""}
          onValueChange={(value) => change("type", value)}
          options={[
            { value: "", label: t("filters.allTypes") },
            ...(types || []),
          ]}
        />
      )}
      {["emails", "packages"].includes(section) && (
        <SelectControl
          label={t("filters.sort.label")}
          value={
            params.get("sort") ||
            (section === "emails" ? "email" : "created_desc")
          }
          onValueChange={(value) => change("sort", value)}
          options={(section === "emails"
            ? [
                ["email", t("filters.emailAsc")],
                ["reverseemail", t("filters.emailDesc")],
                ["username", t("filters.sort.alphabetically")],
                ["reverseusername", t("filters.sort.reversealphabetically")],
              ]
            : [
                ["name_asc", t("filters.sort.alphabetically")],
                ["name_desc", t("filters.sort.reversealphabetically")],
                ["created_desc", t("filters.sort.newest")],
                ["created_asc", t("filters.sort.oldest")],
                ["version_asc", t("filters.versionAsc")],
                ["version_desc", t("filters.versionDesc")],
              ]
          ).map(([value, label]) => ({ value, label }))}
        />
      )}
      {section === "emails" && (
        <SelectControl
          label={t("filters.emails.label")}
          // Forgejo enables the filter with is_activated and reads the
          // wanted state from activated.
          value={
            params.get("is_activated")
              ? params.get("activated") === "true"
                ? "1"
                : "0"
              : ""
          }
          onValueChange={(value) => {
            const next = new URLSearchParams(params);
            if (value) {
              next.set("is_activated", "1");
              next.set("activated", value === "1" ? "true" : "false");
            } else {
              next.delete("is_activated");
              next.delete("activated");
            }
            next.delete("page");
            setParams(next);
          }}
          options={[
            { value: "", label: t("filters.emails.all") },
            { value: "1", label: t("filters.emails.activated") },
            { value: "0", label: t("filters.emails.notActivated") },
          ]}
        />
      )}
    </div>
  );
}
function AdminResourceList({
  section,
  data,
}: {
  section: string;
  data: AdminData;
}) {
  const { t, i18n } = useTranslation("admin");
  const [selected, setSelected] = useState<number[]>([]);
  const client = useQueryClient();
  useEffect(() => {
    const ids = new Set((data.Notices || []).map((row) => Number(row.ID)));
    setSelected((values) => values.filter((value) => ids.has(value)));
  }, [data.Notices]);
  const removeSelected = useMutation({
    mutationFn: async () => {
      const fields = new URLSearchParams();
      for (const id of selected) fields.append("ids[]", String(id));
      await request("/admin/notices/delete", {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: fields,
      });
      setSelected([]);
      await client.invalidateQueries({ queryKey: ["admin"] });
    },
  });
  const table =
    section === "federation/users"
      ? { rows: data.Users, columns: federatedUserColumns }
      : section === "users" || section === "orgs"
        ? {
            rows: data.Users,
            columns:
              section === "orgs"
                ? [
                    "ID",
                    "Name",
                    "FullName",
                    "NumMembers",
                    "NumRepos",
                    "CreatedUnix",
                  ]
                : [
                    "ID",
                    "Name",
                    "Email",
                    "IsActive",
                    "IsAdmin",
                    "IsRestricted",
                    "TwoFactorEnabled",
                    "CreatedUnix",
                    "LastLoginUnix",
                  ],
          }
        : section === "repos"
          ? {
              rows: data.Repos,
              columns: [
                "ID",
                "OwnerName",
                "Name",
                "IsPrivate",
                "IsArchived",
                "NumWatches",
                "NumStars",
                "NumForks",
                "NumIssues",
                "GitSize",
                "LFSSize",
                "CreatedUnix",
              ],
            }
          : section === "emails"
            ? {
                rows: data.Emails,
                columns: [
                  "ID",
                  "Name",
                  "FullName",
                  "Email",
                  "IsPrimary",
                  "IsActivated",
                ],
              }
            : section === "auths"
              ? {
                  rows: data.Sources,
                  columns: ["ID", "Name", "Type", "IsActive", "IsSyncEnabled"],
                }
              : section === "notices"
                ? {
                    rows: data.Notices,
                    columns: [
                      "Select",
                      "ID",
                      "Type",
                      "Description",
                      "CreatedUnix",
                    ],
                  }
                : section === "packages"
                  ? {
                      rows: data.Packages,
                      columns: [
                        "Package.Name",
                        "Package.Type",
                        "Version.Version",
                        "Owner.Name",
                        "Creator.Name",
                        "Size",
                        "Version.CreatedUnix",
                        "Version.DownloadCount",
                      ],
                    }
                  : section === "federation/hosts"
                    ? {
                        rows: data.Hosts,
                        columns: [
                          "ID",
                          "HostFqdn",
                          "HostPort",
                          "NodeInfo.SoftwareName",
                          "NodeInfo.SoftwareVersion",
                        ],
                      }
                    : { rows: [], columns: [] };
  const link = (row: Row, key: string) => {
    if (key === "Select")
      return (
        <input
          type="checkbox"
          aria-label={t("notices.selectNotice", { id: row.ID })}
          checked={selected.includes(Number(row.ID))}
          onChange={(event) =>
            setSelected(
              event.target.checked
                ? [...selected, Number(row.ID)]
                : selected.filter((id) => id !== Number(row.ID)),
            )
          }
        />
      );
    if (key === "Name" && section === "users")
      return <Link to={`/admin/users/${row.ID}`}>{row.Name}</Link>;
    if (section === "federation/users") return federatedUserCell(row, key);
    if (key === "Name" && section === "orgs")
      return <Link to={`/organizations/${row.Name}`}>{row.Name}</Link>;
    if (key === "Name" && section === "repos")
      return (
        <Link
          to={`/projects/${row.OwnerName || row["Owner.Name"]}/${row.Name}`}
        >
          {row.Name}
        </Link>
      );
    if (key === "Name" && section === "auths")
      return <Link to={`/admin/auths/${row.ID}`}>{row.Name}</Link>;
    if (key === "HostFqdn")
      return <Link to={`/admin/federation/hosts/${row.ID}`}>{row[key]}</Link>;
    if (key === "Name" && section === "emails")
      return <Link to={`/admin/users/${row.UID}`}>{row.Name}</Link>;
    if (["Size", "GitSize", "LFSSize"].includes(key))
      return bytes(Number(row[key] || 0), i18n.language);
    if (key === "LastLoginUnix" && !row[key]) return t("list.neverLogin");
    if (key.endsWith("Unix") && row[key])
      return new Date(Number(row[key]) * 1000).toLocaleString(i18n.language);
    return undefined;
  };
  return (
    <>
      <AdminFilters section={section} types={data.PackageTypes} />
      {section === "packages" && (
        <div className={adminToolbar}>
          <AdminAction
            path="/admin/packages/cleanup"
            label={t("list.cleanupPackages")}
            confirm
          />
        </div>
      )}
      {section === "notices" && (
        <div className={adminToolbar}>
          <AdminAction
            path="/admin/notices/empty"
            label={t("list.clearNotices")}
            confirm
          />
          <button
            className="button"
            disabled={!selected.length || removeSelected.isPending}
            onClick={() => {
              if (
                window.confirm(
                  t("notices.confirmSelected", { count: selected.length }),
                )
              )
                removeSelected.mutate();
            }}
          >
            {t("notices.deleteSelected", { count: selected.length })}
          </button>
          <Feedback error={removeSelected.error} />
        </div>
      )}
      <AdminTable
        {...table}
        cell={link}
        header={(key) =>
          key === "Select" ? (
            <input
              type="checkbox"
              aria-label={t("notices.selectAll")}
              checked={
                !!data.Notices?.length &&
                selected.length === data.Notices.length
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? data.Notices.map((row) => Number(row.ID))
                    : [],
                )
              }
            />
          ) : undefined
        }
        actions={(row) => (
          <>
            {section === "users" && (
              <Link className="button" to={`/admin/users/${row.ID}/edit`}>
                {t("list.edit")}
              </Link>
            )}
            {section === "orgs" && (
              <Link
                className="button"
                to={`/organizations/${row.Name}/settings`}
              >
                {t("list.settings")}
              </Link>
            )}
            {section === "repos" && (
              <>
                <Link
                  className="button"
                  to={`/projects/${row.OwnerName || row["Owner.Name"]}/${row.Name}/settings`}
                >
                  {t("list.settings")}
                </Link>
                <AdminAction
                  path="/admin/repos/delete"
                  values={{ id: String(row.ID) }}
                  label={t("list.deleteProject")}
                  confirm
                />
              </>
            )}
            {section === "emails" && row.CanChange !== false && (
              <>
                <AdminAction
                  path="/admin/emails/activate"
                  values={{
                    uid: String(row.UID),
                    email: String(row.Email),
                    primary: row.IsPrimary ? "1" : "0",
                    activate: row.IsActivated ? "0" : "1",
                  }}
                  label={
                    row.IsActivated ? t("list.deactivate") : t("list.activate")
                  }
                  confirm
                />
                {!row.IsPrimary && (
                  <AdminAction
                    path="/admin/emails/delete"
                    values={{ id: String(row.ID), Uid: String(row.UID) }}
                    label={t("list.deleteEmail")}
                    confirm
                  />
                )}
              </>
            )}
            {section === "auths" && (
              <AdminAction
                path={`/admin/auths/${row.ID}/delete`}
                label={t("list.deleteSource")}
                confirm
              />
            )}
            {section === "packages" && (
              <>
                <Link
                  className="button"
                  to={`/packages/${encodeURIComponent(String(row["Owner.Name"]))}/${row["Package.Type"]}/${encodeURIComponent(String(row["Package.Name"]))}/${encodeURIComponent(String(row["Version.Version"]))}`}
                >
                  {t("list.details")}
                </Link>
                <AdminAction
                  path="/admin/packages/delete"
                  values={{ id: String(row["Version.ID"]) }}
                  label={t("list.deleteVersion")}
                  confirm
                />
              </>
            )}
            {section === "notices" && (
              <AdminAction
                path="/admin/notices/delete"
                values={{ "ids[]": String(row.ID) }}
                label={t("list.deleteNotice")}
                confirm
              />
            )}
          </>
        )}
      />
    </>
  );
}
function AdminDashboard({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const stats = useQuery(adminQuery("/admin/monitor/stats"));
  const liveStatus = useQuery({
    ...adminQuery("/admin/system_status"),
    enabled: visible,
    refetchInterval: visible ? 5000 : false,
    refetchIntervalInBackground: false,
  });
  const status = (liveStatus.data?.SysStatus || data.SysStatus || {}) as {
    StartTime?: string;
    NumGoroutine?: number;
    MemAllocated?: number;
  };
  return (
    <>
      {(data.NeedMajorUpdate || data.NeedMinorUpdate) && (
        <p className="form-error" role="status">
          {t("dashboard.updateAvailable", {
            version: data.RemoteVersion || "",
          })}{" "}
          <a
            className="text-primary"
            href="https://forgejo.org/releases/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("dashboard.releases")}
          </a>
        </p>
      )}
      {data.UpdateCheckerError && (
        <p className="form-error" role="status">
          {t("dashboard.updateError", { error: data.UpdateCheckerError })}
        </p>
      )}
      <Feedback error={liveStatus.error} />
      <div className="admin-metrics mb-6 grid grid-cols-4 gap-4 max-[1051px]:grid-cols-2 max-[701px]:gap-2">
        {[
          ["User", t("dashboard.metrics.users")],
          ["Org", t("dashboard.metrics.groups")],
          ["Repo", t("dashboard.metrics.projects")],
          ["Team", t("dashboard.metrics.teams")],
          ["Issue", t("dashboard.metrics.issues")],
          ["IssueOpen", t("dashboard.metrics.openIssues")],
          ["Project", t("dashboard.metrics.boards")],
          ["Release", t("dashboard.metrics.releases")],
        ].map(([key, label]) => (
          <div
            className="rounded-lg border border-line bg-surface p-5 max-[701px]:p-[14px]"
            key={key}
          >
            <strong className="block text-[28px] font-semibold">
              {stats.isPending ? "…" : display(t, stats.data?.Stats?.[key])}
            </strong>
            <span className="text-[12px] text-muted">{label}</span>
          </div>
        ))}
      </div>
      <section className={adminCard}>
        <h2>{t("dashboard.systemStatus")}</h2>
        <AdminValues
          data={{
            [t("dashboard.uptime.label")]: uptime(t, status.StartTime),
            [t("dashboard.goroutines")]: status.NumGoroutine,
            [t("dashboard.memory")]:
              status.MemAllocated === undefined
                ? ""
                : bytes(status.MemAllocated),
          }}
        />
        <Link className="button" to="/admin/system_status">
          {t("dashboard.viewStatus")}
        </Link>
      </section>
      <section className={adminCard}>
        <h2>{t("dashboard.maintenance")}</h2>
        <div>
          {data.Operations?.map((item) => (
            <div className={adminOperationRow} key={item.Name}>
              <span>{item.Label}</span>
              <AdminAction
                path="/admin"
                values={{ op: item.Name }}
                label={t("dashboard.run")}
                confirm
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function AdminUserDetail({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  const user = data.User;
  return (
    <>
      <div className={adminToolbar}>
        <Link className="button primary" to={`/admin/users/${user.ID}/edit`}>
          {t("userDetail.edit")}
        </Link>
        <Link className="button" to={`/users/${user.Name}`}>
          {t("userDetail.viewProfile")}
        </Link>
      </div>
      <section className={adminCard}>
        <h2>{t("userDetail.account")}</h2>
        <AdminValues data={user} />
      </section>
      <section className={adminCard}>
        <h2>{t("userDetail.security")}</h2>
        <AdminValues
          data={{
            [t("userDetail.twoFactor")]: data.TwoFactorEnabled,
            [t("userDetail.authSource")]:
              data.LoginSource?.Name || t("userDetail.local"),
          }}
        />
      </section>
      <section className={adminCard}>
        <h2>{t("userDetail.organizations")}</h2>
        <AdminTable
          rows={data.Users}
          columns={["ID", "Name", "FullName", "NumRepos"]}
          cell={(row, key) =>
            key === "Name" ? (
              <Link to={`/organizations/${row.Name}`}>{row.Name}</Link>
            ) : undefined
          }
        />
      </section>
      <section className={adminCard}>
        <h2>{t("userDetail.projects")}</h2>
        <AdminTable
          rows={data.Repos}
          columns={["ID", "Name", "IsPrivate", "IsArchived"]}
        />
      </section>
      <section className={adminCard}>
        <h2>{t("userDetail.emails")}</h2>
        <AdminTable
          rows={data.Emails}
          columns={["Email", "IsPrimary", "IsActivated"]}
        />
      </section>
    </>
  );
}
function AdminUserForm({
  data,
  endpoint,
}: {
  data: AdminData;
  endpoint: string;
}) {
  const { t } = useTranslation("admin");
  const user = data.User || {},
    editing = !!user.ID,
    navigate = useNavigate(),
    client = useQueryClient();
  const [source, setSource] = useState(
    editing ? `${user.LoginType}-${user.LoginSource}` : "0-0",
  );
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) =>
      nativeForm(
        endpoint,
        Object.fromEntries(new FormData(form).entries()) as Record<
          string,
          string
        >,
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["admin"] });
      if (result.redirect) navigate(uiRoute(result.redirect));
    },
  });
  const fields = [
    {
      name: "user_name",
      label: t("userForm.username"),
      value: user.Name || "",
      required: true,
    },
    {
      name: "email",
      label: t("userForm.email"),
      value: user.Email || "",
      required: true,
    },
    {
      name: "password",
      label: editing ? t("userForm.newPassword") : t("userForm.password"),
      type: "password" as const,
    },
    {
      name: "login_name",
      label: t("userForm.loginName"),
      value: user.LoginName || "",
    },
  ];
  return (
    <>
      <form
        className={`${adminCard} ${adminForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(event.currentTarget);
        }}
      >
        <h2>
          {editing ? t("userForm.accountSettings") : t("userForm.createTitle")}
        </h2>
        <SelectControl
          label={t("userForm.authSource")}
          name="login_type"
          value={source}
          onValueChange={setSource}
          options={[
            { value: "0-0", label: t("userForm.localAccount") },
            ...data.Sources.map((row) => ({
              value: `${row.Type}-${row.ID}`,
              label: String(row.Name),
            })),
            ...(editing && Number(user.LoginSource) === 0
              ? [
                  {
                    value: `${user.LoginType}-0`,
                    label: t("userForm.currentLocalAccount"),
                  },
                ]
              : []),
          ]}
        />
        <SettingsFields fields={fields} />
        <SelectControl
          label={t("userForm.visibility.label")}
          name="visibility"
          defaultValue={String(user.Visibility || 0)}
          options={[
            { value: "0", label: t("userForm.visibility.public") },
            { value: "1", label: t("userForm.visibility.limited") },
            { value: "2", label: t("userForm.visibility.private") },
          ]}
        />
        {editing ? (
          <>
            <SettingsFields
              fields={[
                {
                  name: "full_name",
                  label: t("userForm.fullName"),
                  value: String(user.FullName || ""),
                },
                {
                  name: "website",
                  label: t("userForm.website"),
                  value: String(user.Website || ""),
                },
                {
                  name: "location",
                  label: t("userForm.location"),
                  value: String(user.Location || ""),
                },
                {
                  name: "pronouns",
                  label: t("userForm.pronouns"),
                  value: String(user.Pronouns || ""),
                },
                {
                  name: "language",
                  label: t("userForm.language"),
                  value: String(user.Language || ""),
                },
                {
                  name: "max_repo_creation",
                  label: t("userForm.maxRepoCreation"),
                  type: "number",
                  value: Number(user.MaxRepoCreation ?? -1),
                },
              ]}
            />
            <h2>{t("userForm.permissions")}</h2>
            <SettingsFields
              fields={[
                ["active", t("userForm.active"), "IsActive"],
                ["admin", t("userForm.admin"), "IsAdmin"],
                ["restricted", t("userForm.restricted"), "IsRestricted"],
                [
                  "prohibit_login",
                  t("userForm.prohibitLogin"),
                  "ProhibitLogin",
                ],
                ["allow_git_hook", t("userForm.allowGitHook"), "AllowGitHook"],
                [
                  "allow_import_local",
                  t("userForm.allowImportLocal"),
                  "AllowImportLocal",
                ],
                [
                  "allow_create_organization",
                  t("userForm.allowCreateOrganization"),
                  "AllowCreateOrganization",
                ],
                ["hide_email", t("userForm.hideEmail"), "KeepEmailPrivate"],
              ].map(([name, label, key]) => ({
                name,
                label,
                value: !!user[key],
                type: "checkbox",
              }))}
            />
            {data.TwoFactorEnabled && (
              <SettingsFields
                fields={[
                  {
                    name: "reset_2fa",
                    label: t("userForm.reset2fa"),
                    type: "checkbox",
                  },
                ]}
              />
            )}
          </>
        ) : (
          <SettingsFields
            fields={[
              {
                name: "must_change_password",
                label: t("userForm.mustChangePassword"),
                type: "checkbox",
                value: true,
              },
              ...(data.CanSendEmail
                ? [
                    {
                      name: "send_notify",
                      label: t("userForm.sendNotify"),
                      type: "checkbox" as const,
                    },
                  ]
                : []),
            ]}
          />
        )}
        <Feedback error={save.error} />
        <div className={actionsClass}>
          <button className="button primary" disabled={save.isPending}>
            {editing ? t("userForm.save") : t("userForm.create")}
          </button>
          <Link className="button" to="/admin/users">
            {t("userForm.cancel")}
          </Link>
        </div>
      </form>
      {editing && (
        <>
          <AdminAvatar user={user} disabledGravatar={data.DisableGravatar} />
          <section className={adminCard}>
            <h2>{t("userForm.deleteTitle")}</h2>
            <AdminAction
              path={`/admin/users/${user.ID}/delete`}
              values={{ purge: "false" }}
              label={t("userForm.delete")}
              confirm
              onDone={() => navigate("/admin/users")}
            />
            <p className="text-sm text-muted">{t("userForm.deleteBlocked")}</p>
            <AdminAction
              path={`/admin/users/${user.ID}/delete`}
              values={{ purge: "true" }}
              label={t("userForm.purge")}
              confirm
              onDone={() => navigate("/admin/users")}
            />
          </section>
        </>
      )}
    </>
  );
}
function AdminAvatar({
  user,
  disabledGravatar,
}: {
  user: Row;
  disabledGravatar: boolean;
}) {
  const { t } = useTranslation("admin");
  const [source, setSource] = useState(
    !disabledGravatar && !user.UseCustomAvatar ? "lookup" : "local",
  );
  const action = useMutation({
    mutationFn: (form: HTMLFormElement) =>
      request(`/admin/users/${user.ID}/avatar`, {
        method: "POST",
        headers: { "X-Forgejo-UI": "1" },
        body: new FormData(form),
      }),
  });
  return (
    <section className={adminCard}>
      <h2>{t("avatar.title")}</h2>
      <form
        className={`mb-6 ${adminForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate(event.currentTarget);
        }}
      >
        <input type="hidden" name="source" value={source} />
        {!disabledGravatar && (
          <SelectControl
            label={t("avatar.source")}
            value={source}
            onValueChange={setSource}
            options={[
              { value: "local", label: t("avatar.local") },
              { value: "lookup", label: t("avatar.lookup") },
            ]}
          />
        )}
        {source === "lookup" ? (
          <label>
            {t("avatar.email")}
            <input
              type="email"
              name="gravatar"
              defaultValue={String(user.AvatarEmail || user.Email || "")}
              required
            />
          </label>
        ) : (
          <label>
            {t("avatar.upload")}
            <input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/gif,image/webp"
            />
          </label>
        )}
        <Feedback error={action.error} />
        <button className="button" disabled={action.isPending}>
          {t("avatar.save")}
        </button>
        {action.isSuccess && <span role="status">{t("avatar.updated")}</span>}
      </form>
      <AdminAction
        path={`/admin/users/${user.ID}/avatar/delete`}
        label={t("avatar.remove")}
        confirm
      />
    </section>
  );
}
function AdminJobs({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  return (
    <AdminTable
      rows={data.Tasks || []}
      columns={[
        "Name",
        "Spec",
        "Next",
        "Prev",
        "ExecTimes",
        "Status",
        "LastMessage",
      ]}
      cell={(row, key) =>
        key === "Status" ? (
          <span
            title={String(row.LastMessage || "")}
            className={row.Status === "error" ? "text-danger" : "text-success"}
          >
            {display(t, row.Status)}
          </span>
        ) : undefined
      }
      actions={(row) => (
        <AdminAction
          path="/admin"
          values={{ op: String(row.Name), from: "monitor" }}
          label={t("jobs.run")}
          confirm
        />
      )}
    />
  );
}
function AdminQueues({ data, detail }: { data: AdminData; detail: boolean }) {
  const { t } = useTranslation("admin");
  return detail ? (
    <>
      <AdminValues data={data.Queue} />
      <section className={adminCard}>
        <h2>{t("queues.workerSettings")}</h2>
        <SettingsForm
          path={`/admin/monitor/queue/${data.Queue.ID}/set`}
          fields={[
            {
              name: "max-number",
              label: t("queues.maxWorkers"),
              type: "number",
              min: -1,
              value: Number(data.Queue.MaxWorkers),
            },
          ]}
        />
      </section>
      <AdminAction
        path={`/admin/monitor/queue/${data.Queue.ID}/remove-all-items`}
        label={t("queues.removeAll")}
        confirm
      />
    </>
  ) : (
    <AdminTable
      rows={data.Queues || []}
      columns={[
        "Name",
        "Type",
        "Items",
        "Workers",
        "ActiveWorkers",
        "MaxWorkers",
      ]}
      cell={(row, key) =>
        key === "Name" ? (
          <Link to={`/admin/monitor/queue/${row.ID}`}>{row.Name}</Link>
        ) : undefined
      }
    />
  );
}
function AdminProcesses({ data }: { data: AdminData }) {
  const [seconds, setSeconds] = useState(5);
  const { t } = useTranslation("admin");
  const [params, setParams] = useSearchParams();
  return (
    <>
      <div className={adminToolbar}>
        <SelectControl
          label={t("processes.view")}
          value={params.get("show") || ""}
          onValueChange={(value) => setParams({ show: value })}
          options={[
            { value: "", label: t("processes.summary") },
            { value: "process", label: t("processes.processes") },
            { value: "all", label: t("processes.all") },
          ]}
        />
        <a
          className="button"
          href={native(`/admin/monitor/diagnosis?seconds=${seconds}`)}
          download
        >
          {t("processes.download")}
        </a>
        <label className="flex items-center gap-2 text-sm">
          {t("processes.seconds")}
          <input
            className="w-24 rounded border border-input p-2"
            type="number"
            min={0}
            max={300}
            value={seconds}
            onChange={(event) =>
              setSeconds(
                Math.max(
                  0,
                  Math.min(300, Math.trunc(Number(event.target.value) || 0)),
                ),
              )
            }
          />
        </label>
        <span className="text-xs text-muted">{t("processes.minimum")}</span>
      </div>
      {(data.ProcessStacks || []).map((process) => (
        <ProcessView process={process} key={process.PID} />
      ))}
    </>
  );
}
function ProcessView({ process }: { process: Process }) {
  const { t } = useTranslation("admin");
  return (
    <details className={adminCard}>
      <summary className={adminSummary}>
        {process.Description || process.PID}{" "}
        <span className="badge">{process.Type}</span>
      </summary>
      <div className={adminToolbar}>
        <code>{process.PID}</code>
        <AdminAction
          path={`/admin/monitor/stacktrace/cancel/${encodeURIComponent(process.PID)}`}
          label={t("processes.cancel")}
          confirm
        />
      </div>
      {process.Stacks?.map((stack, i) => (
        <pre
          className="max-h-[500px] overflow-auto rounded-md border border-line bg-surface-subtle p-4 text-[12px]"
          key={i}
        >
          {stack.Description}
          {"\n"}
          {stack.Entries.map(
            (item) => `${item.Function}\n  ${item.File}:${item.Line}`,
          ).join("\n")}
        </pre>
      ))}
      {process.Children?.map((child) => (
        <ProcessView process={child} key={child.PID} />
      ))}
    </details>
  );
}
function AdminUnadopted({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  const [params, setParams] = useSearchParams();
  return (
    <>
      <AdminFilters section="unadopted" />
      <button
        className="button"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set("search", "true");
          setParams(next);
        }}
      >
        {t("unadopted.scan")}
      </button>
      <div>
        {data.Dirs?.map((dir) => (
          <div className={adminOperationRow} key={dir}>
            <code>{dir}</code>
            <div className={actionsClass}>
              <AdminAction
                path="/admin/repos/unadopted"
                values={{ id: dir, action: "adopt" }}
                label={t("unadopted.adopt")}
                confirm
              />
              <AdminAction
                path="/admin/repos/unadopted"
                values={{ id: dir, action: "delete" }}
                label={t("unadopted.delete")}
                confirm
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function AdminConfiguration({
  data,
  settings,
}: {
  data: AdminData;
  settings: boolean;
}) {
  const { t } = useTranslation("admin");
  return settings ? (
    <div className={adminCard}>
      <h2>{t("config.instanceSettings")}</h2>
      {Object.entries(data.DynamicConfig || {}).map(([key, value]) => (
        <SettingsForm
          key={key}
          path="/admin/config"
          hidden={{ key }}
          button={t("config.saveSetting")}
          fields={[
            {
              name: "value",
              label: adminFieldLabel(t, key),
              type: typeof value === "boolean" ? "checkbox" : "textarea",
              value,
            },
          ]}
        />
      ))}
      {data.DefaultEditorApps && (
        <details>
          <summary className={adminSummary}>{t("config.editorApps")}</summary>
          <pre>{data.DefaultEditorApps}</pre>
        </details>
      )}
    </div>
  ) : (
    <>
      {Object.entries(data.Config || {}).filter(
        ([, value]) => !value || typeof value !== "object",
      ).length > 0 && (
        <section className={adminCard}>
          <h2>{t("config.server")}</h2>
          <AdminValues
            data={Object.fromEntries(
              Object.entries(data.Config).filter(
                ([, value]) => !value || typeof value !== "object",
              ),
            )}
          />
        </section>
      )}
      {Object.entries(data.Config || {})
        .filter(([, value]) => value && typeof value === "object")
        .map(([key, value]) => (
          <section className={adminCard} key={key}>
            <h2>
              {(
                {
                  SSH: t("config.sections.ssh"),
                  LFS: t("config.sections.lfs"),
                  DbCfg: t("config.sections.database"),
                  Service: t("config.sections.service"),
                  Webhook: t("config.sections.webhook"),
                  Mailer: t("config.sections.mailer"),
                  SessionConfig: t("config.sections.session"),
                  Git: t("config.sections.git"),
                  Cache: t("config.sections.cache"),
                  Logger: t("config.sections.logger"),
                  Picture: t("config.sections.picture"),
                  Moderation: t("config.sections.moderation"),
                  Federation: t("config.sections.federation"),
                } as Record<string, string>
              )[key] || human(key)}
            </h2>
            <AdminValues data={value as Record<string, unknown>} />
          </section>
        ))}
      <section className={adminCard}>
        <h2>{t("config.testServices")}</h2>
        <SettingsForm
          path="/admin/config/test_mail"
          button={t("config.sendTestEmail")}
          fields={[
            { name: "email", label: t("config.recipient"), required: true },
          ]}
        />
        <AdminAction
          path="/admin/config/test_cache"
          label={t("config.testCache")}
        />
      </section>
    </>
  );
}
function AdminReports({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  return (
    <>
      {data.ContentReference && (
        <div className={adminCard}>
          <h2>{data.ContentReference}</h2>
          {data.ContentURL && (
            <Link to={uiRoute(data.ContentURL)}>
              {t("reports.viewContent")}
            </Link>
          )}
        </div>
      )}
      {Object.entries(data.ReportSnapshots || {}).map(([id, fields]) => (
        <details className={adminCard} key={id}>
          <summary className={adminSummary}>
            {t("reports.snapshot", { id })}
          </summary>
          <AdminValues
            data={Object.fromEntries(
              fields.map((field) => [field.Key, field.Value]),
            )}
          />
        </details>
      ))}
      <AdminTable
        rows={data.Reports}
        columns={[
          "ID",
          "ContentType",
          "ContentID",
          "ReporterName",
          "Category",
          "Remarks",
          "Status",
        ]}
        actions={(row) => (
          <>
            <Link
              className="button"
              to={`/admin/moderation/reports/type/${row.ContentType}/id/${row.ContentID}`}
            >
              {t("reports.details")}
            </Link>
            <AdminAction
              path="/admin/abuse_reports/act"
              values={{
                content_type: String(row.ContentType),
                content_id: String(row.ContentID),
                report_action: "1",
                content_action: "0",
              }}
              label={t("reports.markHandled")}
              confirm
            />
            <AdminAction
              path="/admin/abuse_reports/act"
              values={{
                content_type: String(row.ContentType),
                content_id: String(row.ContentID),
                report_action: "2",
                content_action: "0",
              }}
              label={t("reports.ignore")}
              confirm
            />
            <AdminAction
              path="/admin/abuse_reports/act"
              values={{
                content_type: String(row.ContentType),
                content_id: String(row.ContentID),
                report_action: "1",
                content_action: String(
                  row.ContentType === 1 ? 1 : Number(row.ContentType) + 1,
                ),
              }}
              label={
                row.ContentType === 1
                  ? t("reports.suspend")
                  : t("reports.deleteContent")
              }
              confirm
            />
            {/* Account actions treat content_id as a user ID, so Forgejo only
                offers them for reported users (content type 1). */}
            {Number(row.ContentType) === 1 && (
              <AdminAction
                path="/admin/abuse_reports/act"
                values={{
                  content_type: String(row.ContentType),
                  content_id: String(row.ContentID),
                  report_action: "1",
                  content_action: "2",
                }}
                label={t("reports.deleteAccount")}
                confirm
              />
            )}
          </>
        )}
      />
    </>
  );
}
function AdminHooks({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  const [provider, setProvider] = useState("forgejo");
  return (
    <>
      <SelectControl
        label={t("hooks.integration")}
        value={provider}
        onValueChange={setProvider}
        options={(data.WebhookProviders || ["forgejo"]).map((value) => ({
          value,
          label: value,
        }))}
      />
      {[
        [t("hooks.system"), "system-hooks", data.SystemHooks],
        [t("hooks.defaults"), "default-hooks", data.DefaultHooks],
      ].map(([title, kind, rows]) => (
        <section className={adminCard} key={String(kind)}>
          <div className={pageHeadingClass}>
            <h2>{String(title)}</h2>
            <Link
              className="button primary"
              to={`/admin/${kind}/${provider}/new`}
            >
              {t("hooks.add")}
            </Link>
          </div>
          <AdminTable
            rows={rows as Row[]}
            columns={["ID", "URL", "Type", "IsActive"]}
            actions={(row) => (
              <>
                <Link className="button" to={`/admin/hooks/${row.ID}`}>
                  {t("hooks.edit")}
                </Link>
                <AdminAction
                  path="/admin/hooks/delete"
                  values={{ id: String(row.ID) }}
                  label={t("hooks.delete")}
                  confirm
                />
              </>
            )}
          />
        </section>
      ))}
    </>
  );
}
function AdminApplications() {
  return <AdminApplicationsInner />;
}
function AdminApplicationsInner() {
  const { t } = useTranslation("admin");
  const query = useQuery({
      queryKey: ["admin-applications"],
      queryFn: ({ signal }) =>
        nativePage<{
          applications: {
            id: number;
            name: string;
            client_id: string;
            redirect_uris: string[];
          }[];
        }>("/admin/applications", signal),
    }),
    navigate = useNavigate();
  const create = useMutation({
    // Forgejo answers with the new application and its one-time client
    // secret, which the edit page shows once.
    mutationFn: async (form: HTMLFormElement) => {
      const { data: result } = await request<{
        application?: { ID: number };
        client_secret?: string;
      }>("/admin/applications/oauth2", {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
          Object.fromEntries(new FormData(form)) as Record<string, string>,
        ),
      });
      await query.refetch();
      if (result.application?.ID)
        navigate(`/admin/applications/oauth2/${result.application.ID}`, {
          state: { secret: result.client_secret },
        });
    },
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  return (
    <>
      <div>
        {(query.data.applications || []).map((app) => (
          <div className={adminOperationRow} key={app.id}>
            <div>
              <strong>{app.name}</strong>
              <p>{app.client_id}</p>
            </div>
            <Link
              className="button"
              to={`/admin/applications/oauth2/${app.id}`}
            >
              {t("applications.edit")}
            </Link>
            <AdminAction
              path={`/admin/applications/oauth2/${app.id}/delete`}
              label={t("applications.delete")}
              confirm
            />
          </div>
        ))}
      </div>
      <form
        className={`${adminCard} ${adminForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(event.currentTarget);
        }}
      >
        <h2>{t("applications.add")}</h2>
        <SettingsFields
          fields={[
            {
              name: "application_name",
              label: t("applications.name"),
              required: true,
            },
            {
              name: "redirect_uris",
              label: t("applications.redirectUris"),
              type: "textarea",
              required: true,
            },
            {
              name: "confidential_client",
              label: t("applications.confidential"),
              type: "checkbox",
              value: true,
            },
          ]}
        />
        <Feedback error={create.error} />
        <button className="button primary" disabled={create.isPending}>
          {t("applications.create")}
        </button>
      </form>
    </>
  );
}

const authFields = [
  {
    key: "SecurityProtocol",
    name: "security_protocol",
    kind: "text",
    types: ["2", "5"],
  },
  { key: "Port", name: "port", kind: "number", types: ["2", "5"] },
  {
    key: "BindPassword",
    name: "bind_password",
    kind: "password",
    types: ["2", "5"],
  },
  { key: "UserDN", name: "user_dn", kind: "text", types: ["2", "5"] },
  {
    key: "AttributeName",
    name: "attribute_name",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "DefaultDomainName",
    name: "default_domain_name",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "AttributeSSHPublicKey",
    name: "attribute_ssh_public_key",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "AttributesInBind",
    name: "attributes_in_bind",
    kind: "checkbox",
    types: ["2"],
  },
  {
    key: "SearchPageSize",
    name: "search_page_size",
    kind: "number",
    types: ["2"],
  },
  { key: "AdminFilter", name: "admin_filter", kind: "text", types: ["2", "5"] },
  {
    key: "RestrictedFilter",
    name: "restricted_filter",
    kind: "text",
    types: ["2", "5"],
  },
  { key: "GroupDN", name: "group_dn", kind: "text", types: ["2", "5"] },
  {
    key: "GroupMemberUID",
    name: "group_member_uid",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "GroupTeamMap",
    name: "group_team_map",
    kind: "textarea",
    types: ["2", "5"],
  },
  { key: "SMTPAuth", name: "smtp_auth", kind: "text", types: ["3"] },
  { key: "SMTPPort", name: "smtp_port", kind: "number", types: ["3"] },
  {
    key: "SkipVerify",
    name: "skip_verify",
    kind: "checkbox",
    types: ["2", "3", "5"],
  },
  { key: "DisableHelo", name: "disable_helo", kind: "checkbox", types: ["3"] },
  {
    key: "PAMServiceName",
    name: "pam_service_name",
    kind: "text",
    types: ["4"],
  },
  {
    key: "Oauth2Provider",
    name: "oauth2_provider",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2UseCustomURL",
    name: "oauth2_use_custom_url",
    kind: "checkbox",
    types: ["6"],
  },
  { key: "Oauth2AuthURL", name: "oauth2_auth_url", kind: "text", types: ["6"] },
  {
    key: "Oauth2EmailURL",
    name: "oauth2_email_url",
    kind: "text",
    types: ["6"],
  },
  { key: "Oauth2Tenant", name: "oauth2_tenant", kind: "text", types: ["6"] },
  {
    key: "Oauth2RequiredClaimName",
    name: "oauth2_required_claim_name",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2GroupClaimName",
    name: "oauth2_group_claim_name",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2RestrictedGroup",
    name: "oauth2_restricted_group",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2DynGroupMaps",
    name: "oauth2_dyn_group_maps",
    kind: "textarea",
    types: ["6"],
  },
  {
    key: "Oauth2QuotaGroupClaimName",
    name: "oauth2_quota_group_claim_name",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2AttributeSSHPublicKey",
    name: "oauth2_attribute_ssh_public_key",
    kind: "text",
    types: ["6"],
  },
  {
    key: "AllowUsernameChange",
    name: "allow_username_change",
    kind: "checkbox",
    types: ["6"],
  },
  { key: "Host", name: "host", kind: "text", types: ["2", "5"] },
  { key: "BindDN", name: "bind_dn", kind: "text", types: ["2", "5"] },
  { key: "UserBase", name: "user_base", kind: "text", types: ["2", "5"] },
  {
    key: "AttributeUsername",
    name: "attribute_username",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "AttributeSurname",
    name: "attribute_surname",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "AttributeMail",
    name: "attribute_mail",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "AttributeAvatar",
    name: "attribute_avatar",
    kind: "text",
    types: ["2", "5"],
  },
  {
    key: "UsePagedSearch",
    name: "use_paged_search",
    kind: "checkbox",
    types: ["2"],
  },
  { key: "Filter", name: "filter", kind: "text", types: ["2", "5"] },
  {
    key: "GroupsEnabled",
    name: "groups_enabled",
    kind: "checkbox",
    types: ["2", "5"],
  },
  { key: "GroupFilter", name: "group_filter", kind: "text", types: ["2", "5"] },
  { key: "UserUID", name: "user_uid", kind: "text", types: ["2", "5"] },
  {
    key: "AllowDeactivateAll",
    name: "allow_deactivate_all",
    kind: "checkbox",
    types: ["2", "5"],
  },
  { key: "SMTPHost", name: "smtp_host", kind: "text", types: ["3"] },
  {
    key: "AllowedDomains",
    name: "allowed_domains",
    kind: "text",
    types: ["3"],
  },
  { key: "HeloHostname", name: "helo_hostname", kind: "text", types: ["3"] },
  { key: "ForceSMTPS", name: "force_smtps", kind: "checkbox", types: ["3"] },
  {
    key: "PAMEmailDomain",
    name: "pam_email_domain",
    kind: "text",
    types: ["4"],
  },
  { key: "Oauth2Key", name: "oauth2_key", kind: "text", types: ["6"] },
  {
    key: "Oauth2Secret",
    name: "oauth2_secret",
    kind: "password",
    types: ["6"],
  },
  {
    key: "OpenIDConnectAutoDiscoveryURL",
    name: "open_id_connect_auto_discovery_url",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2TokenURL",
    name: "oauth2_token_url",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2ProfileURL",
    name: "oauth2_profile_url",
    kind: "text",
    types: ["6"],
  },
  { key: "Oauth2IconURL", name: "oauth2_icon_url", kind: "text", types: ["6"] },
  { key: "Oauth2Scopes", name: "oauth2_scopes", kind: "text", types: ["6"] },
  {
    key: "Oauth2RequiredClaimValue",
    name: "oauth2_required_claim_value",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2AdminGroup",
    name: "oauth2_admin_group",
    kind: "text",
    types: ["6"],
  },
  {
    key: "Oauth2GroupTeamMap",
    name: "oauth2_group_team_map",
    kind: "textarea",
    types: ["6"],
  },
  {
    key: "Oauth2GroupTeamMapRemoval",
    name: "oauth2_group_team_map_removal",
    kind: "checkbox",
    types: ["6"],
  },
  {
    key: "Oauth2DynGroupMapsRemoval",
    name: "oauth2_dyn_group_maps_removal",
    kind: "checkbox",
    types: ["6"],
  },
  {
    key: "Oauth2QuotaGroupMap",
    name: "oauth2_quota_group_map",
    kind: "textarea",
    types: ["6"],
  },
  {
    key: "Oauth2QuotaGroupMapRemoval",
    name: "oauth2_quota_group_map_removal",
    kind: "checkbox",
    types: ["6"],
  },
  {
    key: "SkipLocalTwoFA",
    name: "skip_local_two_fa",
    kind: "checkbox",
    types: ["2", "3", "4", "5", "6"],
  },
  {
    key: "GroupTeamMapRemoval",
    name: "group_team_map_removal",
    kind: "checkbox",
    types: ["2", "5"],
  },
];

function AdminAuthForm({
  data,
  endpoint,
}: {
  data: AdminData;
  endpoint: string;
}) {
  const { t } = useTranslation("admin");
  // Field labels for every source type; unknown fields fall back to their key.
  const fieldLabels = t("authForm.fields", { returnObjects: true }) as Record<
    string,
    string
  >;
  const fieldLabel = (key: string) => fieldLabels[key] ?? human(key);
  const initial = data.AuthFields || {},
    [type, setType] = useState(String(initial.Type || 2)),
    navigate = useNavigate(),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) =>
      nativeForm(
        endpoint,
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["admin"] });
      navigate(result.redirect ? uiRoute(result.redirect) : "/admin/auths");
    },
  });
  return (
    <form
      className={`${adminCard} ${adminForm}`}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <SelectControl
        label={t("authForm.type")}
        name="type"
        value={type}
        onValueChange={setType}
        disabled={!!initial.ID}
        options={(data.AuthTypes || []).map((item) => ({
          value: String(item.value),
          label: item.label,
        }))}
      />
      {!!initial.ID && (
        <>
          <input type="hidden" name="id" value={String(initial.ID)} />
          <input type="hidden" name="type" value={type} />
        </>
      )}
      <SettingsFields
        fields={[
          {
            name: "name",
            label: t("authForm.name"),
            value: String(initial.Name || ""),
            required: true,
          },
          {
            name: "is_active",
            label: t("authForm.enabled"),
            value: initial.IsActive !== false,
            type: "checkbox",
          },
          {
            name: "is_sync_enabled",
            label: t("authForm.sync"),
            value: initial.IsSyncEnabled !== false,
            type: "checkbox",
          },
        ]}
      />
      {authFields
        .filter((field) => field.types.includes(type))
        .map((field) =>
          field.key === "Oauth2Provider" ? (
            <SelectControl
              key={field.key}
              label={t("authForm.provider")}
              name={field.name}
              defaultValue={String(
                initial[field.key] ||
                  data.AuthProviders?.[0] ||
                  "openidConnect",
              )}
              searchable
              options={(data.AuthProviders || []).map((value) => ({
                value,
                label: value,
              }))}
            />
          ) : field.key === "SMTPAuth" ? (
            <SelectControl
              key={field.key}
              label={t("authForm.smtpAuth")}
              name={field.name}
              defaultValue={String(initial[field.key] || "PLAIN")}
              options={(data.SMTPAuths || ["PLAIN", "LOGIN", "CRAM-MD5"]).map(
                (value) => ({ value, label: value }),
              )}
            />
          ) : field.key === "SecurityProtocol" ? (
            <SelectControl
              key={field.key}
              label={t("authForm.securityProtocol")}
              name={field.name}
              defaultValue={String(initial[field.key] || 0)}
              options={[
                { value: "0", label: t("authForm.unencrypted") },
                { value: "1", label: "LDAPS" },
                { value: "2", label: "StartTLS" },
              ]}
            />
          ) : (
            <SettingsFields
              key={field.key}
              fields={[
                {
                  name: field.name,
                  label:
                    field.kind === "password" && initial.ID
                      ? t("authForm.keepExisting", {
                          label: fieldLabel(field.key),
                        })
                      : fieldLabel(field.key),
                  value:
                    initial[field.key] ??
                    (field.kind === "checkbox"
                      ? false
                      : field.kind === "number"
                        ? 0
                        : ""),
                  type: field.kind as
                    "text" | "password" | "number" | "checkbox" | "textarea",
                },
              ]}
            />
          ),
        )}
      <Feedback error={save.error} />
      <div className={actionsClass}>
        <button className="button primary" disabled={save.isPending}>
          {initial.ID ? t("authForm.save") : t("authForm.add")}
        </button>
        <Link className="button" to="/admin/auths">
          {t("authForm.cancel")}
        </Link>
      </div>
    </form>
  );
}

function AdminHealth({ data }: { data: AdminData }) {
  const { t } = useTranslation("admin");
  const config = data.Config || {};
  return (
    <section className={adminCard}>
      <h2>{t("health.title")}</h2>
      <p role="status">
        {config.DatabaseCheckHasProblems
          ? t("health.problems")
          : t("health.ok")}
      </p>
      {!!config.DatabaseCheckCollationMismatch && (
        <p role="alert">
          {t("health.collationMismatch", {
            collation: String(config.ExpectedCollation),
          })}
        </p>
      )}
      {!!config.DatabaseCheckCollationCaseInsensitive && (
        <p role="alert">{t("health.caseInsensitive")}</p>
      )}
      {!!config.CacheError && (
        <p role="alert">
          {t("health.cacheError", { error: String(config.CacheError) })}
        </p>
      )}
      {!!config.CacheSlow && (
        <p>{t("health.cacheSlow", { value: String(config.CacheSlow) })}</p>
      )}
      <AdminValues data={config} />
    </section>
  );
}
