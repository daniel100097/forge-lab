import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  GitFork,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { Captcha, ProviderSignIn, type AuthData } from "./AuthenticationExtras";
import { get, nativePage, nativeForm, uiBase, type Bootstrap } from "./api";
import { uiRoute } from "./routes";
import { SelectControl } from "./SelectControl";
import { uiLanguage } from "./i18n";
import { loadServerTheme, useColorMode } from "./Theme";
import { useTranslation } from "react-i18next";

// Shared by the sign-in, registration and verification screens.
export const authHeadingClass = "mb-6";
export const authTitleClass = "mb-2 text-xl";
export const authLinkClass = "text-sm text-primary hover:underline";
export const backLinkClass =
  "mb-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline";
const authNoticeClass =
  "my-4 rounded border border-[#a4c5e8] bg-info-bg p-4 text-sm leading-6 text-[#244b71] dark:border-[#426c96] dark:text-[#a3cbf5]";
const authDescriptionClass = "text-sm leading-6 text-muted";

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("account");
  return (
    <main className="flex min-h-screen flex-col items-center bg-white px-6 py-8 max-md:px-4 dark:bg-surface">
      <Link
        to="/projects"
        className="flex items-center gap-2 text-xl font-semibold"
      >
        <GitFork size={34} className="text-[#e86327]" />
        <span>Forgejo</span>
      </Link>
      <section className="mt-12 w-full max-w-96 max-md:mt-8">
        <div className="rounded border border-line p-6 max-md:p-5">
          {children}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted">
          <LockKeyhole size={13} /> {t("auth.tagline")}
        </div>
        <div className="mt-4 flex justify-center">
          <LanguageSwitcher />
        </div>
      </section>
    </main>
  );
}

// Signed-out visitors choose a language through Forgejo's ?lang handling,
// which stores it in the lang cookie for later requests and sign-in.
function LanguageSwitcher() {
  const { t, i18n } = useTranslation("account");
  const client = useQueryClient();
  return (
    <SelectControl
      label={t("auth.language")}
      className="min-h-7 border-transparent bg-transparent px-2 text-xs text-muted"
      value={uiLanguage(i18n.language)}
      options={[
        { value: "en", label: "English" },
        { value: "de", label: "Deutsch" },
      ]}
      onValueChange={async (value) => {
        await get(
          `/-/ui/data/bootstrap?lang=${value === "de" ? "de-DE" : "en-US"}`,
        );
        await client.invalidateQueries({ queryKey: ["bootstrap"] });
      }}
    />
  );
}

