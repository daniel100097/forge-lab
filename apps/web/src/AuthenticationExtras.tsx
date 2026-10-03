import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { get, native, nativeForm, request, type Bootstrap } from "./api";
import {
  AuthLayout,
  authHeadingClass,
  authLinkClass,
  authTitleClass,
  backLinkClass,
} from "./Auth";
import { Feedback, Pending } from "./UI";
import { uiRoute } from "./routes";
import { loadServerTheme, useColorMode } from "./Theme";
interface CaptchaData {
  enabled: boolean;
  type: string;
  id: string;
  recaptcha_url: string;
  recaptcha_key: string;
  hcaptcha_key: string;
  mcaptcha_url: string;
  mcaptcha_key: string;
  turnstile_key: string;
}
export interface AuthData {
  page: string;
  providers: { name: string; type: string }[];
  registration_enabled: boolean;
  internal_registration: boolean;
  internal_login: boolean;
  openid_enabled: boolean;
  password_min_length: number;
  captcha: CaptchaData;
  DisableRegistration: boolean;
  DisableRegistrationReason: string;
  DisablePassword: boolean;
  ManualActivationOnly: boolean;
  IsSendRegisterMail: boolean;
  ResendLimited: boolean;
  NeedsPassword: boolean;
  IsCodeInvalid: boolean;
  IsPasswordInvalid: boolean;
  ServiceNotEnabled: boolean;
  has_two_factor: boolean;
  HasTwoFactor: boolean;
  Email: string;
  user_email: string;
  email: string;
  user_name: string;
  OpenID: string;
  application: { Name: string; ClientID: string };
  RedirectURI: string;
  State: string;
  Scope: string;
  Nonce: string;
  user_exists?: boolean;
  AllowOnlyInternalRegistration?: boolean;
  /** Set when /user/activate (re)sent the activation email of the signed-in user. */
  IsActivatePage?: boolean;
  ActiveCodeLives?: string;
  signed_user?: { name: string; email: string };
  /** OAuth2 authorization failure without a redirect URI (grant_error). */
  grant_error?: { code: string; description: string };
}
export function Captcha({ data }: { data?: CaptchaData }) {
  const { t } = useTranslation("account");
  const host = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      !data?.enabled ||
      data.type === "image" ||
      data.type === "mcaptcha" ||
      !host.current
    )
      return;
    let active = true;
    const kind =
      data.type === "recaptcha"
        ? "grecaptcha"
        : data.type === "hcaptcha"
          ? "hcaptcha"
          : "turnstile";
    const key =
      data.type === "recaptcha"
        ? data.recaptcha_key
        : data.type === "hcaptcha"
          ? data.hcaptcha_key
          : data.turnstile_key;
    const globals = window as unknown as Record<
      string,
      {
        render: (el: HTMLElement, args: object) => string;
        remove?: (id: string) => void;
        ready?: (cb: () => void) => void;
      }
    >;
    let widget: string | undefined;
    const render = () => {
      const api = globals[kind];
      if (!active || !api || !host.current) return;
      const run = () => {
        if (active && host.current)
          widget = api.render(host.current, {
            sitekey: key,
            theme:
              document.documentElement.dataset.theme === "dark"
                ? "dark"
                : "light",
            callback: (token: string) => setValue(token),
            "expired-callback": () => setValue(""),
          });
      };
      if (api.ready) api.ready(run);
      else run();
    };
    let script: HTMLScriptElement | undefined;
    if (globals[kind]) render();
    else {
      script = document.createElement("script");
      script.src =
        kind === "grecaptcha"
          ? new URL(
              "api.js?render=explicit",
              data.recaptcha_url.endsWith("/")
                ? data.recaptcha_url
                : data.recaptcha_url + "/",
            ).href
          : kind === "hcaptcha"
            ? "https://js.hcaptcha.com/1/api.js?render=explicit"
            : "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      script.onerror = () => setError(t("auth.captcha.loadFailed"));
      document.head.append(script);
    }
    return () => {
      active = false;
      if (widget) globals[kind]?.remove?.(widget);
      script?.remove();
    };
  }, [data, t]);
  useEffect(() => {
    if (!data?.enabled || data.type !== "mcaptcha") return;
    const origin = new URL(data.mcaptcha_url).origin;
    const handler = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === host.current?.querySelector("iframe")?.contentWindow &&
        event.data?.token
      )
        setValue(event.data.token);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [data]);
  if (!data?.enabled) return null;
  if (data.type === "image")
    return (
      <>
        <input type="hidden" name="img-captcha-id" value={data.id} />
        <button
          className="self-start"
          type="button"
          aria-label={t("auth.captcha.reload")}
          onClick={() => setReload(Date.now())}
        >
          <img
            className="bg-white -scale-x-100"
            alt={t("auth.captcha.characters")}
            src={native(
              `/captcha/${data.id}.png${reload ? "?reload=" + reload : ""}`,
            )}
          />
        </button>
        <label>
          {t("auth.captcha.characters")}
          <input name="img-captcha-response" autoComplete="off" required />
        </label>
      </>
    );
  const field =
    data.type === "recaptcha"
      ? "g-recaptcha-response"
      : data.type === "hcaptcha"
        ? "h-captcha-response"
        : data.type === "mcaptcha"
          ? "m-captcha-response"
          : "cf-turnstile-response";
  return (
    <>
      <div ref={host}>
        {data.type === "mcaptcha" && (
          <iframe
            title={t("auth.captcha.frameTitle")}
            src={`${data.mcaptcha_url.replace(/\/$/, "")}/widget/?sitekey=${encodeURIComponent(data.mcaptcha_key)}`}
            className="h-24 w-full border-0"
          />
        )}
      </div>
      <input type="hidden" name={field} value={value} />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function ProviderSignIn({ data }: { data?: AuthData }) {
  const { t } = useTranslation("account");
  return (
    <>
      {data?.providers?.length ? (
        <div className="workspace-form mt-5">
          <p className="text-center text-sm text-muted">
            {t("auth.providers.orContinueWith")}
          </p>
          {data.providers.map((p) => (
            <a
              className="button"
              href={native(`/user/oauth2/${encodeURIComponent(p.name)}`)}
              key={p.name}
            >
              {p.name}
            </a>
          ))}
        </div>
      ) : null}
      {data?.openid_enabled && (
        <Link className={authLinkClass} to="/login/openid">
          {t("auth.providers.openid")}
        </Link>
      )}
      {data?.registration_enabled && (
        <p className={authLinkClass}>
          <Trans
            t={t}
            i18nKey="auth.providers.register"
            components={{ anchor: <Link to="/register" /> }}
          />
        </p>
      )}
    </>
  );
}
export function AuthenticationExtrasPage() {
  const { t } = useTranslation("account");
  const current = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [scratch, setScratch] = useState(false);
  const [linkTab, setLinkTab] = useState<"signin" | "signup" | null>(null);
  const { applyServerTheme } = useColorMode();
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const endpoints: Record<string, string> = {
    "/register": "/user/sign_up",
    "/recover-account": "/user/recover_account",
    "/activate": "/user/activate",
    "/activate-email": "/user/activate_email",
    "/login/openid": "/user/login/openid",
    "/login/openid/connect": "/user/openid/connect",
    "/login/openid/register": "/user/openid/register",
    "/login/link-account": "/user/link_account",
    "/login/webauthn": "/user/webauthn",
    "/oauth/authorize": "/login/oauth/authorize",
  };
  const endpoint = endpoints[current.pathname] || "/user/sign_up";
  const query = useQuery({
    queryKey: ["auth-extra", endpoint, current.search],
    queryFn: ({ signal }) =>
      request<AuthData & { redirect?: string }>(endpoint + current.search, {
        headers: { "X-Forgejo-UI": "1" },
        signal,
      }).then((r) => r.data),
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Like the native link-account page: registering is offered unless only
  // internal registration is allowed (or registration is disabled), and the
  // sign-in tab is preselected when the external account matches a user.
  const linkSignup =
    !query.data?.AllowOnlyInternalRegistration &&
    !query.data?.DisableRegistration;
  const linkRegister =
    linkSignup && (linkTab ? linkTab === "signup" : !query.data?.user_exists);
  const complete = async (redirect?: string) => {
    const data = await get<Bootstrap>("/-/ui/data/bootstrap");
    client.setQueryData(["bootstrap"], data);
    // The account's Forgejo theme applies after signing in, as natively.
    if (data.user)
      void loadServerTheme()
        .then((theme) => theme && applyServerTheme(theme, true))
        .catch(() => {});
    if (redirect) {
      const url = new URL(redirect, location.origin);
      if (
        url.origin !== location.origin ||
        endpoint === "/login/oauth/authorize"
      ) {
        if (["http:", "https:"].includes(url.protocol))
          location.assign(url.href);
        else throw new Error(t("auth.extras.invalidRedirect"));
      } else navigate(uiRoute(redirect), { replace: true });
    }
  };
  useEffect(() => {
    if (query.data?.redirect) void complete(query.data.redirect);
  }, [query.data?.redirect]);
  const save = useMutation({
    onError: async () => {
      if (query.data?.captcha.enabled) {
        await query.refetch();
        setCaptchaAttempt((v) => v + 1);
      }
    },
    mutationFn: async ({
      form,
      granted,
    }: {
      form: HTMLFormElement;
      granted?: boolean;
    }) => {
      setNotice("");
      const fields = new FormData(form);
      const body = new URLSearchParams();
      fields.forEach((v, k) => body.append(k, String(v)));
      if (granted !== undefined) body.set("granted", String(granted));
      if (scratch) body.set("scratch_code", "true");
      const path =
        endpoint === "/user/link_account"
          ? `/user/link_account_${linkRegister ? "signup" : "signin"}`
          : endpoint === "/login/oauth/authorize"
            ? "/login/oauth/grant"
            : endpoint;
      const { data } = await request<AuthData & { redirect?: string }>(
        path + current.search,
        {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );
      if (data.IsCodeInvalid) throw new Error(t("auth.extras.invalidLink"));
      if (data.IsPasswordInvalid)
        throw new Error(t("auth.extras.incorrectPassword"));
      if (data.ResendLimited) throw new Error(t("auth.extras.resendLimited"));
      if (data.redirect) await complete(data.redirect);
      else if (data.ManualActivationOnly)
        setNotice(t("auth.extras.manualActivation"));
      else if (data.IsSendRegisterMail) setNotice(t("auth.extras.checkEmail"));
      else {
        client.setQueryData(["auth-extra", endpoint, current.search], data);
        setNotice(t("auth.extras.received"));
      }
    },
  });
  // Native activation: posting to /user/activate (optionally with a new
  // address) redirects to the GET handler, which sends the activation email.
  const activation = useMutation({
    mutationFn: async (email?: string) => {
      setNotice("");
      await nativeForm("/user/activate", email ? { email } : {});
      await query.refetch();
    },
  });
  const webauthn = useMutation({
    mutationFn: async () => {
      if (!window.PublicKeyCredential)
        throw new Error(t("auth.extras.webauthnUnsupported"));
      const { data } = await request<{ publicKey: Record<string, unknown> }>(
        "/user/webauthn/assertion",
      );
      const raw = data.publicKey as {
        challenge: string;
        allowCredentials?: { id: string; type: "public-key" }[];
      };
      const decode = (v: string) =>
        Uint8Array.from(
          atob(v.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        );
      const encode = (v: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(v)))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/, "");
      const cred = (await navigator.credentials.get({
        publicKey: {
          ...data.publicKey,
          challenge: decode(raw.challenge),
          allowCredentials: raw.allowCredentials?.map((c) => ({
            ...c,
            id: decode(c.id),
          })),
        } as PublicKeyCredentialRequestOptions,
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error(t("auth.extras.webauthnCancelled"));
      const response = cred.response as AuthenticatorAssertionResponse;
      const { data: result } = await request<{ redirect: string }>(
        "/user/webauthn/assertion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forgejo-UI": "1" },
          body: JSON.stringify({
            id: cred.id,
            rawId: encode(cred.rawId),
            type: cred.type,
            response: {
              authenticatorData: encode(response.authenticatorData),
              clientDataJSON: encode(response.clientDataJSON),
              signature: encode(response.signature),
              userHandle: response.userHandle
                ? encode(response.userHandle)
                : null,
            },
            clientExtensionResults: cred.getClientExtensionResults(),
          }),
        },
      );
      await complete(result.redirect);
    },
  });
  const titles: Record<string, string> = {
    "/register": t("auth.extras.titles.register"),
    "/recover-account": t("auth.extras.titles.recoverAccount"),
    "/activate": t("auth.extras.titles.activate"),
    "/activate-email": t("auth.extras.titles.activateEmail"),
    "/login/openid": t("auth.extras.titles.openid"),
    "/login/openid/connect": t("auth.extras.titles.openidConnect"),
    "/login/openid/register": t("auth.extras.titles.openidRegister"),
    "/login/link-account": t("auth.extras.titles.linkAccount"),
    "/login/webauthn": t("auth.extras.titles.webauthn"),
    "/oauth/authorize": t("auth.extras.titles.authorize"),
  };
  const d = query.data;
  const register =
    current.pathname === "/register" ||
    current.pathname.endsWith("/openid/register") ||
    (current.pathname === "/login/link-account" && linkRegister);
  const username =
    register ||
    ["/login/openid/connect", "/login/link-account"].includes(current.pathname);
  const password =
    current.pathname === "/recover-account" ||
    (current.pathname === "/activate" && d?.NeedsPassword) ||
    (username &&
      !current.pathname.endsWith("/openid/register") &&
      !(register && d?.DisablePassword));
  const consent = current.pathname === "/oauth/authorize";
  return (
    <AuthLayout>
      <Link className={backLinkClass} to="/login">
        {t("auth.backToSignIn")}
      </Link>
      <div className={authHeadingClass}>
        <h2 className={authTitleClass}>{titles[current.pathname]}</h2>
      </div>
      <Feedback
        error={query.error || save.error || webauthn.error || activation.error}
      />
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <Pending />
      ) : d?.IsCodeInvalid ? (
        <p role="alert">{t("auth.extras.invalidLink")}</p>
      ) : d?.grant_error ? (
        <div className="form-error" role="alert">
          <strong className="block">{t("auth.extras.consent.failed")}</strong>
          <p className="mt-1">{d.grant_error.description}</p>
          <p className="mt-2 text-xs opacity-80">
            {t("auth.extras.consent.failedHelp")}
          </p>
        </div>
      ) : current.pathname === "/activate" && d?.IsActivatePage ? (
        <div className="workspace-form">
          <p className="text-sm leading-6">
            {d.ServiceNotEnabled ? (
              t("auth.activation.disabled")
            ) : d.ResendLimited ? (
              t("auth.activation.limited")
            ) : (
              <Trans
                t={t}
                i18nKey="auth.activation.sent"
                values={{
                  email: d.signed_user?.email || "",
                  lives: d.ActiveCodeLives || "",
                }}
                components={{
                  email: <strong className="[overflow-wrap:anywhere]" />,
                }}
              />
            )}
          </p>
          {!d.ServiceNotEnabled && (
            <>
              <button
                type="button"
                className="button primary"
                disabled={activation.isPending}
                onClick={() => activation.mutate(undefined)}
              >
                {t("auth.activation.resend")}
              </button>
              <details className="text-sm">
                <summary className="cursor-pointer">
                  {t("auth.activation.changeSummary")}
                </summary>
                <form
                  className="workspace-form mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = String(
                      new FormData(e.currentTarget).get("email") || "",
                    ).trim();
                    if (email) activation.mutate(email);
                  }}
                >
                  <p className="text-muted">
                    {t("auth.activation.changeDescription")}
                  </p>
                  <label>
                    {t("auth.email")}
                    <input name="email" type="email" required />
                  </label>
                  <button
                    className="button self-start"
                    disabled={activation.isPending}
                  >
                    {t("auth.activation.changeSubmit")}
                  </button>
                </form>
              </details>
            </>
          )}
        </div>
      ) : d?.DisableRegistration && register ? (
        <p>
          {d.DisableRegistrationReason || t("auth.extras.registrationDisabled")}
        </p>
      ) : (
        d && (
          <>
            {current.pathname === "/login/webauthn" ? (
              <div className="workspace-form">
                <p>{t("auth.extras.webauthnHint")}</p>
                <button
                  className="button primary"
                  disabled={webauthn.isPending}
                  onClick={() => webauthn.mutate()}
                >
                  {t("auth.extras.useSecurityKey")}
                </button>
                {d.HasTwoFactor && (
                  <Link to="/login/two-factor">
                    {t("auth.extras.useAuthenticatorCode")}
                  </Link>
                )}
                <Link to="/login/recovery">
                  {t("auth.extras.useRecoveryCode")}
                </Link>
              </div>
            ) : (
              <form
                className="workspace-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ form: e.currentTarget });
                }}
              >
                {current.pathname === "/login/link-account" && linkSignup && (
                  <div
                    className="tabs -mt-2"
                    role="tablist"
                    aria-label={t("auth.extras.linkOptions")}
                  >
                    {(
                      [
                        ["signin", t("auth.extras.existingAccount")],
                        ["signup", t("auth.extras.newAccount")],
                      ] as const
                    ).map(([tab, label]) => {
                      const active = (tab === "signup") === linkRegister;
                      return (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={active ? "active" : ""}
                          onClick={() => setLinkTab(tab)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {current.pathname.startsWith("/login/openid/") && (
                  <nav
                    className="tabs -mt-2"
                    aria-label={t("auth.extras.openidOptions")}
                  >
                    {(
                      [
                        [
                          "/login/openid/connect",
                          t("auth.extras.existingAccount"),
                        ],
                        ...(d.registration_enabled
                          ? [
                              [
                                "/login/openid/register",
                                t("auth.extras.newAccount"),
                              ],
                            ]
                          : []),
                      ] as [string, string][]
                    ).map(([to, label]) => (
                      <Link
                        key={to}
                        to={to}
                        className={current.pathname === to ? "active" : ""}
                        aria-current={
                          current.pathname === to ? "page" : undefined
                        }
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                )}
                {username && (
                  <label>
                    {register ? t("auth.username") : t("auth.usernameOrEmail")}
                    <input
                      name="user_name"
                      autoComplete="username"
                      defaultValue={d.user_name || ""}
                      required
                    />
                  </label>
                )}
                {register && (
                  <label>
                    {t("auth.email")}
                    <input
                      name="email"
                      type="email"
                      defaultValue={d.email || ""}
                      required
                    />
                  </label>
                )}
                {current.pathname === "/login/openid" && (
                  <>
                    <p className="text-sm leading-6 text-muted">
                      {t("auth.extras.openidDescription")}
                    </p>
                    <label>
                      {t("auth.extras.openidUri")}
                      <input
                        name="openid"
                        required
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="alice.openid.example.org"
                      />
                    </label>
                    <label className="check-field">
                      <input type="checkbox" name="remember" value="on" />
                      {t("auth.rememberDevice")}
                    </label>
                  </>
                )}
                {d.OpenID && (
                  <p>{t("auth.extras.connecting", { openid: d.OpenID })}</p>
                )}
                {password && (
                  <label>
                    {current.pathname === "/recover-account"
                      ? t("auth.newPassword")
                      : t("auth.password")}
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        register || current.pathname === "/recover-account"
                          ? "new-password"
                          : "current-password"
                      }
                      minLength={
                        register || current.pathname === "/recover-account"
                          ? d.password_min_length
                          : undefined
                      }
                      required
                    />
                  </label>
                )}
                {register && password && (
                  <label>
                    {t("auth.confirmPassword")}
                    <input
                      name="retype"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}
                {d.has_two_factor && (
                  <>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={scratch}
                        onChange={(e) => setScratch(e.target.checked)}
                      />
                      {t("auth.extras.useRecoveryCode")}
                    </label>
                    <label>
                      {scratch
                        ? t("auth.recoveryCode")
                        : t("auth.authenticationCode")}
                      <input
                        name={scratch ? "token" : "passcode"}
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                  </>
                )}
                {current.pathname === "/activate" && !d.NeedsPassword && (
                  <p>
                    {d.ManualActivationOnly || d.ServiceNotEnabled
                      ? t("auth.extras.adminActivation")
                      : d.IsSendRegisterMail
                        ? t("auth.extras.checkEmail")
                        : t("auth.extras.invalidLink")}
                  </p>
                )}
                {consent && (
                  <>
                    <p>
                      <Trans
                        t={t}
                        i18nKey="auth.extras.consent.request"
                        values={{ name: d.application.Name }}
                        components={{ app: <strong /> }}
                      />
                    </p>
                    <p className="text-sm text-muted">
                      {t("auth.extras.consent.redirect", {
                        uri: d.RedirectURI,
                      })}
                    </p>
                    <p>
                      <Trans
                        t={t}
                        i18nKey="auth.extras.consent.scope"
                        values={{
                          scope:
                            d.Scope || t("auth.extras.consent.basicAccess"),
                        }}
                        components={{ code: <code /> }}
                      />
                    </p>
                    {Object.entries({
                      client_id: d.application.ClientID,
                      redirect_uri: d.RedirectURI,
                      state: d.State,
                      scope: d.Scope,
                      nonce: d.Nonce,
                    }).map(([name, value]) => (
                      <input
                        type="hidden"
                        name={name}
                        value={value || ""}
                        key={name}
                      />
                    ))}
                    <div className="flex gap-2">
                      <button
                        className="button primary"
                        type="button"
                        disabled={save.isPending}
                        onClick={(e) =>
                          save.mutate({
                            form: e.currentTarget.form!,
                            granted: true,
                          })
                        }
                      >
                        {t("auth.extras.consent.authorize")}
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={save.isPending}
                        onClick={(e) =>
                          save.mutate({
                            form: e.currentTarget.form!,
                            granted: false,
                          })
                        }
                      >
                        {t("auth.extras.consent.deny")}
                      </button>
                    </div>
                  </>
                )}
                <Captcha key={captchaAttempt} data={d.captcha} />
                {!consent &&
                  !d.ManualActivationOnly &&
                  !d.ServiceNotEnabled &&
                  !(current.pathname === "/activate" && !d.NeedsPassword) && (
                    <button
                      className="button primary"
                      disabled={save.isPending}
                    >
                      {register
                        ? t("auth.extras.submit.register")
                        : current.pathname === "/recover-account"
                          ? t("auth.extras.submit.reset")
                          : t("auth.extras.submit.continue")}
                    </button>
                  )}
              </form>
            )}
            {register && (
              <ProviderSignIn data={{ ...d, registration_enabled: false }} />
            )}
          </>
        )
      )}
    </AuthLayout>
  );
}
