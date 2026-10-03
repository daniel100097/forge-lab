import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Package, Search, Settings } from "lucide-react";
import type { RepoContext } from "./App";
import { appSubUrl, native, nativeForm, nativePage } from "./api";
import { ConfirmAction } from "./IssueManagement";
import { SelectControl } from "./SelectControl";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Markdown,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";

// Package registry pages; `max-[851px]:` mirrors the original `max-width: 850px` breakpoint.
const packagePage =
  "m-auto max-w-[1280px] [&>div>h2]:mb-4 [&>div>h2]:text-[16px] [&>div>h2]:font-semibold";
const packageHeading =
  "mb-6 flex min-h-10 items-start justify-between gap-4 max-md:gap-3";
const packageHeadingText = "mt-2 text-sm text-muted";
const packageTitle = "text-[24px]";
const packageFilterbar =
  "flex gap-3 rounded-t-lg border border-line bg-surface-subtle p-4 max-[851px]:flex-col";
const packageFilterForm = "flex flex-1 items-center gap-2";
const packageTypeIcon =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-subtle";
const packageCard =
  "mb-6 rounded-lg border border-line bg-surface p-6 max-[851px]:p-4";
const packageCardTitle = "mb-4 text-[16px] font-semibold";
const packageActions = "flex flex-wrap items-center gap-2";
const packageCell =
  "border-b border-line px-3 py-2 text-left align-top [overflow-wrap:anywhere] in-[tr:last-child]:border-b-0";
const packageHeaderCell = `${packageCell} font-semibold text-muted`;
const packageTableWrap = "max-w-full overflow-auto";
const packageTable = "w-full border-collapse text-[12px]";
const packageInfoTerm = "mt-4 text-[12px] font-semibold text-muted";
const packageInfoValue = "mt-1 text-[14px]";
const packageFormTitle = "mt-3 text-[16px] font-semibold";
const packageFormLabel = "flex flex-col gap-2 font-semibold";
interface PackageFile {
  id: number;
  name: string;
  size: number;
  sha256: string;
  digest: string;
}
interface PackageItem {
  id: number;
  version_id: number;
  owner: string;
  name: string;
  type: string;
  version: string;
  creator: string;
  created_at: string;
  downloads: number;
  size: number;
  repository?: string;
  repository_id?: number;
  files: PackageFile[];
  metadata: Record<string, unknown>;
  description_html?: string;
  dist_tags?: string[];
}
interface CleanupRule {
  id: number;
  enabled: boolean;
  type: string;
  keep_count: number;
  keep_pattern: string;
  remove_days: number;
  remove_pattern: string;
  match_full_name: boolean;
}
interface PackageData {
  page: string;
  items: PackageItem[];
  package?: PackageItem;
  total: number;
  page_size: number;
  can_write: boolean;
  registry_host: string;
  sign_mail?: string;
  types: { value: string; label: string }[];
  versions: { version: string; created_at: string }[];
  version_count: number;
  repositories: { id: number; name: string }[];
  rules: CleanupRule[];
  rule?: CleanupRule;
  preview: PackageItem[];
  cargo_index: boolean;
}
const encode = encodeURIComponent;
const packageLink = (item: Pick<PackageItem, "owner" | "type" | "name">) =>
  `/packages/${encode(item.owner)}/${encode(item.type)}/${encode(item.name)}`;
const nativePackage = (owner: string, type: string, name: string) =>
  `/${encode(owner)}/-/packages/${encode(type)}/${encode(name)}`;
