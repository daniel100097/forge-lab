import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { native, nativeForm, nativePage, request, type Bootstrap } from "./api";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Pending,
  pageClass,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { AccountRepoPicker, type PickerRepository } from "./AccountRepoPicker";

// Settings frame shared by the account and organization settings screens.
export const settingsLayoutClass =
  "grid grid-cols-[220px_minmax(0,1fr)] gap-8 max-lg:grid-cols-1 max-lg:gap-5";
export const settingsNavClass =
  "flex flex-col gap-1 max-lg:flex-row max-lg:flex-wrap max-lg:border-b max-lg:border-line max-lg:pb-3";
export const settingsNavLinkClass = (active: boolean) =>
  active
    ? "rounded-lg bg-selected px-3 py-2 font-semibold text-ink"
    : "rounded-lg px-3 py-2 text-muted hover:bg-canvas";
export const settingsContentClass = "min-w-0 max-w-4xl";
// Page headings rendered directly inside the settings content column.
export const settingsHeadingClass =
  "mb-5 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
export const settingsTitleClass = "text-xl max-md:text-[22px]";
export const accountRowClass =
  "account-row flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0";
export const accountRowMainClass = "min-w-0 flex-1";
export const accountRowTextClass = "mt-1 text-xs break-all text-muted";
export const actionsClass = "flex flex-wrap items-center gap-2";
// Sections stack inside the account settings frame and use two columns elsewhere.
export const accountSectionClass =
  "block border-b border-line py-6 first-of-type:pt-2 last-of-type:border-b-0";
export const settingsSectionClass =
  "grid grid-cols-[minmax(150px,1fr)_minmax(0,2fr)] gap-10 border-t border-line py-6 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6";
export const sectionTitleClass = "text-lg font-semibold tracking-[-0.25px]";
export const sectionDescriptionClass = "mt-1.5 text-sm text-muted";
export const accountSectionBodyClass = "min-w-0 pt-5";
// Permission rows inside `.workspace-form` (which keeps labels in a column).
export const accountScopeClass =
  "flex-row items-center justify-between gap-3 rounded border border-line p-3 max-md:flex-col max-md:items-stretch";
export const accountScopeSelectClass = "w-52 max-md:w-full";
const accountKeyClass =
  "account-key my-3 block overflow-x-auto rounded border border-line bg-code p-3 text-xs break-all whitespace-pre-wrap";

