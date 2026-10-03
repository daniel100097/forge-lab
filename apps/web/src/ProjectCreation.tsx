import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  get,
  nativeForm,
  nativePage,
  type Bootstrap,
  type RepoSearch,
} from "./api";
import {
  EmptyState,
  Feedback,
  pageHeadingClass,
  Pending,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { uiRoute } from "./routes";
const formPageClass =
  "w-full max-w-[900px] pt-2 pr-7 pb-8 pl-3 max-md:px-3 max-md:pt-3 max-md:pb-6";
const formPanelSurface =
  "max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4";
const formPanelClass = `mt-4 ${formPanelSurface}`;
// These sections were meant to have a top border, but its colour variable was
// never defined, so none is rendered.
const initializationClass = "pt-4";
const initializationSummaryClass =
  "mb-4 cursor-pointer text-[14px] font-semibold";
export interface RepositoryCreationData {
  owners: { id: number; name: string; organization: boolean }[];
  default_branch: string;
  forced_private: boolean;
  gitignores?: string[];
  licenses?: string[];
  readmes?: string[];
  label_templates?: { DisplayName: string; Description: string }[];
  object_formats?: string[];
  can_edit_git_hooks?: boolean;
}
export function ProjectInitializationFields({
  data,
}: {
  data: RepositoryCreationData;
}) {
  const { t } = useTranslation("shell");
  const [params] = useSearchParams();
  const [template, setTemplate] = useState(params.get("template_id") || ""),
    [search, setSearch] = useState(""),
    [initialize, setInitialize] = useState(true),
    [ignores, setIgnores] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["project-templates", search],
    queryFn: ({ signal }) =>
      get<RepoSearch>(
        `/repo/search?${new URLSearchParams({ q: search, template: "true", limit: "50" })}`,
        signal,
      ),
  });
  const selectedTemplate = useQuery({
    queryKey: ["selected-project-template", template],
    enabled: /^\d+$/.test(template),
    queryFn: ({ signal }) =>
      get<{ full_name: string }>(`/repositories/${template}`, signal),
  });
  return (
    <>
      <details className={initializationClass} open={!!template}>
        <summary className={initializationSummaryClass}>
          {t("projectCreation.template.summary")}
        </summary>
        <label className="mb-4 grid gap-1.5">
          {t("projectCreation.template.search")}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("projectCreation.template.searchPlaceholder")}
          />
        </label>
        <Feedback error={query.error} />
        <label className="mb-4 grid gap-1.5">
          {t("projectCreation.template.label")}
          <SelectControl
            label={t("projectCreation.template.label")}
            name="repo_template"
            value={template}
            onValueChange={setTemplate}
            options={[
              { value: "", label: t("projectCreation.template.none") },
              ...(!query.data?.data.some(
                (item) => String(item.repository.id) === template,
              ) && template
                ? [
                    {
                      value: template,
                      label: selectedTemplate.data?.full_name || template,
                    },
                  ]
                : []),
              ...(query.data?.data || []).map(({ repository }) => ({
                value: String(repository.id),
                label: repository.full_name,
              })),
            ]}
          />
        </label>
      </details>
      {template ? (
        <fieldset className={formPanelClass}>
          <legend>{t("projectCreation.template.include")}</legend>
          {[
            ["git_content", t("projectCreation.template.items.gitContent")],
            ["topics", t("projectCreation.template.items.topics")],
            ["avatar", t("projectCreation.template.items.avatar")],
            ["labels", t("projectCreation.template.items.labels")],
            [
              "protected_branch",
              t("projectCreation.template.items.protectedBranches"),
            ],
            ["webhooks", t("projectCreation.template.items.webhooks")],
            ...(data.can_edit_git_hooks
              ? [["git_hooks", t("projectCreation.template.items.gitHooks")]]
              : []),
          ].map(([name, label]) => (
            <label className="check-field" key={name}>
              <input
                name={name}
                type="checkbox"
                defaultChecked={name === "git_content"}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <label className="check-field">
            <input
              name="auto_init"
              type="checkbox"
              checked={initialize}
              onChange={(event) => setInitialize(event.target.checked)}
            />
            {t("projectCreation.init.readme")}
          </label>
          {initialize && (
            <div className="pl-6">
              <label className="mb-4 grid gap-1.5">
                {t("projectCreation.init.gitignores")}
                <SelectControl
                  label={t("projectCreation.init.addGitignoreLabel")}
                  value=""
                  onValueChange={(value) => {
                    if (value && !ignores.includes(value))
                      setIgnores([...ignores, value]);
                  }}
                  searchable
                  options={[
                    {
                      value: "",
                      label: t("projectCreation.init.addGitignore"),
                    },
                    ...(data.gitignores || []).map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                />
              </label>
              <input
                name="gitignores"
                type="hidden"
                value={ignores.join(",")}
              />
              {!!ignores.length && (
                <div className="flex flex-wrap items-center gap-2">
                  {ignores.map((ignore) => (
                    <button
                      className="button"
                      type="button"
                      key={ignore}
                      aria-label={t("projectCreation.init.removeGitignore", {
                        name: ignore,
                      })}
                      onClick={() =>
                        setIgnores(ignores.filter((value) => value !== ignore))
                      }
                    >
                      {ignore} ×
                    </button>
                  ))}
                </div>
              )}
              <label className="mb-4 grid gap-1.5">
                {t("projectCreation.init.license")}
                <SelectControl
                  label={t("projectCreation.init.license")}
                  name="license"
                  searchable
                  options={[
                    { value: "", label: t("projectCreation.init.noLicense") },
                    ...(data.licenses || []).map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                />
              </label>
              {(data.readmes?.length || 0) > 1 ? (
                <label className="mb-4 grid gap-1.5">
                  {t("projectCreation.init.readmeTemplate")}
                  <SelectControl
                    label={t("projectCreation.init.readmeTemplate")}
                    name="readme"
                    defaultValue="Default"
                    options={(data.readmes || []).map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </label>
              ) : (
                <input type="hidden" name="readme" value="Default" />
              )}
            </div>
          )}
          <details className={initializationClass}>
            <summary className={initializationSummaryClass}>
              {t("projectCreation.init.advanced")}
            </summary>
            <label className="mb-4 grid gap-1.5">
              {t("projectCreation.init.labelTemplate")}
              <SelectControl
                label={t("projectCreation.init.labelTemplate")}
                name="issue_labels"
                searchable
                options={[
                  {
                    value: "",
                    label: t("projectCreation.init.noLabelTemplate"),
                  },
                  ...(data.label_templates || []).map((value) => ({
                    value: value.DisplayName,
                    label: value.DisplayName,
                    description: value.Description,
                  })),
                ]}
              />
            </label>
            <label className="mb-4 grid gap-1.5">
              {t("projectCreation.init.objectFormat")}
              <SelectControl
                label={t("projectCreation.init.objectFormat")}
                name="object_format_name"
                defaultValue="sha1"
                options={(data.object_formats || ["sha1"]).map((value) => ({
                  value,
                  label: value.toUpperCase(),
                }))}
              />
            </label>
            <label className="check-field">
              <input name="template" type="checkbox" />
              {t("projectCreation.init.useAsTemplate")}
            </label>
          </details>
        </>
      )}
    </>
  );
}
interface MigrationData {
  services: {
    id: number;
    name: string;
    token_auth: boolean;
    features: string[];
  }[];
  lfs: boolean;
  mirrors: boolean;
  forced_private: boolean;
}
export function NativeImportProjectPage({
  bootstrap,
}: {
  bootstrap: Bootstrap;
}) {
  const { t } = useTranslation("shell");
  const [params, setParams] = useSearchParams();
  const service = Number(params.get("service_type")) || 1;
  const [mirror, setMirror] = useState(
      ["1", "true"].includes(params.get("mirror") || ""),
    ),
    [lfs, setLFS] = useState(false);
  const navigate = useNavigate(),
    client = useQueryClient();
  const options = useQuery({
    queryKey: ["migration-options"],
    queryFn: ({ signal }) => nativePage<MigrationData>("/repo/migrate", signal),
    enabled: !!bootstrap.user,
  });
  const owners = useQuery({
    queryKey: ["new-project-options"],
    queryFn: ({ signal }) =>
      nativePage<RepositoryCreationData>("/repo/create", signal),
    enabled: !!bootstrap.user,
  });
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const result = await nativeForm(
        "/repo/migrate",
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      );
      if (!result.redirect)
        throw new Error(t("projectCreation.import.startFailed"));
      return result;
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      navigate(uiRoute(result.redirect!));
    },
  });
  useTitle(t("projectCreation.import.pageTitle"));
  if (!bootstrap.user) return <Navigate to="/login" replace />;
  const selected = options.data?.services.find((value) => value.id === service),
    owner =
      owners.data?.owners.find(
        (value) => value.name === (params.get("org") || params.get("owner")),
      ) || owners.data?.owners[0];
  return (
    <section className={formPageClass}>
      <div className={pageHeadingClass}>
        <h1 className="max-md:text-[22px]">
          {t("projectCreation.import.title")}
        </h1>
      </div>
      <p className="text-muted mb-5">
        {t("projectCreation.import.description")}
      </p>
      <Feedback error={options.error || owners.error} />
      {options.isPending || owners.isPending ? (
        <Pending />
      ) : (
        options.data &&
        owners.data && (
          <>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("projectCreation.import.source")}
            >
              {options.data.services.map((provider) => (
                <button
                  key={provider.id}
                  className={`button ${service === provider.id ? "primary" : ""}`}
                  onClick={() => {
                    setParams({
                      service_type: String(provider.id),
                      ...(params.get("org") || params.get("owner")
                        ? { org: (params.get("org") || params.get("owner"))! }
                        : {}),
                    });
                    setMirror(false);
                  }}
                >
                  <GitBranch size={15} />
                  {provider.name}
                </button>
              ))}
            </div>
            {selected ? (
              <form
                key={service}
                className={`workspace-form mt-5 ${formPanelSurface}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  create.mutate(event.currentTarget);
                }}
              >
                <input type="hidden" name="service" value={service} />
                <label>
                  {service === 1
                    ? t("projectCreation.import.gitUrl")
                    : t("projectCreation.import.serviceUrl", {
                        service: selected.name,
                      })}
                  <input
                    name="clone_addr"
                    required
                    placeholder="https://example.com/team/project.git"
                  />
                </label>
                <details>
                  <summary>{t("projectCreation.import.auth")}</summary>
                  {selected.token_auth ? (
                    <label>
                      {t("projectCreation.import.accessToken")}
                      <input
                        name="auth_token"
                        type="password"
                        autoComplete="new-password"
                      />
                    </label>
                  ) : (
                    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr]">
                      <label>
                        {t("projectCreation.import.username")}
                        <input name="auth_username" autoComplete="off" />
                      </label>
                      <label>
                        {t("projectCreation.import.password")}
                        <input
                          name="auth_password"
                          type="password"
                          autoComplete="new-password"
                        />
                      </label>
                    </div>
                  )}
                </details>
                <label>
                  {t("projectCreation.import.namespace")}
                  <SelectControl
                    label={t("projectCreation.import.namespace")}
                    name="uid"
                    defaultValue={String(owner?.id || "")}
                    options={owners.data.owners.map((value) => ({
                      value: String(value.id),
                      label: value.name,
                    }))}
                  />
                </label>
                <label>
                  {t("projectCreation.import.name")}
                  <input name="repo_name" required maxLength={100} />
                </label>
                <label>
                  {t("projectCreation.import.descriptionLabel")}
                  <textarea name="description" rows={3} maxLength={2048} />
                </label>
                <label>
                  {t("projectCreation.import.visibility")}
                  <SelectControl
                    label={t("projectCreation.import.visibility")}
                    name="private"
                    defaultValue="on"
                    options={[
                      {
                        value: "on",
                        label: t("projectCreation.import.private"),
                      },
                      ...(!options.data.forced_private
                        ? [
                            {
                              value: "",
                              label: t("projectCreation.import.public"),
                            },
                          ]
                        : []),
                    ]}
                  />
                </label>
                {options.data.mirrors && (
                  <label className="check-field">
                    <input
                      name="mirror"
                      type="checkbox"
                      checked={mirror}
                      onChange={(event) => setMirror(event.target.checked)}
                    />
                    {t("projectCreation.import.mirror")}
                  </label>
                )}
                {options.data.lfs && (
                  <>
                    <label className="check-field">
                      <input
                        name="lfs"
                        type="checkbox"
                        checked={lfs}
                        onChange={(event) => setLFS(event.target.checked)}
                      />
                      {t("projectCreation.import.lfs")}
                    </label>
                    {lfs && (
                      <label>
                        {t("projectCreation.import.lfsEndpoint")}
                        <input
                          name="lfs_endpoint"
                          placeholder={t(
                            "projectCreation.import.lfsEndpointPlaceholder",
                          )}
                        />
                      </label>
                    )}
                  </>
                )}
                {!!selected.features.length && !mirror && (
                  <fieldset>
                    <legend>{t("projectCreation.import.data")}</legend>
                    {selected.features.map((feature) => (
                      <label className="check-field" key={feature}>
                        <input name={feature} type="checkbox" defaultChecked />
                        {
                          (
                            {
                              wiki: t("projectCreation.import.features.wiki"),
                              issues: t(
                                "projectCreation.import.features.issues",
                              ),
                              pull_requests: t(
                                "projectCreation.import.features.pullRequests",
                              ),
                              labels: t(
                                "projectCreation.import.features.labels",
                              ),
                              milestones: t(
                                "projectCreation.import.features.milestones",
                              ),
                              releases: t(
                                "projectCreation.import.features.releases",
                              ),
                            } as Record<string, string>
                          )[feature]
                        }
                      </label>
                    ))}
                  </fieldset>
                )}
                <Feedback error={create.error} />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="button primary"
                    disabled={create.isPending || !owner}
                  >
                    <Upload size={15} />
                    {create.isPending
                      ? t("projectCreation.import.starting")
                      : t("projectCreation.import.submit")}
                  </button>
                  <Link className="button" to="/projects">
                    {t("projectCreation.import.cancel")}
                  </Link>
                </div>
              </form>
            ) : (
              <EmptyState title={t("projectCreation.import.unavailable")} />
            )}
          </>
        )
      )}
    </section>
  );
}
export function AbuseReportPage() {
  const { t } = useTranslation("shell");
  const [params] = useSearchParams();
  const type = params.get("type") || "user",
    id = params.get("id") || "";
  const query = useQuery({
    queryKey: ["report-abuse", type, id],
    queryFn: ({ signal }) =>
      nativePage<{
        content_id: number;
        content_type: number;
        categories: { id: number; name: string }[];
      }>(`/report_abuse?${new URLSearchParams({ type, id })}`, signal),
  });
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) =>
      nativeForm(
        "/report_abuse",
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      ),
  });
  useTitle(t("projectCreation.abuse.title"));
  return (
    <section className={formPageClass}>
      <div className={pageHeadingClass}>
        <h1 className="max-md:text-[22px]">
          {t("projectCreation.abuse.title")}
        </h1>
      </div>
      <Feedback error={query.error || save.error} />
      {save.isSuccess ? (
        <div className={formPanelClass}>
          <h2 className="mb-2">{t("projectCreation.abuse.submittedTitle")}</h2>
          <p className="my-4">{t("projectCreation.abuse.submittedBody")}</p>
          <Link className="button" to="/projects">
            {t("projectCreation.abuse.returnToProjects")}
          </Link>
        </div>
      ) : query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <form
            className={`workspace-form ${formPanelClass}`}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(event.currentTarget);
            }}
          >
            <input
              type="hidden"
              name="content_id"
              value={query.data.content_id}
            />
            <input
              type="hidden"
              name="content_type"
              value={query.data.content_type}
            />
            <label>
              {t("projectCreation.abuse.reason")}
              <SelectControl
                label={t("projectCreation.abuse.reasonLabel")}
                name="abuse_category"
                required
                options={query.data.categories.map((category) => ({
                  value: String(category.id),
                  label: category.name,
                }))}
              />
            </label>
            <label>
              {t("projectCreation.abuse.details")}
              <textarea
                name="remarks"
                required
                minLength={20}
                maxLength={500}
                rows={6}
                placeholder={t("projectCreation.abuse.detailsPlaceholder")}
              />
              <small>{t("projectCreation.abuse.detailsHint")}</small>
            </label>
            <button className="button primary" disabled={save.isPending}>
              {t("projectCreation.abuse.submit")}
            </button>
          </form>
        )
      )}
    </section>
  );
}
