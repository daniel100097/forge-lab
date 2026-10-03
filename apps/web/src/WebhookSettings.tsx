import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { nativePage } from "./api";
import { Feedback, Pending, relativeDate } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  SettingsSection,
  SettingsForm,
  SettingsFields,
  SettingsDelete,
  settingsEmpty,
  settingsField,
  settingsList,
  settingsMuted,
  settingsRow,
  settingsRowBody,
  settingsToolbar,
} from "./ProjectSettings";
interface Hook {
  id: number;
  url: string;
  type: string;
  active: boolean;
  last_status: number;
  payload_url: string;
  secret: string;
  authorization_header: string;
  access_token: string;
  http_method: string;
  content_type: number;
  events: Record<string, boolean | string>;
}
interface HookData {
  page: string;
  type: string;
  providers: string[];
  items: Hook[];
  hook?: Hook;
  metadata: Record<string, string | boolean>;
  can_test: boolean;
  history: {
    id: number;
    uuid: string;
    event: string;
    delivered: boolean;
    success: boolean;
    time: string;
    status: number;
    request_body: string;
    response_body: string;
    request?: {
      url: string;
      method: string;
      headers: Record<string, string> | null;
    };
    response?: { status: number; headers: Record<string, string> | null };
  }[];
}
/** Header lines of a recorded request or response, like the native panel. */
function DeliveryHeaders({ lines }: { lines: [string, string][] }) {
  return (
    <pre className={`${deliveryBody} break-all whitespace-pre-wrap`}>
      {lines.map(([name, value], index) => (
        <span key={`${name}-${index}`} className="block">
          <strong>{name}:</strong> {value}
        </span>
      ))}
    </pre>
  );
}
const deliveryBody =
  "my-3 max-h-72 overflow-auto rounded-md border border-line bg-code p-3 text-xs";