const settings = "/user/settings";
const fields = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form)) as Record<string, string>;
// Instance and account flags behind the native settings navigation
// (templates/user/settings/navbar.tmpl) and the keys page sections.
export interface AccountNav {
  actions: boolean;
  packages: boolean;
  webhooks: boolean;
  quota: boolean;
  oauth2: boolean;
  ssh_keys: boolean;
  gpg_keys: boolean;
  principals: boolean;
}
export interface ProfileData {
  name: string;
  full_name: string;
  website: string;
  location: string;
  pronouns: string;
  biography: string;
  visibility: number;
  keep_email_private: boolean;
  keep_activity_private: boolean;
  keep_pronouns_private: boolean;
  rename_disabled?: boolean;
  /** Allowed profile visibilities (0 public, 1 limited, 2 private). */
  visibility_options?: number[] | null;
  settings?: {
    cooldown_period: number;
    disable_gravatar: boolean;
    use_custom_avatar: boolean;
    avatar_email: string;
    avatar: string;
    max_avatar_file_size: number;
    max_avatar_width: number;
    max_avatar_height: number;
    placeholder_email: string;
    common_pronouns?: string[] | null;
    nav: AccountNav;
  };
}
/** The native profile settings data (GET /user/settings). */
export const profileQuery = {
  queryKey: ["profile"],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    nativePage<ProfileData>(settings, signal),
};
export function AccountSettingsLayout({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("account");
  const profile = useQuery({
    ...profileQuery,
    enabled: !!bootstrap.user,
    retry: false,
  });
  const nav = profile.data?.settings?.nav;
  // Until the flags are known (or when they can't be read) every item is shown.
  const show = (flag?: boolean) => !nav || flag;
  if (!bootstrap.user && bootstrap.auth_state !== "security_setup")
    return <Navigate to="/login" replace />;
  return (
    <section className={pageClass}>
      <h1 className="mb-5">{t("settings.title")}</h1>
      <div className={settingsLayoutClass}>
        <nav className={settingsNavClass} aria-label={t("settings.title")}>
          {(
            [
              ["", t("settings.nav.profile")],
              ["appearance", t("settings.nav.preferences")],
              ["account", t("settings.nav.account")],
              ["security", t("settings.nav.security")],
              [
                "keys",
                t("settings.nav.keys"),
                show(nav?.ssh_keys || nav?.gpg_keys || nav?.principals),
              ],
              ["applications", t("settings.nav.applications")],
              ["authorized-integrations", t("settings.nav.integrations")],
              ["hooks", t("settings.nav.webhooks"), show(nav?.webhooks)],
              ["organization", t("settings.nav.organizations")],
              ["repos", t("settings.nav.repositories")],
              ["packages", t("settings.nav.packages"), show(nav?.packages)],
              ["storage_overview", t("settings.nav.storage"), show(nav?.quota)],
              [
                "actions/runners",
                t("settings.nav.runners"),
                show(nav?.actions),
              ],
              [
                "actions/secrets",
                t("settings.nav.secrets"),
                show(nav?.actions),
              ],
              [
                "actions/variables",
                t("settings.nav.variables"),
                show(nav?.actions),
              ],
              ["blocked", t("settings.nav.blocked")],
            ] as [string, string, boolean?][]
          )
            .filter(([, , visible]) => visible !== false)
            .map(([path, label]) => (
              <NavLink
                key={path}
                end={!path}
                to={`/account${path ? `/${path}` : ""}`}
                className={({ isActive }) => settingsNavLinkClass(isActive)}
              >
                {label}
              </NavLink>
            ))}
        </nav>
        <div className={settingsContentClass}>
          <Outlet />
        </div>
      </div>
    </section>
  );
}
export type SettingsFrame = "account" | "admin" | "organization";
function Section({
  title,
  description,
  children,
  frame = "account",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  frame?: SettingsFrame;
}) {
  return (
    <section
      className={
        frame === "account" ? accountSectionClass : settingsSectionClass
      }
    >
      <div>
        <h2
          className={
            frame === "organization"
              ? "text-xl font-semibold tracking-[-0.25px]"
              : sectionTitleClass
          }
        >
          {title}
        </h2>
        {description && (
          <p className={sectionDescriptionClass}>{description}</p>
        )}
      </div>
      <div
        className={frame === "account" ? accountSectionBodyClass : undefined}
      >
        {children}
      </div>
    </section>
  );
}
function Success({ show }: { show: boolean }) {
  const { t } = useTranslation("account");
  return show ? (
    <p className="form-success" role="status">
      <Check size={16} />
      {t("settings.saved")}
    </p>
  ) : null;
}
function Secret({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation("account");
  return (
    <div
      className="account-secret mb-5 flex flex-col items-start gap-3 rounded-lg border border-primary bg-info-bg p-5"
      role="status"
    >
      <strong>{label}</strong>
      <p>{t("settings.secret.notice")}</p>
      <code className="w-full overflow-x-auto rounded border border-line bg-surface p-3 break-all">
        {value}
      </code>
      <CopyButton value={value} label={t("settings.secret.copy", { label })} />
    </div>
  );
}
interface AccountData {
  emails: {
    ID: number;
    Email: string;
    IsPrimary: boolean;
    IsActivated: boolean;
    CanBePrimary: boolean;
  }[];
  can_add_email: boolean;
  notification_preference: string;
  has_password: boolean;
  disabled?: string[];
  enable_notify_mail?: boolean;
  activations_pending?: boolean;
  delete_with_comments?: boolean;
  delete_with_comments_max_time?: string;
}
export function AccountDetailsPage() {
  const { t } = useTranslation("account");
  const query = useQuery({
      queryKey: ["account-details"],
      queryFn: ({ signal }) =>
        nativePage<AccountData>(`${settings}/account`, signal),
    }),
    client = useQueryClient(),
    navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const save = useMutation({
    mutationFn: async ({
      action,
      data,
    }: {
      action: string;
      data: Record<string, string>;
    }) => {
      setNotice("");
      await nativeForm(`${settings}/${action}`, data);
      const { data: result } = await query.refetch();
      // Like the native flash message: new addresses that need confirmation
      // and resent confirmations point to the inbox.
      const added = data.email
        ? result?.emails.find(
            (email) => email.Email.toLowerCase() === data.email.toLowerCase(),
          )
        : undefined;
      if (added && !added.IsActivated)
        setNotice(t("details.emails.confirmationSent", { email: added.Email }));
      if (data._method === "SENDACTIVATION") {
        const email = result?.emails.find((e) => String(e.ID) === data.id);
        if (email)
          setNotice(
            t("details.emails.confirmationSent", { email: email.Email }),
          );
      }
    },
  });
  const remove = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      await nativeForm(`${settings}/account/delete`, fields(form));
      client.clear();
      navigate("/login");
    },
  });
  useTitle(t("details.documentTitle"));
  const disabled = query.data?.disabled || [];
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("details.title")}</h1>
      </div>
      <Feedback error={query.error || save.error || remove.error} />
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : (
        <Success show={save.isSuccess} />
      )}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <Section
              title={t("details.emails.title")}
              description={t("details.emails.description")}
            >
              {query.data.emails.map((email) => (
                <div className={accountRowClass} key={email.ID}>
                  <div className={accountRowMainClass}>
                    <strong className="break-all">{email.Email}</strong>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {email.IsPrimary && (
                        <span className="badge">
                          {t("details.emails.primary")}
                        </span>
                      )}
                      <span className="badge">
                        {email.IsActivated
                          ? t("details.emails.verified")
                          : t("details.emails.unverified")}
                      </span>
                    </p>
                  </div>
                  <div className={actionsClass}>
                    {!email.IsPrimary && email.CanBePrimary && (
                      <button
                        className="button"
                        onClick={() =>
                          save.mutate({
                            action: "account/email",
                            data: { _method: "PRIMARY", id: String(email.ID) },
                          })
                        }
                      >
                        {t("details.emails.makePrimary")}
                      </button>
                    )}
                    {!email.IsActivated && (
                      <button
                        className="button"
                        disabled={query.data!.activations_pending}
                        title={
                          query.data!.activations_pending
                            ? t("details.emails.pendingHint")
                            : undefined
                        }
                        onClick={() =>
                          save.mutate({
                            action: "account/email",
                            data: {
                              _method: "SENDACTIVATION",
                              id: String(email.ID),
                            },
                          })
                        }
                      >
                        {query.data!.activations_pending
                          ? t("details.emails.pending")
                          : t("details.emails.resend")}
                      </button>
                    )}
                    {!email.IsPrimary && (
                      <button
                        className="icon-button"
                        aria-label={t("details.emails.remove", {
                          email: email.Email,
                        })}
                        onClick={() => {
                          if (
                            window.confirm(
                              t("details.emails.confirmRemove", {
                                email: email.Email,
                              }),
                            )
                          )
                            save.mutate({
                              action: "account/email/delete",
                              data: { id: String(email.ID) },
                            });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <form
                className="workspace-form mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  save.mutate(
                    { action: "account/email", data: fields(form) },
                    { onSuccess: () => form.reset() },
                  );
                }}
              >
                {!query.data.can_add_email && (
                  <p className="text-sm text-muted">
                    {t("details.emails.limited")}
                  </p>
                )}
                <label>
                  {t("details.emails.add")}
                  <input
                    type="email"
                    name="email"
                    required
                    disabled={!query.data.can_add_email}
                  />
                </label>
                <button
                  className="button primary self-start"
                  disabled={save.isPending || !query.data.can_add_email}
                >
                  {t("details.emails.add")}
                </button>
              </form>
            </Section>
            {query.data.enable_notify_mail !== false && (
              <Section title={t("details.notifications.title")}>
                <form
                  className="workspace-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate({
                      action: "account/email",
                      data: {
                        ...fields(e.currentTarget),
                        _method: "NOTIFICATION",
                      },
                    });
                  }}
                >
                  <SelectControl
                    label={t("details.notifications.label")}
                    name="preference"
                    defaultValue={query.data.notification_preference}
                    options={[
                      {
                        value: "enabled",
                        label: t("details.notifications.enabled"),
                      },
                      {
                        value: "andyourown",
                        label: t("details.notifications.andYourOwn"),
                      },
                      {
                        value: "onmention",
                        label: t("details.notifications.onMention"),
                      },
                      {
                        value: "disabled",
                        label: t("details.notifications.disabled"),
                      },
                    ]}
                  />
                  <button
                    className="button self-start"
                    disabled={save.isPending}
                  >
                    {t("details.notifications.save")}
                  </button>
                </form>
              </Section>
            )}
            {!disabled.includes("deletion") && (
              <Section
                title={t("details.delete.title")}
                description={t("details.delete.description")}
              >
                {query.data.delete_with_comments && (
                  <p className="form-error mb-4">
                    {t("details.delete.withComments", {
                      duration: query.data.delete_with_comments_max_time,
                    })}
                  </p>
                )}
                <details>
                  <summary className="text-[var(--ui-danger)] cursor-pointer">
                    {t("details.delete.summary")}
                  </summary>
                  <form
                    className="workspace-form mt-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (window.confirm(t("details.delete.confirm")))
                        remove.mutate(e.currentTarget);
                    }}
                  >
                    <label>
                      {t("details.delete.password")}
                      <input
                        type="password"
                        name="password"
                        required
                        autoComplete="current-password"
                      />
                    </label>
                    <button
                      className="button self-start"
                      disabled={remove.isPending}
                    >
                      {t("details.delete.submit")}
                    </button>
                  </form>
                </details>
              </Section>
            )}
          </>
        )
      )}
    </>
  );
}
interface SecurityData {
  has_password: boolean;
  can_manage_password: boolean;
  totp: boolean;
  openid_enabled: boolean;
  two_factor_required: boolean;
  webauthn: { ID: number; Name: string; CloneWarning: boolean }[];
  links: { ID: number; Name: string }[];
  providers: string[];
  openids: { ID: number; URI: string; Show: boolean }[];
}
export function AccountSecurityPage() {
  const { t } = useTranslation("account");
  const query = useQuery({
    queryKey: ["account-security"],
    queryFn: ({ signal }) =>
      nativePage<SecurityData>(`${settings}/security`, signal),
  });
  const [recovery, setRecovery] = useState("");
  const change = useMutation({
    mutationFn: async ({
      path,
      data,
    }: {
      path: string;
      data: Record<string, string>;
    }) => {
      const { data: result } = await request<{
        recovery_code?: string;
        redirect?: string;
      }>(`${settings}/${path}`, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data),
      });
      if (path === "security/openid" && result.redirect) {
        const url = new URL(result.redirect, location.origin);
        if (
          url.origin !== location.origin &&
          ["http:", "https:"].includes(url.protocol)
        ) {
          location.assign(url.href);
          return;
        }
      }
      if (result.recovery_code) setRecovery(result.recovery_code);
      await query.refetch();
    },
  });
  const credential = useMutation({
    mutationFn: async (name: string) => {
      await registerSecurityKey(t, `${settings}/security/webauthn`, name);
      await query.refetch();
    },
  });
  useTitle(t("security.documentTitle"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("security.title")}</h1>
      </div>
      <Feedback error={query.error || change.error || credential.error} />
      <Success show={change.isSuccess || credential.isSuccess} />
      {recovery && (
        <Secret label={t("security.recoveryCode")} value={recovery} />
      )}
      {query.data?.can_manage_password && (
        <Section
          title={t("security.password.title")}
          description={t("security.password.description")}
        >
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              change.mutate({ path: "account", data: fields(e.currentTarget) });
            }}
          >
            {query.data.has_password && (
              <label>
                {t("security.password.current")}
                <input
                  type="password"
                  name="old_password"
                  autoComplete="current-password"
                  required
                />
              </label>
            )}
            <label>
              {t("security.password.new")}
              <input
                type="password"
                name="password"
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              {t("security.password.confirm")}
              <input
                type="password"
                name="retype"
                required
                autoComplete="new-password"
              />
            </label>
            <button
              className="button primary self-start"
              disabled={change.isPending}
            >
              {t("security.password.save")}
            </button>
          </form>
        </Section>
      )}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <Section
              title={t("security.twoFactor.title")}
              description={t("security.twoFactor.description")}
            >
              <p className="flex items-center gap-2">
                <ShieldCheck size={18} />
                {query.data.totp
                  ? t("security.twoFactor.enabled")
                  : t("security.twoFactor.notEnabled")}
              </p>
              <div className={`mt-4 ${actionsClass}`}>
                {query.data.totp ? (
                  <>
                    <Link className="button" to="two-factor/reenroll">
                      {t("security.twoFactor.replace")}
                    </Link>
                    <button
                      className="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t("security.twoFactor.confirmRegenerate"),
                          )
                        )
                          change.mutate({
                            path: "security/two_factor/regenerate_scratch",
                            data: {},
                          });
                      }}
                    >
                      {t("security.twoFactor.regenerate")}
                    </button>
                    {!query.data.two_factor_required && (
                      <button
                        className="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              t("security.twoFactor.confirmDisable"),
                            )
                          )
                            change.mutate({
                              path: "security/two_factor/disable",
                              data: {},
                            });
                        }}
                      >
                        {t("security.twoFactor.disable")}
                      </button>
                    )}
                  </>
                ) : (
                  <Link className="button primary" to="two-factor/enroll">
                    {t("security.twoFactor.enable")}
                  </Link>
                )}
              </div>
            </Section>
            <Section
              title={t("security.keys.title")}
              description={t("security.keys.description")}
            >
              {query.data.webauthn.map((key) => (
                <div className={accountRowClass} key={key.ID}>
                  <KeyRound size={18} />
                  <strong>{key.Name}</strong>
                  {key.CloneWarning && (
                    <span className="badge">
                      {t("security.keys.cloneWarning")}
                    </span>
                  )}
                  <button
                    className="icon-button ml-auto"
                    aria-label={t("security.keys.delete", { name: key.Name })}
                    onClick={() => {
                      if (
                        window.confirm(
                          t("security.keys.confirmDelete", { name: key.Name }),
                        )
                      )
                        change.mutate({
                          path: "security/webauthn/delete",
                          data: { id: String(key.ID) },
                        });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <form
                className="workspace-form not-first:mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  credential.mutate(
                    String(new FormData(e.currentTarget).get("name")),
                  );
                }}
              >
                <label>
                  {t("security.keys.name")}
                  <input
                    name="name"
                    required
                    placeholder={t("security.keys.namePlaceholder")}
                  />
                </label>
                <button
                  className="button self-start"
                  disabled={credential.isPending}
                >
                  {t("security.keys.register")}
                </button>
              </form>
            </Section>
            <Section title={t("security.linked.title")}>
              {query.data.links.length ? (
                query.data.links.map((link) => (
                  <div className={accountRowClass} key={link.ID}>
                    <span>{link.Name}</span>
                    <button
                      className="button ml-auto"
                      onClick={() =>
                        change.mutate({
                          path: "security/account_link",
                          data: { id: String(link.ID) },
                        })
                      }
                    >
                      {t("security.linked.unlink")}
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-muted">{t("security.linked.empty")}</p>
              )}
              <div className={`mt-4 ${actionsClass}`}>
                {query.data.providers?.map((provider) => (
                  <a
                    key={provider}
                    className="button"
                    href={native(
                      `/user/oauth2/${encodeURIComponent(provider)}`,
                    )}
                  >
                    {t("security.linked.connect", { provider })}
                  </a>
                ))}
              </div>
            </Section>
            {query.data.openid_enabled && (
              <Section title={t("security.openid.title")}>
                {query.data.openids.map((id) => (
                  <div className={accountRowClass} key={id.ID}>
                    <span>{id.URI}</span>
                    <button
                      className="button ml-auto"
                      onClick={() =>
                        change.mutate({
                          path: "security/openid/toggle_visibility",
                          data: { id: String(id.ID) },
                        })
                      }
                    >
                      {id.Show
                        ? t("security.openid.hide")
                        : t("security.openid.show")}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t("security.openid.delete", { uri: id.URI })}
                      onClick={() =>
                        change.mutate({
                          path: "security/openid/delete",
                          data: { id: String(id.ID) },
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <form
                  className="workspace-form mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    change.mutate({
                      path: "security/openid",
                      data: fields(e.currentTarget),
                    });
                  }}
                >
                  <label>
                    {t("security.openid.uri")}
                    <input name="openid" type="url" required />
                  </label>
                  <button className="button self-start">
                    {t("security.openid.connect")}
                  </button>
                </form>
              </Section>
            )}
          </>
        )
      )}
    </>
  );
}
export function TwoFactorSettingsPage() {
  const { t } = useTranslation("account");
  const mode = useParams().mode === "reenroll" ? "reenroll" : "enroll";
  const endpoint = `${settings}/security/two_factor/${mode}`;
  const [code, setCode] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["two-factor-enroll", mode],
    enabled: !code,
    queryFn: ({ signal }) =>
      nativePage<{ secret: string; qr: string }>(endpoint, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const enroll = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const { data } = await request<{ recovery_code: string }>(endpoint, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields(form)),
      });
      if (!data.recovery_code) throw new Error(t("twoFactor.incomplete"));
      setCode(data.recovery_code);
      client.removeQueries({ queryKey: ["two-factor-enroll"] });
      await client.invalidateQueries({ queryKey: ["account-security"] });
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  useTitle(t("twoFactor.title"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("twoFactor.title")}</h1>
      </div>
      <Feedback error={query.error || enroll.error} />
      {code ? (
        <>
          <Secret label={t("security.recoveryCode")} value={code} />
          <Link className="button primary" to="/account/security">
            {t("twoFactor.done")}
          </Link>
        </>
      ) : query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <Section
            title={t("twoFactor.connect")}
            description={t("twoFactor.description")}
          >
            <img
              className="my-5 size-56 rounded bg-white p-3"
              src={query.data.qr}
              alt={t("twoFactor.qrAlt")}
            />
            <details>
              <summary>{t("twoFactor.manual")}</summary>
              <code className={accountKeyClass}>{query.data.secret}</code>
              <CopyButton
                value={query.data.secret}
                label={t("twoFactor.copyKey")}
              />
            </details>
            <form
              className="workspace-form mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                enroll.mutate(e.currentTarget);
              }}
            >
              <label>
                {t("twoFactor.code")}
                <input
                  name="passcode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
              <button
                className="button primary self-start"
                disabled={enroll.isPending}
              >
                {t("twoFactor.verify")}
              </button>
            </form>
          </Section>
        )
      )}
    </>
  );
}
interface KeyData {
  ID: number;
  Name: string;
  Content: string;
  Fingerprint?: string;
  KeyID?: string;
  PaddedKeyID?: string;
  Verified: boolean;
  CreatedUnix?: number;
  UpdatedUnix?: number;
  AddedUnix?: number;
  ExpiredUnix?: number;
  HasUsed?: boolean;
  HasRecentActivity?: boolean;
  External?: boolean;
  OmitEmail?: string;
  Emails?: string[];
  SubKeys?: string[];
}
interface KeysPageData {
  keys: KeyData[];
  gpg: KeyData[];
  principals: KeyData[];
  token_to_sign: string;
  allow_principals: boolean;
  ssh_disabled: boolean;
  domain?: string;
  disabled?: string[];
}
interface SignatureStep {
  message: string;
  key_id: string;
  padded_key_id: string;
  token_to_sign: string;
}
type KeyKind = "ssh" | "gpg" | "principal";
// A shell command or token with a copy button (native settings show these in
// code blocks next to the verification forms).
function CommandBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="my-2 flex items-stretch overflow-hidden rounded border border-line bg-code">
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto p-3 text-xs break-all whitespace-pre-wrap">
        <code>{value}</code>
      </pre>
      <CopyButton compact value={value} label={label} />
    </div>
  );
}
function KeyDates({ kind, data }: { kind: KeyKind; data: KeyData }) {
  const { t, i18n } = useTranslation("account");
  const date = (unix?: number) =>
    unix
      ? new Date(unix * 1000).toLocaleDateString(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";
  if (kind === "gpg")
    return (
      <>
        {!!data.SubKeys?.length && (
          <p className={accountRowTextClass}>
            {t("keys.meta.subkeys", { ids: data.SubKeys.join(", ") })}
          </p>
        )}
        {!!data.Emails?.length && (
          <p className={accountRowTextClass}>
            {t("keys.meta.identities", { emails: data.Emails.join(", ") })}
          </p>
        )}
        <p className={accountRowTextClass}>
          {t("keys.meta.added", { date: date(data.AddedUnix) })} ·{" "}
          {/* Keys without expiry store the zero time (year 1). */}
          {data.ExpiredUnix && data.ExpiredUnix > 0
            ? t("keys.meta.validUntil", { date: date(data.ExpiredUnix) })
            : t("keys.meta.validForever")}
        </p>
      </>
    );
  return (
    <p className={accountRowTextClass}>
      {t("keys.meta.added", { date: date(data.CreatedUnix) })} ·{" "}
      {data.HasUsed ? (
        <span className={data.HasRecentActivity ? "text-success" : undefined}>
          {t("keys.meta.lastUsed", { date: date(data.UpdatedUnix) })}
        </span>
      ) : (
        t("keys.meta.noActivity")
      )}
    </p>
  );
}
export function AccountKeysPage() {
  const { t } = useTranslation("account");
  const query = useQuery({
    queryKey: ["account-keys"],
    queryFn: ({ signal }) =>
      nativePage<KeysPageData>(`${settings}/keys`, signal),
  });
  const [chosenType, setType] = useState<KeyKind | "">("");
  const [signature, setSignature] = useState<SignatureStep | null>(null);
  const action = useMutation({
    mutationFn: async ({
      remove = false,
      data,
      form,
    }: {
      remove?: boolean;
      data: Record<string, string>;
      form?: HTMLFormElement;
    }) => {
      const { data: result } = await request<{
        signature_required?: SignatureStep;
      }>(`${settings}/keys${remove ? "/delete" : ""}`, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data),
      });
      // GPG keys without a matching activated email need a signed token.
      if (result?.signature_required) {
        setSignature(result.signature_required);
        return "signature";
      }
      setSignature(null);
      form?.reset();
      await query.refetch();
      return "saved";
    },
  });
  useTitle(t("keys.title"));
  const data = query.data;
  const disabled = data?.disabled || [];
  const kinds = data
    ? ([
        ...(disabled.includes("manage_ssh_keys") ? [] : ["ssh"]),
        ...(data.allow_principals ? ["principal"] : []),
        ...(disabled.includes("manage_gpg_keys") ? [] : ["gpg"]),
      ] as KeyKind[])
    : [];
  const addable = kinds.filter(
    (kind) => kind !== "principal" || !data?.ssh_disabled,
  );
  const type = addable.includes(chosenType as KeyKind)
    ? (chosenType as KeyKind)
    : addable[0];
  const domain = data?.domain || location.hostname;
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("keys.title")}</h1>
      </div>
      <Feedback error={query.error || action.error} />
      <Success show={action.isSuccess && action.data === "saved"} />
      {query.isPending ? (
        <Pending />
      ) : (
        data && (
          <>
            {kinds.map((kind) => {
              const keys =
                kind === "ssh"
                  ? data.keys
                  : kind === "gpg"
                    ? data.gpg
                    : data.principals;
              return (
                <Section
                  key={kind}
                  title={t(`keys.sections.${kind}`)}
                  description={t(`keys.descriptions.${kind}`)}
                >
                  {kind === "ssh" && data.ssh_disabled && (
                    <p className="mb-4 text-sm text-muted">
                      {t("keys.signOnly")}
                    </p>
                  )}
                  {keys.map((key) => {
                    const name =
                      kind === "gpg"
                        ? key.PaddedKeyID || key.KeyID || ""
                        : key.Name;
                    return (
                      <div
                        className="account-key-card mb-4 border-b border-line pb-4 last:border-0"
                        key={key.ID}
                      >
                        <div className={accountRowClass}>
                          <KeyRound
                            size={18}
                            className={
                              key.HasRecentActivity ||
                              (kind === "gpg" &&
                                (!key.ExpiredUnix ||
                                  key.ExpiredUnix <= 0 ||
                                  key.ExpiredUnix * 1000 > Date.now()))
                                ? "text-success"
                                : undefined
                            }
                          />
                          <strong className="min-w-0 break-all">{name}</strong>
                          {key.Verified && (
                            <span className="badge">{t("keys.verified")}</span>
                          )}
                          <button
                            className="icon-button ml-auto"
                            disabled={key.External}
                            title={
                              key.External
                                ? t("keys.externallyManaged")
                                : undefined
                            }
                            aria-label={t(`keys.delete.${kind}`, {
                              name: key.Name || key.KeyID,
                            })}
                            onClick={() => {
                              if (window.confirm(t("keys.confirmDelete")))
                                action.mutate({
                                  remove: true,
                                  data: { id: String(key.ID), type: kind },
                                });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {kind === "ssh" && (
                          <code className={accountKeyClass}>
                            {key.Fingerprint}
                          </code>
                        )}
                        <KeyDates kind={kind} data={key} />
                        {!key.Verified && kind !== "principal" && (
                          <details className="mt-3">
                            <summary className="cursor-pointer">
                              {t("keys.verify.summary")}
                            </summary>
                            <p className="my-3 text-sm text-muted">
                              {t("keys.verify.instructions")}
                            </p>
                            <CommandBlock
                              value={data.token_to_sign}
                              label={t("keys.verify.copyToken")}
                            />
                            <p className="mt-3 text-sm text-muted">
                              {t("keys.verify.signWith")}
                            </p>
                            {kind === "ssh" ? (
                              <>
                                <CommandBlock
                                  value={`echo -n '${data.token_to_sign}' | ssh-keygen -Y sign -n ${domain} -f ~/.ssh/id_ed25519`}
                                  label={t("keys.verify.copyCommand")}
                                />
                                <p className="mt-3 text-sm text-muted">
                                  {t("keys.verify.sshAgent")}
                                </p>
                                <CommandBlock
                                  value={`bash -c "echo -n '${data.token_to_sign}' | ssh-keygen -Y sign -n ${domain} -f <(echo '${key.OmitEmail || ""}')"`}
                                  label={t("keys.verify.copyCommand")}
                                />
                                <details className="mt-2 text-sm">
                                  <summary className="cursor-pointer text-muted">
                                    {t("keys.verify.windows")}
                                  </summary>
                                  <p className="mt-2 text-muted">PowerShell</p>
                                  <CommandBlock
                                    value={`cmd /c "<NUL set /p=\`"${data.token_to_sign}\`"| ssh-keygen -Y sign -n ${domain} -f /path_to_PrivateKey_or_RelatedPublicKey"`}
                                    label={t("keys.verify.copyCommand")}
                                  />
                                  <p className="mt-2 text-muted">CMD</p>
                                  <CommandBlock
                                    value={`<NUL set /p="${data.token_to_sign}"| ssh-keygen -Y sign -n ${domain} -f /path_to_PrivateKey_or_RelatedPublicKey`}
                                    label={t("keys.verify.copyCommand")}
                                  />
                                </details>
                              </>
                            ) : (
                              <CommandBlock
                                value={`echo "${data.token_to_sign}" | gpg -a --default-key ${key.PaddedKeyID || key.KeyID} --detach-sig`}
                                label={t("keys.verify.copyCommand")}
                              />
                            )}
                            <form
                              className="workspace-form mt-3"
                              onSubmit={(e) => {
                                e.preventDefault();
                                action.mutate({
                                  data:
                                    kind === "ssh"
                                      ? {
                                          ...fields(e.currentTarget),
                                          type: "verify_ssh",
                                          title: "none",
                                          content: key.Content,
                                          fingerprint: key.Fingerprint || "",
                                        }
                                      : {
                                          ...fields(e.currentTarget),
                                          type: "verify_gpg",
                                          title: "none",
                                          content: key.KeyID || "",
                                          key_id: key.KeyID || "",
                                        },
                                });
                              }}
                            >
                              <label>
                                {t("keys.verify.signature")}
                                <textarea
                                  name="signature"
                                  required
                                  rows={5}
                                  className="font-mono"
                                  placeholder={
                                    kind === "ssh"
                                      ? t("keys.verify.sshPlaceholder")
                                      : t("keys.verify.gpgPlaceholder")
                                  }
                                />
                              </label>
                              <button
                                className="button self-start"
                                disabled={action.isPending}
                              >
                                {t("keys.verify.submit")}
                              </button>
                            </form>
                          </details>
                        )}
                      </div>
                    );
                  })}
                  {!keys.length && (
                    <p className="text-muted">{t(`keys.empty.${kind}`)}</p>
                  )}
                </Section>
              );
            })}
            {type && (
              <Section title={t("keys.add.title")}>
                <form
                  className="workspace-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.mutate({
                      data: { ...fields(e.currentTarget), type },
                      form: e.currentTarget,
                    });
                  }}
                >
                  <label>
                    {t("keys.add.type")}
                    <SelectControl
                      label={t("keys.add.type")}
                      value={type}
                      onValueChange={(value) => {
                        setType(value as KeyKind);
                        setSignature(null);
                      }}
                      options={addable.map((kind) => ({
                        value: kind,
                        label: t(`keys.add.types.${kind}`),
                      }))}
                    />
                  </label>
                  {type === "ssh" ? (
                    <label>
                      {t("keys.add.name")}
                      <input name="title" required maxLength={50} />
                    </label>
                  ) : (
                    <input
                      type="hidden"
                      name="title"
                      value={type === "gpg" ? "none" : "principal"}
                    />
                  )}
                  {type === "principal" ? (
                    <label>
                      {t("keys.add.principal")}
                      <input name="content" required />
                    </label>
                  ) : (
                    <label>
                      {t("keys.add.publicKey")}
                      <textarea
                        name="content"
                        rows={6}
                        required
                        className="font-mono"
                        placeholder={
                          type === "ssh"
                            ? "ssh-ed25519 AAAA…"
                            : t("keys.add.gpgPlaceholder")
                        }
                      />
                    </label>
                  )}
                  {type === "gpg" && signature && (
                    <div className="flex flex-col gap-3 rounded border border-line p-4">
                      <p className="form-error" role="alert">
                        {signature.message}
                      </p>
                      <p className="text-sm text-muted">
                        {t("keys.verify.tokenRequired")}
                      </p>
                      <CommandBlock
                        value={signature.token_to_sign}
                        label={t("keys.verify.copyToken")}
                      />
                      <p className="text-sm text-muted">
                        {t("keys.verify.signWith")}
                      </p>
                      <CommandBlock
                        value={`echo "${signature.token_to_sign}" | gpg -a --default-key ${signature.padded_key_id} --detach-sig`}
                        label={t("keys.verify.copyCommand")}
                      />
                      <label>
                        {t("keys.verify.signature")}
                        <textarea
                          name="signature"
                          required
                          rows={5}
                          className="font-mono"
                          placeholder={t("keys.verify.gpgPlaceholder")}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    className="button primary self-start"
                    disabled={action.isPending}
                  >
                    {t("keys.add.submit")}
                  </button>
                </form>
              </Section>
            )}
          </>
        )
      )}
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
interface TokenData {
  ID: number;
  Name: string;
  Scope: string;
  ResourceAllRepos: boolean;
  repositories: { ID: number; Name: string; OwnerName: string }[];
}
export function AccountApplicationsPage() {
  const { t, i18n } = useTranslation("account");
  const query = useQuery({
      queryKey: ["account-applications"],
      queryFn: ({ signal }) =>
        nativePage<{
          tokens: TokenData[];
          applications: Application[];
          oauth_enabled: boolean;
          grants: {
            ID: number;
            ApplicationID: number;
            ApplicationName?: string;
            Scope: string;
            CreatedUnix?: number;
          }[];
        }>(`${settings}/applications`, signal),
    }),
    navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const action = useMutation({
    mutationFn: async ({
      path,
      data,
    }: {
      path: string;
      data: Record<string, string>;
    }) => {
      const { data: result } = await request<{
        token?: string;
        application?: Application;
        client_secret?: string;
      }>(`${settings}/applications/${path}`, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data),
      });
      if (result.token) setSecret(result.token);
      if (result.application?.ID)
        navigate(`/account/applications/oauth2/${result.application.ID}`, {
          state: { secret: result.client_secret },
        });
      await query.refetch();
    },
  });
  useTitle(t("applications.title"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("applications.title")}</h1>
        <Link className="button primary" to="tokens/new">
          <Plus size={16} />
          {t("applications.newToken")}
        </Link>
      </div>
      <Feedback error={query.error || action.error} />
      {secret && (
        <Secret label={t("applications.accessToken")} value={secret} />
      )}{" "}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <Section
              title={t("applications.tokens.title")}
              description={t("applications.tokens.description")}
            >
              {query.data.tokens.map((token) => (
                <div className={accountRowClass} key={token.ID}>
                  <div className={accountRowMainClass}>
                    <strong>{token.Name}</strong>
                    <p className={accountRowTextClass}>{token.Scope}</p>
                    {!token.ResourceAllRepos && (
                      <p className={accountRowTextClass}>
                        {token.repositories
                          .map((r) => `${r.OwnerName}/${r.Name}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <div className={actionsClass}>
                    <button
                      className="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t("applications.tokens.confirmRegenerate", {
                              name: token.Name,
                            }),
                          )
                        )
                          action.mutate({
                            path: "tokens/regenerate",
                            data: { id: String(token.ID) },
                          });
                      }}
                    >
                      {t("applications.tokens.regenerate")}
                    </button>
                    <button
                      className="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t("applications.tokens.confirmRevoke", {
                              name: token.Name,
                            }),
                          )
                        )
                          action.mutate({
                            path: "tokens/delete",
                            data: { id: String(token.ID) },
                          });
                      }}
                    >
                      {t("applications.tokens.revoke")}
                    </button>
                  </div>
                </div>
              ))}
              {!query.data.tokens.length && (
                <p className="text-muted">{t("applications.tokens.empty")}</p>
              )}
            </Section>
            {query.data.oauth_enabled && (
              <>
                <Section title={t("applications.oauth.title")}>
                  {query.data.applications.map((app) => (
                    <div className={accountRowClass} key={app.ID}>
                      <div className={accountRowMainClass}>
                        <Link
                          className="text-primary font-semibold"
                          to={`oauth2/${app.ID}`}
                        >
                          {app.Name}
                        </Link>
                        <p className={accountRowTextClass}>{app.ClientID}</p>
                      </div>
                      <button
                        className="icon-button ml-auto"
                        aria-label={t("applications.oauth.delete", {
                          name: app.Name,
                        })}
                        onClick={() => {
                          if (
                            window.confirm(
                              t("applications.oauth.confirmDelete", {
                                name: app.Name,
                              }),
                            )
                          )
                            action.mutate({
                              path: `oauth2/${app.ID}/delete`,
                              data: {},
                            });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <form
                    className="workspace-form mt-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action.mutate({
                        path: "oauth2",
                        data: fields(e.currentTarget),
                      });
                    }}
                  >
                    <label>
                      {t("oauthApp.name")}
                      <input name="application_name" required />
                    </label>
                    <label>
                      {t("oauthApp.redirectUris")}
                      <textarea
                        name="redirect_uris"
                        rows={3}
                        required
                        placeholder="https://example.com/callback"
                      />
                    </label>
                    <label className="check-field">
                      <input
                        name="confidential_client"
                        type="checkbox"
                        value="on"
                        defaultChecked
                      />
                      {t("oauthApp.confidential")}
                    </label>
                    <button
                      className="button primary self-start"
                      disabled={action.isPending}
                    >
                      {t("applications.oauth.create")}
                    </button>
                  </form>
                </Section>
                <Section
                  title={t("applications.grants.title")}
                  description={t("applications.grants.description")}
                >
                  {query.data.grants.map((grant) => (
                    <div className={accountRowClass} key={grant.ID}>
                      <div className={accountRowMainClass}>
                        <strong>
                          {grant.ApplicationName ||
                            t("applications.grants.unnamed", {
                              id: grant.ApplicationID,
                            })}
                        </strong>
                        <p className={accountRowTextClass}>
                          {[
                            grant.CreatedUnix &&
                              t("applications.grants.added", {
                                date: new Date(
                                  grant.CreatedUnix * 1000,
                                ).toLocaleDateString(i18n.language, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }),
                              }),
                            grant.Scope,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <button
                        className="button ml-auto"
                        onClick={() => {
                          if (
                            window.confirm(
                              t("applications.grants.confirmRevoke", {
                                name:
                                  grant.ApplicationName ||
                                  String(grant.ApplicationID),
                              }),
                            )
                          )
                            action.mutate({
                              path: `oauth2/${grant.ApplicationID}/revoke/${grant.ID}`,
                              data: {},
                            });
                        }}
                      >
                        {t("applications.grants.revoke")}
                      </button>
                    </div>
                  ))}
                  {!query.data.grants.length && (
                    <p className="text-muted">
                      {t("applications.grants.empty")}
                    </p>
                  )}
                </Section>
              </>
            )}
          </>
        )
      )}
    </>
  );
}
export function NewTokenPage() {
  const { t } = useTranslation("account");
  const query = useQuery({
    queryKey: ["token-options"],
    queryFn: ({ signal }) =>
      nativePage<{
        categories: string[];
        repositories: { ID: number; OwnerName: string; Name: string }[];
      }>(`${settings}/applications/tokens/new`, signal),
  });
  const [resource, setResource] = useState("public-only"),
    [token, setToken] = useState(""),
    [repositories, setRepositories] = useState<PickerRepository[]>([]);
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string" && v) data.append(k, v);
      });
      const { data: result } = await request<{ token: string }>(
        `${settings}/applications/tokens/new`,
        {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: data,
        },
      );
      if (!result.token) throw new Error(t("newToken.failed"));
      setToken(result.token);
    },
  });
  useTitle(t("newToken.title"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("newToken.title")}</h1>
      </div>
      <Feedback error={query.error || create.error} />
      {token ? (
        <>
          <Secret label={t("applications.accessToken")} value={token} />
          <Link className="button" to="/account/applications">
            {t("newToken.done")}
          </Link>
        </>
      ) : query.isPending ? (
        <Pending />
      ) : (
        <form
          className="workspace-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(e.currentTarget);
          }}
        >
          <label>
            {t("newToken.name")}
            <input name="name" required />
          </label>
          <label>
            {t("integrations.resource.label")}
            <SelectControl
              label={t("integrations.resource.label")}
              name="resource"
              value={resource}
              onValueChange={setResource}
              options={[
                {
                  value: "public-only",
                  label: t("integrations.resource.publicOnly"),
                },
                {
                  value: "repo-specific",
                  label: t("integrations.resource.selected"),
                },
                { value: "all", label: t("integrations.resource.all") },
              ]}
            />
          </label>
          {resource === "repo-specific" && (
            <AccountRepoPicker
              endpoint={`${settings}/applications/tokens/new`}
              selected={repositories}
              onChange={setRepositories}
            />
          )}
          <h2>{t("integrations.permissions")}</h2>
          <p className="text-muted">{t("newToken.permissionsHint")}</p>
          {query.data?.categories.map((category) => (
            <label className={accountScopeClass} key={category}>
              <span>{category}</span>
              <SelectControl
                label={t("integrations.scope.label", { category })}
                className={accountScopeSelectClass}
                name="scope"
                defaultValue=""
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
          <button
            className="button primary self-start"
            disabled={create.isPending}
          >
            {t("newToken.submit")}
          </button>
        </form>
      )}
    </>
  );
}
export function OAuthApplicationPage({
  nativeRoot = settings,
  applicationId,
  frame = "account",
}: {
  nativeRoot?: string;
  applicationId?: string;
  frame?: SettingsFrame;
} = {}) {
  const { t } = useTranslation("account");
  const settings = nativeRoot;
  const params = useParams();
  const id = applicationId || params.id;
  const query = useQuery({
    queryKey: ["oauth-application", nativeRoot, id],
    queryFn: ({ signal }) =>
      nativePage<{ application: Application }>(
        `${settings}/applications/oauth2/${id}`,
        signal,
      ),
  });
  const location = useLocation();
  const [secret, setSecret] = useState(String(location.state?.secret || ""));
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.secret)
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
  }, [location.pathname, location.search, location.state, navigate]);
  const save = useMutation({
    mutationFn: async ({
      regenerate = false,
      data,
    }: {
      regenerate?: boolean;
      data: Record<string, string>;
    }) => {
      const { data: result } = await request<{ client_secret?: string }>(
        `${settings}/applications/oauth2/${id}${regenerate ? "/regenerate_secret" : ""}`,
        {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(data),
        },
      );
      if (result.client_secret) setSecret(result.client_secret);
      await query.refetch();
    },
  });
  useTitle(t("oauthApp.title"));
  return (
    <>
      <div
        className={
          frame === "admin"
            ? "mb-6 flex min-h-10 items-center justify-between gap-4 max-md:gap-3"
            : settingsHeadingClass
        }
      >
        <h1 className={frame === "admin" ? undefined : settingsTitleClass}>
          {query.data?.application.Name || t("oauthApp.title")}
        </h1>
      </div>
      <Feedback error={query.error || save.error} />
      <Success show={save.isSuccess} />
      {secret && (
        <Secret label={t("oauthApp.clientSecret")} value={secret} />
      )}{" "}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <Section title={t("oauthApp.details")} frame={frame}>
            <label className="block mb-4">
              {t("oauthApp.clientId")}
              <code className={accountKeyClass}>
                {query.data.application.ClientID}
              </code>
              <CopyButton
                value={query.data.application.ClientID}
                label={t("oauthApp.copyClientId")}
              />
            </label>
            <form
              className="workspace-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({ data: fields(e.currentTarget) });
              }}
            >
              <label>
                {t("oauthApp.name")}
                <input
                  name="application_name"
                  required
                  defaultValue={query.data.application.Name}
                />
              </label>
              <label>
                {t("oauthApp.redirectUris")}
                <textarea
                  name="redirect_uris"
                  required
                  rows={4}
                  defaultValue={query.data.application.RedirectURIs.join("\n")}
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  name="confidential_client"
                  value="on"
                  defaultChecked={query.data.application.ConfidentialClient}
                />
                {t("oauthApp.confidential")}
              </label>
              <div className={actionsClass}>
                <button className="button primary" disabled={save.isPending}>
                  {t("oauthApp.save")}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    if (window.confirm(t("oauthApp.confirmRegenerate")))
                      save.mutate({ regenerate: true, data: {} });
                  }}
                >
                  {t("oauthApp.regenerate")}
                </button>
              </div>
            </form>
          </Section>
        )
      )}
    </>
  );
}
export function BlockedUsersPage() {
  const { t } = useTranslation("account");
  const query = useQuery({
    queryKey: ["blocked-users"],
    queryFn: ({ signal }) =>
      nativePage<{ users: { ID: number; Name: string; FullName: string }[] }>(
        `${settings}/blocked_users`,
        signal,
      ),
  });
  const unblock = useMutation({
    mutationFn: async (id: number) => {
      await nativeForm(`${settings}/blocked_users/unblock`, {
        user_id: String(id),
      });
      await query.refetch();
    },
  });
  useTitle(t("blocked.title"));
  return (
    <>
      <div className={settingsHeadingClass}>
        <h1 className={settingsTitleClass}>{t("blocked.title")}</h1>
      </div>
      <Feedback error={query.error || unblock.error} />
      {query.isPending ? (
        <Pending />
      ) : query.data?.users.length ? (
        query.data.users.map((user) => (
          <div className={accountRowClass} key={user.ID}>
            <Link to={`/users/${user.Name}`}>{user.FullName || user.Name}</Link>
            <button
              className="button ml-auto"
              onClick={() => unblock.mutate(user.ID)}
            >
              {t("blocked.unblock")}
            </button>
          </div>
        ))
      ) : (
        <EmptyState title={t("blocked.empty")} />
      )}
    </>
  );
}
async function registerSecurityKey(
  t: TFunction<"account">,
  root: string,
  name: string,
) {
  if (!window.PublicKeyCredential)
    throw new Error(t("security.keys.unsupported"));
  const { data } = await request<{
    publicKey: PublicKeyCredentialCreationOptions & {
      challenge: string;
      user: { id: string };
      excludeCredentials?: { id: string; type: "public-key" }[];
    };
  }>(`${root}/request_register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const decode = (value: string) =>
    Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
  const encode = (value: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(value)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  const raw = data.publicKey as unknown as {
    challenge: string;
    user: { id: string };
    excludeCredentials?: { id: string; type: "public-key" }[];
  };
  const publicKey = {
    ...data.publicKey,
    challenge: decode(raw.challenge),
    user: { ...data.publicKey.user, id: decode(raw.user.id) },
    excludeCredentials: raw.excludeCredentials?.map((c) => ({
      ...c,
      id: decode(c.id),
    })),
  } as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error(t("security.keys.cancelled"));
  const response = credential.response as AuthenticatorAttestationResponse;
  await request(`${root}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: credential.id,
      type: credential.type,
      rawId: encode(credential.rawId),
      response: {
        attestationObject: encode(response.attestationObject),
        clientDataJSON: encode(response.clientDataJSON),
        transports: response.getTransports?.(),
      },
      clientExtensionResults: credential.getClientExtensionResults(),
    }),
  });
}
