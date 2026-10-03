import i18n from "./i18n";
import { registerMarkup } from "./markup";

export const uiBase = new URL(
  document.querySelector("base")!.href,
).pathname.replace(/\/$/, "");
export const appSubUrl = uiBase.slice(0, -"/-/ui".length);
export const native = (path: string) => `${appSubUrl}${path}`;
export const repoPath = (owner: string, repo: string) =>
  `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public loginRequired = false,
  ) {
    super(message);
  }
}
// Files pasted or dropped into a markdown editor are uploaded immediately and
// linked as /attachments/{uuid}. Like native forms (files / files[] fields),
// the save request that contains such a link also attaches the file to the
// issue, comment or release, so other people can open it.
const pendingUploads = new Set<string>();
export function rememberUpload(uuid: string) {
  pendingUploads.add(uuid);
}
function attachPendingUploads(path: string, body: unknown) {
  if (
    !pendingUploads.size ||
    !(body instanceof URLSearchParams || body instanceof FormData)
  )
    return [];
  const content = body.get("content");
  if (typeof content !== "string") return [];
  const field =
    body.has("files[]") ||
    /\/(?:issues|pulls)\/\d+\/content$|\/comments\/\d+$/.test(
      path.split("?")[0],
    )
      ? "files[]"
      : "files";
  const linked: string[] = [];
  for (const uuid of pendingUploads) {
    if (!content.includes(`/attachments/${uuid}`)) continue;
    if (!body.getAll(field).includes(uuid)) body.append(field, uuid);
    linked.push(uuid);
  }
  return linked;
}
export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; total: number }> {
  const linked =
    init?.method === "POST" ? attachPendingUploads(path, init.body) : [];
  const response = await fetch(native(path), {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (response.status === 204 && !response.redirected)
    return { data: undefined as T, total: 0 };
  const contentType = response.headers.get("content-type") ?? "";
  if (response.redirected || !contentType.includes("application/json")) {
    if (!response.ok && response.status !== 404)
      throw new RequestError(
        i18n.t("api.requestFailed", { status: response.status }),
        response.status,
      );
    if (response.status === 404)
      throw new RequestError(i18n.t("api.notFound"), 404);
    throw new RequestError(i18n.t("api.sessionExpired"), response.status, true);
  }
  const data = await response.json();
  if (
    !response.ok ||
    data?.errorMessage ||
    data?.error ||
    (data?.ok === false && data?.err)
  ) {
    const message =
      data?.errorMessage ||
      data?.message ||
      (typeof data?.err === "string" ? data.err : "") ||
      (typeof data?.error === "string"
        ? data.error
        : i18n.t("api.notCompleted"));
    throw new RequestError(message, response.status);
  }
  for (const uuid of linked) pendingUploads.delete(uuid);
  registerMarkup(path, data, appSubUrl);
  return {
    data: data as T,
    total: Number(response.headers.get("x-total-count") ?? 0),
  };
}
export const get = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, { signal }).then((r) => r.data);
export function post<T>(path: string, data: unknown) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => r.data);
}
export interface Bootstrap {
  install?: boolean;
  flash_error?: string;
  contract: number;
  app_name: string;
  app_sub_url: string;
  /** Configured ROOT_URL; absolute links Forgejo renders start with it. */
  app_url?: string;
  auth_state:
    | "anonymous"
    | "ready"
    | "password_change"
    | "inactive"
    | "blocked"
    | "security_setup";
  auth: {
    internal_login: boolean;
    captcha_required: boolean;
    password_reset: boolean;
    require_sign_in: boolean;
  };
  user: {
    id: number;
    username: string;
    name: string;
    avatar: string;
    admin: boolean;
    /** Whether the "+" menu offers "New organization" (native navbar rule). */
    can_create_org?: boolean;
    theme?: string;
  } | null;
  /** The signed-in user's running time tracker, if any. */
  stopwatch?: ActiveStopwatch | null;
  /** Locale resolved by Forgejo (user preference, lang cookie or browser). */
  locale?: string;
  languages?: { lang: string; name: string }[];
}
export interface ActiveStopwatch {
  owner: string;
  repo: string;
  index: number;
  title: string;
  pull: boolean;
  /** Elapsed seconds when the data was produced. */
  seconds: number;
}
export interface Repository {
  status?: number;
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  archived: boolean;
  empty?: boolean;
  default_branch: string;
  stars_count: number;
  starred?: boolean;
  signed_in?: boolean;
  forks_count?: number;
  open_issues_count?: number;
  open_pr_counter?: number;
  updated_at?: string;
  link: string;
  clone?: { HTTPS: string; SSH: string };
  units?: Record<string, boolean>;
  permissions?: {
    admin: boolean;
    write_code: boolean;
    write_projects: boolean;
  };
}
export interface RepoSearch {
  ok: boolean;
  data: { repository: Repository; latest_commit_status?: { status: string } }[];
}
export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  comments: number;
  updated_at: string;
  created_at?: string;
  assignees?: { login: string; avatar_url: string }[];
  milestone?: { title: string };
  due_date?: string;
  user: { login: string; avatar_url: string };
  labels: { id: number; name: string; color: string }[];
  pull_request?: { merged: boolean; draft: boolean };
}
export interface Tree {
  empty: boolean;
  path: string;
  ref: string;
  sha: string;
  entries?: { name: string; path: string; type: string; commit?: Commit }[];
  content?: string;
  binary?: boolean;
  markup?: string;
  too_large?: boolean;
  lfs?: { oid: string; size: number; available: boolean };
  submodule?: string;
  editable?: boolean;
  commit?: { message: string; author: string; date: string };
}
export interface Project {
  id: number;
  title: string;
  description: string;
  closed: boolean;
}
export interface Board {
  project: Project;
  can_write: boolean;
  columns: { id: number; title: string; color: string; issues: Issue[] }[];
}

export interface FormResult {
  redirect?: string;
  page?: string;
  reset_sent?: boolean;
  reset_disabled?: boolean;
  resend_limited?: boolean;
}
// The original browser action handles validation, permissions, CSRF and cookies.
// This header requests the small structured response added by our build patch.
export const nativeForm = (path: string, values?: Record<string, string>) =>
  getForm(path, values);
async function getForm(path: string, values?: Record<string, string>) {
  return request<FormResult>(path, {
    method: values ? "POST" : "GET",
    headers: {
      "X-Forgejo-UI": "1",
      ...(values
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: values ? new URLSearchParams(values) : undefined,
  }).then((result) => result.data);
}

// Opt in to selected data from the normal, session-authenticated page handlers.
export const nativePage = <T>(path: string, signal?: AbortSignal): Promise<T> =>
  request<T & { redirect?: string }>(path, {
    signal,
    headers: { "X-Forgejo-UI": "1" },
  }).then(({ data }) => {
    if (data.redirect)
      throw new RequestError(
        i18n.t("api.pageUnavailable"),
        403,
        /\/user\/login/.test(data.redirect),
      );
    return data;
  });

export async function nativeText(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(native(path), {
    credentials: "same-origin",
    signal,
    headers: { Accept: "text/plain" },
  });
  if (
    !response.ok ||
    response.redirected ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new RequestError(i18n.t("api.changesUnavailable"), response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error(i18n.t("api.changesTooLarge"));
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks as BlobPart[]).text();
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}
