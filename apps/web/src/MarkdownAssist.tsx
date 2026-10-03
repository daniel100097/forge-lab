import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleDot, GitMerge, Users } from "lucide-react";
import {
  get,
  native,
  rememberUpload,
  request,
  uiBase,
  type Issue,
} from "./api";

/** Where the editor is: the repository, issue and kind of content. */
export interface EditorContext {
  /** Encoded native repository path ("/owner/repo"), if any. */
  repo: string;
  issue?: number;
  wiki: boolean;
  /** Native attachment upload endpoint for this content, if it takes files. */
  uploadPath?: string;
}

export function editorContext(): EditorContext {
  const path =
    typeof window === "undefined"
      ? ""
      : window.location.pathname.startsWith(uiBase + "/")
        ? window.location.pathname.slice(uiBase.length)
        : window.location.pathname;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "projects" || !parts[1] || !parts[2])
    return { repo: "", wiki: false };
  const repo = `/${parts[1]}/${parts[2]}`;
  const section = parts[3] ?? "";
  const issue = /^\d+$/.test(parts[4] ?? "") ? Number(parts[4]) : undefined;
  return {
    repo,
    issue: ["issues", "merge-requests"].includes(section) ? issue : undefined,
    wiki: section === "wiki",
    uploadPath: ["issues", "merge-requests"].includes(section)
      ? `${repo}/issues/attachments`
      : section === "releases"
        ? `${repo}/releases/attachments`
        : undefined,
  };
}

/**
 * Forgejo-rendered preview through the native markup endpoint. It renders
 * absolute ROOT_URL links; they become instance-relative so they work (and
 * navigate within the application) on whatever origin serves the UI.
 */
export async function renderPreview(
  context: EditorContext,
  text: string,
  appUrl?: string,
) {
  const response = await fetch(native(`${context.repo}/markup`), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      mode: context.wiki ? "gfm" : "comment",
      context: native(context.repo),
      text,
      wiki: String(context.wiki),
    }),
  });
  if (
    !response.ok ||
    response.redirected ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error(String(response.status));
  const html = await response.text();
  if (!appUrl || !/^https?:\/\//.test(appUrl)) return html;
  const root = appUrl.endsWith("/") ? appUrl : `${appUrl}/`;
  return html.split(`="${root}`).join(`="${native("/")}`);
}

interface Trigger {
  key: "@" | "#" | ":";
  query: string;
  start: number;
  end: number;
}
interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  insert: string;
  avatar?: string;
  emoji?: string;
  image?: string;
  kind?: "issue" | "pull" | "team";
}

