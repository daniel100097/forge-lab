import { lazy, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileWarning, Pencil, TriangleAlert, X } from "lucide-react";
import { native, nativePage, request, type FormResult } from "./api";
import { Feedback, Pagination, Pending, relativeDate } from "./UI";
import { formatBytes } from "./SettingsExtras";
import {
  SettingsDelete,
  SettingsFields,
  SettingsForm,
  SettingsSection,
  settingsEmpty,
  settingsList,
  settingsMuted,
  settingsRow,
  settingsRowBody,
  settingsTab,
  settingsTabs,
  settingsToolbar,
} from "./ProjectSettings";

// The repository viewer's previews; LFS objects have no file name, so the
// native content sniffing (PDF, GLB) selects the preview.
const MediaPreview = lazy(() =>
  import("./RepositoryPreviews").then((module) => ({
    default: module.MediaPreview,
  })),
);
function Flag({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={
        value
          ? "inline-flex items-center gap-1 text-success"
          : "inline-flex items-center gap-1 text-muted"
      }
    >
      {value ? <Check size={14} /> : <X size={14} />}
      {label}
    </span>
  );
}
interface StorageItem {
  id: number;
  oid: string;
  size: number;
  created: string;
  existing: boolean;
  path: string;
  owner: string;
  owner_display?: string;
  linkable?: boolean;
  lockable?: boolean;
  parents?: string[];
  name: string;
  active: boolean;
  sha: string;
  summary: string;
  branch: string;
  when: string;
  exists: boolean;
  in_repo: boolean;
  associatable: boolean;
  accessible: boolean;
}
interface StorageData {
  section: string;
  total: number;
  page_size: number;
  items: StorageItem[];
  associated: number;
  missing: number;
  associatable: number;
  hook: { name: string; content: string; sample: string; active: boolean };
  file: StorageItem;
  RawFileLink: string;
  FileContent: string;
  IsTextFile: boolean;
  IsImageFile: boolean;
  IsVideoFile: boolean;
  IsAudioFile: boolean;
  IsFileTooLarge: boolean;
  IsPDFFile?: boolean;
  Is3DModelFile?: boolean;
  IsGLBFile?: boolean;
  default_branch?: string;
  oid?: string;
  size?: number;
}
export function RepositoryStorageSettings({
  nativeRoot,
  uiRoot,
  section,
}: {
  nativeRoot: string;
  uiRoot: string;
  section: string;
}) {
  const { t, i18n } = useTranslation("settings");
  const bytes = (value: number) => formatBytes(value, i18n.language);
  const [params, setParams] = useSearchParams(),
    page = Math.max(1, Number(params.get("page")) || 1);
  const path = `${nativeRoot}/${section}`;
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["configuration-storage", path, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<StorageData>(`${path}?${params}`, signal),
  });
  // Native bulk association posts every associatable "oid size" pair.
  const associateAll = useMutation({
    mutationFn: (oids: string[]) =>
      request<FormResult>(`${nativeRoot}/lfs/pointers/associate`, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(oids.map((oid) => ["oid", oid])),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["configuration-storage"] }),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data!,
    repoRoot = uiRoot.replace(/\/settings$/, ""),
    repoNative = nativeRoot.replace(/\/settings$/, "");
  // Files at a commit open in the repository viewer.
  const fileAt = (ref: string, file: string) =>
    `${repoRoot}?${new URLSearchParams({ ref, path: file })}`;
  if (section === "hooks/git")
    return (
      <SettingsSection
        title={t("storage.gitHooksTitle")}
        description={t("storage.gitHooksDescription")}
        open
      >
        <div className={settingsList}>
          {data.items.map((hook) => (
            <article key={hook.name} className={settingsRow}>
              <div className={settingsRowBody}>
                <Link
                  className="font-semibold"
                  to={`${uiRoot}/hooks/git/${hook.name}`}
                >
                  {hook.name}
                </Link>
                <p className="text-muted">
                  {hook.active ? t("form.enabled") : t("storage.notConfigured")}
                </p>
              </div>
              <Link className="button" to={`${uiRoot}/hooks/git/${hook.name}`}>
                <Pencil size={14} />
                {t("form.edit")}
              </Link>
            </article>
          ))}
        </div>
      </SettingsSection>
    );
  if (section.startsWith("hooks/git/"))
    return (
      <SettingsSection
        title={t("storage.editHook", { name: data.hook.name })}
        description={t("storage.editHookDescription")}
        open
      >
        <SettingsForm
          path={path}
          onSaved={() => navigate(`${uiRoot}/hooks/git`)}
        >
          <SettingsFields
            fields={[
              {
                name: "content",
                label: t("storage.hookScript"),
                type: "textarea",
                value: data.hook.content || data.hook.sample,
              },
            ]}
          />
          <Link className="button self-start" to={`${uiRoot}/hooks/git`}>
            {t("form.cancel")}
          </Link>
        </SettingsForm>
      </SettingsSection>
    );
  return (
    <>
      <nav className={settingsTabs} aria-label={t("storage.lfsNav")}>
        {[
          ["lfs", t("storage.objectsTab")],
          ["lfs/locks", t("storage.locksTab")],
          ["lfs/pointers", t("storage.pointersTab")],
        ].map(([value, label]) => (
          <Link
            key={value}
            className={settingsTab(section === value)}
            to={`${uiRoot}/${value}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {section === "lfs/locks" ? (
        <SettingsSection
          title={t("storage.locksTitle")}
          description={t("storage.locksDescription")}
          open
        >
          <SettingsForm
            path={path}
            fields={[
              { name: "path", label: t("storage.filePath"), required: true },
            ]}
            button={t("storage.lock")}
          />
          <div className={settingsList}>
            {data.items.map((item) => (
              <article key={item.id} className={settingsRow}>
                <div className={settingsRowBody}>
                  {item.linkable && data.default_branch ? (
                    <Link
                      className="font-semibold break-all"
                      to={fileAt(data.default_branch, item.path)}
                    >
                      {item.path}
                    </Link>
                  ) : (
                    <strong className="break-all">{item.path}</strong>
                  )}
                  <p className="text-muted">
                    {t("storage.lockedBy", {
                      owner: item.owner_display || item.owner,
                      date: relativeDate(item.created),
                    })}
                  </p>
                  {/* Native lock warnings for the default branch. */}
                  {(item.linkable === false || item.lockable === false) && (
                    <p className="flex flex-wrap gap-x-4 gap-y-1">
                      {item.linkable === false && (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <FileWarning size={14} />
                          {t("storage.lockFileMissing")}
                        </span>
                      )}
                      {item.lockable === false && (
                        <span className="inline-flex items-center gap-1 text-[#8f4700] dark:text-[#e9c77b]">
                          <TriangleAlert size={14} />
                          {t("storage.lockNotLockable")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <SettingsDelete
                  path={`${nativeRoot}/lfs/locks/${item.id}/unlock`}
                  name={item.path}
                  label={t("storage.unlock")}
                />
              </article>
            ))}
          </div>
          {!data.items.length && (
            <p className={settingsEmpty}>{t("storage.noLocks")}</p>
          )}
        </SettingsSection>
      ) : section === "lfs/pointers" ? (
        <SettingsSection
          title={t("storage.pointersTitle")}
          description={t("storage.pointersDescription")}
          open
        >
          <div className={settingsToolbar}>
            <p className={settingsMuted}>
              {t("storage.pointerSummary", {
                pointers: t("storage.pointerCount", { count: data.total }),
                associated: t("storage.associatedCount", {
                  count: data.associated,
                }),
                missing: t("storage.missingCount", { count: data.missing }),
              })}
            </p>
            {data.associatable > 0 && (
              <button
                className="button primary"
                disabled={associateAll.isPending}
                onClick={() =>
                  associateAll.mutate(
                    data.items
                      .filter((item) => item.associatable)
                      .map((item) => `${item.oid} ${item.size}`),
                  )
                }
              >
                {t("storage.associateAll", { count: data.associatable })}
              </button>
            )}
          </div>
          <Feedback error={associateAll.error} />
          <div className={settingsList}>
            {data.items.map((item, index) => (
              <article key={`${item.oid}-${index}`} className={settingsRow}>
                <div className={settingsRowBody}>
                  {item.in_repo && item.exists ? (
                    <Link
                      className="font-semibold break-all"
                      to={`${uiRoot}/lfs/show/${item.oid}`}
                    >
                      {item.oid}
                    </Link>
                  ) : (
                    <strong className="break-all">{item.oid}</strong>
                  )}
                  <p className="text-muted">
                    {bytes(item.size)} ·{" "}
                    {item.in_repo
                      ? t("storage.associated")
                      : item.exists
                        ? t("storage.available")
                        : t("storage.missing")}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <a
                      className="font-mono text-muted hover:underline"
                      href={native(`${repoNative}/raw/blob/${item.sha}`)}
                      title={t("storage.blobHash")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.sha.slice(0, 10)}
                    </a>
                    <Flag value={item.in_repo} label={t("storage.inRepo")} />
                    <Flag value={item.exists} label={t("storage.inStore")} />
                    <Flag
                      value={item.accessible}
                      label={t("storage.accessible")}
                    />
                  </p>
                </div>
                <Link
                  className="button"
                  to={`${uiRoot}/lfs/find?oid=${item.oid}&size=${item.size}&sha=${item.sha}`}
                >
                  {t("storage.findReferences")}
                </Link>
                {item.associatable && (
                  <SettingsForm
                    path={`${nativeRoot}/lfs/pointers/associate`}
                    hidden={{ oid: `${item.oid} ${item.size}` }}
                    button={t("storage.associate")}
                  />
                )}
              </article>
            ))}
          </div>
          {!data.items.length && (
            <p className={settingsEmpty}>{t("storage.noPointers")}</p>
          )}
        </SettingsSection>
      ) : section === "lfs/find" ? (
        <SettingsSection
          title={t("storage.referencesTitle")}
          description={t("storage.referencesDescription")}
          open
        >
          <div className={settingsList}>
            {data.items.map((item, index) => (
              <article key={index} className={settingsRow}>
                <div className={settingsRowBody}>
                  <Link
                    className="font-semibold break-all"
                    to={fileAt(item.sha, item.name)}
                  >
                    {item.name}
                  </Link>
                  <p className="text-muted">
                    <Link
                      className="hover:underline"
                      to={`${repoRoot}/commit/${item.sha}`}
                    >
                      {item.summary}
                    </Link>{" "}
                    · {item.branch} · {relativeDate(item.when)}
                  </p>
                  {!!item.parents?.length && (
                    <p className="flex flex-wrap items-center gap-1 text-muted">
                      {t("storage.parents")}
                      {item.parents.map((parent) => (
                        <Link
                          key={parent}
                          className="font-mono hover:underline"
                          to={`${repoRoot}/commit/${parent}`}
                        >
                          {parent.slice(0, 8)}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
                <Link
                  className="font-mono break-all"
                  to={`${repoRoot}/commit/${item.sha}`}
                  aria-label={t("storage.commitLabel", {
                    sha: item.sha.slice(0, 8),
                  })}
                >
                  {item.sha.slice(0, 8)}
                </Link>
              </article>
            ))}
          </div>
          {!data.items.length && (
            <p className={settingsEmpty}>{t("storage.noReferences")}</p>
          )}
        </SettingsSection>
      ) : section.startsWith("lfs/show/") ? (
        <SettingsSection
          title={t("storage.objectTitle")}
          description={data.file.oid}
          open
        >
          <div className={settingsToolbar}>
            <span>{bytes(data.file.size)}</span>
            <div className="flex flex-wrap gap-2">
              <Link
                className="button"
                to={`${uiRoot}/lfs/find?oid=${data.file.oid}&size=${data.file.size}`}
              >
                {t("storage.findReferences")}
              </Link>
              <a className="button" href={data.RawFileLink} download>
                {t("storage.download")}
              </a>
            </div>
          </div>
          {data.IsTextFile && data.IsFileTooLarge ? (
            <p className={settingsEmpty}>{t("storage.tooLarge")}</p>
          ) : data.IsTextFile && !data.IsFileTooLarge ? (
            <div
              className="configuration-lfs-preview max-h-[700px] overflow-auto rounded-md border border-line bg-code p-4 font-mono text-xs leading-6"
              dangerouslySetInnerHTML={{ __html: data.FileContent }}
            />
          ) : data.IsImageFile ? (
            <img
              className="max-h-[700px] max-w-full rounded-md"
              src={data.RawFileLink}
              alt={t("storage.objectAlt", { oid: data.file.oid })}
            />
          ) : data.IsVideoFile ? (
            <video
              className="max-h-[700px] max-w-full rounded-md"
              controls
              src={data.RawFileLink}
            />
          ) : data.IsAudioFile ? (
            <audio controls src={data.RawFileLink} />
          ) : data.IsPDFFile || (data.Is3DModelFile && data.IsGLBFile) ? (
            <div className="overflow-hidden rounded-md border border-line">
              <Suspense fallback={<Pending />}>
                <MediaPreview
                  url={data.RawFileLink}
                  filename={`${data.file.oid}.${data.IsPDFFile ? "pdf" : "glb"}`}
                />
              </Suspense>
            </div>
          ) : (
            <p className={settingsEmpty}>{t("storage.downloadToView")}</p>
          )}
        </SettingsSection>
      ) : (
        <SettingsSection
          title={t("storage.objectsTitle")}
          description={t("storage.objectsDescription")}
          open
        >
          <div className={settingsList}>
            {data.items.map((item) => (
              <article key={item.id} className={settingsRow}>
                <div className={settingsRowBody}>
                  <Link
                    className="font-semibold break-all"
                    to={`${uiRoot}/lfs/show/${item.oid}`}
                  >
                    {item.oid}
                  </Link>
                  <p className="text-muted">
                    {t("storage.objectSummary", {
                      size: bytes(item.size),
                      date: relativeDate(item.created),
                    })}
                  </p>
                </div>
                <Link
                  className="button"
                  to={`${uiRoot}/lfs/find?oid=${item.oid}&size=${item.size}`}
                >
                  {t("storage.findReferences")}
                </Link>
                <SettingsDelete
                  path={`${nativeRoot}/lfs/delete/${item.oid}`}
                  name={t("storage.objectName", { oid: item.oid.slice(0, 12) })}
                />
              </article>
            ))}
          </div>
          {!data.items.length && (
            <p className={settingsEmpty}>{t("storage.noObjects")}</p>
          )}
        </SettingsSection>
      )}
      {["lfs", "lfs/locks"].includes(section) && (
        <Pagination
          page={page}
          total={data.total || 0}
          size={data.page_size}
          onPage={(next) => setParams({ page: String(next) })}
        />
      )}
    </>
  );
}
