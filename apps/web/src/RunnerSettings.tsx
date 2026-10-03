import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { nativeForm, nativePage, type FormResult } from "./api";
import { uiRoute } from "./routes";
import { CopyButton, Feedback, Pagination, Pending, relativeDate } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  SettingsDelete,
  SettingsFields,
  SettingsSection,
  settingsActions,
  settingsConfirm,
  settingsEmpty,
  settingsFormClass,
  settingsList,
  settingsRow,
  settingsRowBody,
  settingsSubmit,
  settingsToken,
  settingsTokenCode,
  settingsToolbar,
} from "./ProjectSettings";

interface Runner {
  id: number;
  uuid: string;
  name: string;
  description: string;
  version: string;
  labels: string[];
  status: string;
  scope: string;
  owner_type?: string;
  owner_name?: string;
  editable: boolean;
  last_online: string;
  last_active: string;
  created: string;
  ephemeral: boolean;
}
interface RunnerTask {
  id: number;
  status: number;
  name?: string;
  run_id?: number;
  started: string;
  stopped: string;
  is_stopped?: boolean;
  commit_sha?: string;
  run_link?: string;
  repo_name?: string;
  repo_link?: string;
  commit_link?: string;
}
interface RunnerData {
  page: string;
  items?: Runner[];
  runner?: Runner;
  total?: number;
  page_size?: number;
  registration_token?: string;
  token?: string;
  app_url: string;
  admin_page?: boolean;
  keyword?: string;
  sort?: string;
  tasks?: RunnerTask[];
}

// Snippets that are not the runner configuration; the configuration block
// keeps the `configuration-token` hook used by browser tests.
const snippet =
  "my-3 flex items-start gap-3 rounded-md border border-line bg-code p-3";
const snippetCode =
  "min-w-0 flex-1 font-mono text-xs leading-6 break-all whitespace-pre-wrap";
const docsLink = "https://forgejo.org/docs/latest/admin/actions/";

