import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { get, native, nativePage, uiBase, type Bootstrap } from "./api";
import { AuthLayout } from "./Auth";
import { SelectControl } from "./SelectControl";
import { Feedback, Pending } from "./UI";
interface InstallData {
  database_types: { type: string; name: string }[];
  database_type: string;
  password_algorithms: string[];
  fields: Record<string, string | number | boolean | null>;
}
export function Installer() {
  const { t } = useTranslation("shell");
  const [complete, setComplete] = useState(
    new URLSearchParams(location.search).has("complete"),
  );
  const [db, setDb] = useState("");
  const [waiting, setWaiting] = useState(false);
  // Set when the database was used by Forgejo before (native reinstall check).
  const [reinstall, setReinstall] = useState(false);
  const [adminName, setAdminName] = useState("");
  const query = useQuery({
    queryKey: ["install-options"],
    queryFn: ({ signal }) => nativePage<InstallData>("/", signal),
    enabled: !complete,
    retry: false,
  });
  const install = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const response = await fetch(native("/"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
          Object.fromEntries(new FormData(form)) as Record<string, string>,
        ),
      });
      const result = (await response.json().catch(() => ({}))) as {
        installed?: boolean;
        errorMessage?: string;
        reinstall_required?: boolean;
      };
      if (result.reinstall_required) setReinstall(true);
      if (result.installed) setComplete(true);
      else throw new Error(result.errorMessage || t("installer.failed"));
    },
  });
  useEffect(() => {
    if (!complete) return;
    let active = true;
    const timer = setInterval(() => {
      void get<Bootstrap>("/-/ui/data/bootstrap")
        .then((data) => {
          if (active && !data.install)
            location.assign(`${uiBase}/${data.user ? "projects" : "login"}`);
        })
        .catch(() => {
          if (active) setWaiting(true);
        });
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [complete]);
  const input = (
    name: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={String(query.data?.fields[name] ?? "")}
        required={required}
        autoComplete={type === "password" ? "new-password" : undefined}
      />
    </label>
  );
  const toggle = (name: string, label: string) => (
    <label key={name} className="check-field">
      <input
        name={name}
        type="checkbox"
        defaultChecked={!!query.data?.fields[name]}
      />
      {label}
    </label>
  );
  const database = db || query.data?.database_type || "sqlite3";
  return (
    <AuthLayout>
      <div className="mb-6">
        <h2 className="mb-2 text-xl">
          {complete ? t("installer.startingTitle") : t("installer.setupTitle")}
        </h2>
        <p className="text-sm leading-6 text-muted">
          {complete ? t("installer.startingBody") : t("installer.setupBody")}
        </p>
      </div>
      <Feedback error={query.error || install.error} />
      {complete ? (
        <>
          <Pending />
          <p role="status">{waiting ? t("installer.waiting") : ""}</p>
        </>
      ) : query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              install.mutate(e.currentTarget);
            }}
          >
            <h3>{t("installer.sections.database")}</h3>
            <SelectControl
              label={t("installer.fields.dbType")}
              name="db_type"
              value={database}
              onValueChange={setDb}
              options={query.data.database_types.map((v) => ({
                value: v.type,
                label: v.name,
              }))}
            />
            {database === "sqlite3" ? (
              input("db_path", t("installer.fields.dbPath"), "text", true)
            ) : (
              <>
                {input("db_host", t("installer.fields.dbHost"), "text", true)}
                {input("db_name", t("installer.fields.dbName"), "text", true)}
                {input("db_user", t("installer.fields.dbUser"), "text", true)}
                {input(
                  "db_passwd",
                  t("installer.fields.dbPassword"),
                  "password",
                )}
                {database === "postgres" &&
                  input("db_schema", t("installer.fields.dbSchema"))}
                <SelectControl
                  name="ssl_mode"
                  label={t("installer.fields.sslMode")}
                  defaultValue={String(query.data.fields.ssl_mode || "disable")}
                  options={[
                    "disable",
                    "require",
                    "verify-ca",
                    "verify-full",
                  ].map((v) => ({ value: v, label: v }))}
                />
              </>
            )}
            <h3>{t("installer.sections.instance")}</h3>
            {input("app_name", t("installer.fields.appName"), "text", true)}
            {input("app_slogan", t("installer.fields.appSlogan"))}
            {input("domain", t("installer.fields.domain"), "text", true)}
            {input("app_url", t("installer.fields.appUrl"), "url", true)}
            {input("http_port", t("installer.fields.httpPort"), "number", true)}
            {input("ssh_port", t("installer.fields.sshPort"), "number")}
            {input(
              "repo_root_path",
              t("installer.fields.repoRoot"),
              "text",
              true,
            )}
            {input("lfs_root_path", t("installer.fields.lfsRoot"))}
            {input("run_user", t("installer.fields.runUser"), "text", true)}
            {input(
              "log_root_path",
              t("installer.fields.logRoot"),
              "text",
              true,
            )}
            <h3>{t("installer.sections.administrator")}</h3>
            <p className="-mt-2 text-sm leading-6 text-muted">
              {t("installer.adminOptional")}
            </p>
            <label>
              {t("installer.fields.adminName")}
              <input
                name="admin_name"
                autoComplete="username"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
              />
            </label>
            {/* Like native, the account is optional; its fields are needed once a name is given. */}
            {input(
              "admin_email",
              t("installer.fields.adminEmail"),
              "email",
              !!adminName.trim(),
            )}
            {input(
              "admin_passwd",
              t("installer.fields.adminPassword"),
              "password",
              !!adminName.trim(),
            )}
            {input(
              "admin_confirm_passwd",
              t("installer.fields.adminConfirm"),
              "password",
              !!adminName.trim(),
            )}
            <details>
              <summary className="font-semibold cursor-pointer">
                {t("installer.sections.advanced")}
              </summary>
              <div className="workspace-form mt-4">
                {input("smtp_addr", t("installer.fields.smtpHost"))}
                {input("smtp_port", t("installer.fields.smtpPort"))}
                {input("smtp_from", t("installer.fields.smtpFrom"))}
                {input("smtp_user", t("installer.fields.smtpUser"))}
                {input(
                  "smtp_passwd",
                  t("installer.fields.smtpPassword"),
                  "password",
                )}
                {[
                  ["register_confirm", t("installer.options.registerConfirm")],
                  ["mail_notify", t("installer.options.mailNotify")],
                  [
                    "disable_registration",
                    t("installer.options.disableRegistration"),
                  ],
                  [
                    "allow_only_external_registration",
                    t("installer.options.externalRegistration"),
                  ],
                  [
                    "require_sign_in_view",
                    t("installer.options.requireSignIn"),
                  ],
                  ["enable_captcha", t("installer.options.captcha")],
                  ["offline_mode", t("installer.options.offline")],
                  ["disable_gravatar", t("installer.options.disableGravatar")],
                  [
                    "enable_federated_avatar",
                    t("installer.options.federatedAvatars"),
                  ],
                  [
                    "enable_open_id_sign_in",
                    t("installer.options.openIdSignIn"),
                  ],
                  [
                    "enable_open_id_sign_up",
                    t("installer.options.openIdSignUp"),
                  ],
                  [
                    "default_keep_email_private",
                    t("installer.options.keepEmailPrivate"),
                  ],
                  [
                    "default_allow_create_organization",
                    t("installer.options.allowCreateOrganization"),
                  ],
                  [
                    "default_enable_timetracking",
                    t("installer.options.timeTracking"),
                  ],
                  [
                    "enable_update_checker",
                    t("installer.options.updateChecker"),
                  ],
                ].map(([name, label]) => toggle(name, label))}
                {input("no_reply_address", t("installer.fields.noReply"))}
                <SelectControl
                  name="password_algorithm"
                  label={t("installer.fields.passwordAlgorithm")}
                  defaultValue={String(
                    query.data.fields.password_algorithm || "pbkdf2",
                  )}
                  options={query.data.password_algorithms.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </div>
            </details>
            {reinstall && (
              <div
                className="flex flex-col gap-3 rounded border border-[#edb8b1] bg-danger-bg p-4 dark:border-[#a34a44]"
                role="group"
                aria-label={t("installer.reinstall.title")}
              >
                <strong className="text-sm">
                  {t("installer.reinstall.title")}
                </strong>
                <p className="text-sm leading-6 font-normal">
                  {t("installer.reinstall.message")}
                </p>
                {(
                  [
                    ["reinstall_confirm_first", t("installer.reinstall.first")],
                    [
                      "reinstall_confirm_second",
                      t("installer.reinstall.second"),
                    ],
                    ["reinstall_confirm_third", t("installer.reinstall.third")],
                  ] as const
                ).map(([name, label]) => (
                  <label
                    key={name}
                    className="check-field items-start leading-6"
                  >
                    <input
                      className="mt-1 shrink-0"
                      name={name}
                      type="checkbox"
                      required
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <button className="button primary" disabled={install.isPending}>
              {install.isPending
                ? t("installer.installing")
                : t("installer.install")}
            </button>
          </form>
        )
      )}
    </AuthLayout>
  );
}