const triggerPattern = /(?:^|[\s([{>])([@#:])([\p{L}\p{N}_.+\-/]*)$/u;

export function findTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(Math.max(0, caret - 64), caret);
  const match = triggerPattern.exec(before);
  if (!match) return null;
  const key = match[1] as Trigger["key"];
  const query = match[2];
  if (key === ":" && (query.length < 2 || query.includes("/"))) return null;
  if (key === "#" && query.includes("/")) return null;
  return { key, query, start: caret - query.length - 1, end: caret };
}

const mirrored = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

/** Caret coordinates inside a textarea (mirror element technique). */
function caretCoordinates(field: HTMLTextAreaElement, position: number) {
  const mirror = document.createElement("div");
  const style = getComputedStyle(field);
  for (const property of mirrored)
    mirror.style[property as never] = style[property as never];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.textContent = field.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = field.value.slice(position) || ".";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const result = {
    top: marker.offsetTop - field.scrollTop + lineHeight,
    left: marker.offsetLeft - field.scrollLeft,
  };
  mirror.remove();
  return result;
}

function useDebounced<T>(value: T, delay: number) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

const imageName = (file: File) =>
  (file.name.includes(".")
    ? file.name.slice(0, file.name.lastIndexOf("."))
    : file.name
  ).replace(/[[\]]/g, "");

/**
 * "@" mention, "#" issue and ":" emoji suggestions plus paste/drop uploads for
 * a markdown textarea, using the same data as native pages: mention
 * candidates (participants, assignable users, teams), the repository's issue
 * search and Forgejo's emoji aliases; files go to the native attachment
 * endpoint and are linked to the content when it is saved.
 */
export function useMarkdownAssist({
  field,
  value,
  onChange,
  context,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  context: EditorContext;
}) {
  const { t } = useTranslation("mergeRequests");
  const listId = useId();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    above: false,
  });
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const enabled = !!context.repo;
  const key = trigger && dismissed !== trigger.start ? trigger.key : null;
  const issueQuery = useDebounced(key === "#" ? trigger!.query : "", 200);

  const mentions = useQuery({
    queryKey: ["markdown-mentions", context.repo, context.issue ?? 0],
    queryFn: ({ signal }) =>
      get<{
        users: { name: string; full_name: string; avatar: string }[];
        teams: { name: string; avatar: string }[];
      }>(
        `/-/ui/data/repos${context.repo}/mentions${context.issue ? `?issue=${context.issue}` : ""}`,
        signal,
      ),
    enabled: enabled && key === "@",
    staleTime: 5 * 60_000,
  });
  const emoji = useQuery({
    queryKey: ["markdown-emoji"],
    queryFn: ({ signal }) => get<string[][]>("/-/ui/data/emoji", signal),
    enabled: enabled && key === ":",
    staleTime: Infinity,
  });
  const issues = useQuery({
    queryKey: ["markdown-issues", context.repo, issueQuery],
    queryFn: ({ signal }) =>
      get<Issue[]>(
        `${context.repo}/issues/search?${new URLSearchParams({ q: issueQuery, state: "all", limit: "8" })}`,
        signal,
      ),
    enabled: enabled && key === "#",
    staleTime: 30_000,
  });

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || !key) return [];
    const query = trigger.query.toLowerCase();
    if (key === "@") {
      const ranked: [number, Suggestion][] = [];
      for (const user of mentions.data?.users ?? []) {
        const index = `${user.name} ${user.full_name}`
          .toLowerCase()
          .indexOf(query);
        if (index >= 0)
          ranked.push([
            index,
            {
              id: `user-${user.name}`,
              label: user.name,
              detail:
                user.full_name && user.full_name.toLowerCase() !== user.name
                  ? user.full_name
                  : undefined,
              insert: `@${user.name} `,
              avatar: user.avatar,
            },
          ]);
      }
      for (const team of mentions.data?.teams ?? []) {
        const index = team.name.toLowerCase().indexOf(query);
        if (index >= 0)
          ranked.push([
            index,
            {
              id: `team-${team.name}`,
              label: team.name,
              insert: `@${team.name} `,
              kind: "team",
            },
          ]);
      }
      return ranked
        .sort((a, b) => a[0] - b[0])
        .slice(0, 8)
        .map(([, item]) => item);
    }
    if (key === ":") {
      const ranked: [number, Suggestion][] = [];
      const words = query.replaceAll("_", " ");
      for (const [alias, char, image] of emoji.data ?? []) {
        const index = alias.replaceAll("_", " ").indexOf(words);
        if (index < 0) continue;
        ranked.push([
          index,
          {
            id: `emoji-${alias}`,
            label: alias,
            insert: char || `:${alias}:`,
            emoji: char,
            image,
          },
        ]);
      }
      return ranked
        .sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length)
        .slice(0, 8)
        .map(([, item]) => item);
    }
    return (issues.data ?? []).slice(0, 8).map((issue) => ({
      id: `issue-${issue.number}`,
      label: `#${issue.number}`,
      detail: issue.title,
      insert: `#${issue.number} `,
      kind: issue.pull_request ? "pull" : "issue",
    }));
  }, [trigger, key, mentions.data, emoji.data, issues.data]);
  const open = suggestions.length > 0;
  const selected = Math.min(active, suggestions.length - 1);

  function inspect() {
    const input = field.current;
    if (!input || !enabled) return setTrigger(null);
    if (input.selectionStart !== input.selectionEnd) return setTrigger(null);
    const next = findTrigger(input.value, input.selectionStart);
    if (!next || trigger?.start !== next.start || trigger.query !== next.query)
      setActive(0);
    if (!next || next.start !== dismissed) setDismissed(null);
    setTrigger(next);
    if (next) {
      // Fixed positioning: the editor frame clips overflowing children.
      const caret = caretCoordinates(input, next.start);
      const frame = input.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
      const below = frame.top + caret.top + 4;
      const width = Math.min(288, window.innerWidth - 16);
      setPosition({
        top:
          below + 272 > window.innerHeight && below - lineHeight - 280 > 8
            ? below - lineHeight - 8
            : below,
        above: below + 272 > window.innerHeight && below - lineHeight - 280 > 8,
        left: Math.max(
          8,
          Math.min(frame.left + caret.left, window.innerWidth - width - 8),
        ),
      });
    }
  }

  function choose(item: Suggestion) {
    const input = field.current;
    if (!input || !trigger) return;
    const text = latest.current;
    const updated =
      text.slice(0, trigger.start) + item.insert + text.slice(trigger.end);
    onChange(updated);
    setTrigger(null);
    const caret = trigger.start + item.insert.length;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }

  function insertText(text: string) {
    const input = field.current;
    const current = latest.current;
    const start = input?.selectionStart ?? current.length,
      end = input?.selectionEnd ?? current.length;
    const updated = current.slice(0, start) + text + current.slice(end);
    latest.current = updated;
    onChange(updated);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function upload(files: File[]) {
    if (!context.uploadPath || !files.length) return;
    setUploadError("");
    for (const file of files) {
      const image = file.type.startsWith("image/");
      const name = image ? imageName(file) : file.name.replace(/[[\]]/g, "");
      const placeholder = `${image ? "!" : ""}[${name}](${t("markdownEditor.upload.placeholder")})`;
      insertText(placeholder);
      setUploading((count) => count + 1);
      try {
        const body = new FormData();
        body.set("file", file, file.name);
        const { data } = await request<{ uuid: string }>(context.uploadPath, {
          method: "POST",
          headers: { "X-Forgejo-UI": "1" },
          body,
        });
        rememberUpload(data.uuid);
        const link = `${image ? "!" : ""}[${name}](/attachments/${data.uuid})`;
        const current = latest.current;
        const updated = current.includes(placeholder)
          ? current.replace(placeholder, link)
          : current + link;
        latest.current = updated;
        onChange(updated);
      } catch (error) {
        const current = latest.current;
        latest.current = current.replace(placeholder, "");
        onChange(latest.current);
        setUploadError(
          t("markdownEditor.upload.failed", {
            name: file.name,
            message: error instanceof Error ? error.message : "",
          }),
        );
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  useEffect(() => {
    if (!trigger) return;
    const close = (event: Event) => {
      if (!(event.target as Element)?.closest?.(".markdown-suggestions"))
        setTrigger(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [trigger]);

  const handlers = {
    onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (!open) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((selected + step + suggestions.length) % suggestions.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(suggestions[selected]);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(trigger?.start ?? null);
        return true;
      }
      return false;
    },
    onKeyUp(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (
        !["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)
      )
        inspect();
    },
    onClick: inspect,
    onInput: inspect,
    onBlur: () => window.setTimeout(() => setTrigger(null), 150),
    onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
      const files = [...event.clipboardData.files].filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length && context.uploadPath) {
        event.preventDefault();
        void upload(files);
        return;
      }
      // Pasting a URL over selected text makes a link (native behaviour).
      const input = event.currentTarget;
      const text = event.clipboardData.getData("text/plain").trim();
      const selection = input.value.slice(
        input.selectionStart,
        input.selectionEnd,
      );
      if (
        selection &&
        /^https?:\/\/\S+$/.test(text) &&
        !/^https?:\/\//.test(selection)
      ) {
        event.preventDefault();
        insertText(`[${selection}](${text})`);
      }
    },
    onDragOver(event: DragEvent<HTMLTextAreaElement>) {
      if (!context.uploadPath || !event.dataTransfer.types.includes("Files"))
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop(event: DragEvent<HTMLTextAreaElement>) {
      setDragging(false);
      const files = [...event.dataTransfer.files];
      if (!context.uploadPath || !files.length) return;
      event.preventDefault();
      const input = event.currentTarget;
      input.focus();
      void upload(files);
    },
  };

  const activeId = open ? `${listId}-${selected}` : undefined;
  const aria = {
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": activeId,
  };

  const popup = open ? (
    <ul
      id={listId}
      role="listbox"
      aria-label={t("markdownEditor.suggestions")}
      className={`markdown-suggestions fixed z-50 m-0 w-72 max-w-[calc(100vw-16px)] list-none overflow-hidden rounded-md border border-line bg-surface p-1 text-sm shadow-popover ${position.above ? "-translate-y-full" : ""}`}
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.map((item, index) => (
        <li
          key={item.id}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === selected}
          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${index === selected ? "bg-hover" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(item)}
        >
          {item.avatar ? (
            <img
              src={item.avatar}
              alt=""
              className="size-5 shrink-0 rounded-full"
            />
          ) : item.image ? (
            <img src={item.image} alt="" className="size-5 shrink-0" />
          ) : item.emoji ? (
            <span className="w-5 shrink-0 text-center text-base leading-5">
              {item.emoji}
            </span>
          ) : item.kind === "team" ? (
            <Users size={16} className="shrink-0 text-muted" />
          ) : item.kind === "pull" ? (
            <GitMerge size={16} className="shrink-0 text-muted" />
          ) : item.kind === "issue" ? (
            <CircleDot size={16} className="shrink-0 text-muted" />
          ) : null}
          <span
            className={`shrink-0 ${item.kind === "issue" || item.kind === "pull" ? "font-mono text-xs" : "font-semibold"}`}
          >
            {item.label}
          </span>
          {item.detail && (
            <span className="min-w-0 truncate text-muted">{item.detail}</span>
          )}
        </li>
      ))}
    </ul>
  ) : null;

  return {
    handlers,
    aria,
    popup,
    dragging,
    uploading,
    uploadError,
    canUpload: !!context.uploadPath,
  };
}
