import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { nativePage, nativeForm, request, type FormResult } from "./api";
import type { RepoContext } from "./App";
import { uiRoute } from "./routes";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { SharedWebhookSettings } from "./WebhookSettings";
import { RepositoryStorageSettings } from "./StorageSettings";
import {
  formatBytes,
  globMatch,
  searchUsers,
  SuggestionInput,
  teamSearch,
} from "./SettingsExtras";
import { RunnerSettings } from "./RunnerSettings";

// Shared by project, account, organization and admin settings screens.
export const settingsTabs =
  "mb-6 flex gap-5 overflow-x-auto border-b border-line whitespace-nowrap max-md:gap-4";
export const settingsTab = (active: boolean) =>
  active
    ? "border-b-2 border-primary px-1 pt-1 pb-3 text-sm font-semibold text-ink"
    : "border-b-2 border-transparent px-1 pt-1 pb-3 text-sm text-muted";
export const settingsToolbar =
  "mb-5 flex items-center justify-between gap-3 max-md:flex-wrap";
export const settingsList = "configuration-list mt-4 [&_p]:mt-1 [&_p]:text-xs";
export const settingsRow =
  "flex flex-wrap items-center gap-3 border-t border-line py-4";
export const settingsRowBody = "min-w-0 flex-1 max-md:basis-[65%]";
export const settingsRowIcon = "shrink-0 text-muted";
export const settingsEmpty =
  "rounded-md border border-dashed border-line px-5 py-8 text-center text-sm text-muted";
export const settingsField =
  "flex min-w-0 flex-col gap-2 text-sm font-semibold";
export const settingsFormClass = "flex max-w-[720px] flex-col gap-5";
export const settingsActions = "flex flex-wrap items-center gap-2";
export const settingsMuted = "text-sm text-muted";
export const settingsInput =
  "min-h-8 w-full rounded border border-[#89888d] bg-surface px-3 py-2 text-sm font-normal text-ink focus:outline-2 focus:outline-offset-1 focus:outline-primary";
const settingsTextarea = `${settingsInput} resize-y leading-6`;
export const settingsHint = "block text-xs leading-5 font-normal text-muted";
const settingsCheck = "flex items-start gap-2 text-sm";
const settingsCheckInput = "mt-0.5 size-4 shrink-0 accent-primary";
export const settingsConfirm =
  "my-4 flex basis-full flex-col gap-3 rounded-md border border-line bg-surface-subtle p-5";
export const settingsToken =
  "configuration-token my-4 flex items-start gap-3 rounded-md border border-line bg-code p-3";
export const settingsTokenCode =
  "min-w-0 flex-1 text-xs leading-6 break-all whitespace-pre-wrap";
const settingsDivider = "my-6 border-t border-line";
const settingsMirrorRow =
  "configuration-mirror-row mb-5 rounded-md border border-line p-4 [&>form]:mt-4";
export const settingsFormHeading = "mt-2 text-base font-semibold";
// Notices for settings the native page replaces with a warning (archived projects).
export const settingsWarning =
  "flex items-start gap-2 rounded-md border border-[#e9be74] bg-[#fdf1dd] px-4 py-3 text-sm text-[#8f4700] dark:border-[#8f5d0b] dark:bg-[#4a3a1c] dark:text-[#e9c77b]";