const taskStatuses = [
  "unknown",
  "success",
  "failure",
  "cancelled",
  "skipped",
  "waiting",
  "running",
  "blocked",
] as const;
const runnerStates = ["offline", "idle", "active", "unspecified"] as const;
const runnerScopes = ["Project", "Namespace", "Instance"] as const;
const ownerTypes = [
  "repository",
  "organization",
  "individual",
  "system-global",
] as const;
// Forgejo reports runner states and built-in scopes as English identifiers;
// other values (owner or repository names) are shown as they are.
function runnerStatus(t: TFunction<"settings">, status: string) {
  const state = runnerStates.find((value) => value === status);
  return state ? t(`runners.states.${state}`) : status;
}
/** The native "Type" column: repository, organization, user or global. */
function runnerType(t: TFunction<"settings">, runner: Runner) {
  const type = ownerTypes.find((value) => value === runner.owner_type);
  if (type) return t(`runners.types.${type}`);
  const known = runnerScopes.find((value) => value === runner.scope);
  return known ? t(`runners.scopes.${known}`) : runner.scope;
}
function StatusDot({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={
        status === "active" || status === "idle"
          ? "size-2.5 shrink-0 rounded-full bg-[#108548]"
          : "size-2.5 shrink-0 rounded-full bg-muted"
      }
      title={label}
    />
  );
}
function Snippet({ value, label }: { value: string; label: string }) {
  return (
    <div className={snippet}>
      <code className={snippetCode} aria-label={label}>
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/** Runner list, details, creation and setup shared by every settings scope. */
export function RunnerSettings({
  nativeRoot,
  uiRoot,
  section,
}: {
  nativeRoot: string;
  uiRoot: string;
  section: string;
}) {
  const { t } = useTranslation("settings");
  const [params, setParams] = useSearchParams(),
    page = Math.max(1, Number(params.get("page")) || 1),
    keyword = params.get("q") || "",
    sort = params.get("sort") || "";
  const path = `${nativeRoot}/actions/${section}`,
    listRoot = `${uiRoot}/actions/runners`,
    isList = section === "runners";
  const search = new URLSearchParams({ page: String(page) });
  if (isList && keyword) search.set("q", keyword);
  if (isList && sort) search.set("sort", sort);
  const query = useQuery({
    queryKey: ["configuration-runners", path, search.toString()],
    queryFn: ({ signal }) =>
      nativePage<RunnerData>(`${path}?${search}`, signal),
  });
  const [setup, setSetup] = useState<RunnerData>();
  const [showRegistration, setShowRegistration] = useState(false);
  const [resetRegistration, setResetRegistration] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (values: Record<string, string>) =>
      settingsSubmit<RunnerData & FormResult>(path, values),
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ["configuration-runners"] });
      if (data.token) setSetup(data);
      else if (data.redirect) navigate(uiRoute(data.redirect));
      else navigate(listRoot);
    },
  });
  const reset = useMutation({
    mutationFn: () =>
      nativeForm(`${nativeRoot}/actions/runners/reset_registration_token`),
    onSuccess: async () => {
      setResetRegistration(false);
      setShowRegistration(true);
      await client.invalidateQueries({ queryKey: ["configuration-runners"] });
    },
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!,
    runner = data.runner;
  const admin = data.admin_page ?? nativeRoot === "/admin";
  if (setup?.token) {
    const uuid = setup.runner?.uuid || "";
    const configuration = `server:\n  connections:\n    forgejo:\n      url: ${JSON.stringify(setup.app_url)}\n      uuid: ${JSON.stringify(uuid)}\n      token: ${JSON.stringify(setup.token)}\nrunner:\n  labels:\n    - "docker:docker://node:lts"\n`;
    const options = `$ echo -n "${setup.token}" > /path/to/runner-token\n$ forgejo-runner daemon \\\n\t--url ${setup.app_url} \\\n\t--uuid ${uuid} \\\n\t--token-url file:///path/to/runner-token \\\n\t--label docker:docker://node:lts\n`;
    return (
      <SettingsSection
        title={t("runners.registerTitle")}
        description={t("runners.registerDescription")}
        open
      >
        <dl className="mb-5 grid max-w-[720px] gap-3">
          {[
            [t("runners.uuid"), uuid, t("runners.copyUuid")],
            [t("runners.token"), setup.token, t("runners.copyRunnerToken")],
          ].map(([label, value, copy]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd>
                <Snippet value={value} label={copy} />
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-2 text-base font-semibold">
          {t("runners.usingConfiguration")}
        </h3>
        <p className="mt-2">
          <Trans
            t={t}
            i18nKey="runners.saveConfig"
            values={{ file: "config.yaml" }}
            components={{ code: <code /> }}
          />
        </p>
        <div className={settingsToken}>
          <code className={settingsTokenCode}>{configuration}</code>
          <CopyButton value={configuration} label={t("runners.copyConfig")} />
        </div>
        <p>
          <Trans
            t={t}
            i18nKey="runners.connectionName"
            values={{ name: "forgejo" }}
            components={{ code: <code /> }}
          />
        </p>
        <p className="mt-2">
          <Trans
            t={t}
            i18nKey="runners.start"
            values={{ command: "forgejo-runner --config config.yaml daemon" }}
            components={{ code: <code /> }}
          />
        </p>
        <h3 className="mt-6 text-base font-semibold">
          {t("runners.usingOptions")}
        </h3>
        <Snippet value={options} label={t("runners.copyCommand")} />
        <p className="mb-5">
          <Trans
            t={t}
            i18nKey="runners.advancedDocs"
            components={{
              anchor: (
                <a
                  className="text-primary hover:underline"
                  href={docsLink}
                  target="_blank"
                  rel="noreferrer"
                />
              ),
            }}
          />
        </p>
        <div className={settingsActions}>
          <button
            className="button primary"
            onClick={() => {
              setSetup(undefined);
              navigate(listRoot);
            }}
          >
            {t("runners.finish")}
          </button>
        </div>
      </SettingsSection>
    );
  }
  if (data.page === "create" || data.page === "edit")
    return (
      <SettingsSection
        title={
          runner
            ? t("runners.editTitle", { id: runner.id })
            : t("runners.newTitle")
        }
        description={t("runners.formDescription")}
        open
      >
        <form
          className={settingsFormClass}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<
                string,
                string
              >,
            );
          }}
        >
          <SettingsFields
            fields={[
              {
                name: "runner_name",
                label: t("runners.name"),
                value: runner?.name || "",
                required: true,
                max: 255,
              },
              {
                name: "runner_description",
                label: t("form.description"),
                type: "textarea",
                value: runner?.description || "",
                max: 255,
              },
              ...(runner
                ? [
                    {
                      name: "regenerate_token",
                      label: t("runners.regenerate"),
                      hint: t("runners.regenerateHint"),
                      type: "checkbox" as const,
                      value: false,
                    },
                  ]
                : []),
            ]}
          />
          <Feedback error={save.error} />
          <div className={settingsActions}>
            <button className="button primary" disabled={save.isPending}>
              {runner ? t("form.save") : t("runners.create")}
            </button>
            <Link className="button" to={listRoot}>
              {t("form.cancel")}
            </Link>
          </div>
        </form>
      </SettingsSection>
    );
  if (runner) {
    const scopeKind = admin
      ? "admin"
      : nativeRoot === "/user/settings"
        ? "user"
        : nativeRoot.startsWith("/org/")
          ? "organization"
          : "project";
    const details: [string, ReactNode][] = [
      [
        t("runners.uuid"),
        <span className="inline-flex max-w-full items-center gap-1">
          <code className="min-w-0 text-xs break-all">{runner.uuid}</code>
          <CopyButton
            value={runner.uuid}
            label={t("runners.copyUuid")}
            compact
          />
        </span>,
      ],
      [t("runners.type"), runnerType(t, runner)],
      ...(admin && runner.owner_name
        ? ([[t("runners.owner"), runner.owner_name]] as [string, ReactNode][])
        : []),
      [
        t("runners.status"),
        <span className="inline-flex items-center gap-2">
          <StatusDot
            status={runner.status}
            label={runnerStatus(t, runner.status)}
          />
          {runnerStatus(t, runner.status)}
        </span>,
      ],
      [t("runners.version"), runner.version || t("runners.notConnected")],
      [
        t("runners.lastContact"),
        new Date(runner.last_online).getTime() > 0
          ? relativeDate(runner.last_online)
          : t("runners.neverContacted"),
      ],
      [t("runners.created"), relativeDate(runner.created)],
      [
        t("runners.labels"),
        runner.labels?.length ? (
          <span className="flex flex-wrap gap-1">
            {runner.labels.map((label) => (
              <span className="badge" key={label}>
                {label}
              </span>
            ))}
          </span>
        ) : (
          t("runners.none")
        ),
      ],
      [
        t("runners.ephemeral"),
        runner.ephemeral ? t("runners.yes") : t("runners.no"),
      ],
    ];
    return (
      <>
        <div className={settingsToolbar}>
          <Link to={listRoot}>{t("runners.runners")}</Link>
          {runner.editable && (
            <Link className="button" to={`${listRoot}/${runner.id}/edit`}>
              <Pencil size={14} />
              {t("runners.edit")}
            </Link>
          )}
        </div>
        <SettingsSection
          title={`${runner.name} #${runner.id}`}
          description={runner.description}
          open
        >
          <dl className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
            {details.map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="mb-1 text-xs text-muted">{key}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-muted italic">
            {t("runners.labelsNote")}
          </p>
        </SettingsSection>
        <SettingsSection
          title={t("runners.jobsTitle")}
          description={t(`runners.jobsDescription.${scopeKind}`)}
          open
        >
          {data.tasks?.length ? (
            <div className={settingsList}>
              {data.tasks.map((task) => (
                <article key={task.id} className={settingsRow}>
                  <div className={settingsRowBody}>
                    {task.run_link ? (
                      <Link
                        className="font-semibold"
                        to={uiRoute(task.run_link)}
                      >
                        {task.name || t("runners.job", { id: task.id })}
                      </Link>
                    ) : (
                      <strong>
                        {task.name || t("runners.job", { id: task.id })}
                      </strong>
                    )}
                    <p className="flex flex-wrap items-center gap-x-1 text-muted">
                      <span>{t("runners.task", { id: task.id })}</span>
                      {task.repo_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <Link
                            className="hover:underline"
                            to={uiRoute(task.repo_link || "")}
                          >
                            {task.repo_name}
                          </Link>
                        </>
                      )}
                      {task.commit_sha && (
                        <>
                          <span aria-hidden="true">·</span>
                          {task.commit_link ? (
                            <Link
                              className="font-mono hover:underline"
                              to={uiRoute(task.commit_link)}
                            >
                              {task.commit_sha.slice(0, 10)}
                            </Link>
                          ) : (
                            <span className="font-mono">
                              {task.commit_sha.slice(0, 10)}
                            </span>
                          )}
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>
                        {(task.is_stopped ??
                        new Date(task.stopped).getTime() > 0)
                          ? t("runners.doneAt", {
                              date: relativeDate(task.stopped),
                            })
                          : t("runners.started", {
                              date: relativeDate(task.started),
                            })}
                      </span>
                    </p>
                  </div>
                  <span className="badge">
                    {t(
                      `runners.taskStatus.${taskStatuses[task.status] || "unknown"}`,
                    )}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className={settingsEmpty}>{t("runners.noJobs")}</p>
          )}
          <Pagination
            page={page}
            total={data.total || 0}
            size={data.page_size}
            onPage={(next) => setParams({ page: String(next) })}
          />
        </SettingsSection>
        {runner.editable && (
          <SettingsSection
            title={t("runners.removeTitle")}
            description={t("runners.removeDescription")}
            danger
          >
            <SettingsDelete
              path={`${nativeRoot}/actions/runners/${runner.id}/delete`}
              name={runner.name}
              description={t("runners.deleteNotice")}
              onDeleted={() => navigate(listRoot)}
            />
          </SettingsSection>
        )}
      </>
    );
  }
  const setFilter = (next: Record<string, string>) => {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: keyword,
      sort,
      ...next,
    }))
      if (value) values.set(key, value);
    setParams(values);
  };
  return (
    <>
      <SettingsSection
        title={t("runners.runners")}
        description={t("runners.listDescription")}
        open
      >
        <div className={settingsToolbar}>
          <strong>
            {t("runners.available")}{" "}
            <span className="counter">{data.total || 0}</span>
          </strong>
          <Link className="button primary" to={`${listRoot}/new`}>
            <Plus size={15} />
            {t("runners.new")}
          </Link>
        </div>
        <div className="my-4 flex flex-wrap items-center gap-3">
          <form
            key={keyword}
            className="flex min-w-0 flex-1 items-center gap-2 max-md:order-first max-md:basis-full"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter({
                q: String(new FormData(e.currentTarget).get("q") || "").trim(),
              });
            }}
          >
            <label className="filter-input w-auto min-w-0 flex-1">
              <Search size={16} />
              <input
                name="q"
                type="search"
                defaultValue={keyword}
                placeholder={t("runners.searchPlaceholder")}
                aria-label={t("runners.search")}
              />
            </label>
            <button className="button">{t("form.search")}</button>
          </form>
          <SelectControl
            label={t("runners.sort")}
            value={sort || "online"}
            onValueChange={(value) =>
              setFilter({ sort: value === "online" ? "" : value })
            }
            options={[
              ["online", t("runners.sorts.online")],
              ["offline", t("runners.sorts.offline")],
              ["alphabetically", t("runners.sorts.alphabetically")],
              [
                "reversealphabetically",
                t("runners.sorts.reversealphabetically"),
              ],
              ["newest", t("runners.sorts.newest")],
              ["oldest", t("runners.sorts.oldest")],
            ].map(([value, label]) => ({ value, label }))}
          />
        </div>
        {data.items?.length ? (
          <div className={settingsList}>
            {data.items.map((item) => (
              <article key={item.id} className={settingsRow}>
                <StatusDot
                  status={item.status}
                  label={runnerStatus(t, item.status)}
                />
                <div className={settingsRowBody}>
                  <Link className="font-semibold" to={`${listRoot}/${item.id}`}>
                    {item.name || t("runners.runner", { id: item.id })}
                  </Link>
                  <p className="text-muted">
                    #{item.id} · {runnerType(t, item)}
                    {admin && item.owner_name
                      ? ` (${item.owner_name})`
                      : ""} · {runnerStatus(t, item.status)}
                  </p>
                  <p className="font-mono break-all text-muted">{item.uuid}</p>
                  {item.labels?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.labels.map((label) => (
                        <span className="badge" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {item.editable && (
                  <>
                    <Link className="button" to={`${listRoot}/${item.id}/edit`}>
                      <Pencil size={14} />
                      {t("form.edit")}
                    </Link>
                    <SettingsDelete
                      path={`${nativeRoot}/actions/runners/${item.id}/delete`}
                      name={item.name || t("runners.runner", { id: item.id })}
                      description={t("runners.deleteNotice")}
                    />
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className={settingsEmpty}>
            {keyword ? t("runners.noMatches") : t("runners.empty")}
          </p>
        )}
        <Pagination
          page={page}
          total={data.total || 0}
          size={data.page_size}
          onPage={(next) =>
            setParams((current) => {
              const values = new URLSearchParams(current);
              values.set("page", String(next));
              return values;
            })
          }
        />
      </SettingsSection>
      <SettingsSection
        title={t("runners.tokenTitle")}
        description={t("runners.tokenDescription")}
      >
        <button
          className="button"
          onClick={() => setShowRegistration(!showRegistration)}
        >
          {showRegistration ? t("runners.hideToken") : t("runners.revealToken")}
        </button>
        {showRegistration && (
          <div className={settingsToken}>
            <code className={settingsTokenCode}>{data.registration_token}</code>
            <CopyButton
              value={data.registration_token || ""}
              label={t("runners.copyToken")}
            />
          </div>
        )}
        <div className={settingsActions}>
          <button className="button" onClick={() => setResetRegistration(true)}>
            <RefreshCw size={14} />
            {t("runners.resetToken")}
          </button>
        </div>
        {resetRegistration && (
          <div
            className={settingsConfirm}
            role="alertdialog"
            aria-label={t("runners.resetToken")}
          >
            <strong>{t("runners.resetQuestion")}</strong>
            <p>{t("runners.resetBody")}</p>
            <Feedback error={reset.error} />
            <div className={settingsActions}>
              <button
                className="button"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {t("runners.reset")}
              </button>
              <button
                className="button"
                onClick={() => setResetRegistration(false)}
              >
                {t("form.cancel")}
              </button>
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