const providerNames: Record<string, string> = {
  forgejo: "Forgejo",
  gitea: "Gitea",
  gogs: "Gogs",
  slack: "Slack",
  discord: "Discord",
  dingtalk: "DingTalk",
  telegram: "Telegram",
  msteams: "Microsoft Teams",
  feishu: "Feishu",
  matrix: "Matrix",
  wechatwork: "WeCom",
  packagist: "Packagist",
  sourcehut_builds: "SourceHut Builds",
};
// Event identifiers sent to Forgejo with their visible labels.
const hookEvents = (t: TFunction<"settings">) => [
  ["create", t("webhooks.events.create")],
  ["delete", t("webhooks.events.delete")],
  ["push", t("webhooks.events.push")],
  ["fork", t("webhooks.events.fork")],
  ["repository", t("webhooks.events.repository")],
  ["release", t("webhooks.events.release")],
  ["package", t("webhooks.events.package")],
  ["wiki", t("webhooks.events.wiki")],
  ["issues", t("webhooks.events.issues")],
  ["issue_assign", t("webhooks.events.issueAssign")],
  ["issue_label", t("webhooks.events.issueLabel")],
  ["issue_milestone", t("webhooks.events.issueMilestone")],
  ["issue_comment", t("webhooks.events.issueComment")],
  ["pull_request", t("webhooks.events.pullRequest")],
  ["pull_request_assign", t("webhooks.events.pullRequestAssign")],
  ["pull_request_label", t("webhooks.events.pullRequestLabel")],
  ["pull_request_milestone", t("webhooks.events.pullRequestMilestone")],
  ["pull_request_comment", t("webhooks.events.pullRequestComment")],
  ["pull_request_review", t("webhooks.events.pullRequestReview")],
  [
    "pull_request_review_request",
    t("webhooks.events.pullRequestReviewRequest"),
  ],
  ["pull_request_sync", t("webhooks.events.pullRequestSync")],
  ["action_failure", t("webhooks.events.actionFailure")],
  ["action_recover", t("webhooks.events.actionRecover")],
  ["action_success", t("webhooks.events.actionSuccess")],
];
export function SharedWebhookSettings({
  nativeRoot,
  uiRoot,
  section,
}: {
  nativeRoot: string;
  uiRoot: string;
  section: string;
}) {
  const { t } = useTranslation("settings");
  const [provider, setProvider] = useState("forgejo");
  const path = `${nativeRoot}/${section}`,
    listRoot = `${uiRoot}/hooks`;
  const query = useQuery({
    queryKey: ["configuration-hooks", path],
    queryFn: ({ signal }) => nativePage<HookData>(path, signal),
    // Native test/replay actions enqueue a delivery. Keep its visible result
    // current until the worker records the response, then stop polling.
    refetchInterval: (query) =>
      query.state.data?.history?.some((delivery) => !delivery.delivered)
        ? 2000
        : false,
  });
  const navigate = useNavigate();
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!;
  if (section === "hooks")
    return (
      <SettingsSection
        title={t("webhooks.title")}
        description={t("webhooks.description")}
        open
      >
        <div className={settingsToolbar}>
          <SelectControl
            label={t("webhooks.integration")}
            value={provider}
            onValueChange={setProvider}
            options={data.providers.map((value) => ({
              value,
              label: providerNames[value] || value,
            }))}
          />
          <Link className="button primary" to={`${listRoot}/${provider}/new`}>
            <Plus size={15} />
            {t("webhooks.add")}
          </Link>
        </div>
        {data.items.length ? (
          <div className={settingsList}>
            {data.items.map((hook) => (
              <article key={hook.id} className={settingsRow}>
                <div className={settingsRowBody}>
                  <Link className="font-semibold" to={`${listRoot}/${hook.id}`}>
                    {hook.url}
                  </Link>
                  <p className="text-muted">
                    {t("webhooks.summary", {
                      provider: providerNames[hook.type] || hook.type,
                      state: hook.active
                        ? t("webhooks.active")
                        : t("webhooks.disabled"),
                      delivery:
                        hook.last_status === 1
                          ? t("webhooks.lastSucceeded")
                          : hook.last_status === 2
                            ? t("webhooks.lastFailed")
                            : t("webhooks.noDeliveries"),
                    })}
                  </p>
                </div>
                <Link className="button" to={`${listRoot}/${hook.id}`}>
                  <Pencil size={14} />
                  {t("form.edit")}
                </Link>
                <SettingsDelete
                  path={`${nativeRoot}/hooks/delete`}
                  values={{ id: String(hook.id) }}
                  name={t("webhooks.name", { id: hook.id })}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className={settingsEmpty}>{t("webhooks.empty")}</p>
        )}
      </SettingsSection>
    );
  const hook = data.hook!,
    type = data.type || hook.type;
  const metadata = data.metadata || {},
    generic = ["forgejo", "gitea", "gogs"].includes(type);
  const field = (
    name: string,
    label: string,
    required = false,
    password = false,
  ) => ({
    name,
    label,
    value: String(metadata[name] || ""),
    required,
    type: password ? ("password" as const) : ("text" as const),
  });
  return (
    <>
      <div className={settingsToolbar}>
        <Link to={listRoot}>{t("webhooks.title")}</Link>
        <span className="badge">{providerNames[type] || type}</span>
      </div>
      <SettingsSection
        title={hook.id ? t("webhooks.edit") : t("webhooks.add")}
        description={t("webhooks.formDescription")}
        open
      >
        <SettingsForm
          key={path}
          path={path}
          button={hook.id ? t("form.save") : t("webhooks.add")}
          onSaved={() => navigate(listRoot)}
        >
          <SettingsFields
            fields={
              !["matrix", "telegram", "packagist"].includes(type)
                ? [
                    {
                      name: "payload_url",
                      label: t("webhooks.url"),
                      type: "url",
                      required: true,
                      value:
                        hook.payload_url ||
                        (type === "sourcehut_builds"
                          ? "https://builds.sr.ht/query"
                          : ""),
                    },
                  ]
                : []
            }
          />
          {generic && (
            <SettingsFields
              fields={[
                {
                  name: "http_method",
                  label: t("webhooks.httpMethod"),
                  value: hook.http_method || "POST",
                  options: [
                    { value: "POST", label: "POST" },
                    { value: "GET", label: "GET" },
                  ],
                },
                {
                  name: "content_type",
                  label: t("webhooks.contentType"),
                  value: String(hook.content_type || 1),
                  options: [
                    { value: "1", label: "application/json" },
                    { value: "2", label: "application/x-www-form-urlencoded" },
                  ],
                },
                {
                  name: "secret",
                  label: t("webhooks.secret"),
                  type: "password",
                  value: hook.secret || "",
                },
              ]}
            />
          )}{" "}
          {type === "slack" && (
            <SettingsFields
              fields={[
                field("channel", t("webhooks.channel"), true),
                field("username", t("webhooks.displayName")),
                field("icon_url", t("webhooks.iconUrl")),
                field("color", t("webhooks.color")),
              ]}
            />
          )}{" "}
          {type === "discord" && (
            <SettingsFields
              fields={[
                field("username", t("webhooks.displayName"), true),
                field("icon_url", t("webhooks.iconUrl")),
              ]}
            />
          )}{" "}
          {type === "telegram" && (
            <SettingsFields
              fields={[
                field("bot_token", t("webhooks.botToken"), true, true),
                field("chat_id", t("webhooks.chatId"), true),
                field("thread_id", t("webhooks.threadId")),
              ]}
            />
          )}{" "}
          {type === "packagist" && (
            <SettingsFields
              fields={[
                field("username", t("webhooks.username"), true),
                field("api_token", t("webhooks.apiToken"), true, true),
                field("package_url", t("webhooks.packageUrl"), true),
              ]}
            />
          )}{" "}
          {type === "matrix" && (
            <SettingsFields
              fields={[
                field("homeserver_url", t("webhooks.homeserverUrl"), true),
                {
                  name: "access_token",
                  label: t("webhooks.accessToken"),
                  type: "password",
                  required: true,
                  value: hook.access_token,
                },
                field("room_id", t("webhooks.roomId"), true),
                {
                  name: "message_type",
                  label: t("webhooks.messageType"),
                  value: String(metadata.message_type || 1),
                  options: [
                    { value: "1", label: t("webhooks.notice") },
                    { value: "2", label: t("webhooks.text") },
                  ],
                },
              ]}
            />
          )}{" "}
          {type === "sourcehut_builds" && (
            <SettingsFields
              fields={[
                {
                  name: "manifest_path",
                  label: t("webhooks.manifestPath"),
                  value: String(metadata.manifest_path || ".build.yml"),
                  required: true,
                },
                {
                  name: "visibility",
                  label: t("webhooks.visibility"),
                  value: String(metadata.visibility || "PRIVATE"),
                  options: [
                    { value: "PRIVATE", label: t("webhooks.private") },
                    { value: "UNLISTED", label: t("webhooks.unlisted") },
                    { value: "PUBLIC", label: t("webhooks.public") },
                  ],
                },
                {
                  name: "secrets",
                  label: t("webhooks.buildSecrets"),
                  type: "checkbox",
                  value: !!metadata.secrets,
                },
                {
                  name: "access_token",
                  label: t("webhooks.accessToken"),
                  type: "password",
                  required: true,
                  value: hook.access_token,
                },
              ]}
            />
          )}{" "}
          {!["matrix", "sourcehut_builds"].includes(type) && (
            <SettingsFields
              fields={[
                {
                  name: "authorization_header",
                  label: t("webhooks.authorizationHeader"),
                  type: "password",
                  value: hook.authorization_header || "",
                },
              ]}
            />
          )}
          <HookEventFields events={hook.events || {}} />
          <SettingsFields
            fields={[
              {
                name: "active",
                label: t("webhooks.enable"),
                type: "checkbox",
                value: hook.id ? hook.active : true,
              },
            ]}
          />
          <Link className="button self-start" to={listRoot}>
            {t("form.cancel")}
          </Link>
        </SettingsForm>
      </SettingsSection>
      {hook.id > 0 && (
        <SettingsSection
          title={t("webhooks.deliveriesTitle")}
          description={t("webhooks.deliveriesDescription")}
          open
        >
          {data.can_test &&
            (hook.active ? (
              <SettingsForm
                path={`${nativeRoot}/hooks/${hook.id}/test`}
                button={t("webhooks.test")}
              />
            ) : (
              // Natively a disabled webhook can't be tested or replayed.
              <div className="flex flex-wrap items-center gap-3">
                <button className="button primary" disabled>
                  {t("webhooks.test")}
                </button>
                <span className={settingsMuted}>
                  {t("webhooks.activateToTest")}
                </span>
              </div>
            ))}
          {data.history.length ? (
            <div className="configuration-deliveries mt-5">
              {data.history.map((item) => (
                <details key={item.id} className="border-t border-line py-4">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                    <span className="badge">
                      {item.delivered
                        ? item.success
                          ? t("webhooks.succeeded")
                          : t("webhooks.failed")
                        : t("webhooks.pending")}
                    </span>
                    <strong>{item.event}</strong>
                    <span className={settingsMuted}>
                      {relativeDate(item.time)}
                    </span>
                  </summary>
                  <p className={settingsMuted}>
                    {t("webhooks.delivery", {
                      uuid: item.uuid,
                      status: item.status || "—",
                    })}
                  </p>
                  <h3 className="mt-4 font-semibold">
                    {t("webhooks.request")}
                  </h3>
                  {item.request && (
                    <>
                      <h4 className="mt-3 text-sm font-semibold text-muted">
                        {t("webhooks.headers")}
                      </h4>
                      <DeliveryHeaders
                        lines={[
                          [t("webhooks.requestUrl"), item.request.url],
                          [t("webhooks.requestMethod"), item.request.method],
                          ...Object.entries(item.request.headers ?? {}).sort(
                            ([a], [b]) => a.localeCompare(b),
                          ),
                        ]}
                      />
                    </>
                  )}
                  <h4 className="mt-3 text-sm font-semibold text-muted">
                    {t("webhooks.requestBody")}
                  </h4>
                  <pre className={deliveryBody}>
                    {item.request_body || t("webhooks.noRequestBody")}
                  </pre>
                  <h3 className="mt-4 flex items-center gap-2 font-semibold">
                    {t("webhooks.response")}
                    <span
                      className={
                        item.response?.status
                          ? item.success
                            ? "badge border-success text-success"
                            : "badge border-danger text-danger"
                          : "badge"
                      }
                    >
                      {item.response?.status || "—"}
                    </span>
                  </h3>
                  {item.response && (
                    <>
                      <h4 className="mt-3 text-sm font-semibold text-muted">
                        {t("webhooks.headers")}
                      </h4>
                      {Object.keys(item.response.headers ?? {}).length ? (
                        <DeliveryHeaders
                          lines={Object.entries(
                            item.response.headers ?? {},
                          ).sort(([a], [b]) => a.localeCompare(b))}
                        />
                      ) : (
                        <p className={`my-3 ${settingsMuted}`}>
                          {t("webhooks.noHeaders")}
                        </p>
                      )}
                    </>
                  )}
                  <h4 className="mt-3 text-sm font-semibold text-muted">
                    {t("webhooks.responseBody")}
                  </h4>
                  <pre className={deliveryBody}>
                    {item.response_body || t("webhooks.noResponseBody")}
                  </pre>
                  {hook.active ? (
                    <SettingsForm
                      path={`${nativeRoot}/hooks/${hook.id}/replay/${item.uuid}`}
                      button={t("webhooks.resend")}
                    />
                  ) : (
                    <p className={settingsMuted}>
                      {t("webhooks.activateToReplay")}
                    </p>
                  )}
                </details>
              ))}
            </div>
          ) : (
            <p className={settingsEmpty}>{t("webhooks.noAttempts")}</p>
          )}
        </SettingsSection>
      )}
    </>
  );
}
function HookEventFields({
  events,
}: {
  events: Record<string, string | boolean>;
}) {
  const { t } = useTranslation("settings");
  const [mode, setMode] = useState(
    events.send_everything
      ? "send_everything"
      : events.choose_events
        ? "choose_events"
        : "push_only",
  );
  return (
    <>
      <label className={settingsField}>
        {t("webhooks.trigger")}
        <SelectControl
          className="w-full font-normal"
          name="events"
          label={t("webhooks.triggerLabel")}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "push_only", label: t("webhooks.pushOnly") },
            { value: "send_everything", label: t("webhooks.everything") },
            { value: "choose_events", label: t("webhooks.chooseEvents") },
          ]}
        />
      </label>
      {mode === "choose_events" && (
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <SettingsFields
            fields={hookEvents(t).map(([name, label]) => ({
              name,
              label,
              type: "checkbox",
              value: !!events[name],
            }))}
          />
        </div>
      )}
      <SettingsFields
        fields={[
          {
            name: "branch_filter",
            label: t("form.branchFilter"),
            value: String(events.branch_filter || "*"),
            hint: t("webhooks.branchFilterHint"),
          },
        ]}
      />
    </>
  );
}
