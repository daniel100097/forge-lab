import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { get, nativeForm, nativePage, request, type Bootstrap } from "./api";
import { EmptyState, Feedback, Pending, useTitle } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  AccountRepoPicker,
  AccountSourceRepoPicker,
  type PickerRepository,
} from "./AccountRepoPicker";
import { isPlainTheme, themeMode, useColorMode, type ColorMode } from "./Theme";
import {
  profileQuery,
  accountRowClass,
  accountRowMainClass,
  accountRowTextClass,
  accountScopeClass,
  accountScopeSelectClass,
  accountSectionBodyClass,
  accountSectionClass,
  sectionDescriptionClass,
  sectionTitleClass,
  settingsHeadingClass,
  settingsTitleClass,
} from "./AccountSettings";
const root = "/user/settings";
const fields = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form)) as Record<string, string>;
// Profile settings (native templates/user/settings/profile.tmpl): visibility
// limited to the instance's allowed modes, the username-change notice and the
// avatar source choice.
const visibilityValues = [0, 1, 2] as const;
export function ProfileForm() {
  const { t } = useTranslation("account");
  const client = useQueryClient();
  const query = useQuery(profileQuery);
  const [name, setName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(root, {
        keep_email_private: "",
        keep_activity_private: "",
        keep_pronouns_private: "",
        ...fields(form),
      });
      setName(null);
      await client.invalidateQueries({ queryKey: ["profile"] });
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  const settings = data.settings;
  const renamed = name !== null && name !== data.name;
  const allowed = (
    data.visibility_options?.length ? data.visibility_options : visibilityValues
  ).filter((value) => visibilityValues.includes(value as 0 | 1 | 2));
  // Keep the current value selectable even if the instance no longer allows it.
  const options = allowed.includes(data.visibility)
    ? allowed
    : [data.visibility, ...allowed];
  const visibilityLabel = (value: number) =>
    value === 1
      ? t("profile.visibility.limited")
      : value === 2
        ? t("profile.visibility.private")
        : t("profile.visibility.public");
  const currentVisibility = Number(visibility ?? data.visibility);
  const help = "text-xs leading-5 text-muted";
  return (
    <>
      <form
        className="workspace-form mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            renamed &&
            !window.confirm(t("profile.username.confirm", { name }))
          )
            return;
          save.mutate(e.currentTarget);
        }}
      >
        <Feedback error={save.error} />
        {save.isSuccess && (
          <p className="form-success" role="status">
            {t("profile.saved")}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label>
            {t("profile.username.label")}
            <input
              name="name"
              readOnly={!!data.rename_disabled}
              defaultValue={data.name}
              maxLength={40}
              required
              autoCapitalize="none"
              aria-describedby="profile-username-help"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p
            id="profile-username-help"
            className={
              renamed
                ? "profile-rename-warning rounded border border-[#e9c77b] bg-[#fdf1d7] px-3 py-2 text-xs leading-5 text-[#6b4609] dark:border-[#8f5d0b] dark:bg-[#534024] dark:text-[#f5d9a0]"
                : help
            }
            role={renamed ? "status" : undefined}
          >
            {data.rename_disabled
              ? t("profile.username.disabled")
              : `${t("profile.username.prompt")} ${
                  settings?.cooldown_period
                    ? t("profile.username.cooldown", {
                        count: settings.cooldown_period,
                      })
                    : t("profile.username.redirect")
                }`}
          </p>
        </div>
        <label>
          {t("profile.fullName")}
          <input
            name="full_name"
            defaultValue={data.full_name}
            maxLength={100}
          />
        </label>
        <label>
          {t("profile.pronouns")}
          <input
            name="pronouns"
            list="profile-pronouns"
            defaultValue={data.pronouns}
            placeholder={t("profile.pronounsUnspecified")}
            maxLength={50}
          />
          <datalist id="profile-pronouns">
            {(settings?.common_pronouns || []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label>
          {t("profile.location")}
          <input name="location" defaultValue={data.location} maxLength={50} />
        </label>
        <label>
          {t("profile.website")}
          <input
            name="website"
            type="url"
            defaultValue={data.website}
            maxLength={255}
          />
        </label>
        <label>
          {t("profile.bio")}
          <textarea
            name="biography"
            aria-label={t("profile.bio")}
            rows={3}
            defaultValue={data.biography}
            maxLength={255}
          />
        </label>
        <div className="flex flex-col gap-1">
          <label>
            {t("profile.visibility.label")}
            <SelectControl
              name="visibility"
              label={t("profile.visibility.label")}
              defaultValue={String(data.visibility)}
              onValueChange={setVisibility}
              options={options.map((value) => ({
                value: String(value),
                label: visibilityLabel(value),
              }))}
            />
          </label>
          <p className={help}>
            {currentVisibility === 1
              ? t("profile.visibility.limitedHelp")
              : currentVisibility === 2
                ? t("profile.visibility.privateHelp")
                : t("profile.visibility.publicHelp")}
          </p>
        </div>
        {(
          [
            [
              "keep_email_private",
              t("profile.keepEmailPrivate"),
              t("profile.keepEmailPrivateHelp", {
                email: settings?.placeholder_email || "",
              }),
            ],
            [
              "keep_activity_private",
              t("profile.keepActivityPrivate"),
              t("profile.keepActivityPrivateHelp"),
            ],
            [
              "keep_pronouns_private",
              t("profile.keepPronounsPrivate"),
              t("profile.keepPronounsPrivateHelp"),
            ],
          ] as const
        ).map(([field, label, description]) => (
          <div className="flex flex-col gap-1" key={field}>
            <label className="check-field">
              <input
                name={field}
                type="checkbox"
                defaultChecked={!!data[field]}
                aria-describedby={`profile-${field}-help`}
              />
              {label}
            </label>
            <p id={`profile-${field}-help`} className={`ml-6 ${help}`}>
              {description}
            </p>
          </div>
        ))}
        <div>
          <button className="button primary" disabled={save.isPending}>
            {t("profile.save")}
          </button>
        </div>
      </form>
      <AvatarSettings />
    </>
  );
}
const radioClass = "size-4 min-h-0 shrink-0 border-0 p-0 accent-primary";
export function AvatarSettings() {
  const { t, i18n } = useTranslation("account");
  const client = useQueryClient();
  const profile = useQuery(profileQuery);
  const settings = profile.data?.settings;
  // Gravatar/Libravatar lookups are offered unless the instance disables them.
  const lookup = !!settings && !settings.disable_gravatar;
  const [chosen, setSource] = useState<"lookup" | "local" | null>(null);
  const source =
    chosen ?? (!lookup || settings?.use_custom_avatar ? "local" : "lookup");
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement | null) => {
      if (form)
        await request(`${root}/avatar`, {
          method: "POST",
          headers: { "X-Forgejo-UI": "1" },
          body: new FormData(form),
        });
      else await nativeForm(`${root}/avatar/delete`, {});
      form?.reset();
      setSource(null);
      await client.invalidateQueries({ queryKey: ["profile"] });
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  const size = settings?.max_avatar_file_size
    ? new Intl.NumberFormat(i18n.language, {
        style: "unit",
        unit: "megabyte",
        maximumFractionDigits: 1,
      }).format(settings.max_avatar_file_size / 1024 / 1024)
    : "";
  return (
    <section className={`mt-6 ${accountSectionClass}`}>
      <div>
        <h2 className={sectionTitleClass}>{t("avatar.title")}</h2>
      </div>
      <div className={accountSectionBodyClass}>
        <Feedback error={save.error} />
        <form
          className="workspace-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(e.currentTarget);
          }}
        >
          {lookup ? (
            <>
              <label className="check-field">
                <input
                  className={radioClass}
                  type="radio"
                  name="source"
                  value="lookup"
                  checked={source === "lookup"}
                  onChange={() => setSource("lookup")}
                />
                {t("avatar.lookup")}
              </label>
              <label className="ml-6">
                {t("avatar.email")}
                <input
                  name="gravatar"
                  type="email"
                  defaultValue={settings.avatar_email}
                  onFocus={() => setSource("lookup")}
                />
              </label>
              <label className="check-field">
                <input
                  className={radioClass}
                  type="radio"
                  name="source"
                  value="local"
                  checked={source === "local"}
                  onChange={() => setSource("local")}
                />
                {t("avatar.custom")}
              </label>
            </>
          ) : (
            <input type="hidden" name="source" value="local" />
          )}
          <div className={`flex flex-col gap-1 ${lookup ? "ml-6" : ""}`}>
            <label>
              {t("avatar.upload")}
              <input
                type="file"
                name="avatar"
                accept="image/png,image/jpeg,image/gif,image/webp"
                required={source === "local"}
                onChange={() => setSource("local")}
              />
            </label>
            {settings && (
              <p className="text-xs leading-5 text-muted">
                {t("avatar.constraints", {
                  size,
                  width: settings.max_avatar_width,
                  height: settings.max_avatar_height,
                })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button primary" disabled={save.isPending}>
              {source === "local" ? t("avatar.upload") : t("avatar.update")}
            </button>
            <button
              type="button"
              className="button"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              {t("avatar.remove")}
            </button>
          </div>
          {save.isSuccess && <p role="status">{t("avatar.updated")}</p>}
        </form>
      </div>
    </section>
  );
}
export function AppearanceSettingsPage() {
  const { t } = useTranslation("account");
  const { mode, saveMode, applyServerTheme } = useColorMode();
  const client = useQueryClient();
  useTitle(t("preferences.title"));
  const eventLabels: Record<string, string> = {
    reference: t("preferences.events.types.reference"),
    label: t("preferences.events.types.label"),
    milestone: t("preferences.events.types.milestone"),
    assignee: t("preferences.events.types.assignee"),
    title: t("preferences.events.types.title"),
    branch: t("preferences.events.types.branch"),
    time_tracking: t("preferences.events.types.time_tracking"),
    deadline: t("preferences.events.types.deadline"),
    dependency: t("preferences.events.types.dependency"),
    lock: t("preferences.events.types.lock"),
    review_request: t("preferences.events.types.review_request"),
    pull_request_push: t("preferences.events.types.pull_request_push"),
    project: t("preferences.events.types.project"),
    issue_ref: t("preferences.events.types.issue_ref"),
  };
  const query = useQuery({
    queryKey: ["account-appearance"],
    queryFn: ({ signal }) =>
      nativePage<{
        language: string;
        languages: { Lang: string; Name: string }[];
        hints: boolean;
        comments: Record<string, boolean>;
        /** The account's Forgejo theme (Preferences → Theme). */
        theme?: string;
        themes?: { id: string; name: string }[];
      }>(`${root}/appearance`, signal),
  });
  const serverTheme = query.data?.theme;
  // Adopt a theme chosen on another device or in another browser.
  useEffect(() => {
    if (serverTheme) applyServerTheme(serverTheme);
  }, [serverTheme, applyServerTheme]);
  const theme = useMutation({
    mutationFn: async (next: ColorMode) => {
      await saveMode(next, {
        current: query.data?.theme,
        themes: query.data?.themes?.map((theme) => theme.id),
      });
      await query.refetch();
    },
  });
  const themeName = (id: string) =>
    query.data?.themes?.find((theme) => theme.id === id)?.name || id;
  // Variants and families this interface renders as plain light/dark/system.
  const otherThemes = (query.data?.themes || []).filter(
    (theme) => !isPlainTheme(theme.id),
  );
  const save = useMutation({
    mutationFn: async ({
      part,
      form,
    }: {
      part: string;
      form: HTMLFormElement;
    }) => {
      await nativeForm(`${root}/appearance/${part}`, fields(form));
      await query.refetch();
      // Forgejo updates the lang cookie; the bootstrap reload switches the UI.
      if (part === "language")
        await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("preferences.title")}</h1>
      </div>
      <Feedback error={query.error || save.error || theme.error} />
      {(save.isSuccess || theme.isSuccess) && (
        <p className="form-success" role="status">
          {t("preferences.saved")}
        </p>
      )}
      <section className={accountSectionClass}>
        <div>
          <h2 className={sectionTitleClass}>{t("preferences.theme.title")}</h2>
          <p className={sectionDescriptionClass}>
            {t("preferences.theme.description")}
          </p>
        </div>
        <div className={accountSectionBodyClass}>
          <SelectControl
            label={t("preferences.theme.title")}
            className="w-full max-w-sm"
            value={mode}
            disabled={theme.isPending}
            onValueChange={(v) => theme.mutate(v as ColorMode)}
            options={[
              { value: "light", label: t("preferences.theme.light") },
              { value: "dark", label: t("preferences.theme.dark") },
              { value: "system", label: t("preferences.theme.system") },
            ]}
          />
          {serverTheme && !isPlainTheme(serverTheme) && (
            <p className="mt-3 max-w-xl text-xs leading-5 text-muted">
              {themeMode(serverTheme)
                ? t("preferences.theme.variant", {
                    name: themeName(serverTheme),
                  })
                : t("preferences.theme.unsupported", {
                    name: themeName(serverTheme),
                  })}
            </p>
          )}
          {!!otherThemes.length &&
            (!serverTheme || isPlainTheme(serverTheme)) && (
              <p className="mt-3 max-w-xl text-xs leading-5 text-muted">
                {t("preferences.theme.serverOnly")}
              </p>
            )}
        </div>
      </section>
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            {(["language", "hints", "hidden_comments"] as const).map((part) => (
              <section className={accountSectionClass} key={part}>
                <div>
                  <h2 className={sectionTitleClass}>
                    {part === "language"
                      ? t("preferences.language.title")
                      : part === "hints"
                        ? t("preferences.hints.title")
                        : t("preferences.events.title")}
                  </h2>
                  {part !== "hints" && (
                    <p className={sectionDescriptionClass}>
                      {part === "language"
                        ? t("preferences.language.description")
                        : t("preferences.events.description")}
                    </p>
                  )}
                </div>
                <form
                  className={`workspace-form ${accountSectionBodyClass}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate({ part, form: e.currentTarget });
                  }}
                >
                  {part === "language" ? (
                    <SelectControl
                      name="language"
                      label={t("preferences.language.title")}
                      className="max-w-sm"
                      defaultValue={query.data.language}
                      options={[
                        { value: "", label: t("preferences.language.default") },
                        ...query.data.languages.map((l) => ({
                          value: l.Lang,
                          label: l.Name,
                        })),
                      ]}
                    />
                  ) : part === "hints" ? (
                    <label className="check-field">
                      <input
                        name="enable_repo_unit_hints"
                        type="checkbox"
                        defaultChecked={query.data.hints}
                      />
                      {t("preferences.hints.label")}
                    </label>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {Object.entries(query.data.comments).map(
                        ([name, checked]) => (
                          <label className="check-field capitalize" key={name}>
                            <input
                              type="checkbox"
                              name={name}
                              defaultChecked={checked}
                            />
                            {eventLabels[name] ?? name.replaceAll("_", " ")}
                          </label>
                        ),
                      )}
                    </div>
                  )}
                  <button
                    className="button primary self-start"
                    disabled={save.isPending}
                  >
                    {t("preferences.save")}
                  </button>
                </form>
              </section>
            ))}
          </>
        )
      )}
    </>
  );
}
interface AccountListData {
  items: {
    ID: number;
    Name: string;
    FullName?: string;
    Description?: string;
    OwnerName?: string;
    IsPrivate?: boolean;
    Avatar?: string;
  }[];
  directories?: string[];
  allow_adopt?: boolean;
  allow_delete?: boolean;
  can_create_org?: boolean;
  page: { HasNext: boolean; HasPrevious: boolean };
}
export function AccountResourcesPage({
  organizations = false,
}: {
  organizations?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page")) || 1;
  const { t } = useTranslation("account");
  const part = organizations ? "organization" : "repos";
  const query = useQuery({
    queryKey: ["account-resources", part, page],
    queryFn: ({ signal }) =>
      nativePage<AccountListData>(`${root}/${part}?page=${page}`, signal),
  });
  const bootstrap = useQuery({ queryKey: ["bootstrap"], enabled: false });
  const client = useQueryClient();
  const user = (bootstrap.data as Bootstrap | undefined)?.user;
  const username = user?.username || "";
  const change = useMutation({
    mutationFn: async ({ name, action }: { name: string; action: string }) => {
      await nativeForm(`${root}/repos/unadopted`, { id: name, action });
      await query.refetch();
    },
  });
  // Leaving uses the organization member action like the native settings page.
  const leave = useMutation({
    mutationFn: async (org: string) => {
      await nativeForm(`/org/${encodeURIComponent(org)}/members/action/leave`, {
        uid: String(user?.id || ""),
      });
      // Refusals (for example the last owner) are reported as a flash message.
      const data = await get<Bootstrap>("/-/ui/data/bootstrap");
      client.setQueryData(["bootstrap"], data);
      await query.refetch();
      if (data.flash_error) throw new Error(data.flash_error);
    },
  });
  const title = organizations
    ? t("resources.organizations")
    : t("resources.repositories");
  useTitle(title);
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{title}</h1>
        {organizations && query.data?.can_create_org && (
          <Link className="button primary" to="/organizations/new">
            <Plus size={16} />
            {t("resources.newOrganization")}
          </Link>
        )}
      </div>
      <Feedback error={query.error || change.error || leave.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <div>
              {query.data.items.map((item) => (
                <div className={`px-4 ${accountRowClass}`} key={item.ID}>
                  {organizations && item.Avatar && (
                    <img
                      src={item.Avatar}
                      alt=""
                      className="size-8 shrink-0 rounded-lg"
                    />
                  )}
                  <div className={accountRowMainClass}>
                    <Link
                      to={
                        organizations
                          ? `/organizations/${item.Name}`
                          : `/projects/${item.OwnerName || username}/${item.Name}`
                      }
                    >
                      <strong>{item.FullName || item.Name}</strong>
                    </Link>
                    <p className={accountRowTextClass}>
                      {item.Description ||
                        (item.IsPrivate
                          ? t("resources.private")
                          : t("resources.public"))}
                    </p>
                  </div>
                  {!organizations && (
                    <Link
                      className="button"
                      to={`/projects/${item.OwnerName || username}/${item.Name}/settings`}
                    >
                      {t("resources.settings")}
                    </Link>
                  )}
                  {organizations && (
                    <button
                      className="button"
                      disabled={leave.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("resources.confirmLeave", {
                              name: item.FullName || item.Name,
                            }),
                          )
                        )
                          leave.mutate(item.Name);
                      }}
                    >
                      {t("resources.leave")}
                    </button>
                  )}
                </div>
              ))}
              {!query.data.items.length && (
                <EmptyState
                  title={
                    organizations
                      ? t("resources.noOrganizations")
                      : t("resources.noRepositories")
                  }
                />
              )}
            </div>
            {query.data.directories
              ?.filter(
                (name) => !query.data!.items.some((i) => i.Name === name),
              )
              .map((name) => (
                <div className={accountRowClass} key={name}>
                  <strong>{name}</strong>
                  <span className="text-sm text-muted">
                    {t("resources.unadopted")}
                  </span>
                  {query.data!.allow_adopt && (
                    <button
                      className="button"
                      onClick={() => change.mutate({ name, action: "adopt" })}
                    >
                      {t("resources.adopt")}
                    </button>
                  )}
                  {query.data!.allow_delete && (
                    <button
                      className="button"
                      onClick={() => {
                        if (confirm(t("resources.confirmDelete", { name })))
                          change.mutate({ name, action: "delete" });
                      }}
                    >
                      {t("resources.delete")}
                    </button>
                  )}
                </div>
              ))}
            {(page > 1 || query.data.page.HasNext) && (
              <div className="flex gap-3 mt-5">
                <button
                  className="button"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(page - 1) })}
                >
                  {t("resources.previous")}
                </button>
                <span>{t("resources.page", { page })}</span>
                <button
                  className="button"
                  disabled={!query.data.page.HasNext}
                  onClick={() => setParams({ page: String(page + 1) })}
                >
                  {t("resources.next")}
                </button>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
interface IntegrationForm {
  Name: string;
  Description: string;
  Audience: string;
  Resource: string;
  SelectedRepo: string[] | null;
  ScopeAll: boolean;
  Scope: string[] | null;
  Issuer: string;
  ClaimRules: string;
  SourceRepo: string;
  WorkflowFile: string;
  GitRef: string;
  Event: string[] | null;
}
// Events offered by the native Forgejo Actions integration form
// (templates/user/settings/authorized_integrations/actions_local/view.tmpl).
const integrationEvents = [
  "pull_request",
  "push",
  "issues",
  "pull_request_target",
  "release",
  "schedule",
  "workflow_dispatch",
];
const splitRepository = (name: string): PickerRepository => {
  const [owner, ...rest] = name.split("/");
  return { OwnerName: owner, Name: rest.join("/") };
};
export function AuthorizedIntegrationsPage() {
  const { ui, id } = useParams();
  const { t, i18n } = useTranslation("account");
  const editing = !!ui;
  const endpoint = `${root}/authorized-integrations${editing ? `/${ui}/${id || "new"}` : ""}`;
  // Repository searches use the "new" form so the stored integration is never reloaded.
  const searchEndpoint = `${root}/authorized-integrations/${ui}/new`;
  const navigate = useNavigate();
  const [resource, setResource] = useState("");
  const [selected, setSelected] = useState<PickerRepository[] | null>(null);
  const [source, setSource] = useState<PickerRepository | null | undefined>(
    undefined,
  );
  const query = useQuery({
    queryKey: ["authorized-integrations", endpoint],
    queryFn: ({ signal }) =>
      nativePage<{
        items?: {
          ID: number;
          Name: string;
          UI: string;
          Description: string;
          Issuer: string;
          Scope: string;
          CreatedUnix?: number;
          UpdatedUnix?: number;
        }[];
        form?: IntegrationForm;
        categories?: string[];
        repositories?: PickerRepository[];
        selected_repositories?: PickerRepository[];
        source_repository?: PickerRepository;
      }>(endpoint, signal),
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const body = new URLSearchParams();
      data.forEach((v, k) => {
        if (String(v)) body.append(k, String(v));
      });
      if (data.has("scope_all")) {
        body.delete("scope");
        body.append("scope", "all");
      }
      await request(endpoint, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      await query.refetch();
      navigate("/account/authorized-integrations");
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await nativeForm(`${root}/authorized-integrations/delete`, {
        id: String(id),
      });
      await query.refetch();
    },
  });
  useTitle(t("integrations.title"));
  const f = query.data?.form;
  const date = (unix?: number) =>
    unix
      ? new Date(unix * 1000).toLocaleDateString(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";
  const sourceRepository =
    source !== undefined
      ? source
      : query.data?.source_repository ||
        (f?.SourceRepo ? splitRepository(f.SourceRepo) : null);
  const selectedRepositories =
    selected ??
    (query.data?.selected_repositories?.length
      ? query.data.selected_repositories
      : (f?.SelectedRepo || []).map(splitRepository));
  const help = "text-xs leading-5 font-normal text-muted";
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>
          {editing
            ? id
              ? t("integrations.editTitle")
              : t("integrations.newTitle")
            : t("integrations.title")}
        </h1>
      </div>
      <p className="mb-5 text-sm text-muted">{t("integrations.description")}</p>
      <Feedback error={query.error || save.error || remove.error} />
      {query.isPending ? (
        <Pending />
      ) : editing && f ? (
        <form
          key={endpoint}
          className="workspace-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(e.currentTarget);
          }}
        >
          <label>
            {t("integrations.name")}
            <input name="name" defaultValue={f.Name} required maxLength={255} />
          </label>
          <label>
            {t("integrations.descriptionLabel")}
            <textarea
              name="description"
              rows={3}
              defaultValue={f.Description}
              placeholder={t("integrations.descriptionPlaceholder")}
            />
          </label>
          {f.Audience && (
            <label>
              {t("integrations.audience")}
              <input name="audience" readOnly value={f.Audience} />
            </label>
          )}
          {ui === "generic" ? (
            <>
              <label>
                {t("integrations.issuer")}
                <input
                  name="issuer"
                  required
                  maxLength={255}
                  defaultValue={f.Issuer}
                />
              </label>
              <label>
                {t("integrations.claimRules")}
                <textarea
                  name="claim_rules"
                  className="font-mono"
                  rows={10}
                  defaultValue={f.ClaimRules}
                />
              </label>
            </>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">
                  {t("integrations.sourceRepo")}
                </legend>
                <p className={help}>{t("integrations.sourceRepoHelp")}</p>
                <AccountSourceRepoPicker
                  endpoint={searchEndpoint}
                  value={sourceRepository}
                  onChange={setSource}
                />
              </fieldset>
              {(
                [
                  [
                    "workflow_file",
                    t("integrations.workflowFile"),
                    f.WorkflowFile,
                  ],
                  ["git_ref", t("integrations.gitRef"), f.GitRef],
                ] as const
              ).map(([name, label, value]) => (
                <div className="flex flex-col gap-1" key={name}>
                  <label>
                    {label}
                    <input
                      name={name}
                      defaultValue={value}
                      placeholder="*"
                      aria-describedby={`integration-${name}-help`}
                    />
                  </label>
                  <p id={`integration-${name}-help`} className={help}>
                    {name === "workflow_file"
                      ? t("integrations.workflowFileHelp")
                      : t("integrations.gitRefHelp")}
                  </p>
                </div>
              ))}
              <fieldset>
                <legend className="font-semibold mb-2">
                  {t("integrations.events")}
                </legend>
                <div className="flex flex-col gap-2">
                  {integrationEvents.map((event) => (
                    <label className="check-field" key={event}>
                      <input
                        name="event"
                        value={event}
                        type="checkbox"
                        defaultChecked={f.Event?.includes(event)}
                      />
                      <code>{event}</code>
                    </label>
                  ))}
                </div>
                <p className={`mt-2 ${help}`}>{t("integrations.eventsHelp")}</p>
              </fieldset>
            </>
          )}
          <label>
            {t("integrations.resource.label")}
            <SelectControl
              label={t("integrations.resource.label")}
              name="resource"
              value={resource || f.Resource || "all"}
              onValueChange={setResource}
              options={[
                { value: "all", label: t("integrations.resource.all") },
                {
                  value: "public-only",
                  label: t("integrations.resource.publicOnly"),
                },
                {
                  value: "repo-specific",
                  label: t("integrations.resource.selected"),
                },
              ]}
            />
          </label>
          {(resource || f.Resource) === "repo-specific" && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                {t("integrations.selectRepositories")}
              </legend>
              <AccountRepoPicker
                endpoint={searchEndpoint}
                selected={selectedRepositories}
                onChange={setSelected}
              />
            </fieldset>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold mb-2">
              {t("integrations.permissions")}
            </legend>
            <label className="check-field">
              <input
                name="scope_all"
                type="checkbox"
                defaultChecked={f.ScopeAll}
              />
              {t("integrations.allPermissions")}
            </label>
            {query.data?.categories?.map((category) => (
              <label key={category} className={accountScopeClass}>
                <span className="capitalize">{category}</span>
                <SelectControl
                  name="scope"
                  className={accountScopeSelectClass}
                  label={t("integrations.scope.label", { category })}
                  defaultValue={
                    f.Scope?.find((s) => s.endsWith(`:${category}`)) || ""
                  }
                  options={[
                    { value: "", label: t("integrations.scope.none") },
                    {
                      value: `read:${category}`,
                      label: t("integrations.scope.read"),
                    },
                    {
                      value: `write:${category}`,
                      label: t("integrations.scope.write"),
                    },
                  ]}
                />
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button className="button primary" disabled={save.isPending}>
              {t("integrations.save")}
            </button>
            <Link className="button" to="/account/authorized-integrations">
              {t("integrations.cancel")}
            </Link>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            <Link className="button primary" to="forgejo-actions-local/new">
              <Plus size={16} />
              {t("integrations.connectActions")}
            </Link>
            <Link className="button" to="generic/new">
              {t("integrations.connectOidc")}
            </Link>
          </div>
          {query.data?.items?.length ? (
            query.data.items.map((item) => (
              <div className={accountRowClass} key={item.ID}>
                <div className={accountRowMainClass}>
                  <Link to={`${item.UI}/${item.ID}`}>
                    <strong>{item.Name}</strong>
                  </Link>
                  <p className={accountRowTextClass}>
                    {item.UI === "forgejo-actions-local"
                      ? t("integrations.kind.actions")
                      : t("integrations.kind.generic")}
                    {item.Description || item.Issuer
                      ? ` · ${item.Description || item.Issuer}`
                      : ""}
                  </p>
                  <p className={accountRowTextClass}>
                    {[
                      item.CreatedUnix &&
                        t("integrations.added", {
                          date: date(item.CreatedUnix),
                        }),
                      item.UpdatedUnix &&
                      item.CreatedUnix &&
                      item.UpdatedUnix > item.CreatedUnix
                        ? t("integrations.lastUsed", {
                            date: date(item.UpdatedUnix),
                          })
                        : t("integrations.noActivity"),
                      item.Scope,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link className="button" to={`${item.UI}/${item.ID}`}>
                  {t("integrations.edit")}
                </Link>
                <button
                  className="icon-button"
                  aria-label={t("integrations.deleteLabel", {
                    name: item.Name,
                  })}
                  onClick={() => {
                    if (
                      confirm(
                        t("integrations.confirmDelete", { name: item.Name }),
                      )
                    )
                      remove.mutate(item.ID);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <EmptyState title={t("integrations.empty")} />
          )}
        </>
      )}
    </>
  );
}
