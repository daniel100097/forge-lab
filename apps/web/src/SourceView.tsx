import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "@base-ui/react/menu";
import { Eye, EyeOff, MoreHorizontal, X } from "lucide-react";
import type { HighlightToken } from "@tanstack/highlight/core";
import { codeLanguage, codeTokens } from "./Highlight";
import { useQuery } from "@tanstack/react-query";
import { get } from "./api";
import {
  codePointLabel,
  escapeMarks,
  escapeStatus,
  type EscapeContext,
  type EscapeMark,
  type EscapeStatus,
  type EscapeTables,
} from "./escape";

/** Forgejo's escape tables for the viewer's locale (cached for the session). */
export function useEscapeTables(context: EscapeContext) {
  const query = useQuery({
    queryKey: ["escape-characters"],
    queryFn: ({ signal }) =>
      get<EscapeTables>("/-/ui/data/escape-characters", signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const tables = query.data;
  return tables?.enabled && !(tables.skip ?? []).includes(context)
    ? tables
    : undefined;
}

/** Files larger than this are shown without syntax highlighting. */
const highlightLimit = 1024 * 1024;

/** Splits text into display lines (a trailing newline ends the last line). */
export function sourceLines(code: string) {
  const lines = code.split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/** Escape marks for each line and the combined status (native EscapeStatus). */
export function useLineEscapes(lines: string[], context: EscapeContext) {
  const tables = useEscapeTables(context);
  return useMemo(() => {
    const marks = tables
      ? lines.map((line) => escapeMarks(line, tables))
      : lines.map(() => []);
    return { marks, status: escapeStatus(marks) };
  }, [lines, tables]);
}

const escapedClass =
  "[&_.escaped-code-point>span:first-child]:font-mono [&_.escaped-code-point>span:first-child]:text-danger [&_.ambiguous-code-point]:border [&_.ambiguous-code-point]:border-[#d8a31a] [&_.broken-code-point]:font-mono [&_.broken-code-point]:text-[#1f75cb] dark:[&_.broken-code-point]:text-[#7cb4f0]";

/** Escape marks styling; add to the element that contains MarkedText. */
export const escapeStyles = escapedClass;

function MarkedSegment({
  text,
  mark,
  escaped,
}: {
  text: string;
  mark: EscapeMark;
  escaped: boolean;
}) {
  const { t } = useTranslation("repository");
  if (mark.kind === "ambiguous") {
    const title = t("escape.ambiguousCharacter", {
      character: String.fromCodePoint(mark.codePoint),
      code: codePointLabel(mark.codePoint),
      other: String.fromCodePoint(mark.confusable ?? 0x3f),
      otherCode: codePointLabel(mark.confusable ?? 0x3f),
    });
    return escaped ? (
      <span className="ambiguous-code-point" title={title}>
        {text}
      </span>
    ) : (
      <>{text}</>
    );
  }
  if (mark.kind === "broken")
    return (
      <span className="broken-code-point">
        {`<${[...new TextEncoder().encode(text)].map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join("")}>`}
      </span>
    );
  if (!escaped) return <>{text}</>;
  return (
    <span
      className="escaped-code-point"
      title={codePointLabel(mark.codePoint)}
      data-escaped={`[${codePointLabel(mark.codePoint)}]`}
    >
      <span aria-hidden="true" className="select-none">
        [{codePointLabel(mark.codePoint)}]
      </span>
      <span className="char hidden">{text}</span>
    </span>
  );
}

/** Highlighted tokens with Forgejo's escape marks applied. */
export function MarkedTokens({
  tokens,
  marks,
  escaped,
}: {
  tokens: HighlightToken[];
  marks?: EscapeMark[];
  escaped: boolean;
}) {
  if (!marks?.length)
    return (
      <>
        {tokens.map((token, i) =>
          token.className ? (
            <span className={`th-${token.className}`} key={i}>
              {token.value}
            </span>
          ) : (
            <Fragment key={i}>{token.value}</Fragment>
          ),
        )}
      </>
    );
  const parts: ReactNode[] = [];
  let offset = 0,
    markIndex = 0;
  tokens.forEach((token, tokenIndex) => {
    const pieces: ReactNode[] = [];
    let local = 0;
    const value = token.value;
    while (local < value.length) {
      const absolute = offset + local;
      while (markIndex < marks.length && marks[markIndex].end <= absolute)
        markIndex++;
      const mark = marks[markIndex];
      if (mark && mark.start <= absolute) {
        const end = Math.min(value.length, mark.end - offset);
        pieces.push(
          <MarkedSegment
            key={`${tokenIndex}-${local}`}
            text={value.slice(local, end)}
            mark={mark}
            escaped={escaped}
          />,
        );
        local = end;
      } else {
        const end = Math.min(
          value.length,
          mark ? mark.start - offset : value.length,
        );
        pieces.push(value.slice(local, end));
        local = end;
      }
    }
    offset += value.length;
    parts.push(
      token.className ? (
        <span className={`th-${token.className}`} key={tokenIndex}>
          {pieces}
        </span>
      ) : (
        <Fragment key={tokenIndex}>{pieces}</Fragment>
      ),
    );
  });
  return <>{parts}</>;
}

/** Native unicode_escape_prompt: a dismissible warning above escaped content. */
export function EscapeWarning({
  status,
  file = true,
}: {
  status: EscapeStatus;
  file?: boolean;
}) {
  const { t } = useTranslation("repository");
  const [closed, setClosed] = useState(false);
  if (closed || !status.escaped) return null;
  return (
    <div
      className="unicode-escape-prompt relative border-b border-line bg-[#fdf1dd] px-4 py-3 pr-10 text-sm text-[#8f4700] dark:bg-[#4a3a1c] dark:text-[#e9c77b]"
      role="status"
    >
      <button
        className="icon-button absolute top-2 right-2"
        aria-label={t("escape.dismiss")}
        onClick={() => setClosed(true)}
      >
        <X size={15} />
      </button>
      <strong className="block">
        {t(
          status.invisible
            ? file
              ? "escape.invisibleHeader"
              : "escape.invisibleHeaderDiff"
            : file
              ? "escape.ambiguousHeader"
              : "escape.ambiguousHeaderDiff",
        )}
      </strong>
      {status.invisible && (
        <p className="mt-1">{t("escape.invisibleDescription")}</p>
      )}
      {status.ambiguous && (
        <p className="mt-1">{t("escape.ambiguousDescription")}</p>
      )}
    </div>
  );
}

/** The native "Escape" / "Unescape" toggle. */
export function EscapeToggle({
  escaped,
  onToggle,
  className = "button",
}: {
  escaped: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation("repository");
  return (
    <button
      type="button"
      className={`escape-toggle ${className}`}
      aria-pressed={escaped}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      {escaped ? <EyeOff size={14} /> : <Eye size={14} />}
      {t(escaped ? "escape.unescape" : "escape.escape")}
    </button>
  );
}

function readRange(hash: string): [number, number] | null {
  const match = hash.match(/^#L(\d+)(?:-L(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]),
    end = Number(match[2] || match[1]);
  return [Math.min(start, end), Math.max(start, end)];
}

export interface LineActions {
  /** Absolute permalink to the file at this commit (without fragment). */
  permalink: string;
  /** SPA route of the blame view at this commit. */
  blame?: string;
  /** SPA route for a new issue; the permalink is appended as its body. */
  newIssue?: string;
}

/**
 * Code with line numbers like the native file view: highlighted lines and
 * line ranges (#L5, shift-click for #L5-L9), a line menu (permalink, blame,
 * reference in a new issue) and Unicode escape marks.
 */
export function SourceView({
  code,
  filename,
  marks,
  escaped = false,
  onToggleEscape,
  actions,
  tabSize,
}: {
  code: string;
  filename: string;
  marks?: EscapeMark[][];
  escaped?: boolean;
  onToggleEscape?: () => void;
  actions?: LineActions;
  tabSize?: number;
}) {
  const { t } = useTranslation("repository");
  const container = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => readRange(window.location.hash));
  const lines = useMemo(() => {
    const result: HighlightToken[][] = [[]];
    const tokens =
      code.length > highlightLimit
        ? [{ value: code } as HighlightToken]
        : codeTokens(code, codeLanguage(filename));
    for (const token of tokens) {
      const parts = token.value.split("\n");
      parts.forEach((value, index) => {
        if (index) result.push([]);
        if (value) result.at(-1)!.push({ ...token, value });
      });
    }
    if (result.length > 1 && !result.at(-1)!.length) result.pop();
    // Drop the carriage return of CRLF line endings (like Chroma's EnsureLF).
    for (const line of result) {
      const last = line.at(-1);
      if (last?.value.endsWith("\r")) {
        const value = last.value.slice(0, -1);
        if (value) line[line.length - 1] = { ...last, value };
        else line.pop();
      }
    }
    return result;
  }, [code, filename]);
  useEffect(() => {
    const update = () => setRange(readRange(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const initial = readRange(window.location.hash);
    if (!initial) return;
    container.current
      ?.querySelector(`#L${initial[0]}`)
      ?.scrollIntoView({ block: "center" });
  }, []);
  const select = (line: number, extend: boolean) => {
    const next: [number, number] =
      extend && range
        ? [Math.min(range[0], line), Math.max(range[0], line)]
        : [line, line];
    setRange(next);
    const hash =
      next[0] === next[1] ? `#L${next[0]}` : `#L${next[0]}-L${next[1]}`;
    window.history.replaceState(window.history.state, "", hash);
  };
  const fragment = range
    ? range[0] === range[1]
      ? `#L${range[0]}`
      : `#L${range[0]}-L${range[1]}`
    : "";
  const lineEscapes = marks?.some((line) => line.length);
  return (
    <div
      ref={container}
      className={`source-code relative overflow-auto py-3 text-[13px] leading-6 ${escapedClass}`}
      style={{ tabSize: tabSize || 4 }}
    >
      {lines.map((tokens, i) => {
        const number = i + 1;
        const selected = !!range && number >= range[0] && number <= range[1];
        const lineMarks = marks?.[i];
        return (
          <div
            className={`source-line group/source flex w-max min-w-full target:scroll-mt-[100px] target:bg-info-bg ${selected ? "selected bg-info-bg" : ""}`}
            id={`L${number}`}
            key={i}
          >
            {actions && range && number === range[0] && (
              <span className="sticky left-0 z-[1] w-0 shrink-0 overflow-visible">
                <LineMenu actions={actions} fragment={fragment} />
              </span>
            )}
            <a
              href={`#L${number}`}
              className="source-line-number"
              aria-label={t("source.line", { number })}
              onClick={(event) => {
                event.preventDefault();
                select(number, event.shiftKey);
              }}
            >
              {number}
            </a>
            {lineEscapes && onToggleEscape && (
              <span className="flex w-6 shrink-0 items-center justify-center">
                {!!lineMarks?.length && (
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded text-[#b07c00] hover:bg-hover"
                    title={t(
                      lineMarks.some((mark) => mark.kind !== "ambiguous")
                        ? "escape.invisibleLine"
                        : "escape.ambiguousLine",
                    )}
                    aria-pressed={escaped}
                    onClick={onToggleEscape}
                  >
                    {escaped ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
              </span>
            )}
            <code className="pr-4 pl-3 whitespace-pre">
              {tokens.length ? (
                <MarkedTokens
                  tokens={tokens}
                  marks={lineMarks}
                  escaped={escaped}
                />
              ) : (
                " "
              )}
            </code>
          </div>
        );
      })}
    </div>
  );
}

function LineMenu({
  actions,
  fragment,
}: {
  actions: LineActions;
  fragment: string;
}) {
  const { t } = useTranslation("repository");
  const link = actions.permalink + fragment;
  return (
    <Menu.Root>
      <Menu.Trigger
        className="code-line-button absolute top-0.5 left-1 grid size-5 place-items-center rounded border border-control bg-surface text-ink shadow-sm"
        aria-label={t("source.lineMenu")}
        title={t("source.lineMenu")}
      >
        <MoreHorizontal size={13} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="dropdown-positioner"
          align="start"
          sideOffset={4}
        >
          <Menu.Popup
            className="dropdown-popup action-menu"
            aria-label={t("source.lineMenu")}
          >
            {actions.newIssue && (
              <Menu.Item
                className="menu-item"
                render={
                  <Link
                    to={`${actions.newIssue}${actions.newIssue.includes("?") ? "&" : "?"}${new URLSearchParams({ body: link })}`}
                  />
                }
              >
                {t("source.referenceInIssue")}
              </Menu.Item>
            )}
            {actions.blame && (
              <Menu.Item
                className="menu-item"
                render={<Link to={actions.blame + fragment} />}
              >
                {t("source.viewBlame")}
              </Menu.Item>
            )}
            <Menu.Item
              className="menu-item"
              onClick={() => void copyText(link)}
            >
              {t("source.copyPermalink")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Copies text like CopyButton (with a fallback outside secure contexts). */
export async function copyText(value: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}
