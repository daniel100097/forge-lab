// Markup rendered by Forgejo arrives next to the raw text in data responses:
// a field "X" gets "X_html" (sanitized HTML) and, when the viewer may edit it,
// "X_edit" ({url, version}: the native update endpoint used for task lists).
// Pages keep passing the raw text to <Markdown>; it finds the rendered HTML here
// by repository/owner context and raw text, and falls back to the client
// renderer when Forgejo did not render it.

export interface MarkupEdit {
  /** Native endpoint (may include the instance sub-path), e.g. /o/r/comments/5. */
  url: string;
  version: number;
}
export interface RenderedMarkup {
  html: string;
  edit?: MarkupEdit;
}

const limit = 4000;
const registry = new Map<string, RenderedMarkup>();
const reserved = new Set([
  "",
  "-",
  "api",
  "admin",
  "user",
  "explore",
  "repo",
  "notifications",
  "attachments",
  "avatars",
  "assets",
]);

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const key = (context: string, raw: string) => `${context}\u0000${raw}`;

/** "owner/repo" or "owner" for a native (or SPA data) request path. */
export function nativeMarkupContext(path: string, subUrl = ""): string {
  let clean = path.split(/[?#]/, 1)[0];
  if (subUrl && clean.startsWith(subUrl + "/"))
    clean = clean.slice(subUrl.length);
  let parts = clean.split("/").filter(Boolean).map(decode);
  if (parts[0] === "-" && parts[1] === "ui" && parts[2] === "data") {
    if (parts[3] !== "repos") return "";
    parts = parts.slice(4);
  } else if (parts[0] === "org") parts = parts.slice(1, 2);
  if (!parts.length || reserved.has(parts[0])) return "";
  return (
    parts.length === 1 || parts[1] === "-"
      ? parts[0]
      : `${parts[0]}/${parts[1]}`
  ).toLowerCase();
}

/** The same context for an SPA location (/projects/o/r, /users/u, …). */
export function uiMarkupContext(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean).map(decode);
  if (parts[0] === "projects" && parts[1] && parts[2])
    return `${parts[1]}/${parts[2]}`.toLowerCase();
  if (
    (parts[0] === "users" || parts[0] === "organizations") &&
    parts[1] &&
    !["new", "invite"].includes(parts[1])
  )
    return parts[1].toLowerCase();
  return "";
}

function parseEdit(value: unknown): MarkupEdit | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { url, version } = value as Record<string, unknown>;
  return typeof url === "string" && typeof version === "number"
    ? { url, version }
    : undefined;
}

function remember(context: string, raw: string, value: RenderedMarkup) {
  const id = key(context, raw);
  registry.delete(id);
  registry.set(id, value);
  if (registry.size > limit)
    registry.delete(registry.keys().next().value as string);
}

function walk(context: string, value: unknown, depth: number) {
  if (depth > 12 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(context, item, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [name, field] of Object.entries(record)) {
    if (name.endsWith("_html")) {
      const base = name.slice(0, -5);
      const raw = record[base];
      if (typeof field === "string" && field && typeof raw === "string")
        remember(context, raw, {
          html: field,
          edit: parseEdit(record[`${base}_edit`]),
        });
    } else if (field && typeof field === "object")
      walk(context, field, depth + 1);
  }
}

/** Records Forgejo-rendered markup found in a data response. */
export function registerMarkup(path: string, data: unknown, subUrl = "") {
  const context = nativeMarkupContext(path, subUrl);
  if (context) walk(context, data, 0);
}

export function lookupMarkup(
  context: string,
  raw: string,
): RenderedMarkup | undefined {
  return context ? registry.get(key(context, raw)) : undefined;
}

/**
 * After a task-list toggle both the previous text (still held by the page
 * until it refetches) and the new text show the updated rendering.
 */
export function replaceMarkup(
  context: string,
  previous: string,
  raw: string,
  value: RenderedMarkup,
) {
  remember(context, previous, value);
  remember(context, raw, value);
}