export function AuthPage({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("account");
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const mode =
    location.pathname === "/forgot-password"
      ? "forgot"
      : location.pathname.split("/")[2] || "login";
  const authOptions = useQuery({
    queryKey: ["auth-login-options"],
    queryFn: ({ signal }) => nativePage<AuthData>("/user/login", signal),
    enabled: mode === "login" && !bootstrap.user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const { applyServerTheme } = useColorMode();
  // Like native Forgejo, the account's theme applies once signed in.
  const syncTheme = () =>
    void loadServerTheme()
      .then((theme) => theme && applyServerTheme(theme, true))
      .catch(() => {});
  useEffect(() => {
    document.title = `${mode === "forgot" ? t("auth.documentTitle.forgot") : mode === "login" ? t("auth.documentTitle.login") : t("auth.documentTitle.verification")} · ${bootstrap.app_name}`;
  }, [mode, bootstrap.app_name, t]);
  const refresh = async () => {
    const data = await get<Bootstrap>("/-/ui/data/bootstrap");
    client.setQueryData(["bootstrap"], data);
    return data;
  };
  useEffect(() => {
    if (mode !== "login" || bootstrap.user) return;
    let active = true;
    // Run Forgejo's normal remember-device check; never recreate it in the SPA.
    void nativeForm("/user/login")
      .then(async (result) => {
        if (result.redirect && active) {
          const data = await get<Bootstrap>("/-/ui/data/bootstrap");
          if (active) client.setQueryData(["bootstrap"], data);
          if (data.user) syncTheme();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode, bootstrap.user, client]);
  const submit = useMutation({
    onError: async () => {
      if (authOptions.data?.captcha.enabled) {
        await authOptions.refetch();
        setCaptchaAttempt((v) => v + 1);
      }
    },
    mutationFn: async (values: Record<string, string>) => {
      const endpoint = (
        {
          login: "/user/login",
          "two-factor": "/user/two_factor",
          recovery: "/user/two_factor/scratch",
          password: "/user/settings/change_password",
          forgot: "/user/forgot_password",
        } as Record<string, string>
      )[mode];
      if (!endpoint) throw new Error(t("auth.errors.unavailable"));
      const result = await nativeForm(endpoint, values);
      if (result.reset_sent) {
        setNotice(t("auth.resetSent"));
        return;
      }
      if (result.resend_limited) throw new Error(t("auth.errors.resetLimited"));
      if (!result.redirect)
        throw new Error(
          result.page?.includes("prohibit")
            ? t("auth.errors.prohibited")
            : t("auth.errors.failed"),
        );
      const data = await refresh();
      if (data.user) syncTheme();
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "bootstrap",
      });
      const next = params.get("next");
      navigate(
        data.user &&
          next?.startsWith("/") &&
          !next.startsWith("//") &&
          !next.startsWith("/login")
          ? next
          : uiRoute(result.redirect),
        { replace: true },
      );
    },
  });
  useEffect(() => {
    submit.reset();
    setNotice("");
  }, [mode]); // reset form feedback when changing auth steps
  if (bootstrap.user) return <Navigate to="/projects" replace />;
  const titles: Record<string, string> = {
    login: t("auth.titles.login"),
    "two-factor": t("auth.titles.twoFactor"),
    recovery: t("auth.titles.recovery"),
    password: t("auth.titles.password"),
    forgot: t("auth.titles.forgot"),
  };
  const descriptions: Record<string, string> = {
    login: t("auth.descriptions.login"),
    "two-factor": t("auth.descriptions.twoFactor"),
    recovery: t("auth.descriptions.recovery"),
    password: t("auth.descriptions.password"),
    forgot: t("auth.descriptions.forgot"),
  };
  return (
    <AuthLayout>
      {bootstrap.flash_error && (
        <div className="form-error" role="alert">
          {bootstrap.flash_error}
        </div>
      )}
      {mode !== "login" && (
        <Link className={backLinkClass} to="/login">
          <ArrowLeft size={14} /> {t("auth.backToSignIn")}
        </Link>
      )}
      <div className={authHeadingClass}>
        <span className="mb-2 block text-sm font-medium text-muted">
          {bootstrap.app_name}
        </span>
        <h2 className={authTitleClass}>
          {titles[mode] || t("auth.titles.verification")}
        </h2>
        <p className={authDescriptionClass}>{descriptions[mode]}</p>
      </div>
      {mode === "forgot" && !bootstrap.auth.password_reset ? (
        <div className={authNoticeClass}>{t("auth.recoveryDisabled")}</div>
      ) : mode === "login" && !bootstrap.auth.internal_login ? (
        <div className={authNoticeClass}>{t("auth.chooseProvider")}</div>
      ) : !titles[mode] ? (
        <div className={authNoticeClass}>{t("auth.invalidLink")}</div>
      ) : (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            submit.mutate(Object.fromEntries(data) as Record<string, string>);
          }}
          key={mode}
        >
          {submit.error && (
            <div className="form-error" role="alert">
              {submit.error.message}
            </div>
          )}
          {notice && (
            <div className="form-success" role="status">
              {notice}
            </div>
          )}
          {mode === "login" && (
            <label>
              {t("auth.usernameOrEmail")}
              <input
                name="user_name"
                autoComplete="username"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </label>
          )}
          {(mode === "login" || mode === "password") && (
            <>
              <label>
                {mode === "password"
                  ? t("auth.newPassword")
                  : t("auth.password")}
                <div className="relative">
                  <input
                    className="pr-10"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "password" ? "new-password" : "current-password"
                    }
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-1 flex items-center border-0 bg-transparent px-2 text-muted"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {mode === "password" && (
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
            </>
          )}
          {mode === "login" && (
            <div className="flex items-center justify-between gap-2">
              <label className="check-field">
                <input type="checkbox" name="remember" value="on" />
                {t("auth.rememberDevice")}
              </label>
              <Link className={authLinkClass} to="/forgot-password">
                {t("auth.forgotPassword")}
              </Link>
            </div>
          )}
          {mode === "forgot" && (
            <label>
              {t("auth.email")}
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                autoFocus
              />
            </label>
          )}
          {mode === "two-factor" && (
            <label>
              {t("auth.authenticationCode")}
              <input
                name="passcode"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                required
                autoFocus
              />
            </label>
          )}
          {mode === "recovery" && (
            <label>
              {t("auth.recoveryCode")}
              <input name="token" autoComplete="off" required autoFocus />
            </label>
          )}
          {mode === "login" && (
            <Captcha key={captchaAttempt} data={authOptions.data?.captcha} />
          )}
          <button className="button primary w-full" disabled={submit.isPending}>
            {submit.isPending ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : null}
            {mode === "login"
              ? t("auth.submit.login")
              : mode === "forgot"
                ? t("auth.submit.forgot")
                : mode === "password"
                  ? t("auth.submit.password")
                  : t("auth.submit.verify")}
            <ArrowRight size={17} />
          </button>
          {mode === "two-factor" && (
            <Link className={authLinkClass} to="/login/recovery">
              {t("auth.useRecoveryInstead")}
            </Link>
          )}
        </form>
      )}
      {mode === "login" && <ProviderSignIn data={authOptions.data} />}
      <Link
        className="mt-6 flex items-center justify-center gap-2 text-sm text-primary hover:underline"
        to="/projects"
      >
        {t("auth.exploreProjects")} <ArrowRight size={14} />
      </Link>
    </AuthLayout>
  );
}

export function AccountRestriction({ state }: { state: string }) {
  const { t } = useTranslation("account");
  const [error, setError] = useState("");
  return (
    <AuthLayout>
      <div className={authHeadingClass}>
        <h2 className={authTitleClass}>{t("auth.restriction.title")}</h2>
        <p className={authDescriptionClass}>
          {state === "security_setup"
            ? t("auth.restriction.securitySetup")
            : t("auth.restriction.inactive")}
        </p>
      </div>
      {state === "inactive" && (
        <Link className="button primary mb-4" to="/activate">
          {t("auth.restriction.activate")}
        </Link>
      )}
      {state === "security_setup" && (
        <Link className="button primary mb-4" to="/account/security">
          {t("auth.restriction.setUp")}
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="button"
        onClick={() =>
          void nativeForm("/user/logout", {})
            .then(() => location.assign(`${uiBase}/login`))
            .catch((e) => setError(e.message))
        }
      >
        {t("auth.restriction.signOut")}
      </button>
    </AuthLayout>
  );
}
