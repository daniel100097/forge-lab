import { useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bootstrap } from "./api";
import {
  Bold,
  Italic,
  Code,
  Quote,
  List,
  ListOrdered,
  ListTodo,
  Link2,
  Heading,
  Table2,
  IndentIncrease,
  IndentDecrease,
  AtSign,
  Hash,
  Type,
  Strikethrough,
  Image,
  Minus,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  ChevronsUp,
  ChevronsDown,
  Maximize,
  Columns2,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { Markdown } from "./Markdown";
import {
  editorContext,
  renderPreview,
  useMarkdownAssist,
} from "./MarkdownAssist";
import {
  continueMarkdown,
  markdownHeading,
  indentMarkdown,
  markdownTable,
} from "./markdownTools";

export function MarkdownEditor({
  name = "content",
  value,
  onChange,
  rows = 9,
  label: labelProp,
  placeholder,
}: {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  label?: string;
  /** Defaults to a generic "Write a description…" prompt. */
  placeholder?: string;
}) {
  const { t } = useTranslation("mergeRequests");
  const label = labelProp ?? t("markdownEditor.defaultLabel");
  const [preview, setPreview] = useState(false);
  const [split, setSplit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const tabEnabled = useRef(false);
  const [tool, setTool] = useState<"link" | "table" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [tableRows, setTableRows] = useState(2);
  const [tableColumns, setTableColumns] = useState(2);
  const [monospace, setMonospace] = useState(() => {
    try {
      return localStorage.getItem("markdown-editor-monospace") !== "false";
    } catch {
      return true;
    }
  });
  const selection = useRef({ start: 0, end: 0 });
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const context = useMemo(editorContext, []);
  const client = useQueryClient();
  const assist = useMarkdownAssist({ field, value, onChange, context });
  // Forgejo renders the preview (references, mentions, emoji, math …) when the
  // editor belongs to a repository; otherwise the client renderer is used.
  const rendered = useQuery({
    queryKey: ["markdown-preview", context.repo, context.wiki, value],
    queryFn: () =>
      renderPreview(
        context,
        value,
        client.getQueryData<Bootstrap>(["bootstrap"])?.app_url,
      ),
    enabled: (preview || split) && !!context.repo && !!value.trim(),
    staleTime: 60_000,
    retry: false,
  });
  function replaceSelection(text: string, start: number, end: number) {
    const input = field.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(start, end);
    if (document.execCommand("insertText", false, text)) onChange(input.value);
    else onChange(value.slice(0, start) + text + value.slice(end));
  }
  function format(
    before: string,
    after = "",
    fallback = t("markdownEditor.sample.text"),
    line = false,
  ) {
    const input = field.current;
    if (!input) return;
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (line) start = value.lastIndexOf("\n", start - 1) + 1;
    const selected = value.slice(start, end) || fallback;
    if (
      !line &&
      after &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after
    ) {
      start -= before.length;
      end += after.length;
      replaceSelection(selected, start, end);
      requestAnimationFrame(() =>
        input.setSelectionRange(start, start + selected.length),
      );
      return;
    }
    const replacement = line
      ? selected
          .split("\n")
          .map((text) => before + text)
          .join("\n")
      : before + selected + after;
    replaceSelection(replacement, start, end);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + before.length,
        start + replacement.length - after.length,
      );
    });
  }
  function heading(change: number, absolute = false) {
    const input = field.current;
    if (!input) return;
    const next = markdownHeading(
      value,
      input.selectionStart,
      input.selectionEnd,
      change,
      absolute,
    );
    insert(next.text, next);
  }
  const actions = [
    {
      label: t("markdownEditor.actions.bold"),
      icon: Bold,
      apply: () => format("**", "**"),
    },
    {
      label: t("markdownEditor.actions.italic"),
      icon: Italic,
      apply: () => format("_", "_"),
    },
    {
      label: t("markdownEditor.actions.heading"),
      icon: Heading,
      apply: () => format("### ", "", t("markdownEditor.sample.heading"), true),
    },
    {
      label: t("markdownEditor.actions.quote"),
      icon: Quote,
      apply: () => format("> ", "", t("markdownEditor.sample.quote"), true),
    },
    {
      label: t("markdownEditor.actions.code"),
      icon: Code,
      apply: () => {
        const input = field.current;
        const multiline =
          input &&
          value.slice(input.selectionStart, input.selectionEnd).includes("\n");
        format(
          multiline ? "```\n" : "`",
          multiline ? "\n```" : "`",
          t("markdownEditor.sample.code"),
        );
      },
    },
    {
      label: t("markdownEditor.actions.link"),
      icon: Link2,
      apply: () => openTool("link"),
    },
    {
      label: t("markdownEditor.actions.bulletedList"),
      icon: List,
      apply: () => format("- ", "", t("markdownEditor.sample.listItem"), true),
    },
    {
      label: t("markdownEditor.actions.numberedList"),
      icon: ListOrdered,
      apply: () => format("1. ", "", t("markdownEditor.sample.listItem"), true),
    },
    {
      label: t("markdownEditor.actions.taskList"),
      icon: ListTodo,
      apply: () => format("- [ ] ", "", t("markdownEditor.sample.task"), true),
    },
  ];
  function openTool(next: "link" | "table") {
    const input = field.current;
    if (!input) return;
    selection.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
    if (next === "link") {
      setLinkText(value.slice(input.selectionStart, input.selectionEnd));
      setLinkUrl("");
    }
    setTool(next);
  }
  function insert(text: string, range = selection.current) {
    replaceSelection(text, range.start, range.end);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(
        range.start + text.length,
        range.start + text.length,
      );
      field.current?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  function indent(outdent: boolean) {
    const input = field.current;
    if (!input) return;
    const next = indentMarkdown(
      value,
      input.selectionStart,
      input.selectionEnd,
      outdent,
    );
    replaceSelection(next.value, 0, value.length);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(next.start, next.end);
    });
  }
  actions.push(
    {
      label: t("markdownEditor.actions.codeBlock"),
      icon: Code,
      apply: () =>
        format("\n```\n", "\n```\n", t("markdownEditor.sample.code")),
    },
    {
      label: t("markdownEditor.actions.strikethrough"),
      icon: Strikethrough,
      apply: () => format("~~", "~~"),
    },
    {
      label: t("markdownEditor.actions.heading1"),
      icon: Heading1,
      apply: () => heading(1, true),
    },
    {
      label: t("markdownEditor.actions.heading2"),
      icon: Heading2,
      apply: () => heading(2, true),
    },
    {
      label: t("markdownEditor.actions.heading3"),
      icon: Heading3,
      apply: () => heading(3, true),
    },
    {
      label: t("markdownEditor.actions.headingBigger"),
      icon: ChevronsUp,
      apply: () => heading(-1),
    },
    {
      label: t("markdownEditor.actions.headingSmaller"),
      icon: ChevronsDown,
      apply: () => heading(1),
    },
    {
      label: t("markdownEditor.actions.checkedTask"),
      icon: CheckSquare,
      apply: () => format("- [x] ", "", t("markdownEditor.sample.task"), true),
    },
    {
      label: t("markdownEditor.actions.image"),
      icon: Image,
      apply: () => format("![", "](https://)"),
    },
    {
      label: t("markdownEditor.actions.rule"),
      icon: Minus,
      apply: () => format("\n---\n", "", ""),
    },
    {
      label: t("markdownEditor.actions.indent"),
      icon: IndentIncrease,
      apply: () => indent(false),
    },
    {
      label: t("markdownEditor.actions.outdent"),
      icon: IndentDecrease,
      apply: () => indent(true),
    },
    {
      label: t("markdownEditor.actions.table"),
      icon: Table2,
      apply: () => openTool("table"),
    },
    {
      label: t("markdownEditor.actions.mention"),
      icon: AtSign,
      apply: () =>
        field.current &&
        insert("@", {
          start: field.current.selectionStart,
          end: field.current.selectionEnd,
        }),
    },
    {
      label: t("markdownEditor.actions.reference"),
      icon: Hash,
      apply: () =>
        field.current &&
        insert("#", {
          start: field.current.selectionStart,
          end: field.current.selectionEnd,
        }),
    },
    {
      label: t("markdownEditor.actions.font"),
      icon: Type,
      apply: () => {
        setMonospace(!monospace);
        try {
          localStorage.setItem("markdown-editor-monospace", String(!monospace));
        } catch {}
      },
    },
  );
  return (
    <div
      className={
        fullscreen
          ? "markdown-editor fixed inset-0 z-150 overflow-auto border border-input bg-surface p-4"
          : "markdown-editor overflow-hidden rounded border border-input"
      }
    >
      <div className="flex flex-wrap items-center border-b border-line bg-surface-subtle">
        <div
          className="tabs m-0 shrink-0 border-0 bg-transparent dark:bg-code"
          role="tablist"
          aria-label={t("markdownEditor.tabs", { label })}
        >
          {[false, true].map((isPreview) => (
            <button
              type="button"
              role="tab"
              key={String(isPreview)}
              id={`${id}-${isPreview ? "preview" : "write"}`}
              aria-controls={`${id}-panel`}
              aria-selected={preview === isPreview}
              tabIndex={preview === isPreview ? 0 : -1}
              className={
                preview === isPreview ? "active min-h-10 py-2" : "min-h-10 py-2"
              }
              onClick={() => setPreview(isPreview)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? false
                      : event.key === "End"
                        ? true
                        : !preview;
                  setPreview(next);
                  document
                    .getElementById(`${id}-${next ? "preview" : "write"}`)
                    ?.focus();
                }
              }}
            >
              {isPreview
                ? t("markdownEditor.preview")
                : t("markdownEditor.write")}
            </button>
          ))}
        </div>
        {!preview && (
          <div
            className="ml-auto flex flex-wrap gap-0.5 px-2 py-1 max-[621px]:ml-0 max-[621px]:w-full max-[621px]:border-t max-[621px]:border-line"
            role="group"
            aria-label={t("markdownEditor.formatting", { label })}
          >
            {actions.map(({ label: title, icon: Icon, apply }) => (
              <button
                type="button"
                key={title}
                title={title}
                className="grid size-7 place-items-center rounded bg-transparent text-muted hover:bg-hover hover:text-ink"
                aria-label={title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={apply}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-1 px-2 py-1">
          <button
            type="button"
            className="icon-button"
            title={t("markdownEditor.actions.split")}
            aria-label={t("markdownEditor.actions.split")}
            aria-pressed={split}
            onClick={() => {
              setSplit(!split);
              setPreview(false);
            }}
          >
            <Columns2 size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title={t("markdownEditor.actions.fullscreen")}
            aria-label={t("markdownEditor.actions.fullscreen")}
            aria-pressed={fullscreen}
            onClick={() => setFullscreen(!fullscreen)}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${preview ? "preview" : "write"}`}
        className={
          split ? "relative grid grid-cols-2 max-md:grid-cols-1" : "relative"
        }
      >
        <textarea
          ref={field}
          aria-label={label}
          name={name}
          rows={rows}
          className={`${preview ? "hidden" : "block"} ${fullscreen ? "min-h-[70vh]" : "min-h-30"} w-full resize-y rounded-none border-0 bg-surface p-3 ${monospace ? "font-mono" : "font-sans"} text-[14px] text-ink ${assist.dragging ? "outline-2 -outline-offset-2 outline-primary outline-dashed" : ""}`}
          value={value}
          onChange={(event) => {
            tabEnabled.current = true;
            onChange(event.target.value);
          }}
          onFocus={() => {
            tabEnabled.current = false;
          }}
          onPointerUp={() => {
            tabEnabled.current = true;
          }}
          {...assist.aria}
          onInput={assist.handlers.onInput}
          onKeyUp={assist.handlers.onKeyUp}
          onClick={assist.handlers.onClick}
          onBlur={assist.handlers.onBlur}
          onPaste={assist.handlers.onPaste}
          onDragOver={assist.handlers.onDragOver}
          onDragLeave={assist.handlers.onDragLeave}
          onDrop={assist.handlers.onDrop}
          onKeyDown={(event) => {
            if (assist.handlers.onKeyDown(event)) return;
            const input = event.currentTarget;
            if (event.key === "Escape") {
              setFullscreen(false);
              input.blur();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              input.form?.requestSubmit();
              return;
            }
            if (
              event.key === "Tab" &&
              tabEnabled.current &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              (input.selectionStart !== input.selectionEnd ||
                /^\s+|^[-*+>]\s|^\d+[.)]\s/.test(
                  value.slice(
                    value.lastIndexOf("\n", input.selectionStart - 1) + 1,
                  ),
                ))
            ) {
              event.preventDefault();
              indent(event.shiftKey);
              return;
            }
            if (
              event.key === "Enter" &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              const next = continueMarkdown(
                value,
                input.selectionStart,
                input.selectionEnd,
              );
              if (next) {
                event.preventDefault();
                insert(next.text, next);
                return;
              }
            }
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key.toLowerCase() === "k"
            ) {
              event.preventDefault();
              openTool("link");
              return;
            }
            if (
              (event.ctrlKey || event.metaKey) &&
              ["b", "i"].includes(event.key.toLowerCase())
            ) {
              event.preventDefault();
              const mark = event.key.toLowerCase() === "b" ? "**" : "_";
              format(mark, mark);
            }
          }}
          placeholder={placeholder ?? t("markdownEditor.placeholder")}
        />
        {!preview && assist.popup}
        {(preview || split) && (
          <div
            className="min-h-40 min-w-0 p-4"
            aria-label={t("markdownEditor.preview")}
          >
            {rendered.isFetching && !rendered.data ? (
              <p className="text-sm text-muted" role="status">
                {t("markdownEditor.loadingPreview")}
              </p>
            ) : (
              <Markdown html={rendered.isError ? undefined : rendered.data}>
                {value || t("markdownEditor.nothingToPreview")}
              </Markdown>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line bg-surface-subtle px-3 py-1.5 text-[12px] text-muted">
        <span>{t("markdownEditor.supported")}</span>
        {assist.uploading > 0 ? (
          <span role="status">
            {t("markdownEditor.upload.uploading", { count: assist.uploading })}
          </span>
        ) : (
          assist.canUpload && (
            <span className="max-md:hidden">
              {t("markdownEditor.upload.hint")}
            </span>
          )
        )}
      </div>
      <Dialog.Root
        open={tool !== null}
        onOpenChange={(open) => {
          if (!open) setTool(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-160 bg-black/40" />
          <Dialog.Popup className="fixed top-[20%] left-1/2 z-161 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-line bg-surface p-6 text-ink shadow-popover">
            <Dialog.Title className="mb-4 text-xl">
              {t(
                tool === "table"
                  ? "markdownEditor.tools.tableTitle"
                  : "markdownEditor.tools.linkTitle",
              )}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-muted">
              {t("markdownEditor.tools.hint")}
            </Dialog.Description>
            <div className="workspace-form flex flex-col gap-4">
              {tool === "table" ? (
                <>
                  <label>
                    {t("markdownEditor.tools.rows")}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={tableRows}
                      onChange={(event) =>
                        setTableRows(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    {t("markdownEditor.tools.columns")}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={tableColumns}
                      onChange={(event) =>
                        setTableColumns(Number(event.target.value))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {t("markdownEditor.tools.url")}
                    <input
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                    />
                  </label>
                  <label>
                    {t("markdownEditor.tools.description")}
                    <input
                      value={linkText}
                      onChange={(event) => setLinkText(event.target.value)}
                    />
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close className="button">
                  {t("markdownEditor.tools.cancel")}
                </Dialog.Close>
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    tool === "table"
                      ? !Number.isSafeInteger(tableRows) ||
                        !Number.isSafeInteger(tableColumns) ||
                        tableRows < 1 ||
                        tableColumns < 1
                      : !linkUrl.trim() || !linkText.trim()
                  }
                  onClick={() => {
                    const text =
                      tool === "table"
                        ? "\n" +
                          markdownTable(
                            tableRows,
                            tableColumns,
                            t("markdownEditor.tools.header"),
                            t("markdownEditor.tools.cell"),
                          ) +
                          "\n"
                        : `[${linkText}](${linkUrl})`;
                    setTool(null);
                    insert(text);
                  }}
                >
                  {t("markdownEditor.tools.insert")}
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {assist.uploadError && (
        <div
          className="form-error rounded-none border-x-0 border-b-0"
          role="alert"
        >
          {assist.uploadError}
        </div>
      )}
    </div>
  );
}