export function SettingsSection({
  title,
  description,
  children,
  open = false,
  danger = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  danger?: boolean;
}) {
  return (
    <details
      className="configuration-section group/section border-b border-line py-5 first-of-type:pt-0"
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-sm [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2
            className={
              danger
                ? "text-xl font-semibold tracking-[-0.25px] text-danger max-md:text-lg"
                : "text-xl font-semibold tracking-[-0.25px] max-md:text-lg"
            }
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 text-sm break-words text-muted">
              {description}
            </p>
          )}
        </div>
        <ChevronDown
          size={18}
          className="mt-1.5 shrink-0 transition-transform duration-150 group-open/section:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="animate-configuration-reveal pt-5 motion-reduce:animate-none">
        {children}
      </div>
    </details>
  );
}
interface Field {
  name: string;
  label: string;
  value?: string | number | boolean;
  type?: "text" | "textarea" | "password" | "number" | "url" | "checkbox";
  required?: boolean;
  max?: number;
  min?: number;
  hint?: string;
  options?: { value: string; label: string }[];
  disabled?: boolean;
}
export function SettingsFields({ fields }: { fields: Field[] }) {
  return (
    <>
      {fields.map((field) =>
        field.type === "checkbox" ? (
          <label className={settingsCheck} key={field.name}>
            <input
              type="checkbox"
              name={field.name}
              aria-label={field.label}
              defaultChecked={!!field.value}
              value="true"
              disabled={field.disabled}
              className={settingsCheckInput}
            />
            <span>
              {field.label}
              {field.hint && (
                <small className={`mt-1 ${settingsHint}`}>{field.hint}</small>
              )}
            </span>
          </label>
        ) : (
          <label className={settingsField} key={field.name}>
            {field.label}
            {field.options ? (
              <SelectControl
                name={field.name}
                label={field.label}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                options={field.options}
                disabled={field.disabled}
                className="w-full font-normal"
              />
            ) : field.type === "textarea" ? (
              <textarea
                className={settingsTextarea}
                name={field.name}
                aria-label={field.label}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                maxLength={field.max}
              />
            ) : (
              <input
                className={settingsInput}
                name={field.name}
                aria-label={field.label}
                type={field.type || "text"}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                maxLength={field.type === "number" ? undefined : field.max}
                min={field.min}
                max={field.type === "number" ? field.max : undefined}
                disabled={field.disabled}
              />
            )}{" "}
            {field.hint && <small className={settingsHint}>{field.hint}</small>}
          </label>
        ),
      )}
    </>
  );
}
function fieldsFromForm(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form)) as Record<string, string>;
}
export async function settingsSubmit<T = FormResult>(
  path: string,
  values: Record<string, string> | FormData,
) {
  return (
    await request<T>(path, {
      method: "POST",
      headers: {
        "X-Forgejo-UI": "1",
        ...(values instanceof FormData
          ? {}
          : { "Content-Type": "application/x-www-form-urlencoded" }),
      },
      body: values instanceof FormData ? values : new URLSearchParams(values),
    })
  ).data;
}
export function SettingsForm({
  path,
  fields,
  hidden = {},
  button,
  children,
  onSaved,
}: {
  path: string;
  fields?: Field[];
  hidden?: Record<string, string>;
  button?: string;
  children?: ReactNode;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("settings");
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      settingsSubmit(path, values),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries();
      onSaved?.();
    },
  });
  return (
    <form
      className={settingsFormClass}
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        mutation.mutate({ ...fieldsFromForm(e.currentTarget), ...hidden });
      }}
    >
      {fields && <SettingsFields fields={fields} />} {children}
      <Feedback error={mutation.error} />
      <div className={settingsActions}>
        <button className="button primary" disabled={mutation.isPending}>
          {button ?? t("form.save")}
        </button>
        {saved && (
          <span role="status" className="text-sm text-success">
            {t("form.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
export function SettingsDelete({
  path,
  values,
  label: customLabel,
  name,
  description,
  disabled,
  onDeleted,
}: {
  path: string;
  values?: Record<string, string>;
  label?: string;
  name: string;
  /** Replaces the generic "takes effect immediately" notice. */
  description?: string;
  disabled?: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation("settings");
  const label = customLabel ?? t("form.delete");
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => nativeForm(path, values || {}),
    onSuccess: async () => {
      setConfirm(false);
      await client.invalidateQueries();
      onDeleted?.();
    },
  });
  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => setConfirm(true)}
        aria-label={t("confirm.label", { action: label, name })}
        disabled={disabled}
      >
        <Trash2 size={14} />
        {label}
      </button>
      {confirm && (
        <div
          className={settingsConfirm}
          role="alertdialog"
          aria-label={t("confirm.label", { action: label, name })}
        >
          <strong>{t("confirm.question", { action: label, name })}</strong>
          <p>{description ?? t("confirm.immediate")}</p>
          <Feedback error={mutation.error} />
          <div className={settingsActions}>
            <button
              className="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {label}
            </button>
            <button className="button" onClick={() => setConfirm(false)}>
              {t("form.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface SettingsRepository {
  id: number;
  name: string;
  description: string;
  website: string;
  private: boolean;
  template: boolean;
  archived: boolean;
  mirror: boolean;
  fork: boolean;
  default_branch: string;
  default_wiki_branch: string;
  trust_model: string;
  empty: boolean;
  status: number;
  health_check: boolean;
  size?: number;
  git_size?: number;
  lfs_size?: number;
  num_forks?: number;
  num_stars?: number;
}
export interface GeneralSettings {
  repository: SettingsRepository;
  force_private: boolean;
  owner: boolean;
  admin: boolean;
  avatar_url: string;
  mirrors_enabled: boolean;
  push_mirrors_enabled: boolean;
  minimum_mirror_interval: string;
  default_mirror_interval: string;
  signing_key_available: boolean;
  code_indexer_enabled: boolean;
  git_hooks_enabled: boolean;
  ssh_mirroring_enabled: boolean;
  lfs_enabled: boolean;
  federation_enabled: boolean;
  following_repos: string;
  transfer: { id?: number; recipient?: string };
  pull_mirror?: {
    interval: number;
    enable_prune: boolean;
    lfs: boolean;
    lfs_endpoint: string;
    updated: string;
    username: string;
    address: string;
  };
  push_mirrors: {
    id: number;
    remote_name: string;
    sync_on_commit: boolean;
    interval: number;
    last_update: string;
    last_error: string;
    branch_filter: string;
    address: string;
    public_key: string;
  }[];
  // Native visibility conditions (absent from older servers).
  ap_actor_id?: string;
  pull_mirrors_enabled?: boolean;
  code_enabled?: boolean;
  wiki_readable?: boolean;
  default_wiki_branch_name?: string;
  can_convert_fork?: boolean;
  actions_enabled?: boolean;
  webhooks_enabled?: boolean;
  flags_enabled?: boolean;
  code_indexer_commit?: string;
  stats_indexer_commit?: string;
  pull_mirror_broken?: boolean;
}
export function ProjectSettingsPage() {
  const { t } = useTranslation("settings");
  const { path, repository } = useOutletContext<RepoContext>();
  const location = useLocation();
  const root = `/projects${path}/settings`,
    nativeRoot = `${path}/settings`,
    section =
      location.pathname.slice(root.length).replace(/^\//, "") || "general";
  useTitle(t("project.title"));
  if (!repository.permissions?.admin)
    return (
      <EmptyState title={t("project.adminRequired.title")}>
        {t("project.adminRequired.body")}
      </EmptyState>
    );
  return (
    <section className="mx-auto max-w-[1100px] min-w-0">
      <header className="repository-page-header flex min-h-14 items-center justify-between gap-4 pb-4 max-md:flex-wrap">
        <h1 className="text-[23px] font-semibold tracking-[-0.4px] max-md:text-xl">
          {t("project.title")}
        </h1>
      </header>
      {section === "flags" ? (
        <RepositoryFlags path={path} />
      ) : section.startsWith("hooks/git") || section.startsWith("lfs") ? (
        <RepositoryStorageSettings
          nativeRoot={nativeRoot}
          uiRoot={root}
          section={section}
        />
      ) : section.startsWith("hooks") ? (
        <SharedWebhookSettings
          nativeRoot={nativeRoot}
          uiRoot={root}
          section={section}
        />
      ) : section.startsWith("actions/") ? (
        <SharedActionsSettings
          nativeRoot={nativeRoot}
          uiRoot={root}
          section={section.slice(8)}
        />
      ) : section === "general" ? (
        <GeneralProjectSettings nativeRoot={nativeRoot} />
      ) : section === "units" ? (
        <UnitsSettings nativeRoot={nativeRoot} />
      ) : section === "collaboration" ? (
        <MemberSettings nativeRoot={nativeRoot} />
      ) : section.startsWith("branches") ? (
        <BranchSettings
          nativeRoot={nativeRoot}
          uiRoot={root}
          edit={section.endsWith("edit")}
        />
      ) : section.startsWith("tags") ? (
        <TagProtectionSettings
          nativeRoot={nativeRoot}
          editId={Number(section.split("/")[1]) || undefined}
          uiRoot={root}
        />
      ) : section === "keys" ? (
        <DeployKeySettings nativeRoot={nativeRoot} />
      ) : (
        <EmptyState title={t("project.notFound.title")}>
          {t("project.notFound.body")}
        </EmptyState>
      )}
    </section>
  );
}
function GeneralProjectSettings({ nativeRoot }: { nativeRoot: string }) {
  const { t, i18n } = useTranslation("settings");
  const { repository, path } = useOutletContext<RepoContext>();
  const [failedAvatar, setFailedAvatar] = useState("");
  const query = useQuery({
    queryKey: ["project-settings", nativeRoot],
    queryFn: ({ signal }) => nativePage<GeneralSettings>(nativeRoot, signal),
  });
  const navigate = useNavigate();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      settingsSubmit(nativeRoot, { ...values, action: "update" }),
    onSuccess: async (response) => {
      await client.invalidateQueries();
      if (response.redirect) navigate(uiRoute(response.redirect));
    },
  });
  const avatar = useMutation({
    mutationFn: (values: FormData) =>
      settingsSubmit(`${nativeRoot}/avatar`, values),
    onSuccess: () => client.invalidateQueries(),
  });
  const [confirm, setConfirm] = useState<{
    action: string;
    title: string;
    description: string;
  }>();
  const danger = useMutation({
    mutationFn: (values: Record<string, string>) =>
      nativeForm(nativeRoot, values),
    onSuccess: async (response) => {
      setConfirm(undefined);
      await client.invalidateQueries();
      if (response.redirect) navigate(uiRoute(response.redirect));
    },
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!,
    r = data.repository;
  const dateOrNever = (value?: string) =>
    value && new Date(value).getTime() > 0
      ? relativeDate(value)
      : t("mirror.never");
  // Native mirror settings: shown with the code unit when new mirrors are
  // allowed or the project already mirrors; the notice follows the instance's
  // pull/push mirror switches.
  const pullAllowed = data.pull_mirrors_enabled !== false,
    pushAllowed = data.push_mirrors_enabled,
    hasMirrors = r.mirror || !!data.pull_mirror || !!data.push_mirrors?.length;
  const showMirrors =
    data.code_enabled !== false && (pullAllowed || pushAllowed || hasMirrors);
  const mirrorNotice =
    pullAllowed && pushAllowed
      ? data.mirrors_enabled
        ? t("mirror.pushEnabled")
        : t("mirror.disabled")
      : pushAllowed
        ? t("mirror.pullMirrorsDisabled")
        : pullAllowed
          ? hasMirrors
            ? t("mirror.pushMirrorsDisabledExisting")
            : t("mirror.pushMirrorsDisabled")
          : data.mirrors_enabled
            ? t("mirror.noNewMirrors")
            : t("mirror.disabled");
  return (
    <>
      <SettingsSection
        title={t("general.title")}
        description={t("general.description")}
        open
      >
        <form
          className={settingsFormClass}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(fieldsFromForm(e.currentTarget));
          }}
        >
          <SettingsFields
            fields={[
              {
                name: "repo_name",
                label: t("general.name"),
                value: r.name,
                required: true,
                max: 100,
              },
            ]}
          />
          {r.size !== undefined && (
            <div className={settingsField}>
              {t("general.size")}
              <span className="font-normal">
                {formatBytes(r.size, i18n.language)}
              </span>
              <small className={settingsHint}>
                {t("general.sizeDetails", {
                  git: formatBytes(r.git_size ?? 0, i18n.language),
                  lfs: formatBytes(r.lfs_size ?? 0, i18n.language),
                })}
              </small>
            </div>
          )}
          <SettingsFields
            fields={[
              {
                name: "description",
                label: t("form.description"),
                type: "textarea",
                value: r.description,
                max: 2048,
              },
              {
                name: "website",
                label: t("general.website"),
                type: "url",
                value: r.website,
                max: 1024,
              },
              {
                name: "template",
                label: t("general.template"),
                type: "checkbox",
                value: r.template,
              },
            ]}
          />
          {!r.fork && (
            <SettingsFields
              fields={[
                {
                  name: "private",
                  label: t("general.private"),
                  type: "checkbox",
                  value: r.private,
                  disabled: data.force_private && r.private && !data.admin,
                  // Native warnings: forks follow the visibility and making a
                  // public project private removes its stars.
                  hint: [
                    t("general.privateHint"),
                    r.num_forks ? t("general.privateForksHint") : "",
                    !r.private && r.num_stars
                      ? t("general.privateStarsHint")
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                },
              ]}
            />
          )}{" "}
          {(r.fork || (data.force_private && r.private && !data.admin)) &&
            r.private && <input name="private" type="hidden" value="true" />}
          <Feedback error={save.error} />
          <div className={settingsActions}>
            <button className="button primary" disabled={save.isPending}>
              {t("form.save")}
            </button>
            {save.isSuccess && (
              <span role="status" className="text-sm text-success">
                {t("form.saved")}
              </span>
            )}
          </div>
        </form>
        <div className={settingsDivider} />
        <form
          className={settingsFormClass}
          onSubmit={(e) => {
            e.preventDefault();
            avatar.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="flex items-center gap-5 max-md:items-start">
            {data.avatar_url && data.avatar_url !== failedAvatar ? (
              <img
                className="size-20 rounded-lg border border-line object-cover"
                src={data.avatar_url}
                alt={t("general.avatar")}
                onError={() => setFailedAvatar(data.avatar_url)}
              />
            ) : (
              <span
                className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-2xl font-semibold text-muted"
                role="img"
                aria-label={t("general.avatarFallback", { name: r.name })}
              >
                {r.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <label className={settingsField}>
              {t("general.avatar")}
              <input
                className={settingsInput}
                name="avatar"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                required
              />
            </label>
          </div>
          <Feedback error={avatar.error} />
          <div className={settingsActions}>
            <button className="button" disabled={avatar.isPending}>
              {t("general.uploadAvatar")}
            </button>
            <SettingsDelete
              path={`${nativeRoot}/avatar/delete`}
              name={t("general.avatarName")}
              label={t("form.remove")}
            />
          </div>
        </form>
      </SettingsSection>
      {showMirrors && (
        <SettingsSection
          title={t("mirror.title")}
          description={t("mirror.description")}
        >
          {r.archived ? (
            <p className={settingsWarning}>
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              {t("mirror.archived")}
            </p>
          ) : (
            <>
              <p className={settingsMuted}>{mirrorNotice}</p>
              {r.mirror && (
                <div className={settingsMirrorRow}>
                  <p>{t("mirror.pullMirror")}</p>
                  {data.pull_mirror_broken ? (
                    <p role="alert" className="text-danger">
                      {t("mirror.pullBroken")}
                    </p>
                  ) : (
                    data.pull_mirror && (
                      <p className={settingsMuted}>
                        {t("mirror.lastUpdate", {
                          date: dateOrNever(data.pull_mirror.updated),
                        })}
                      </p>
                    )
                  )}
                  {data.pull_mirror && (
                    <SettingsForm
                      path={nativeRoot}
                      hidden={{ action: "mirror", repo_name: r.name }}
                      fields={[
                        {
                          name: "mirror_address",
                          label: t("mirror.sourceUrl"),
                          value: data.pull_mirror.address,
                          required: true,
                        },
                        {
                          name: "mirror_username",
                          label: t("form.authUsername"),
                          value: data.pull_mirror.username || "",
                        },
                        {
                          name: "mirror_password",
                          label: t("form.authPassword"),
                          type: "password",
                          hint: t("mirror.passwordHint"),
                        },
                        {
                          name: "interval",
                          label: t("form.updateInterval"),
                          value: `${data.pull_mirror.interval / 1e9}s`,
                          required: true,
                        },
                        {
                          name: "enable_prune",
                          label: t("mirror.prune"),
                          type: "checkbox",
                          value: data.pull_mirror.enable_prune,
                        },
                        // The native form offers LFS options only with the LFS server.
                        ...(data.lfs_enabled
                          ? [
                              {
                                name: "mirror_lfs",
                                label: t("mirror.lfs"),
                                type: "checkbox" as const,
                                value: data.pull_mirror.lfs,
                              },
                              {
                                name: "mirror_lfs_endpoint",
                                label: t("mirror.lfsEndpoint"),
                                value: data.pull_mirror.lfs_endpoint,
                              },
                            ]
                          : []),
                      ]}
                      button={t("mirror.updatePull")}
                    />
                  )}
                  {data.pull_mirror && (
                    <SettingsForm
                      path={nativeRoot}
                      hidden={{ action: "mirror-sync", repo_name: r.name }}
                      button={t("mirror.syncPull")}
                    />
                  )}
                </div>
              )}
              {data.push_mirrors?.map((mirror) => (
                <div className={settingsMirrorRow} key={mirror.id}>
                  <strong>{mirror.address || mirror.remote_name}</strong>
                  <p className={settingsMuted}>
                    {mirror.sync_on_commit
                      ? t("mirror.syncOnPushEnabled")
                      : t("mirror.syncOnPushDisabled")}
                  </p>
                  {mirror.public_key && (
                    <div className={settingsToken}>
                      <code className={settingsTokenCode}>
                        {mirror.public_key}
                      </code>
                      <CopyButton
                        value={mirror.public_key}
                        label={t("mirror.copyKey")}
                      />
                    </div>
                  )}
                  <p className={settingsMuted}>
                    {t("mirror.lastSync", {
                      date: dateOrNever(mirror.last_update),
                    })}
                  </p>
                  {mirror.last_error && <p role="alert">{mirror.last_error}</p>}
                  <SettingsForm
                    path={nativeRoot}
                    hidden={{
                      repo_name: r.name,
                      action: "push-mirror-update",
                      push_mirror_id: String(mirror.id),
                    }}
                    fields={[
                      {
                        name: "push_mirror_interval",
                        label: t("form.updateInterval"),
                        value: `${mirror.interval / 1e9}s`,
                        required: true,
                      },
                      {
                        name: "push_mirror_branch_filter",
                        label: t("form.branchFilter"),
                        value: mirror.branch_filter,
                      },
                    ]}
                    button={t("mirror.update")}
                  />
                  <div className={`mt-4 ${settingsActions}`}>
                    <SettingsForm
                      path={nativeRoot}
                      hidden={{
                        repo_name: r.name,
                        action: "push-mirror-sync",
                        push_mirror_id: String(mirror.id),
                      }}
                      button={t("mirror.sync")}
                    />
                    <SettingsDelete
                      path={nativeRoot}
                      values={{
                        repo_name: r.name,
                        action: "push-mirror-remove",
                        push_mirror_id: String(mirror.id),
                      }}
                      name={mirror.remote_name}
                    />
                  </div>
                </div>
              ))}
              {data.mirrors_enabled && data.push_mirrors_enabled && (
                <SettingsForm
                  path={nativeRoot}
                  hidden={{ repo_name: r.name, action: "push-mirror-add" }}
                  fields={[
                    {
                      name: "push_mirror_address",
                      label: t("mirror.address"),
                      required: true,
                    },
                    {
                      name: "push_mirror_username",
                      label: t("form.authUsername"),
                    },
                    {
                      name: "push_mirror_password",
                      label: t("form.authPassword"),
                      type: "password",
                    },
                    ...(data.ssh_mirroring_enabled
                      ? [
                          {
                            name: "push_mirror_use_ssh",
                            label: t("mirror.useSsh"),
                            type: "checkbox" as const,
                            value: false,
                            hint: t("mirror.useSshHint"),
                          },
                        ]
                      : []),
                    {
                      name: "push_mirror_interval",
                      label: t("form.updateInterval"),
                      value: data.default_mirror_interval,
                      hint: t("mirror.minimumInterval", {
                        interval: data.minimum_mirror_interval,
                      }),
                    },
                    {
                      name: "push_mirror_sync_on_commit",
                      label: t("mirror.syncOnPush"),
                      type: "checkbox",
                      value: true,
                    },
                    {
                      name: "push_mirror_branch_filter",
                      label: t("form.branchFilter"),
                      hint: t("mirror.branchFilterHint"),
                    },
                  ]}
                  button={t("mirror.add")}
                />
              )}
            </>
          )}
        </SettingsSection>
      )}
      <SettingsSection
        title={t("signing.title")}
        description={t("signing.description")}
      >
        <SettingsForm
          path={nativeRoot}
          hidden={{ repo_name: r.name, action: "signing" }}
          fields={[
            {
              name: "trust_model",
              label: t("signing.trustModel"),
              value: r.trust_model,
              options: [
                { value: "default", label: t("signing.default") },
                { value: "collaborator", label: t("signing.collaborator") },
                { value: "committer", label: t("signing.committer") },
                {
                  value: "collaboratorcommitter",
                  label: t("signing.collaboratorCommitter"),
                },
              ],
            },
          ]}
        />
      </SettingsSection>
      {data.federation_enabled && (
        <SettingsSection
          title={t("federation.title")}
          description={t("federation.description")}
        >
          {data.ap_actor_id && (
            <div className="mb-5 flex max-w-[720px] flex-col gap-2">
              <strong className="text-sm">{t("federation.actorId")}</strong>
              <p className={settingsMuted}>{t("federation.actorIdHint")}</p>
              <div className={settingsToken}>
                <code className={settingsTokenCode}>{data.ap_actor_id}</code>
                <CopyButton
                  value={data.ap_actor_id}
                  label={t("federation.copyActorId")}
                />
              </div>
            </div>
          )}
          <SettingsForm
            path={nativeRoot}
            hidden={{ action: "federation", repo_name: r.name }}
            fields={[
              {
                name: "following_repos",
                label: t("federation.following"),
                value: data.following_repos || "",
                hint: t("federation.followingHint"),
              },
            ]}
          />
        </SettingsSection>
      )}
      {data.transfer?.recipient && (
        <SettingsSection
          title={t("transfer.title")}
          description={t("transfer.description", {
            recipient: data.transfer.recipient,
          })}
          open
        >
          <SettingsForm
            path={nativeRoot}
            hidden={{ action: "cancel_transfer", repo_name: r.name }}
            button={t("transfer.cancel")}
          />
        </SettingsSection>
      )}
      {data.admin && (
        <SettingsSection
          title={t("maintenance.title")}
          description={t("maintenance.description")}
        >
          <SettingsForm
            path={nativeRoot}
            hidden={{ repo_name: r.name, action: "admin" }}
            fields={[
              {
                name: "enable_health_check",
                label: t("maintenance.healthCheck"),
                type: "checkbox",
                value: r.health_check,
              },
            ]}
          />
          <div className={settingsDivider} />
          <dl className="mb-4 grid max-w-[720px] grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm max-md:grid-cols-1">
            {[
              ...(data.code_indexer_enabled
                ? [[t("maintenance.codeIndexer"), data.code_indexer_commit]]
                : []),
              [t("maintenance.statsIndexer"), data.stats_indexer_commit],
            ].map(([label, sha]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="max-md:mb-2">
                  {sha ? (
                    <>
                      {t("maintenance.lastIndexed")}{" "}
                      <Link
                        className="font-mono text-primary"
                        to={`/projects${path}/commit/${sha}`}
                      >
                        {sha.slice(0, 10)}
                      </Link>
                    </>
                  ) : (
                    t("maintenance.unindexed")
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-3">
            {(
              [
                "stats",
                ...(data.code_indexer_enabled ? ["code" as const] : []),
                "issues",
              ] as const
            ).map((kind) => (
              <SettingsForm
                key={kind}
                path={nativeRoot}
                hidden={{
                  repo_name: r.name,
                  action: "admin_index",
                  request_reindex_type: kind,
                }}
                button={t(`maintenance.rebuild.${kind}`)}
              />
            ))}
          </div>
        </SettingsSection>
      )}
      {data.owner && (
        <SettingsSection
          title={t("advanced.title")}
          description={t("advanced.description")}
          danger
        >
          <div>
            {[
              // Like native, mirrors can't be archived.
              ...(!r.mirror
                ? [
                    {
                      action: r.archived ? "unarchive" : "archive",
                      title: r.archived
                        ? t("advanced.unarchive")
                        : t("advanced.archive"),
                      description: r.archived
                        ? t("advanced.unarchiveDescription")
                        : t("advanced.archiveDescription"),
                    },
                  ]
                : []),
              {
                action: "transfer",
                title: t("advanced.transfer"),
                description: data.transfer?.recipient
                  ? t("advanced.transferPending", {
                      recipient: data.transfer.recipient,
                    })
                  : t("advanced.transferDescription"),
                // A pending transfer is cancelled in its own section above.
                pending: !!data.transfer?.recipient,
              },
              ...(r.mirror
                ? [
                    {
                      action: "convert",
                      title: t("advanced.convert"),
                      description: t("advanced.convertDescription"),
                    },
                  ]
                : []),
              ...((data.can_convert_fork ?? r.fork)
                ? [
                    {
                      action: "convert_fork",
                      title: t("advanced.detachFork"),
                      description: t("advanced.detachForkDescription"),
                    },
                  ]
                : []),
              // Wiki actions need the wiki unit; the branch is only renamed
              // when it differs from the instance default.
              ...(data.wiki_readable !== false
                ? [
                    {
                      action: "delete-wiki",
                      title: t("advanced.deleteWiki"),
                      description: t("advanced.deleteWikiDescription"),
                    },
                  ]
                : []),
              ...(data.wiki_readable !== false &&
              (!data.default_wiki_branch_name ||
                r.default_wiki_branch !== data.default_wiki_branch_name)
                ? [
                    {
                      action: "rename-wiki-branch",
                      title: t("advanced.renameWikiBranch"),
                      description: t("advanced.renameWikiBranchDescription"),
                    },
                  ]
                : []),
              {
                action: "delete",
                title: t("advanced.delete"),
                description: t("advanced.deleteDescription"),
              },
            ].map((action) => (
              <div
                key={action.action}
                className="flex items-center justify-between gap-5 border-b border-line py-4 first:pt-0 last:border-b-0 max-md:flex-col max-md:items-start max-md:gap-3"
              >
                <div>
                  <strong>{action.title}</strong>
                  <p className="mt-1 text-sm text-muted">
                    {action.description}
                  </p>
                </div>
                {!("pending" in action && action.pending) && (
                  <button
                    className="button"
                    onClick={() => {
                      danger.reset();
                      setConfirm(action);
                    }}
                  >
                    {action.title}
                  </button>
                )}
              </div>
            ))}
          </div>
          {confirm && (
            <form
              className="my-4 flex max-w-[720px] basis-full flex-col gap-3 rounded-md border border-line bg-surface-subtle p-5"
              role="alertdialog"
              aria-label={confirm.title}
              onSubmit={(e) => {
                e.preventDefault();
                danger.mutate({
                  ...fieldsFromForm(e.currentTarget),
                  action: confirm.action,
                });
              }}
            >
              <h3 className="mt-2 text-lg font-semibold">{confirm.title}</h3>
              <p>{confirm.description}</p>
              <label className={settingsField}>
                {t("advanced.typeToConfirm", { name: repository.full_name })}
                <input
                  className={settingsInput}
                  required
                  name="repo_name"
                  pattern={repository.full_name.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                  )}
                  autoComplete="off"
                />
              </label>
              {confirm.action === "transfer" && (
                <label className={settingsField}>
                  {t("advanced.newOwner")}
                  <input
                    className={settingsInput}
                    name="new_owner_name"
                    required
                  />
                </label>
              )}
              <Feedback error={danger.error} />
              <div className={settingsActions}>
                <button className="button" disabled={danger.isPending}>
                  {confirm.title}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setConfirm(undefined)}
                >
                  {t("form.cancel")}
                </button>
              </div>
            </form>
          )}
        </SettingsSection>
      )}
      <p className="mt-6 text-xs text-muted">
        <Trans
          t={t}
          i18nKey="project.footer"
          values={{ id: r.id }}
          components={{ anchor: <Link to={`/projects${path}`} /> }}
        />
      </p>
    </>
  );
}
interface UnitsData {
  enabled: Record<string, boolean>;
  available: Record<string, boolean>;
  issues: Record<string, boolean>;
  pulls: Record<string, boolean | string>;
  external_tracker: Record<string, string>;
  external_wiki_url: string;
  globally_writeable_wiki: boolean;
  enable_close_issues_via_commit_in_any_branch: boolean;
  mirror?: boolean;
  private?: boolean;
  actions_enabled?: boolean;
  timetracking_enabled?: boolean;
  packages_visibility_warning?: boolean;
  owner_name?: string;
}
function UnitsSettings({ nativeRoot }: { nativeRoot: string }) {
  const { t } = useTranslation("settings");
  const query = useQuery({
    queryKey: ["configuration-units", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<UnitsData>(`${nativeRoot}/units`, signal),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!,
    enabled = data.enabled;
  // Native merge request defaults: while the unit is disabled its form shows
  // every merge style allowed, so enabling it doesn't save them all off.
  const pullDefaults = !enabled.pulls;
  const checks = (
    items: [string, string][],
    values: Record<string, unknown>,
    defaults: string[] = [],
  ): Field[] =>
    items.map(([name, label]) => ({
      name,
      label,
      type: "checkbox",
      value: !!values[name] || defaults.includes(name),
    }));
  // Mirrors have no merge request settings and the Actions unit depends on
  // the instance switch, exactly like the native form.
  const showPulls = !data.mirror,
    showActions = data.actions_enabled !== false;
  return (
    <SettingsSection
      title={t("units.title")}
      description={t("units.description")}
      open
    >
      <SettingsForm path={`${nativeRoot}/units`}>
        <SettingsFields
          fields={Object.entries({
            code: t("units.code"),
            issues: t("units.issues"),
            pulls: t("units.pulls"),
            wiki: t("units.wiki"),
            projects: t("units.projects"),
            releases: t("units.releases"),
            packages: t("units.packages"),
            actions: t("units.actions"),
          })
            .filter(
              ([name]) =>
                (name !== "pulls" || showPulls) &&
                (name !== "actions" || showActions),
            )
            .map(([name, label]) => {
              // Natively a globally disabled unit stays visible but disabled.
              const available =
                data.available[name] ||
                (name === "wiki" && data.available.external_wiki) ||
                (name === "issues" && data.available.external_tracker);
              return {
                name: `enable_${name}`,
                label,
                type: "checkbox",
                value:
                  enabled[name] ||
                  (name === "wiki" && enabled.external_wiki) ||
                  (name === "issues" && enabled.external_tracker),
                disabled: !available,
                hint: !available
                  ? t("units.globallyDisabled")
                  : name === "packages" && data.packages_visibility_warning
                    ? t("units.packagesVisibilityWarning", {
                        owner: data.owner_name,
                      })
                    : undefined,
              };
            })}
        />
        <h3 className={settingsFormHeading}>{t("units.issuesHeading")}</h3>
        <SettingsFields
          fields={checks(
            [
              // Time tracking options exist only when the instance enables it.
              ...(data.timetracking_enabled !== false
                ? ([
                    ["enable_timetracker", t("units.timetracker")],
                    [
                      "allow_only_contributors_to_track_time",
                      t("units.contributorsTrackTime"),
                    ],
                  ] as [string, string][])
                : []),
              ["enable_issue_dependencies", t("units.dependencies")],
            ],
            data.issues,
          )}
        />
        <SettingsFields
          fields={[
            {
              name: "enable_close_issues_via_commit_in_any_branch",
              label: t("units.closeViaAnyBranch"),
              type: "checkbox",
              value: data.enable_close_issues_via_commit_in_any_branch,
            },
          ]}
        />
        {showPulls && (
          <>
            <h3 className={settingsFormHeading}>{t("units.pullsHeading")}</h3>
            <SettingsFields
              fields={checks(
                [
                  ["pulls_ignore_whitespace", t("units.ignoreWhitespace")],
                  ["pulls_allow_merge", t("units.allowMerge")],
                  ["pulls_allow_rebase", t("units.allowRebase")],
                  ["pulls_allow_rebase_merge", t("units.allowRebaseMerge")],
                  ["pulls_allow_squash", t("units.allowSquash")],
                  [
                    "pulls_allow_fast_forward_only",
                    t("units.allowFastForwardOnly"),
                  ],
                  ["pulls_allow_manual_merge", t("units.allowManualMerge")],
                  [
                    "enable_autodetect_manual_merge",
                    t("units.autodetectManualMerge"),
                  ],
                  ["pulls_allow_rebase_update", t("units.allowRebaseUpdate")],
                  [
                    "default_delete_branch_after_merge",
                    t("units.deleteBranchAfterMerge"),
                  ],
                  [
                    "default_allow_maintainer_edit",
                    t("units.allowMaintainerEdit"),
                  ],
                ],
                data.pulls,
                pullDefaults
                  ? [
                      "pulls_allow_merge",
                      "pulls_allow_rebase",
                      "pulls_allow_rebase_merge",
                      "pulls_allow_squash",
                      "pulls_allow_fast_forward_only",
                      "pulls_allow_manual_merge",
                      "enable_autodetect_manual_merge",
                      "pulls_allow_rebase_update",
                      "default_delete_branch_after_merge",
                      "default_allow_maintainer_edit",
                    ]
                  : [],
              )}
            />
            <SettingsFields
              fields={[
                {
                  name: "pulls_default_merge_style",
                  label: t("units.defaultMergeStyle"),
                  value: String(
                    data.pulls.pulls_default_merge_style || "merge",
                  ),
                  options: [
                    ["merge", t("units.mergeStyles.merge")],
                    ["rebase", t("units.mergeStyles.rebase")],
                    ["rebase-merge", t("units.mergeStyles.rebaseMerge")],
                    ["squash", t("units.mergeStyles.squash")],
                    [
                      "fast-forward-only",
                      t("units.mergeStyles.fastForwardOnly"),
                    ],
                    ["manually-merged", t("units.mergeStyles.manuallyMerged")],
                  ].map(([value, label]) => ({ value, label })),
                },
                {
                  name: "pulls_default_update_style",
                  label: t("units.defaultUpdateStyle"),
                  value: String(
                    data.pulls.pulls_default_update_style || "merge",
                  ),
                  options: [
                    { value: "merge", label: t("units.updateStyles.merge") },
                    { value: "rebase", label: t("units.updateStyles.rebase") },
                  ],
                },
              ]}
            />
          </>
        )}
        <h3 className={settingsFormHeading}>{t("units.wikiHeading")}</h3>
        <SettingsFields
          fields={[
            // Private projects can't open their wiki to everyone.
            ...(!data.private
              ? [
                  {
                    name: "globally_writeable_wiki",
                    label: t("units.globallyWriteableWiki"),
                    type: "checkbox" as const,
                    value: data.globally_writeable_wiki,
                  },
                ]
              : []),
            ...(data.available.external_wiki
              ? [
                  {
                    name: "enable_external_wiki",
                    label: t("units.externalWiki"),
                    type: "checkbox" as const,
                    value: enabled.external_wiki,
                  },
                  {
                    name: "external_wiki_url",
                    label: t("units.externalWikiUrl"),
                    type: "url" as const,
                    value: data.external_wiki_url,
                  },
                ]
              : []),
          ]}
        />
        {data.available.external_tracker && (
          <>
            <h3 className={settingsFormHeading}>{t("units.trackerHeading")}</h3>
            <SettingsFields
              fields={[
                {
                  name: "enable_external_tracker",
                  label: t("units.externalTracker"),
                  type: "checkbox",
                  value: enabled.external_tracker,
                },
                {
                  name: "external_tracker_url",
                  label: t("units.trackerUrl"),
                  value: data.external_tracker.external_tracker_url,
                },
                {
                  name: "tracker_url_format",
                  label: t("units.trackerFormat"),
                  value: data.external_tracker.tracker_url_format,
                  hint: t("units.trackerFormatHint"),
                },
                {
                  name: "tracker_issue_style",
                  label: t("units.issueStyle"),
                  value: data.external_tracker.tracker_issue_style || "numeric",
                  options: [
                    { value: "numeric", label: t("units.issueStyles.numeric") },
                    {
                      value: "alphanumeric",
                      label: t("units.issueStyles.alphanumeric"),
                    },
                    { value: "regexp", label: t("units.issueStyles.regexp") },
                  ],
                },
                {
                  name: "external_tracker_regexp_pattern",
                  label: t("units.issuePattern"),
                  value: data.external_tracker.external_tracker_regexp_pattern,
                },
              ]}
            />
          </>
        )}
      </SettingsForm>
    </SettingsSection>
  );
}
interface MembersData {
  members: {
    id: number;
    username: string;
    name: string;
    mode: number;
    avatar_url?: string;
  }[];
  teams: {
    id: number;
    name: string;
    lower_name?: string;
    description: string;
    mode: number;
    includes_all: boolean;
    units?: string[];
  }[];
  organization: boolean;
  can_change_teams: boolean;
  owner?: string;
}
const teamUnits = [
  "code",
  "issues",
  "ext_issues",
  "pulls",
  "releases",
  "wiki",
  "ext_wiki",
  "projects",
  "packages",
  "actions",
] as const;
function accessLevel(t: TFunction<"settings">, mode: number) {
  return mode === 1
    ? t("members.roles.read")
    : mode === 2
      ? t("members.roles.write")
      : mode === 3
        ? t("members.roles.admin")
        : mode === 4
          ? t("members.roles.owner")
          : t("members.roles.undefined");
}
function MemberSettings({ nativeRoot }: { nativeRoot: string }) {
  const { t } = useTranslation("settings");
  const [added, setAdded] = useState(0);
  const query = useQuery({
    queryKey: ["configuration-members", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<MembersData>(`${nativeRoot}/collaboration`, signal),
  });
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: ({ id, mode }: { id: number; mode: string }) =>
      nativeForm(`${nativeRoot}/collaboration/access_mode`, {
        uid: String(id),
        mode,
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["configuration-members", nativeRoot],
      }),
  });
  const owner = query.data?.owner;
  return (
    <>
      <SettingsSection
        title={t("members.title")}
        description={t("members.description")}
        open
      >
        <SettingsForm
          key={`member-${added}`}
          path={`${nativeRoot}/collaboration`}
          button={t("members.add")}
          onSaved={() => setAdded((count) => count + 1)}
        >
          <label className={settingsField}>
            {t("members.username")}
            <SuggestionInput
              name="collaborator"
              label={t("members.username")}
              placeholder={t("members.usernamePlaceholder")}
              required
              className={settingsInput}
              queryKey="users"
              search={searchUsers}
            />
          </label>
        </SettingsForm>
        <Feedback error={query.error || change.error} />
        {query.isPending ? (
          <Pending />
        ) : query.data?.members.length ? (
          <div className={settingsList}>
            {query.data.members.map((member) => (
              <article key={member.id} className={settingsRow}>
                <MemberAvatar url={member.avatar_url} name={member.username} />
                <div className={settingsRowBody}>
                  <Link
                    className="font-semibold"
                    to={`/users/${encodeURIComponent(member.username)}`}
                  >
                    {member.name || member.username}
                  </Link>
                  <p className="text-muted">@{member.username}</p>
                </div>
                <SelectControl
                  className="w-40"
                  label={t("members.role", { name: member.username })}
                  value={String(member.mode)}
                  onValueChange={(mode) =>
                    change.mutate({ id: member.id, mode })
                  }
                  options={[
                    ...([1, 2, 3].includes(member.mode)
                      ? []
                      : [["0", t("members.roles.undefined")]]),
                    ["1", t("members.roles.read")],
                    ["2", t("members.roles.write")],
                    ["3", t("members.roles.admin")],
                  ].map(([value, label]) => ({ value, label }))}
                  disabled={change.isPending}
                />
                <SettingsDelete
                  path={`${nativeRoot}/collaboration/delete`}
                  values={{ id: String(member.id) }}
                  name={member.username}
                  label={t("form.remove")}
                  description={t("members.removeDescription")}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className={settingsEmpty}>{t("members.empty")}</p>
        )}
      </SettingsSection>
      {query.data?.organization && (
        <SettingsSection
          title={t("members.teams")}
          description={t("members.teamsDescription")}
          open
        >
          {query.data.can_change_teams ? (
            <SettingsForm
              key={`team-${added}`}
              path={`${nativeRoot}/collaboration/team`}
              button={t("members.addTeam")}
              onSaved={() => setAdded((count) => count + 1)}
            >
              <label className={settingsField}>
                {t("members.teamName")}
                <SuggestionInput
                  name="team"
                  label={t("members.teamName")}
                  placeholder={t("members.teamPlaceholder")}
                  required
                  className={settingsInput}
                  queryKey={`teams-${owner}`}
                  search={teamSearch(owner || "")}
                  icon={<Users size={16} className="shrink-0 text-muted" />}
                />
              </label>
            </SettingsForm>
          ) : (
            <p className={settingsMuted}>{t("members.teamsRestricted")}</p>
          )}
          <div className={settingsList}>
            {query.data.teams.map((team) => (
              <article key={team.id} className={settingsRow}>
                <Users size={20} className={settingsRowIcon} />
                <div className={settingsRowBody}>
                  {owner && team.lower_name ? (
                    <Link
                      className="font-semibold"
                      to={uiRoute(
                        `/org/${encodeURIComponent(owner)}/teams/${encodeURIComponent(team.lower_name)}`,
                      )}
                    >
                      {team.name}
                    </Link>
                  ) : (
                    <strong>{team.name}</strong>
                  )}
                  {team.description && (
                    <p className="text-muted">{team.description}</p>
                  )}
                  {team.units && (
                    <p className="text-muted" title={t("members.teamUnitsTip")}>
                      {t("members.teamUnits", {
                        units: team.units.length
                          ? team.units
                              .map((unit) =>
                                teamUnits.includes(
                                  unit as (typeof teamUnits)[number],
                                )
                                  ? t(
                                      `members.units.${unit as (typeof teamUnits)[number]}`,
                                    )
                                  : unit,
                              )
                              .join(", ")
                          : t("members.noUnits"),
                      })}
                    </p>
                  )}
                </div>
                <span className="badge">{accessLevel(t, team.mode)}</span>
                <span className="badge">
                  {team.includes_all
                    ? t("members.allProjects")
                    : t("members.projectAccess")}
                </span>
                {query.data?.can_change_teams &&
                  (team.includes_all ? (
                    // Natively these teams can't be removed per project.
                    <span title={t("members.teamAllTip")}>
                      <button className="button" disabled>
                        <Trash2 size={14} />
                        {t("form.remove")}
                      </button>
                    </span>
                  ) : (
                    <SettingsDelete
                      path={`${nativeRoot}/collaboration/team/delete`}
                      values={{ id: String(team.id) }}
                      label={t("form.remove")}
                      name={team.name}
                    />
                  ))}
              </article>
            ))}
          </div>
        </SettingsSection>
      )}
    </>
  );
}
function MemberAvatar({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      className="size-8 shrink-0 rounded-full border border-line"
      src={url}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-xs font-semibold text-muted"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
interface Rule {
  id: number;
  rule_name: string;
  can_push: boolean;
  enable_whitelist: boolean;
  required_approvals: number;
  [field: string]: string | number | boolean | number[] | string[] | null;
}
interface RuleData {
  rules: Rule[];
  branches: string[];
  default_branch: string;
  rule: Rule;
  users: { id: number; name: string }[];
  teams: { id: number; name: string }[];
  recent_status_checks: string[];
  archived?: boolean;
}
/**
 * Required status check patterns with the native list of checks reported in
 * the last week: each check shows whether a pattern matches it and can be
 * added or removed as an exact pattern.
 */
function StatusCheckField({
  initial,
  recent,
}: {
  initial: string[];
  recent: string[];
}) {
  const { t } = useTranslation("settings");
  const [value, setValue] = useState(initial.join("\n"));
  const patterns = value
    .split(/[\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const toggle = (context: string, checked: boolean) =>
    setValue(
      (checked
        ? [...patterns, context]
        : patterns.filter((pattern) => pattern !== context)
      ).join("\n"),
    );
  return (
    <>
      <label className={settingsField}>
        {t("branches.statusChecks")}
        <textarea
          className={settingsTextarea}
          name="status_check_contexts"
          aria-label={t("branches.statusChecks")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <small className={settingsHint}>{t("branches.statusChecksHint")}</small>
      </label>
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-sm font-semibold">
          {t("branches.recentChecks")}
        </legend>
        <p className={`mb-2 ${settingsHint}`}>
          {t("branches.recentChecksHint")}
        </p>
        {recent.length ? (
          recent.map((context) => (
            <label
              key={context}
              className="flex min-w-0 items-center gap-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={patterns.includes(context)}
                onChange={(e) => toggle(context, e.target.checked)}
              />
              <span className="min-w-0 font-mono text-xs break-all">
                {context}
              </span>
              {patterns.some((pattern) => globMatch(pattern, context)) && (
                <span className="badge shrink-0 border-success text-success">
                  {t("branches.matched")}
                </span>
              )}
            </label>
          ))
        ) : (
          <p className={settingsMuted}>{t("branches.noRecentChecks")}</p>
        )}
      </fieldset>
    </>
  );
}
function MultiPeople({
  name,
  label,
  options,
  selected,
}: {
  name: string;
  label: string;
  options: { id: number; name: string }[];
  selected: unknown;
}) {
  const { t } = useTranslation("settings");
  const [ids, setIds] = useState<number[]>(
    Array.isArray(selected) ? (selected as number[]) : [],
  );
  return (
    <fieldset className="rounded-md border border-line p-3 [&_input]:size-4 [&_input]:accent-primary">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <input type="hidden" name={name} value={ids.join(",")} />
      {options.length ? (
        options.map((option) => (
          <label
            key={option.id}
            className="mr-5 inline-flex items-center gap-2 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={ids.includes(option.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, option.id]
                    : ids.filter((id) => id !== option.id),
                )
              }
            />
            {option.name}
          </label>
        ))
      ) : (
        <p className={settingsMuted}>{t("form.noEligible", { label })}</p>
      )}
    </fieldset>
  );
}
function BranchSettings({
  nativeRoot,
  uiRoot,
  edit,
}: {
  nativeRoot: string;
  uiRoot: string;
  edit: boolean;
}) {
  const { t } = useTranslation("settings");
  const [params] = useSearchParams();
  const name = params.get("rule_name") || "";
  const query = useQuery({
    queryKey: ["configuration-branches", nativeRoot, edit, name],
    queryFn: ({ signal }) =>
      nativePage<RuleData>(
        `${nativeRoot}/branches${edit ? `/edit?rule_name=${encodeURIComponent(name)}` : ""}`,
        signal,
      ),
  });
  const navigate = useNavigate();
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!;
  if (data.archived && !edit)
    return (
      <p className={settingsWarning}>
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        {t("branches.archived")}
      </p>
    );
  if (edit) {
    const rule = data.rule;
    return (
      <SettingsSection
        title={
          rule.id
            ? t("branches.editTitle", { name: rule.rule_name })
            : t("branches.newTitle")
        }
        description={t("branches.editDescription")}
        open
      >
        <SettingsForm
          key={`${rule.id}-${rule.rule_name}`}
          path={`${nativeRoot}/branches/edit`}
          hidden={{ rule_id: String(rule.id || 0) }}
          button={t("branches.saveRule")}
          onSaved={() => navigate(`${uiRoot}/branches`)}
          fields={[
            {
              name: "rule_name",
              label: t("branches.pattern"),
              value: rule.rule_name || "",
              required: true,
            },
            {
              name: "enable_push",
              label: t("branches.push"),
              value: rule.can_push
                ? rule.enable_whitelist
                  ? "whitelist"
                  : "all"
                : "none",
              options: [
                { value: "none", label: t("branches.pushNone") },
                { value: "all", label: t("branches.pushAll") },
                { value: "whitelist", label: t("branches.pushSelected") },
              ],
            },
            {
              name: "whitelist_deploy_keys",
              label: t("branches.deployKeys"),
              type: "checkbox",
              value: !!rule.whitelist_deploy_keys,
            },
          ]}
        >
          <MultiPeople
            name="whitelist_users"
            label={t("branches.pushUsers")}
            options={data.users}
            selected={rule.whitelist_user_ids}
          />
          <MultiPeople
            name="whitelist_teams"
            label={t("branches.pushTeams")}
            options={data.teams}
            selected={rule.whitelist_team_ids}
          />
          <SettingsFields
            fields={[
              {
                name: "enable_merge_whitelist",
                label: t("branches.mergeWhitelist"),
                type: "checkbox",
                value: !!rule.enable_merge_whitelist,
              },
            ]}
          />
          <MultiPeople
            name="merge_whitelist_users"
            label={t("branches.mergeUsers")}
            options={data.users}
            selected={rule.merge_whitelist_user_ids}
          />
          <MultiPeople
            name="merge_whitelist_teams"
            label={t("branches.mergeTeams")}
            options={data.teams}
            selected={rule.merge_whitelist_team_ids}
          />
          <h3 className={settingsFormHeading}>{t("branches.approvalRules")}</h3>
          <SettingsFields
            fields={[
              {
                name: "required_approvals",
                label: t("branches.requiredApprovals"),
                type: "number",
                value: Number(rule.required_approvals) || 0,
                min: 0,
              },
              {
                name: "enable_approvals_whitelist",
                label: t("branches.approvalsWhitelist"),
                type: "checkbox",
                value: !!rule.enable_approvals_whitelist,
              },
            ]}
          />
          <MultiPeople
            name="approvals_whitelist_users"
            label={t("branches.approvalUsers")}
            options={data.users}
            selected={rule.approvals_whitelist_user_ids}
          />
          <MultiPeople
            name="approvals_whitelist_teams"
            label={t("branches.approvalTeams")}
            options={data.teams}
            selected={rule.approvals_whitelist_team_ids}
          />
          <SettingsFields
            fields={[
              ["block_on_rejected_reviews", t("branches.blockOnRejected")],
              [
                "block_on_official_review_requests",
                t("branches.blockOnReviewRequests"),
              ],
              ["block_on_outdated_branch", t("branches.blockOnOutdated")],
              ["dismiss_stale_approvals", t("branches.dismissStale")],
              ["ignore_stale_approvals", t("branches.ignoreStale")],
              ["require_signed_commits", t("branches.signedCommits")],
              ["apply_to_admins", t("branches.applyToAdmins")],
              ["enable_status_check", t("branches.statusCheck")],
            ].map(([name, label]) => ({
              name,
              label,
              type: "checkbox",
              value: !!rule[name],
            }))}
          />
          <StatusCheckField
            initial={
              Array.isArray(rule.status_check_contexts)
                ? (rule.status_check_contexts as string[])
                : []
            }
            recent={data.recent_status_checks || []}
          />
          <SettingsFields
            fields={[
              {
                name: "protected_file_patterns",
                label: t("branches.protectedFiles"),
                value: String(rule.protected_file_patterns || ""),
                hint: t("branches.protectedFilesHint"),
              },
              {
                name: "unprotected_file_patterns",
                label: t("branches.unprotectedFiles"),
                value: String(rule.unprotected_file_patterns || ""),
              },
            ]}
          />
          <Link className="button self-start" to={`${uiRoot}/branches`}>
            {t("form.cancel")}
          </Link>
        </SettingsForm>
      </SettingsSection>
    );
  }
  return (
    <>
      <SettingsSection
        title={t("branches.defaultTitle")}
        description={t("branches.defaultDescription")}
        open
      >
        <SettingsForm
          path={`${nativeRoot}/branches`}
          hidden={{ action: "default_branch" }}
          fields={[
            {
              name: "branch",
              label: t("branches.defaultLabel"),
              value: data.default_branch,
              options: data.branches.map((value) => ({ value, label: value })),
            },
          ]}
        />
      </SettingsSection>
      <SettingsSection
        title={t("branches.protectedTitle")}
        description={t("branches.protectedDescription")}
        open
      >
        <Link className="button primary" to={`${uiRoot}/branches/edit`}>
          <Plus size={15} />
          {t("branches.protect")}
        </Link>
        <div className={settingsList}>
          {data.rules.map((rule) => (
            <article key={rule.id} className={settingsRow}>
              <div className={settingsRowBody}>
                <strong>{rule.rule_name}</strong>
                <p className="text-muted">
                  {t("branches.ruleSummary", {
                    push: rule.can_push
                      ? rule.enable_whitelist
                        ? t("branches.canPushSelected")
                        : t("branches.canPushWrite")
                      : t("branches.canPushNone"),
                    approvals: t("branches.approvals", {
                      count: rule.required_approvals,
                    }),
                  })}
                </p>
              </div>
              <Link
                className="button"
                to={`${uiRoot}/branches/edit?rule_name=${encodeURIComponent(rule.rule_name)}`}
              >
                <Pencil size={14} />
                {t("form.edit")}
              </Link>
              <SettingsDelete
                path={`${nativeRoot}/branches/${rule.id}/delete`}
                name={rule.rule_name}
              />
            </article>
          ))}
        </div>
        {!data.rules.length && (
          <p className={settingsEmpty}>{t("branches.empty")}</p>
        )}
      </SettingsSection>
      <SettingsSection
        title={t("branches.renameTitle")}
        description={t("branches.renameDescription")}
      >
        <SettingsForm
          path={`${nativeRoot}/rename_branch`}
          fields={[
            {
              name: "from",
              label: t("branches.renameFrom"),
              value: data.default_branch,
              options: data.branches.map((value) => ({ value, label: value })),
            },
            {
              name: "to",
              label: t("branches.renameTo"),
              required: true,
              max: 100,
            },
          ]}
          button={t("branches.rename")}
        />
      </SettingsSection>
    </>
  );
}
interface TagRules {
  rules: {
    id: number;
    name_pattern: string;
    allowlist_user_ids: number[];
    allowlist_team_ids: number[];
  }[];
  users: { id: number; name: string; full_name?: string }[];
  teams: { id: number; name: string; lower_name?: string }[];
  archived?: boolean;
  organization?: boolean;
  owner?: string;
}
function TagProtectionSettings({
  nativeRoot,
  uiRoot,
  editId,
}: {
  nativeRoot: string;
  uiRoot: string;
  /** Native /settings/tags/{id} links open the rule editor. */
  editId?: number;
}) {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const [editing, setEditing] = useState<TagRules["rules"][number] | null>();
  const query = useQuery({
    queryKey: ["configuration-protected-tags", nativeRoot],
    queryFn: ({ signal }) => nativePage<TagRules>(`${nativeRoot}/tags`, signal),
  });
  const linked = editId
    ? query.data?.rules.find((rule) => rule.id === editId)
    : undefined;
  const current = editing === undefined ? linked : editing;
  const close = () => {
    setEditing(undefined);
    if (editId) navigate(`${uiRoot}/tags`);
  };
  if (query.data?.archived)
    return (
      <p className={settingsWarning}>
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        {t("tags.archived")}
      </p>
    );
  const data = query.data;
  return (
    <SettingsSection
      title={t("tags.title")}
      description={t("tags.description")}
      open
    >
      <Feedback error={query.error} />
      <button className="button primary" onClick={() => setEditing(null)}>
        <Plus size={15} />
        {t("tags.protect")}
      </button>
      {current !== undefined && data && (
        <SettingsForm
          key={current?.id || "new"}
          path={`${nativeRoot}/tags${current ? `/${current.id}` : ""}`}
          fields={[
            {
              name: "name_pattern",
              label: t("tags.pattern"),
              required: true,
              value: current?.name_pattern || "",
            },
          ]}
          button={t("tags.save")}
          onSaved={close}
        >
          <MultiPeople
            name="allowlist_users"
            label={t("tags.users")}
            options={data.users}
            selected={current?.allowlist_user_ids}
          />
          {data.organization !== false && (
            <MultiPeople
              name="allowlist_teams"
              label={t("tags.teams")}
              options={data.teams}
              selected={current?.allowlist_team_ids}
            />
          )}
          <button className="button self-start" type="button" onClick={close}>
            {t("form.cancel")}
          </button>
        </SettingsForm>
      )}
      {query.isPending ? (
        <Pending />
      ) : (
        <div className={settingsList}>
          {data?.rules.map((rule) => {
            // Like native, list the allowed users and teams by name.
            const users = data.users.filter((user) =>
              rule.allowlist_user_ids?.includes(user.id),
            );
            const teams =
              data.organization === false
                ? []
                : data.teams.filter((team) =>
                    rule.allowlist_team_ids?.includes(team.id),
                  );
            return (
              <article key={rule.id} className={settingsRow}>
                <div className={settingsRowBody}>
                  <strong>{rule.name_pattern}</strong>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted">{t("tags.allowed")}</span>
                    {users.length || teams.length ? (
                      <>
                        {users.map((user) => (
                          <Link
                            key={`u${user.id}`}
                            className="label hover:underline"
                            to={`/users/${encodeURIComponent(user.name)}`}
                          >
                            {user.full_name || user.name}
                          </Link>
                        ))}
                        {teams.map((team) =>
                          data.owner && team.lower_name ? (
                            <Link
                              key={`t${team.id}`}
                              className="label hover:underline"
                              to={uiRoute(
                                `/org/${encodeURIComponent(data.owner)}/teams/${encodeURIComponent(team.lower_name)}`,
                              )}
                            >
                              <Users size={12} />
                              {team.name}
                            </Link>
                          ) : (
                            <span key={`t${team.id}`} className="label">
                              <Users size={12} />
                              {team.name}
                            </span>
                          ),
                        )}
                      </>
                    ) : (
                      <span className="text-muted">{t("tags.noOne")}</span>
                    )}
                  </div>
                </div>
                <button className="button" onClick={() => setEditing(rule)}>
                  <Pencil size={14} />
                  {t("form.edit")}
                </button>
                <SettingsDelete
                  path={`${nativeRoot}/tags/delete`}
                  values={{ id: String(rule.id) }}
                  name={rule.name_pattern}
                />
              </article>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
function DeployKeySettings({ nativeRoot }: { nativeRoot: string }) {
  const { t } = useTranslation("settings");
  const query = useQuery({
    queryKey: ["configuration-deploy-keys", nativeRoot],
    queryFn: ({ signal }) =>
      nativePage<{
        disabled: boolean;
        items: {
          id: number;
          name: string;
          fingerprint: string;
          mode: number;
          created: string;
          updated: string;
          has_used?: boolean;
          recent?: boolean;
        }[];
      }>(`${nativeRoot}/keys`, signal),
  });
  return (
    <SettingsSection
      title={t("deployKeys.title")}
      description={t("deployKeys.description")}
      open
    >
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.disabled ? (
        <p className={settingsEmpty}>{t("deployKeys.sshDisabled")}</p>
      ) : (
        <>
          <SettingsForm
            path={`${nativeRoot}/keys`}
            button={t("deployKeys.add")}
            fields={[
              { name: "title", label: t("deployKeys.name"), required: true },
              {
                name: "content",
                label: t("deployKeys.content"),
                type: "textarea",
                required: true,
              },
              {
                name: "is_writable",
                label: t("deployKeys.writable"),
                type: "checkbox",
                value: false,
              },
            ]}
          />
          <div className={settingsList}>
            {query.data?.items.map((key) => (
              <article key={key.id} className={settingsRow}>
                {key.has_used && key.recent ? (
                  // Native highlights keys used within the last week.
                  <span
                    className="shrink-0 text-success"
                    title={t("deployKeys.recentActivity")}
                  >
                    <KeyRound size={20} />
                  </span>
                ) : (
                  <KeyRound size={20} className={settingsRowIcon} />
                )}
                <div className={settingsRowBody}>
                  <strong>{key.name}</strong>
                  <p className="break-all text-muted">{key.fingerprint}</p>
                  <p className="text-muted">
                    {t("deployKeys.summary", {
                      access:
                        key.mode >= 2
                          ? t("deployKeys.readWrite")
                          : t("deployKeys.readOnly"),
                      date: relativeDate(key.created),
                    })}
                    {key.has_used !== undefined && (
                      <>
                        {" · "}
                        {key.has_used ? (
                          <span className={key.recent ? "text-success" : ""}>
                            {t("deployKeys.lastUsed", {
                              date: relativeDate(key.updated),
                            })}
                          </span>
                        ) : (
                          t("deployKeys.noActivity")
                        )}
                      </>
                    )}
                  </p>
                </div>
                <SettingsDelete
                  path={`${nativeRoot}/keys/delete`}
                  values={{ id: String(key.id) }}
                  name={key.name}
                />
              </article>
            ))}
          </div>
        </>
      )}
    </SettingsSection>
  );
}

interface ActionValue {
  id: number;
  name: string;
  data?: string;
  created: string;
  updated?: string;
}
/** Shared native settings used for project, organization and account scopes. */
export function SharedActionsSettings({
  nativeRoot,
  uiRoot,
  section,
}: {
  nativeRoot: string;
  uiRoot: string;
  section: string;
}) {
  if (section.startsWith("runners"))
    return (
      <RunnerSettings
        nativeRoot={nativeRoot}
        uiRoot={uiRoot}
        section={section}
      />
    );
  return (
    <ActionValuesSettings
      key={`${nativeRoot}-${section}`}
      nativeRoot={nativeRoot}
      secrets={section === "secrets"}
    />
  );
}
function ActionValuesSettings({
  nativeRoot,
  secrets,
}: {
  nativeRoot: string;
  secrets: boolean;
}) {
  const { t } = useTranslation("settings");
  const type = secrets ? "secrets" : "variables",
    path = `${nativeRoot}/actions/${type}`,
    addLabel = secrets ? t("values.addSecret") : t("values.addVariable");
  const [editing, setEditing] = useState<ActionValue | null>();
  const query = useQuery({
    queryKey: ["configuration-action-values", path],
    queryFn: ({ signal }) => nativePage<{ items: ActionValue[] }>(path, signal),
  });
  return (
    <SettingsSection
      title={secrets ? t("values.secretsTitle") : t("values.variablesTitle")}
      description={
        secrets
          ? t("values.secretsDescription")
          : t("values.variablesDescription")
      }
      open
    >
      <div className={settingsToolbar}>
        <strong>
          {secrets ? t("values.secrets") : t("values.variables")}{" "}
          <span className="counter">{query.data?.items.length || 0}</span>
        </strong>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={15} />
          {addLabel}
        </button>
      </div>
      <Feedback error={query.error} />
      {editing !== undefined && (
        <SettingsForm
          key={editing?.id || "new"}
          path={
            editing
              ? `${path}/${editing.id}/edit`
              : secrets
                ? path
                : `${path}/new`
          }
          button={
            editing
              ? secrets
                ? t("values.updateSecret")
                : t("values.updateVariable")
              : addLabel
          }
          fields={[
            {
              name: "name",
              label: t("values.key"),
              value: editing?.name || "",
              required: true,
              hint: t("values.keyHint"),
            },
            {
              name: "data",
              label:
                editing && secrets ? t("values.newValue") : t("values.value"),
              type: "textarea",
              value: editing?.data || "",
              // Natively an empty value keeps the stored secret, so a secret
              // can be renamed without re-entering it.
              required: !(editing && secrets),
              hint:
                editing && secrets
                  ? t("values.keepSecretHint")
                  : secrets
                    ? t("values.secretValueHint")
                    : undefined,
            },
          ]}
          onSaved={() => setEditing(undefined)}
        >
          <button
            className="button self-start"
            type="button"
            onClick={() => setEditing(undefined)}
          >
            {t("form.cancel")}
          </button>
        </SettingsForm>
      )}
      {query.isPending ? (
        <Pending />
      ) : query.data?.items.length ? (
        <div className={settingsList}>
          {query.data.items.map((item) => (
            <article key={item.id} className={settingsRow}>
              <KeyRound size={18} className={settingsRowIcon} />
              <div className={settingsRowBody}>
                <strong className="break-all">{item.name}</strong>
                {secrets ? (
                  <p className="font-mono text-muted" aria-hidden="true">
                    ******
                  </p>
                ) : (
                  <p className="max-h-24 overflow-auto break-all whitespace-pre-wrap">
                    {item.data}
                  </p>
                )}
                <p className="text-muted">
                  {t("form.added", { date: relativeDate(item.created) })}
                </p>
              </div>
              <button className="button" onClick={() => setEditing(item)}>
                <Pencil size={14} />
                {t("form.edit")}
              </button>
              <SettingsDelete
                path={`${path}/${item.id}/delete`}
                name={item.name}
              />
            </article>
          ))}
        </div>
      ) : (
        <p className={settingsEmpty}>
          {secrets ? t("values.noSecrets") : t("values.noVariables")}
        </p>
      )}
    </SettingsSection>
  );
}
function RepositoryFlags({ path }: { path: string }) {
  const { t } = useTranslation("settings");
  const query = useQuery({
    queryKey: ["repository-flags", path],
    queryFn: ({ signal }) =>
      nativePage<{ flags: Record<string, boolean> }>(`${path}/flags`, signal),
  });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (form: FormData) => settingsSubmit(`${path}/flags`, form),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["repository-flags", path] }),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  return (
    <SettingsSection
      title={t("flags.title")}
      description={t("flags.description")}
      open
    >
      <form
        className={settingsFormClass}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(new FormData(event.currentTarget));
        }}
      >
        {Object.entries(query.data!.flags).map(([name, value]) => (
          <label className={settingsCheck} key={name}>
            <input
              className={settingsCheckInput}
              name="flags"
              type="checkbox"
              value={name}
              defaultChecked={value}
            />
            {name}
          </label>
        ))}
        {!Object.keys(query.data!.flags).length && (
          <p className={settingsEmpty}>{t("flags.empty")}</p>
        )}
        <Feedback error={save.error} />
        <div className={settingsActions}>
          <button className="button primary" disabled={save.isPending}>
            {t("flags.save")}
          </button>
          {save.isSuccess && <span role="status">{t("form.saved")}</span>}
        </div>
      </form>
    </SettingsSection>
  );
}
