import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { nativeForm, nativePage, request } from "./api";
import {
  EmptyState,
  Feedback,
  Pending,
  pageClass,
  pageHeadingClass,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import {
  accountSectionClass,
  OAuthApplicationPage,
  settingsContentClass,
  settingsSectionClass,
} from "./AccountSettings";
import {
  actionsClass,
  fieldInputClass,
  formPanelClass,
  narrowPageClass,
  OrganizationFrame,
  organizationFieldClass,
  workspaceSearchClass,
  type WorkspaceData,
} from "./WorkspaceManagement";
import { SharedActionsSettings } from "./ProjectSettings";
import { ConfirmAction } from "./IssueManagement";
import { SharedWebhookSettings } from "./WebhookSettings";

const encode = encodeURIComponent;
// Headings rendered directly inside `.account-settings-content`.
const settingsHeadingClass =
  "mb-5 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
const accountRowClass =
  "account-row flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0";
const accountRowTextClass = "mt-1 text-xs break-all text-muted";
const lowerPanelClass =
  "workspace-form mt-5 max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4";
const values = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form)) as Record<string, string>;
// Quota subjects reported by Forgejo; unknown subjects are shown as sent.
const storageLabels = (t: TFunction<"workspace">): Record<string, string> => ({
  "size:all": t("storage.subjects.all"),
  "size:repos:all": t("storage.subjects.reposAll"),
  "size:repos:public": t("storage.subjects.reposPublic"),
  "size:repos:private": t("storage.subjects.reposPrivate"),
  "size:git:all": t("storage.subjects.gitAll"),
  "size:git:lfs": "Git LFS",
  "size:assets:all": t("storage.subjects.assetsAll"),
  "size:assets:attachments:all": t("storage.subjects.attachmentsAll"),
  "size:assets:attachments:issues": t("storage.subjects.attachmentsIssues"),
  "size:assets:attachments:releases": t("storage.subjects.attachmentsReleases"),
  "size:assets:artifacts": t("storage.subjects.artifacts"),
  "size:assets:packages:all": t("storage.subjects.packages"),
  "size:assets:wiki": t("storage.subjects.wiki"),
});
function bytes(value: number, language: string) {
  if (value === 0) return "0 B";
  const unit = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  const digits = unit ? 1 : 0;
  const amount = new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value / 1024 ** unit);
  return `${amount} ${["B", "KiB", "MiB", "GiB", "TiB"][unit]}`;
}
export function SharedStoragePage({
  nativeRoot = "/user/settings",
}: {
  nativeRoot?: string;
}) {
  const { t, i18n } = useTranslation("workspace");
  const labels = storageLabels(t);
  // Account settings stack sections; organization settings use two columns.
  const sectionClass =
    nativeRoot === "/user/settings"
      ? accountSectionClass
      : settingsSectionClass;
  const query = useQuery({
    queryKey: ["storage-overview", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<{
        enabled: boolean;
        items: { subject: string; used: number }[];
        groups: {
          name: string;
          rules: {
            name: string;
            limit: number;
            used: number;
            subjects: string[];
          }[];
        }[];
      }>(`${nativeRoot}/storage_overview`, signal),
  });
  useTitle(t("storage.title"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h2>{t("storage.title")}</h2>
      </div>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.enabled ? (
        <>
          <section className={sectionClass}>
            <div>
              <h2>{t("storage.byType")}</h2>
              <p>{t("storage.byTypeDescription")}</p>
            </div>
            <div>
              {query.data.items.map((item) => (
                <div className={accountRowClass} key={item.subject}>
                  <span>{labels[item.subject] || item.subject}</span>
                  <strong className="ml-auto">
                    {bytes(item.used, i18n.language)}
                  </strong>
                </div>
              ))}
            </div>
          </section>
          {query.data.groups.map((group) => (
            <section className={sectionClass} key={group.name}>
              <div>
                <h2>{group.name}</h2>
                <p>{t("storage.groupDescription")}</p>
              </div>
              <div>
                {group.rules.map((rule) => (
                  <article className="py-4" key={rule.name}>
                    <h3 className="mb-1 text-[14px] font-semibold">
                      {rule.name}
                    </h3>
                    <p className="mb-3 text-[13px] text-muted">
                      {rule.subjects
                        .map((subject) => labels[subject] || subject)
                        .join(", ")}
                    </p>
                    <strong>
                      {bytes(rule.used, i18n.language)} /{" "}
                      {rule.limit < 0
                        ? t("storage.unlimited")
                        : bytes(rule.limit, i18n.language)}
                    </strong>
                    {rule.limit > 0 && (
                      <progress
                        className="mt-3 block h-2 w-full"
                        max={rule.limit}
                        value={Math.min(rule.used, rule.limit)}
                        aria-label={t("storage.used", { name: rule.name })}
                      />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        query.data && (
          <EmptyState title={t("storage.disabled")}>
            {t("storage.disabledHint")}
          </EmptyState>
        )
      )}
    </>
  );
}
export function OrganizationAdvancedSettingsPage() {
  const { org = "" } = useParams();
  const location = useLocation();
  const root = `/organizations/${encode(org)}/settings`,
    nativeRoot = `/org/${encode(org)}/settings`;
  const section = location.pathname.split("/settings/")[1] || "";
  const query = useQuery({
    queryKey: ["organization", org, "settings"],
    queryFn: ({ signal }) => nativePage<WorkspaceData>(nativeRoot, signal),
  });
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
  return (
    <OrganizationFrame data={query.data} selected="settings">
      <div className={settingsContentClass}>
        {section === "storage_overview" ? (
          <SharedStoragePage nativeRoot={nativeRoot} />
        ) : section === "avatar" ? (
          <OrganizationAvatar nativeRoot={nativeRoot} data={query.data} />
        ) : section === "delete" ? (
          <DeleteOrganization nativeRoot={nativeRoot} org={org} />
        ) : section === "blocked_users" ? (
          <OrganizationBlocked nativeRoot={nativeRoot} />
        ) : section === "labels" ? (
          <OrganizationLabels nativeRoot={nativeRoot} />
        ) : section === "applications" ? (
          <OrganizationApplications nativeRoot={nativeRoot} uiRoot={root} />
        ) : section.startsWith("applications/oauth2/") ? (
          <OAuthApplicationPage
            frame="organization"
            nativeRoot={nativeRoot}
            applicationId={section.split("/")[2]}
          />
        ) : section.startsWith("actions/") ? (
          <SharedActionsSettings
            nativeRoot={nativeRoot}
            uiRoot={root}
            section={section.slice(8)}
          />
        ) : section === "hooks" || section.startsWith("hooks/") ? (
          <SharedWebhookSettings
            nativeRoot={nativeRoot}
            uiRoot={root}
            section={section}
          />
        ) : null}
      </div>
    </OrganizationFrame>
  );
}
function OrganizationAvatar({
  nativeRoot,
  data,
}: {
  nativeRoot: string;
  data: WorkspaceData;
}) {
  const { t } = useTranslation("workspace");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const payload = new FormData(form);
      await request(`${nativeRoot}/avatar`, {
        method: "POST",
        headers: { "X-Forgejo-UI": "1" },
        body: payload,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["organization"] }),
  });
  const remove = useMutation({
    mutationFn: () => nativeForm(`${nativeRoot}/avatar/delete`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ["organization"] }),
  });
  return (
    <>
      <h2>{t("organization.avatar.title")}</h2>
      <p className="text-muted my-4">{t("organization.avatar.description")}</p>
      {data.profile?.avatar && (
        <img
          src={data.profile.avatar}
          alt={t("organization.avatar.current")}
          className="mb-5 size-24 shrink-0 rounded-full object-cover"
        />
      )}
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(event.currentTarget);
        }}
      >
        <label>
          {t("organization.avatar.image")}
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/gif,image/webp"
            required
          />
        </label>
        <Feedback error={save.error || remove.error} />
        {save.isSuccess && (
          <p role="status" className="form-success">
            {t("organization.avatar.saved")}
          </p>
        )}
        <div className={actionsClass}>
          <button className="button primary" disabled={save.isPending}>
            {t("organization.avatar.upload")}
          </button>
          <button
            className="button"
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t("organization.avatar.remove")}
          </button>
        </div>
      </form>
    </>
  );
}
function DeleteOrganization({
  nativeRoot,
  org,
}: {
  nativeRoot: string;
  org: string;
}) {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (fields: Record<string, string>) =>
      nativeForm(`${nativeRoot}/delete`, fields),
    onSuccess: () => navigate("/organizations"),
  });
  return (
    <>
      <h2>{t("organization.settings.nav.delete")}</h2>
      <p className="my-5">{t("organization.delete.description", { org })}</p>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(values(event.currentTarget));
        }}
      >
        <label>
          {t("organization.delete.confirm", { org })}
          <input
            name="org_name"
            required
            pattern={org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}
          />
        </label>
        <Feedback error={mutation.error} />
        <button className="button" disabled={mutation.isPending}>
          {t("organization.settings.nav.delete")}
        </button>
      </form>
    </>
  );
}
function OrganizationBlocked({ nativeRoot }: { nativeRoot: string }) {
  const { t } = useTranslation("workspace");
  const query = useQuery({
    queryKey: ["organization-blocked", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData>(`${nativeRoot}/blocked_users`, signal),
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      data,
    }: {
      action: string;
      data: Record<string, string>;
    }) => nativeForm(`${nativeRoot}/blocked_users/${action}`, data),
    onSuccess: () => query.refetch(),
  });
  return (
    <>
      <div className={settingsHeadingClass}>
        <h2>{t("organization.settings.nav.blocked")}</h2>
      </div>
      <form
        className={workspaceSearchClass}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            action: "block",
            data: values(event.currentTarget),
          });
        }}
      >
        <label className={`flex-1 ${organizationFieldClass}`}>
          {t("shared.username")}
          <input className={fieldInputClass} name="uname" required />
        </label>
        <button className="button">{t("organization.blocked.block")}</button>
      </form>
      <Feedback error={query.error || mutation.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.people.length ? (
        query.data.people.map((person) => (
          <div className={accountRowClass} key={person.id}>
            <Link to={`/users/${encode(person.name)}`}>
              {person.full_name || person.name}
            </Link>
            <button
              className="button ml-auto"
              onClick={() =>
                mutation.mutate({
                  action: "unblock",
                  data: { user_id: String(person.id) },
                })
              }
            >
              {t("organization.blocked.unblock")}
            </button>
          </div>
        ))
      ) : (
        <EmptyState title={t("organization.blocked.empty")} />
      )}
    </>
  );
}
interface OrganizationLabel {
  ID: number;
  Name: string;
  Description: string;
  Color: string;
  Exclusive: boolean;
  ArchivedUnix: number;
}
function OrganizationLabels({ nativeRoot }: { nativeRoot: string }) {
  const { t, i18n } = useTranslation("workspace");
  const [editing, setEditing] = useState<OrganizationLabel | "new" | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["organization-labels", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<{
        labels: OrganizationLabel[];
        templates: { DisplayName: string; Description: string }[];
      }>(`${nativeRoot}/labels`, signal),
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      fields,
    }: {
      path: string;
      fields: Record<string, string>;
    }) => nativeForm(`${nativeRoot}/labels/${path}`, fields),
    onSuccess: async () => {
      setEditing(null);
      await query.refetch();
    },
  });
  return (
    <>
      <div className={settingsHeadingClass}>
        <h2>{t("organization.labels.title")}</h2>
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={15} />
          {t("organization.labels.new")}
        </button>
      </div>
      <p className="text-muted mb-5">{t("organization.labels.description")}</p>
      <Feedback error={query.error || mutation.error} />
      {editing && (
        <form
          className={`workspace-form mb-5 ${formPanelClass}`}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              path: editing === "new" ? "new" : "edit",
              fields: values(event.currentTarget),
            });
          }}
          key={editing === "new" ? "new" : editing.ID}
        >
          {editing !== "new" && (
            <input type="hidden" name="id" value={editing.ID} />
          )}
          <label>
            {t("organization.labels.name")}
            <input
              name="title"
              required
              defaultValue={editing === "new" ? "" : editing.Name}
            />
          </label>
          <label>
            {t("shared.description")}
            <input
              name="description"
              defaultValue={editing === "new" ? "" : editing.Description}
            />
          </label>
          <label>
            {t("organization.labels.color")}
            <input
              name="color"
              type="color"
              defaultValue={
                editing === "new"
                  ? "#6699cc"
                  : `#${editing.Color.replace(/^#/, "")}`
              }
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              name="exclusive"
              defaultChecked={editing !== "new" && editing.Exclusive}
            />
            {t("organization.labels.exclusive")}
          </label>
          {editing !== "new" && (
            <label className="check-field">
              <input
                type="checkbox"
                name="is_archived"
                defaultChecked={!!editing.ArchivedUnix}
              />
              {t("shared.archived")}
            </label>
          )}
          <div className={actionsClass}>
            <button className="button primary">
              {t("organization.labels.save")}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setEditing(null)}
            >
              {t("shared.cancel")}
            </button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data?.labels
          .slice()
          .sort((left, right) =>
            left.Name.localeCompare(right.Name, i18n.language),
          )
          .map((label) => (
            <article className={accountRowClass} key={label.ID}>
              <div className="min-w-0 flex-1">
                <strong
                  className="label"
                  style={{
                    backgroundColor: `#${label.Color.replace(/^#/, "")}`,
                    color: "#fff",
                  }}
                >
                  {label.Name}
                </strong>
                <p className={accountRowTextClass}>{label.Description}</p>
                {!!label.ArchivedUnix && (
                  <span className="text-muted text-xs">
                    {t("shared.archived")}
                  </span>
                )}
              </div>
              <div className={`ml-auto ${actionsClass}`}>
                <button className="button" onClick={() => setEditing(label)}>
                  {t("shared.edit")}
                </button>
                <ConfirmAction
                  title={t("organization.labels.confirmDelete", {
                    name: label.Name,
                  })}
                  action={() =>
                    mutation.mutateAsync({
                      path: "delete",
                      fields: { id: String(label.ID) },
                    })
                  }
                >
                  {t("organization.labels.confirmDeleteText")}
                </ConfirmAction>
              </div>
            </article>
          ))
      )}
      {query.data && !query.data.labels.length && (
        <EmptyState title={t("organization.labels.empty")} />
      )}
      {query.data?.templates?.length ? (
        <form
          className={lowerPanelClass}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              path: "initialize",
              fields: values(event.currentTarget),
            });
          }}
        >
          <h3>{t("organization.labels.useTemplate")}</h3>
          <label>
            {t("organization.labels.template")}
            <SelectControl
              label={t("organization.labels.template")}
              name="template_name"
              options={query.data.templates.map((template) => ({
                value: template.DisplayName,
                label: template.DisplayName,
                description: template.Description,
              }))}
            />
          </label>
          <button className="button">
            {t("organization.labels.addTemplate")}
          </button>
        </form>
      ) : null}
    </>
  );
}
interface Application {
  ID: number;
  Name: string;
  ClientID: string;
  RedirectURIs: string[];
  ConfidentialClient: boolean;
}
function OrganizationApplications({
  nativeRoot,
  uiRoot,
}: {
  nativeRoot: string;
  uiRoot: string;
}) {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["organization-applications", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<{ applications: Application[] }>(
        `${nativeRoot}/applications`,
        signal,
      ),
  });
  const save = useMutation({
    mutationFn: async (fields: Record<string, string>) =>
      (
        await request<{ application: Application; client_secret?: string }>(
          `${nativeRoot}/applications/oauth2`,
          {
            method: "POST",
            headers: {
              "X-Forgejo-UI": "1",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(fields),
          },
        )
      ).data,
    onSuccess: (result) => {
      if (result.application?.ID)
        navigate(`${uiRoot}/applications/oauth2/${result.application.ID}`, {
          state: { secret: result.client_secret },
        });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      nativeForm(`${nativeRoot}/applications/oauth2/${id}/delete`, {}),
    onSuccess: () => query.refetch(),
  });
  return (
    <>
      <div className={settingsHeadingClass}>
        <h2>{t("organization.applications.title")}</h2>
      </div>
      <Feedback error={query.error || save.error || remove.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data?.applications.map((app) => (
          <div className={accountRowClass} key={app.ID}>
            <div className="min-w-0 flex-1">
              <Link to={`${uiRoot}/applications/oauth2/${app.ID}`}>
                {app.Name}
              </Link>
              <p className={accountRowTextClass}>{app.ClientID}</p>
            </div>
            <ConfirmAction
              title={t("organization.applications.confirmDelete", {
                name: app.Name,
              })}
              action={() => remove.mutateAsync(app.ID)}
              className="button ml-auto"
            >
              {t("organization.applications.confirmDeleteText")}
            </ConfirmAction>
          </div>
        ))
      )}
      <form
        className={lowerPanelClass}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(values(event.currentTarget));
        }}
      >
        <h3>{t("organization.applications.add")}</h3>
        <label>
          {t("organization.applications.name")}
          <input name="application_name" required />
        </label>
        <label>
          {t("organization.applications.redirectUris")}
          <textarea
            name="redirect_uris"
            rows={3}
            required
            placeholder="https://example.com/callback"
          />
        </label>
        <label className="check-field">
          <input name="confidential_client" type="checkbox" defaultChecked />
          {t("organization.applications.confidential")}
        </label>
        <button className="button primary">
          {t("organization.applications.create")}
        </button>
      </form>
    </>
  );
}
export function TeamInvitationPage() {
  const { t } = useTranslation("workspace");
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const endpoint = `/org/invite/${encode(token)}`;
  const query = useQuery({
    queryKey: ["team-invitation", token],
    queryFn: ({ signal }) =>
      nativePage<WorkspaceData & { inviter: { name: string } }>(
        endpoint,
        signal,
      ),
  });
  const accept = useMutation({
    mutationFn: () => nativeForm(endpoint, {}),
    onSuccess: () =>
      navigate(
        `/organizations/${encode(query.data?.profile?.name || "")}/teams/${encode(query.data?.team?.name || "")}`,
      ),
  });
  return (
    <section className={narrowPageClass}>
      <div className={pageHeadingClass}>
        <h1 className="max-md:text-[22px]">{t("invitation.title")}</h1>
      </div>
      <Feedback error={query.error || accept.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <div className={formPanelClass}>
            <h2 className="mb-2">
              {t("invitation.join", {
                name: query.data.profile?.full_name || query.data.profile?.name,
              })}
            </h2>
            <p className="my-5">
              {t("invitation.text", {
                inviter: query.data.inviter.name,
                team: query.data.team?.name,
              })}
            </p>
            <button
              className="button primary"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              {t("invitation.accept")}
            </button>
          </div>
        )
      )}
    </section>
  );
}