function size(bytes: number, language: string) {
  const decimal = (amount: number) =>
    new Intl.NumberFormat(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(amount);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${decimal(bytes / 1024)} KiB`;
  return `${decimal(bytes / 1048576)} MiB`;
}
function usePackageData(path: string) {
  return useQuery({
    queryKey: ["packages", path],
    queryFn: ({ signal }) => nativePage<PackageData>(path, signal),
  });
}
export function ProjectPackages() {
  const { path } = useOutletContext<RepoContext>();
  return <PackageList endpoint={`${path}/packages`} />;
}
export function OwnerPackages() {
  const { owner = "" } = useParams();
  return (
    <PackageList endpoint={`/${encode(owner)}/-/packages`} owner={owner} />
  );
}
function PackageRows({ items }: { items: PackageItem[] }) {
  const { t } = useTranslation("settings");
  return (
    <div className="overflow-hidden rounded-b-lg border border-t-0 border-line">
      {items.map((item) => (
        <article
          className="package-row flex items-center gap-4 border-b border-line px-4 py-5 last:border-0 max-[851px]:gap-3"
          key={item.version_id}
        >
          <span className={packageTypeIcon}>
            <Package size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to={`${packageLink(item)}/${encode(item.version)}`}
              className="text-[16px] font-semibold"
            >
              {item.name}
            </Link>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted">
              <span className="badge">{item.type}</span>
              <span>{item.version}</span>
              <span>
                {t("packages.published", {
                  date: relativeDate(item.created_at),
                })}
              </span>
              {item.repository && (
                <Link to={`/projects/${item.repository}`}>
                  {item.repository}
                </Link>
              )}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <Download size={14} />
            {item.downloads}
          </span>
        </article>
      ))}
    </div>
  );
}
function PackageList({
  endpoint,
  owner,
}: {
  endpoint: string;
  owner?: string;
}) {
  const { t } = useTranslation("settings");
  useTitle(t("packages.registry"));
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("q") || "");
  const page = Number(params.get("page") || 1),
    query = usePackageData(`${endpoint}?${params}`);
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(name, value);
    if (name !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <div className={packagePage}>
      <div className={packageHeading}>
        <div>
          <h1 className={packageTitle}>{t("packages.registry")}</h1>
          <p className={packageHeadingText}>
            {owner
              ? t("packages.ownerPackages", { owner })
              : t("packages.projectDescription")}
          </p>
        </div>
        <Link
          className="button"
          to="https://forgejo.org/docs/latest/user/packages/"
          target="_blank"
          rel="noreferrer"
        >
          {t("packages.publish")}
        </Link>
      </div>
      <div className={packageFilterbar}>
        <form
          className={packageFilterForm}
          onSubmit={(event) => {
            event.preventDefault();
            set("q", search);
          }}
        >
          <label className="filter-input w-auto min-w-0 flex-1">
            <Search size={16} />
            <input
              aria-label={t("packages.searchLabel")}
              placeholder={t("packages.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className="button">{t("form.search")}</button>
        </form>
        <SelectControl
          label={t("packages.type")}
          value={params.get("type") || ""}
          onValueChange={(value) => set("type", value)}
          searchable
          options={[
            { value: "", label: t("packages.allTypes") },
            ...(query.data?.types || []),
          ]}
        />
      </div>
      {query.isPending ? (
        <Pending />
      ) : query.error ? (
        <Feedback error={query.error} />
      ) : (
        <>
          {query.data.items.length ? (
            <PackageRows items={query.data.items} />
          ) : (
            <section>
              <EmptyState
                title={t("packages.emptyTitle")}
                icon={<Package size={40} />}
              >
                {t("packages.emptyBody")}
              </EmptyState>
            </section>
          )}
          <Pagination
            page={page}
            total={query.data.total}
            size={query.data.page_size}
            onPage={(value) => set("page", String(value))}
          />
        </>
      )}
    </div>
  );
}
export function PackageLatest() {
  const { t } = useTranslation("settings");
  const { owner = "", type = "", name = "" } = useParams();
  const query = usePackageData(nativePackage(owner, type, name) + "/versions");
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const item = query.data.items[0];
  return item ? (
    <Navigate replace to={packageLink(item) + "/" + encode(item.version)} />
  ) : (
    <EmptyState title={t("packages.noVersionsAvailable")} />
  );
}
export function PackageDetail() {
  const { t, i18n } = useTranslation("settings");
  const { owner = "", type = "", name = "", version = "" } = useParams(),
    location = useLocation(),
    navigate = useNavigate();
  const mode = location.pathname.endsWith("/settings")
    ? "settings"
    : location.pathname.endsWith("/versions")
      ? "versions"
      : "detail";
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("q") || "");
  const endpoint =
      nativePackage(owner, type, name) +
      (mode === "versions"
        ? "/versions"
        : `/${encode(version)}${mode === "settings" ? "/settings" : ""}`),
    query = usePackageData(`${endpoint}?${params}`);
  useTitle(name);
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data,
    item = data.package!;
  const root = packageLink({ owner, type, name });
  return (
    <div className={packagePage}>
      <div className="mb-6 flex gap-2.5 text-[13px] text-muted">
        <Link to={`/packages/${encode(owner)}`}>{t("packages.registry")}</Link>
        <span>/</span>
        <span>{name}</span>
      </div>
      <div className={packageHeading}>
        <div className="flex items-center gap-4 max-[851px]:items-start">
          <span className={packageTypeIcon}>
            <Package size={24} />
          </span>
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-[24px] [overflow-wrap:anywhere] max-[851px]:text-[20px]">
              {name}
              {version && <span className="badge">{version}</span>}
            </h1>
            <p className={packageHeadingText}>
              {type}
              {item.creator &&
                ` · ${t("packages.publishedBy", {
                  creator: item.creator,
                  date: relativeDate(item.created_at),
                })}`}
            </p>
          </div>
        </div>
        <div className={packageActions}>
          <Link className="button" to={`${root}/versions`}>
            {data.version_count
              ? t("packages.allVersionsCount", { count: data.version_count })
              : t("packages.allVersions")}
          </Link>
          {data.can_write && mode === "detail" && (
            <Link className="button" to={`${root}/${encode(version)}/settings`}>
              <Settings size={16} />
              {t("form.settings")}
            </Link>
          )}
        </div>
      </div>
      {mode === "versions" ? (
        <>
          <div className={packageFilterbar}>
            <form
              className={packageFilterForm}
              onSubmit={(event) => {
                event.preventDefault();
                const next = new URLSearchParams(params);
                next.set("q", search);
                next.delete("page");
                setParams(next);
              }}
            >
              <label className="filter-input w-auto min-w-0 flex-1">
                <Search size={16} />
                <input
                  aria-label={t("packages.searchVersionsLabel")}
                  placeholder={t("packages.searchVersionsPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button className="button">{t("form.search")}</button>
            </form>
            <SelectControl
              label={t("packages.sort")}
              value={params.get("sort") || "created_desc"}
              onValueChange={(value) => {
                const next = new URLSearchParams(params);
                next.set("sort", value);
                setParams(next);
              }}
              options={[
                { value: "created_desc", label: t("packages.sortNewest") },
                { value: "created_asc", label: t("packages.sortOldest") },
                { value: "version_asc", label: t("packages.sortVersionAsc") },
                { value: "version_desc", label: t("packages.sortVersionDesc") },
              ]}
            />
            {type === "container" && (
              <SelectControl
                label={t("packages.containerTags")}
                value={params.get("tagged") || "tagged"}
                onValueChange={(value) => {
                  const next = new URLSearchParams(params);
                  next.set("tagged", value);
                  setParams(next);
                }}
                options={[
                  { value: "tagged", label: t("packages.tagged") },
                  { value: "untagged", label: t("packages.untagged") },
                ]}
              />
            )}
          </div>
          {data.items.length ? (
            <PackageRows items={data.items} />
          ) : (
            <EmptyState title={t("packages.noVersions")} />
          )}
          <Pagination
            page={Number(params.get("page") || 1)}
            total={data.total}
            size={data.page_size}
            onPage={(value) => {
              const next = new URLSearchParams(params);
              next.set("page", String(value));
              setParams(next);
            }}
          />
        </>
      ) : mode === "settings" ? (
        <PackageVersionSettings
          data={data}
          endpoint={endpoint}
          onDeleted={() => navigate(`/packages/${encode(owner)}`)}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-8 max-[851px]:grid-cols-[minmax(0,1fr)]">
          <div>
            <section className={packageCard}>
              <h2 className={packageCardTitle}>{t("packages.installation")}</h2>
              <PackageInstall
                item={item}
                registry={data.registry_host}
                signMail={data.sign_mail}
              />
            </section>
            {!!(
              item.metadata.Readme ||
              item.metadata.Description ||
              item.metadata.Summary
            ) && (
              <section
                className={`${packageCard} [&_h2]:mt-0 [&_h2]:mb-4 [&_h2]:text-[16px] [&_h2]:font-semibold`}
              >
                <h2>{t("packages.about")}</h2>
                <Markdown
                  html={item.description_html}
                  basePath={nativePackage(owner, type, name) + "/"}
                >
                  {String(
                    item.metadata.Readme ||
                      item.metadata.Description ||
                      item.metadata.Summary,
                  )}
                </Markdown>
              </section>
            )}
            <section className={packageCard}>
              <h2 className={packageCardTitle}>
                {t("packages.files")}{" "}
                <span className="counter">{item.files.length}</span>
              </h2>
              <div>
                {item.files.map((file) => (
                  <div
                    className="border-b border-line py-4 first:pt-0 last:border-0 last:pb-0"
                    key={file.id}
                  >
                    <div className="flex justify-between gap-4">
                      <a
                        className="flex items-center gap-2 [overflow-wrap:anywhere]"
                        href={native(
                          `${nativePackage(owner, type, name)}/${encode(version)}/files/${file.id}`,
                        )}
                        download
                      >
                        <Download size={15} />
                        {file.name}
                      </a>
                      <small className="whitespace-nowrap text-muted">
                        {size(file.size, i18n.language)}
                      </small>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted">
                      <span>SHA256</span>
                      <code className="overflow-hidden text-ellipsis">
                        {file.sha256}
                      </code>
                      <CopyButton
                        value={file.sha256}
                        compact
                        label={t("packages.copyChecksum", { name: file.name })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {!!item.dist_tags?.length && (
              <section className={packageCard}>
                <h2 className={packageCardTitle}>{t("packages.distTags")}</h2>
                <div className="flex flex-wrap gap-2">
                  {item.dist_tags.map((tag) => (
                    <span key={tag} className="badge">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {item.type === "container" &&
              Array.isArray(item.metadata.Manifests) && (
                <section className={packageCard}>
                  <h2 className={packageCardTitle}>
                    {t("packages.platformImages")}
                  </h2>
                  {(
                    item.metadata.Manifests as {
                      digest: string;
                      platform: string;
                      size: number;
                    }[]
                  )
                    .filter(
                      (manifest) => manifest.platform !== "unknown/unknown",
                    )
                    .map((manifest) => (
                      <div
                        className="border-b border-line py-3"
                        key={manifest.digest}
                      >
                        <Link
                          className="break-all text-primary"
                          to={packageLink(item) + "/" + encode(manifest.digest)}
                        >
                          {manifest.digest}
                        </Link>
                        <p className="mt-1 text-sm text-muted">
                          {manifest.platform} ·{" "}
                          {size(manifest.size, i18n.language)}
                        </p>
                      </div>
                    ))}
                </section>
              )}
            <PackageMetadata item={item} />
          </div>
          <aside className="border-l border-line pl-6 [overflow-wrap:anywhere] max-[851px]:border-t max-[851px]:border-l-0 max-[851px]:pt-6 max-[851px]:pl-0">
            <h2 className={packageCardTitle}>{t("packages.information")}</h2>
            <dl className="mb-6">
              <dt className={packageInfoTerm}>{t("packages.format")}</dt>
              <dd className={packageInfoValue}>{type}</dd>
              <dt className={packageInfoTerm}>{t("packages.size")}</dt>
              <dd className={packageInfoValue}>
                {size(item.size, i18n.language)}
              </dd>
              <dt className={packageInfoTerm}>{t("packages.downloads")}</dt>
              <dd className={packageInfoValue}>{item.downloads}</dd>
              <dt className={packageInfoTerm}>
                {t("packages.publishedLabel")}
              </dt>
              <dd className={packageInfoValue}>
                {relativeDate(item.created_at)}
              </dd>
              {item.repository && (
                <>
                  <dt className={packageInfoTerm}>{t("packages.project")}</dt>
                  <dd className={packageInfoValue}>
                    <Link to={`/projects/${item.repository}`}>
                      {item.repository}
                    </Link>
                  </dd>
                </>
              )}
            </dl>
            <h2 className={packageCardTitle}>{t("packages.latestVersions")}</h2>
            {data.versions.map((value) => (
              <Link
                className="flex justify-between gap-2 border-b border-line py-2.5 text-[13px]"
                to={`${root}/${encode(value.version)}`}
                key={value.version}
              >
                <strong>{value.version}</strong>
                <span className="text-[12px] text-muted">
                  {relativeDate(value.created_at)}
                </span>
              </Link>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
function PackageVersionSettings({
  data,
  endpoint,
  onDeleted,
}: {
  data: PackageData;
  endpoint: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation("settings");
  const item = data.package!,
    [repo, setRepo] = useState(String(item.repository_id || 0)),
    client = useQueryClient(),
    save = useMutation({
      mutationFn: () => nativeForm(endpoint, { action: "link", repo_id: repo }),
      onSuccess: () => client.invalidateQueries({ queryKey: ["packages"] }),
    });
  return (
    <div className="max-w-[1000px]">
      <section className={packageCard}>
        <h2 className={packageCardTitle}>
          {t("versionSettings.linkedProject")}
        </h2>
        <p>{t("versionSettings.linkDescription")}</p>
        <form
          className="workspace-form gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <SelectControl
            label={t("versionSettings.linkedProject")}
            value={repo}
            onValueChange={setRepo}
            searchable
            options={[
              { value: "0", label: t("versionSettings.noLinkedProject") },
              ...data.repositories.map((value) => ({
                value: String(value.id),
                label: value.name,
              })),
            ]}
          />
          <Feedback error={save.error} />
          <div>
            <button className="button primary" disabled={save.isPending}>
              {t("form.save")}
            </button>
            {save.isSuccess && (
              <span role="status" className="text-sm text-muted">
                {" "}
                {t("versionSettings.linkSaved")}
              </span>
            )}
          </div>
        </form>
      </section>
      <section className="mb-6 rounded-lg border border-danger bg-surface p-6 max-[851px]:p-4">
        <h2 className={`${packageCardTitle} text-danger`}>
          {t("versionSettings.deleteTitle")}
        </h2>
        <p>
          {t("versionSettings.deleteDescription", {
            name: item.name,
            version: item.version,
          })}
        </p>
        <ConfirmAction
          label={t("versionSettings.deleteTitle")}
          title={t("versionSettings.deleteQuestion", {
            name: item.name,
            version: item.version,
          })}
          action={async () => {
            await nativeForm(endpoint, { action: "delete" });
            await client.invalidateQueries({ queryKey: ["packages"] });
            onDeleted();
          }}
        >
          {t("versionSettings.deleteBody")}
        </ConfirmAction>
      </section>
    </div>
  );
}
function Command({ title, value }: { title: string; value: string }) {
  const { t } = useTranslation("settings");
  return (
    <div className="package-command mb-4 overflow-hidden rounded-md border border-line">
      {/* Translated copy labels are longer than English ones; let them wrap
          below the title instead of overflowing on narrow screens. */}
      <div className="flex items-center justify-between border-b border-line bg-surface-subtle px-3 py-2 text-[12px] [&:not(:lang(en))]:flex-wrap [&:not(:lang(en))]:gap-2">
        <strong>{title}</strong>
        <CopyButton
          value={value}
          label={t("packages.copyCommand", { title })}
        />
      </div>
      <pre className="m-0 overflow-x-auto p-4 text-[13px] leading-[1.6]">
        <code>{value}</code>
      </pre>
    </div>
  );
}
function PackageInstall({
  item,
  registry,
  signMail,
}: {
  item: PackageItem;
  registry: string;
  signMail?: string;
}) {
  const { t } = useTranslation("settings");
  const { type, name, version, owner, metadata: m } = item,
    api = `${location.origin}${appSubUrl}/api/packages/${encode(owner)}`,
    value = (key: string, fallback = "") => String(m[key] || fallback),
    values = (key: string, fallback: string[] = []) =>
      Array.isArray(m[key]) && m[key].length ? (m[key] as string[]) : fallback;
  let commands: { title: string; value: string }[] = [];
  const add = (title: string, value: string) => commands.push({ title, value });
  switch (type) {
    case "generic":
      for (const file of item.files)
        add(
          t("install.download", { name: file.name }),
          `curl -OJ "${api}/generic/${encode(name)}/${encode(version)}/${encode(file.name)}"`,
        );
      break;
    case "container":
      add(
        t("install.pullImage"),
        m.Type === "helm"
          ? `helm pull oci://${registry}/${owner.toLowerCase()}/${name.toLowerCase()} --version ${version}`
          : `docker pull ${registry}/${owner.toLowerCase()}/${name.toLowerCase()}${m.IsTagged === false ? "@" : ":"}${version}`,
      );
      for (const file of item.files)
        if (file.digest) add(t("install.digest"), file.digest);
      break;
    case "npm":
      add(
        t("install.configureFile", { file: ".npmrc" }),
        `${value("Scope") ? `${value("Scope")}:` : ""}registry=${api}/npm/`,
      );
      add(t("install.installPackage"), `npm install ${name}@${version}`);
      break;
    case "pypi":
      add(
        t("install.installPackage"),
        `pip install --index-url ${api}/pypi/simple/ ${name}==${version}`,
      );
      break;
    case "nuget":
      add(
        t("install.addSource"),
        `dotnet nuget add source ${api}/nuget/index.json --name ${owner}`,
      );
      add(
        t("install.installPackage"),
        `dotnet add package ${name} --version ${version} --source ${owner}`,
      );
      break;
    case "cargo":
      add(
        t("install.configureFile", { file: ".cargo/config.toml" }),
        `[registries.${owner}]\nindex = "sparse+${api}/cargo/"`,
      );
      add(
        t("install.installDependency"),
        `cargo add ${name}@${version} --registry ${owner}`,
      );
      break;
    case "composer":
      add(
        t("install.configureRepository"),
        `composer config repositories.${owner} composer ${api}/composer`,
      );
      add(t("install.installPackage"), `composer require ${name}:${version}`);
      break;
    case "rubygems":
      add(
        t("install.configureFile", { file: "Gemfile" }),
        `source "${api}/rubygems" do\n  gem "${name}", "${version}"\nend`,
      );
      add(
        t("install.installGem"),
        `gem install ${name} --version ${version} --source ${api}/rubygems`,
      );
      break;
    case "helm":
      add(t("install.addHelmRepository"), `helm repo add ${owner} ${api}/helm`);
      add(
        t("install.installChart"),
        `helm install ${name} ${owner}/${name} --version ${version}`,
      );
      break;
    case "go":
      add(t("install.configureGoProxy"), `go env -w GOPROXY=${api}/go`);
      add(t("install.installModule"), `go get ${name}@${version}`);
      break;
    case "maven":
      add(t("install.installPackage"), "mvn install");
      add(
        t("install.download", { name }),
        `mvn dependency:get -DremoteRepositories=${api}/maven -Dartifact=${value("GroupID")}:${value("ArtifactID", name)}:${version}`,
      );
      add(
        t("install.repositoryConfiguration"),
        `<repositories>\n  <repository><id>${owner}</id><url>${api}/maven</url></repository>\n</repositories>\n<distributionManagement>\n  <repository><id>${owner}</id><url>${api}/maven</url></repository>\n  <snapshotRepository><id>${owner}</id><url>${api}/maven</url></snapshotRepository>\n</distributionManagement>`,
      );
      add(
        t("install.dependency"),
        `<dependency>\n  <groupId>${value("GroupID")}</groupId>\n  <artifactId>${value("ArtifactID", name)}</artifactId>\n  <version>${version}</version>\n</dependency>`,
      );
      break;
    case "pub":
      add(
        t("install.addDependency"),
        `dart pub add ${name} --hosted-url ${api}/pub`,
      );
      break;
    case "conda":
      add(
        t("install.configureFile", { file: ".condarc" }),
        `channel_alias: ${api}/conda\nchannels:\n  - ${api}/conda\ndefault_channels:\n  - ${api}/conda`,
      );
      add(
        t("install.configureChannel"),
        `conda config --add channels ${api}/conda`,
      );
      add(
        t("install.installPackage"),
        `conda install${value("CondaChannel") ? " -c " + value("CondaChannel") : ""} ${value("CondaName", name)}=${version}`,
      );
      break;
    case "cran":
      add(
        t("install.installPackage"),
        `install.packages("${name}", repos="${api}/cran")`,
      );
      break;
    case "conan":
      add(
        t("install.configureRemote"),
        `conan remote add ${owner} ${api}/conan`,
      );
      add(
        t("install.installPackage"),
        `conan install --requires=${name}/${version} --remote=${owner}`,
      );
      break;
    case "swift":
      add(
        t("install.addDependency"),
        `dependencies: [\n  .package(id: "${name}", from: "${version}")\n]`,
      );
      add(t("install.installPackage"), "swift package resolve");
      add(
        t("install.configureRegistry"),
        `swift package-registry set ${api}/swift`,
      );
      break;
    case "vagrant":
      add(
        t("install.addBox"),
        `vagrant box add "${location.origin}${appSubUrl}/api/packages/${encode(owner)}/vagrant/${encode(name)}" --box-version ${version}`,
      );
      break;
    case "chef":
      add(
        t("install.configureFile", { file: "knife.rb" }),
        `knife[:supermarket_site] = "${api}/chef"`,
      );
      add(
        t("install.installCookbook"),
        `knife supermarket install ${name} ${version}`,
      );
      break;
    case "debian":
      add(
        t("install.importKey"),
        `sudo curl ${api}/debian/repository.key -o /etc/apt/keyrings/forgejo-${owner}.asc`,
      );
      add(
        t("install.configureApt"),
        values("RepositoryDistributions", ["$distribution"])
          .map(
            (distribution) =>
              `deb [signed-by=/etc/apt/keyrings/forgejo-${owner}.asc] ${api}/debian ${distribution} ${values("RepositoryComponents", ["$component"]).join(" ")}`,
          )
          .join("\n"),
      );
      add(t("install.installPackage"), `apt install ${name}=${version}`);
      break;
    case "alpine":
      add(
        t("install.configureApk"),
        values("RepositoryBranches", ["$branch"])
          .flatMap((branch) =>
            values("RepositoryRepositories", ["$repository"]).map(
              (repository) => `${api}/alpine/${branch}/${repository}`,
            ),
          )
          .join("\n"),
      );
      add(t("install.downloadKey"), `curl -JO ${api}/alpine/key`);
      add(t("install.installPackage"), `apk add ${name}=${version}`);
      break;
    case "arch":
      add(
        t("install.downloadKey"),
        `wget -O sign.gpg ${api}/arch/repository.key\npacman-key --add sign.gpg\npacman-key --lsign-key '${signMail || `${owner}@noreply.${registry}`}'`,
      );
      add(
        t("install.configureFile", { file: "pacman.conf" }),
        values("RepositoryGroups", ["$distribution"])
          .map(
            (group) =>
              `[${owner.toLowerCase()}.${registry}]\nSigLevel = Required\nServer = ${api}/arch/${group}/$arch`,
          )
          .join("\n\n"),
      );
      add(t("install.installPackage"), `pacman -Sy ${name.toLowerCase()}`);
      break;
    case "rpm":
    case "alt":
      for (const group of values("RepositoryGroups", [""])) {
        const title = group
          ? t("install.configureRepositoryGroup", { group })
          : t("install.configureRepository");
        if (type === "rpm")
          add(
            title,
            `dnf config-manager addrepo --from-repofile="${api}/rpm${group ? "/" + group : ""}.repo"\nzypper addrepo ${api}/rpm${group ? "/" + group : ""}.repo`,
          );
        else
          add(
            title,
            `apt-repo add rpm ${api}/alt/${group || "alt"}.repo _arch_ classic`,
          );
      }
      add(
        t("install.installPackage"),
        type === "rpm"
          ? `dnf install ${name}\nzypper install ${name}`
          : `apt-get install ${name}`,
      );
      break;
  }
  return (
    <>
      {commands.map((command, index) => (
        <Command key={index} {...command} />
      ))}
      <p className="text-sm text-muted">{t("packages.credentials")}</p>
      <a
        href={`https://forgejo.org/docs/latest/user/packages/${type}/`}
        target="_blank"
        rel="noreferrer"
      >
        {t("packages.documentation", { type })}
      </a>
    </>
  );
}
function PackageMetadata({ item }: { item: PackageItem }) {
  const { t } = useTranslation("settings");
  const labels: Record<string, string> = {
    Dependencies: t("metadataFields.dependencies"),
    DevelopmentDependencies: t("metadataFields.developmentDependencies"),
    PeerDependencies: t("metadataFields.peerDependencies"),
    OptionalDependencies: t("metadataFields.optionalDependencies"),
    RuntimeDependencies: t("metadataFields.runtimeDependencies"),
    Require: t("metadataFields.require"),
    RequireDev: t("metadataFields.requireDev"),
    RequiredRubyVersion: t("metadataFields.requiredRubyVersion"),
    RequiredRubygemsVersion: t("metadataFields.requiredRubygemsVersion"),
    ProjectURL: t("metadataFields.projectURL"),
    RepositoryURL: t("metadataFields.repositoryURL"),
    DocumentationURL: t("metadataFields.documentationURL"),
    Homepage: t("metadataFields.homepage"),
    License: t("metadataFields.license"),
    Author: t("metadataFields.author"),
    Authors: t("metadataFields.authors"),
  };
  const fields = Object.entries(item.metadata).filter(
    ([key, value]) =>
      ![
        "Readme",
        "Description",
        "Summary",
        "Scope",
        "Type",
        "IsTagged",
        "Manifests",
        "CondaName",
        "CondaChannel",
      ].includes(key) &&
      value !== null &&
      value !== "" &&
      (!Array.isArray(value) || value.length),
  );
  if (!fields.length) return null;
  return (
    <section className={packageCard}>
      <h2 className={packageCardTitle}>{t("packages.metadata")}</h2>
      <dl className="package-metadata">
        {fields.map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[170px_minmax(0,1fr)] gap-4 border-b border-line py-3 text-[13px] max-[851px]:grid-cols-[1fr]"
          >
            <dt className="font-semibold">
              {labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </dt>
            <dd className="[overflow-wrap:anywhere]">
              <MetadataValue value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function PackageSettingsRouter({
  organization = false,
}: {
  organization?: boolean;
}) {
  const { org = "", name = "" } = useParams(),
    namespace = org || name;
  return (
    <SharedPackageSettings
      nativeRoot={
        organization
          ? `/org/${encode(namespace)}/settings/packages`
          : "/user/settings/packages"
      }
      uiRoot={
        organization
          ? `/organizations/${encode(namespace)}/settings/packages`
          : "/account/packages"
      }
    />
  );
}
export function SharedPackageSettings({
  nativeRoot,
  uiRoot,
}: {
  nativeRoot: string;
  uiRoot: string;
}) {
  const { t } = useTranslation("settings");
  const location = useLocation(),
    client = useQueryClient(),
    suffix = location.pathname.slice(uiRoot.length),
    query = usePackageData(nativeRoot + suffix);
  useTitle(t("packageSettings.title"));
  const cargo = useMutation({
    mutationFn: (action: string) =>
      nativeForm(`${nativeRoot}/cargo/${action}`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ["packages"] }),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  return (
    <div className="m-auto max-w-[1000px] [&>div>h2]:mb-4 [&>div>h2]:text-[16px] [&>div>h2]:font-semibold">
      <div className={packageHeading}>
        <div>
          <h1 className={packageTitle}>
            {suffix.endsWith("/preview")
              ? t("packageSettings.previewTitle")
              : suffix.includes("/rules/")
                ? t("packageSettings.ruleTitle")
                : t("packageSettings.title")}
          </h1>
          <p className={packageHeadingText}>
            {t("packageSettings.description")}
          </p>
        </div>
        {suffix && (
          <Link className="button" to={uiRoot}>
            {t("packageSettings.back")}
          </Link>
        )}
      </div>
      {suffix.endsWith("/preview") ? (
        <>
          <p>{t("packageSettings.previewBody")}</p>
          {data.preview.length ? (
            <PackageRows items={data.preview} />
          ) : (
            <EmptyState title={t("packageSettings.noMatches")} />
          )}
        </>
      ) : suffix.includes("/rules/") ? (
        <CleanupRuleForm
          key={suffix}
          data={data}
          endpoint={nativeRoot + suffix}
          uiRoot={uiRoot}
        />
      ) : (
        <>
          <section className={packageCard}>
            <div className={packageHeading}>
              <div>
                <h2 className={packageCardTitle}>
                  {t("packageSettings.policies")}
                </h2>
                <p className={packageHeadingText}>
                  {t("packageSettings.policiesDescription")}
                </p>
              </div>
              <Link className="button primary" to={`${uiRoot}/rules/add`}>
                {t("packageSettings.addRule")}
              </Link>
            </div>
            {data.rules.length ? (
              <div>
                {data.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 border-t border-line py-4 max-[851px]:flex-wrap"
                  >
                    <div className="flex-1">
                      <strong>{rule.type}</strong>
                      <p className="mt-1 text-[13px] text-muted">
                        {cleanupSummary(t, rule)}
                      </p>
                    </div>
                    <Link className="button" to={`${uiRoot}/rules/${rule.id}`}>
                      {t("form.edit")}
                    </Link>
                    <Link
                      className="button"
                      to={`${uiRoot}/rules/${rule.id}/preview`}
                    >
                      {t("packageSettings.preview")}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                {t("packageSettings.noRules")}
              </p>
            )}
          </section>
          <section className={packageCard}>
            <h2 className={packageCardTitle}>
              {t("packageSettings.cargoTitle")}
            </h2>
            <p>
              {data.cargo_index
                ? t("packageSettings.cargoRebuildDescription")
                : t("packageSettings.cargoInitDescription")}
            </p>
            <Feedback error={cargo.error} />
            <button
              className="button"
              disabled={cargo.isPending}
              onClick={() =>
                cargo.mutate(data.cargo_index ? "rebuild" : "initialize")
              }
            >
              {data.cargo_index
                ? t("packageSettings.cargoRebuild")
                : t("packageSettings.cargoInit")}
            </button>
            {cargo.isSuccess && (
              <p role="status">{t("packageSettings.cargoUpdated")}</p>
            )}
          </section>
          {nativeRoot === "/user/settings/packages" && (
            <section className={packageCard}>
              <h2 className={packageCardTitle}>
                {t("packageSettings.chefTitle")}
              </h2>
              <p>{t("packageSettings.chefDescription")}</p>
              <ConfirmAction
                label={t("packageSettings.chefGenerate")}
                title={t("packageSettings.chefQuestion")}
                action={async () => {
                  const response = await fetch(
                    native(`${nativeRoot}/chef/regenerate_keypair`),
                    {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "X-Forgejo-UI": "1" },
                    },
                  );
                  if (
                    !response.ok ||
                    response.redirected ||
                    !response.headers.get("content-type")?.includes("pem")
                  )
                    throw new Error(t("packageSettings.chefFailed"));
                  const url = URL.createObjectURL(await response.blob()),
                    link = document.createElement("a");
                  link.href = url;
                  link.download = "chef-private-key.pem";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
              >
                {t("packageSettings.chefBody")}
              </ConfirmAction>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function cleanupSummary(t: TFunction<"settings">, rule: CleanupRule) {
  const state = rule.enabled ? t("form.enabled") : t("form.disabled"),
    keep = rule.keep_count
      ? t("packageSettings.keepCount", { count: rule.keep_count })
      : t("packageSettings.keepAll");
  return rule.remove_days
    ? t("packageSettings.ruleSummaryRemoval", {
        state,
        keep,
        remove: t("packageSettings.removeAfter", { count: rule.remove_days }),
      })
    : t("packageSettings.ruleSummary", { state, keep });
}
function CleanupRuleForm({
  data,
  endpoint,
  uiRoot,
}: {
  data: PackageData;
  endpoint: string;
  uiRoot: string;
}) {
  const { t } = useTranslation("settings");
  const initial = data.rule!,
    [rule, setRule] = useState(initial),
    navigate = useNavigate(),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      nativeForm(endpoint, {
        action: "save",
        id: String(rule.id),
        type: rule.type || data.types[0].value,
        enabled: String(rule.enabled),
        match_full_name: String(rule.match_full_name),
        keep_count: String(rule.keep_count),
        keep_pattern: rule.keep_pattern,
        remove_days: String(rule.remove_days),
        remove_pattern: rule.remove_pattern,
      }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["packages"] });
      const id = result.redirect?.match(/rules\/(\d+)/)?.[1];
      if (id) navigate(`${uiRoot}/rules/${id}`);
    },
  });
  return (
    <form
      className="workspace-form mb-6 gap-5 rounded-lg border border-line bg-surface p-6 max-[851px]:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="check-field">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(event) =>
            setRule({ ...rule, enabled: event.target.checked })
          }
        />
        {t("cleanup.enable")}
      </label>
      <SelectControl
        label={t("packages.type")}
        value={rule.type || data.types[0].value}
        onValueChange={(type) => setRule({ ...rule, type })}
        options={data.types}
        disabled={!!rule.id}
      />
      <label className="check-field">
        <input
          type="checkbox"
          checked={rule.match_full_name}
          onChange={(event) =>
            setRule({ ...rule, match_full_name: event.target.checked })
          }
        />
        {t("cleanup.matchFullName")}
      </label>
      <h2 className={packageFormTitle}>{t("cleanup.keepHeading")}</h2>
      <SelectControl
        label={t("cleanup.keepRecent")}
        value={String(rule.keep_count)}
        onValueChange={(value) =>
          setRule({ ...rule, keep_count: Number(value) })
        }
        options={[0, 1, 5, 10, 25, 50, 100].map((value) => ({
          value: String(value),
          label: value
            ? t("cleanup.versions", { count: value })
            : t("cleanup.noMinimum"),
        }))}
      />
      <label className={packageFormLabel}>
        {t("cleanup.keepPattern")}
        <input
          value={rule.keep_pattern}
          onChange={(event) =>
            setRule({ ...rule, keep_pattern: event.target.value })
          }
          placeholder={t("cleanup.regexPlaceholder")}
        />
      </label>
      <h2 className={packageFormTitle}>{t("cleanup.removeHeading")}</h2>
      <SelectControl
        label={t("cleanup.olderThan")}
        value={String(rule.remove_days)}
        onValueChange={(value) =>
          setRule({ ...rule, remove_days: Number(value) })
        }
        options={[0, 7, 14, 30, 60, 90, 180].map((value) => ({
          value: String(value),
          label: value
            ? t("cleanup.days", { count: value })
            : t("cleanup.anyAge"),
        }))}
      />
      <label className={packageFormLabel}>
        {t("cleanup.removePattern")}
        <input
          value={rule.remove_pattern}
          onChange={(event) =>
            setRule({ ...rule, remove_pattern: event.target.value })
          }
          placeholder={t("cleanup.regexPlaceholder")}
        />
      </label>
      <Feedback error={save.error} />
      <div className={packageActions}>
        <button className="button primary" disabled={save.isPending}>
          {rule.id ? t("cleanup.save") : t("cleanup.create")}
        </button>
        {!!rule.id && (
          <>
            <Link className="button" to={`${uiRoot}/rules/${rule.id}/preview`}>
              {t("cleanup.preview")}
            </Link>
            <ConfirmAction
              title={t("cleanup.deleteQuestion")}
              label={t("cleanup.delete")}
              action={async () => {
                await nativeForm(endpoint, {
                  action: "remove",
                  id: String(rule.id),
                });
                await client.invalidateQueries({ queryKey: ["packages"] });
                navigate(uiRoot);
              }}
            >
              {t("cleanup.deleteBody")}
            </ConfirmAction>
          </>
        )}
        {save.isSuccess && <span role="status">{t("cleanup.saved")}</span>}
      </div>
    </form>
  );
}

function MetadataValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>—</>;
  if (typeof value === "string" && /^https?:\/\//i.test(value))
    return (
      <a
        className="text-primary hover:underline"
        href={value}
        target="_blank"
        rel="noopener noreferrer"
      >
        {value}
      </a>
    );
  if (typeof value !== "object") return <>{String(value)}</>;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object"))
      return (
        <ul className="pl-4 leading-[1.8]">
          {value.map((item, index) => (
            <li key={index}>
              <MetadataValue value={item} />
            </li>
          ))}
        </ul>
      );
    const columns = [
      ...new Set(
        value.flatMap((item) =>
          item && typeof item === "object" ? Object.keys(item) : [],
        ),
      ),
    ];
    return (
      <div className={packageTableWrap}>
        <table className={packageTable}>
          <thead className="bg-surface-subtle">
            <tr>
              {columns.map((key) => (
                <th key={key} className={packageHeaderCell}>
                  {key.replace(/[_-]/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((item, index) => (
              <tr key={index}>
                {columns.map((key) => (
                  <td key={key} className={packageCell}>
                    <MetadataValue value={item?.[key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className={packageTableWrap}>
      <table className={packageTable}>
        <tbody>
          {Object.entries(value).map(([key, item]) => (
            <tr key={key}>
              <th scope="row" className={packageHeaderCell}>
                {key}
              </th>
              <td className={packageCell}>
                <MetadataValue value={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
