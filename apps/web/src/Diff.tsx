import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  ChevronsUpDown,
  FileCode2,
  FileDiff,
  Files,
  Folder,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState, Pending } from "./UI";
import { codeLanguage, codeTokens } from "./Highlight";
import {
  contextRows,
  diffBlobs,
  diffFileName,
  diffHunks,
  diffRows,
  type DiffRow,
} from "./diffRows";
import { native, repoPath } from "./api";
import { SelectControl } from "./SelectControl";
import { AdvancedDiff } from "./AdvancedDiff";
import { mediaDiffKind } from "./csvDiff";
import {
  escapeMarks,
  escapeStatus,
  type EscapeMark,
  type EscapeTables,
} from "./escape";
import {
  EscapeToggle,
  EscapeWarning,
  MarkedTokens,
  escapeStyles,
  useEscapeTables,
} from "./SourceView";

const gutter =
  "w-11 shrink-0 border-r border-black/5 pr-2 text-right text-muted select-none dark:border-line";
const parallelCode =
  "overflow-hidden border-r border-line px-3 text-clip whitespace-pre";
const commentButton =
  "absolute top-px z-2 grid size-5 place-items-center rounded bg-primary text-white opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100 max-md:opacity-100";
const expandButton =
  "grid h-6 min-w-0 flex-1 place-items-center text-primary hover:bg-[#cbe2f9] dark:hover:bg-[#24405e]";
/** Lines revealed per click, like the native blob excerpt. */
const expandStep = 20;

export type Whitespace =
  "show-all" | "ignore-all" | "ignore-change" | "ignore-eol";

/** Diff layout and whitespace options (native diff box options). */
export function useDiffOptions() {
  const [parallel, setParallelState] = useState(
    () => localStorage.getItem("forgejo-ui:diff-style") === "split",
  );
  const [whitespace, setWhitespace] = useState<Whitespace>("show-all");
  return {
    parallel,
    setParallel: (value: boolean) => {
      setParallelState(value);
      localStorage.setItem(
        "forgejo-ui:diff-style",
        value ? "split" : "unified",
      );
    },
    whitespace,
    setWhitespace,
  };
}

export function DiffOptions({
  options,
  whitespace = true,
}: {
  options: ReturnType<typeof useDiffOptions>;
  whitespace?: boolean;
}) {
  const { t } = useTranslation("mergeRequests");
  const button =
    "button m-0 min-h-8 rounded-none px-3 first:rounded-l-md last:rounded-r-md aria-pressed:bg-hover aria-pressed:font-semibold";
  return (
    <div className="diff-options mb-4 flex flex-wrap items-center gap-3">
      <div
        className="flex items-stretch"
        role="group"
        aria-label={t("diff.options.layout")}
      >
        <button
          className={button}
          aria-pressed={!options.parallel}
          onClick={() => options.setParallel(false)}
        >
          {t("diff.options.unified")}
        </button>
        <button
          className={`${button} [border-left:0]`}
          aria-pressed={options.parallel}
          onClick={() => options.setParallel(true)}
        >
          {t("diff.options.split")}
        </button>
      </div>
      {whitespace && (
        <SelectControl
          label={t("diff.options.whitespace")}
          value={options.whitespace}
          onValueChange={(value) => options.setWhitespace(value as Whitespace)}
          options={[
            { value: "show-all", label: t("diff.whitespace.showAll") },
            { value: "ignore-all", label: t("diff.whitespace.ignoreAll") },
            {
              value: "ignore-change",
              label: t("diff.whitespace.ignoreChange"),
            },
            { value: "ignore-eol", label: t("diff.whitespace.ignoreEol") },
          ]}
        />
      )}
    </div>
  );
}

interface DiffFile {
  lines: string[];
  name: string;
  added: number;
  removed: number;
  blobs: { before?: string; after?: string };
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: { index: number; added: number; removed: number };
}
function fileTree(files: DiffFile[]) {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  files.forEach((file, index) => {
    const parts = file.name.split("/");
    let node = root;
    parts.forEach((part, depth) => {
      const path = parts.slice(0, depth + 1).join("/");
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    });
    node.file = { index, added: file.added, removed: file.removed };
  });
  // Show chains of single folders as one entry ("src/components").
  const compress = (node: TreeNode): TreeNode => {
    for (const [key, child] of node.children)
      node.children.set(key, compress(child));
    if (node.name && !node.file && node.children.size === 1) {
      const [only] = node.children.values();
      if (!only.file)
        return {
          ...only,
          name: `${node.name}/${only.name}`,
        };
    }
    return node;
  };
  return compress(root);
}

function FileTreeNodes({
  node,
  depth,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  onOpen: (index: number) => void;
}) {
  const { t } = useTranslation("mergeRequests");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = [...node.children.values()].sort(
    (a, b) =>
      Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name),
  );
  return (
    <ul className="m-0 list-none p-0">
      {children.map((child) =>
        child.file ? (
          <li key={child.path}>
            <button
              className="flex w-full items-center gap-1.5 rounded py-1.5 pr-2 text-left text-xs hover:bg-hover"
              style={{ paddingLeft: 8 + depth * 14 }}
              title={child.path}
              onClick={() => onOpen(child.file!.index)}
            >
              <FileDiff size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              <span className="text-success">+{child.file.added}</span>
              <span className="text-danger">−{child.file.removed}</span>
            </button>
          </li>
        ) : (
          <li key={child.path}>
            <button
              className="flex w-full items-center gap-1 rounded py-1.5 pr-2 text-left text-xs text-muted hover:bg-hover"
              style={{ paddingLeft: 4 + depth * 14 }}
              aria-expanded={!collapsed.has(child.path)}
              aria-label={t("diff.toggleFolder", { name: child.name })}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (!next.delete(child.path)) next.add(child.path);
                  return next;
                })
              }
            >
              {collapsed.has(child.path) ? (
                <ChevronRight size={13} className="shrink-0" />
              ) : (
                <ChevronDown size={13} className="shrink-0" />
              )}
              <Folder size={14} className="shrink-0" />
              <span className="min-w-0 truncate">{child.name}</span>
            </button>
            {!collapsed.has(child.path) && (
              <FileTreeNodes node={child} depth={depth + 1} onOpen={onOpen} />
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/** Highlighted diff text with Unicode escape marks. */
function DiffCode({
  text,
  filename,
  tables,
  escaped,
}: {
  text: string;
  filename: string;
  tables?: EscapeTables;
  escaped: boolean;
}) {
  const tokens = useMemo(
    () => codeTokens(text || " ", codeLanguage(filename)),
    [text, filename],
  );
  const marks = useMemo(
    () => (tables ? escapeMarks(text, tables) : undefined),
    [text, tables],
  );
  return <MarkedTokens tokens={tokens} marks={marks} escaped={escaped} />;
}

export function DiffView({
  text,
  navigation = false,
  parallel = false,
  onComment,
  fileControl,
  afterLine,
  fileRef,
}: {
  text: string;
  navigation?: boolean;
  parallel?: boolean;
  onComment?: (line: {
    path: string;
    line: number;
    side: "previous" | "proposed";
  }) => void;
  fileControl?: (path: string) => ReactNode;
  afterLine?: (
    path: string,
    before: number | undefined,
    after: number | undefined,
  ) => ReactNode;
  /** Commit of the new side, for "View file" links. */
  fileRef?: string;
}) {
  const { t } = useTranslation("mergeRequests");
  const container = useRef<HTMLDivElement>(null);
  const { t: issueText } = useTranslation("issues");
  const [showTree, setShowTree] = useState(true);
  const [filter, setFilter] = useState("");
  const { owner, repo } = useParams();
  const repository = owner && repo ? repoPath(owner, repo) : "";
  const tables = useEscapeTables("diff");
  const files = useMemo(
    () =>
      text
        .split(/(?=^diff --git )/m)
        .filter((s) => s.trim())
        .map((file): DiffFile => {
          const lines = file.split("\n");
          const counted = diffRows(lines.slice(1), false);
          return {
            lines,
            name: diffFileName(file),
            added: counted.filter((row) => row.kind === "added").length,
            removed: counted.filter((row) => row.kind === "removed").length,
            blobs: diffBlobs(lines),
          };
        }),
    [text],
  );
  const visibleFiles = useMemo(
    () =>
      files.filter((file) =>
        file.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
      ),
    [files, filter],
  );
  const tree = useMemo(() => fileTree(visibleFiles), [visibleFiles]);
  const expand = (open: boolean) =>
    container.current
      ?.querySelectorAll<HTMLDetailsElement>("details.diff-file")
      .forEach((item) => {
        item.open = open;
      });
  if (!files.length)
    return (
      <EmptyState title={t("diff.empty.title")}>
        {t("diff.empty.body")}
      </EmptyState>
    );
  const openFile = (index: number) => {
    const target =
      container.current?.querySelectorAll<HTMLDetailsElement>(
        "details.diff-file",
      )[index];
    if (target) {
      target.open = true;
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }
  };
  return (
    <div>
      {navigation && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <Files size={16} />
            <strong>{t("diff.changedFiles", { count: files.length })}</strong>
            <span className="text-success">
              +{files.reduce((n, f) => n + f.added, 0)}
            </span>
            <span className="text-danger">
              −{files.reduce((n, f) => n + f.removed, 0)}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="filter-input min-w-0 max-w-64 max-md:w-full"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label={issueText("files.filter")}
              placeholder={issueText("files.filter")}
            />
            <button
              className="button"
              aria-pressed={showTree}
              onClick={() => setShowTree((value) => !value)}
            >
              {issueText("files.toggleTree")}
            </button>
            <button className="button" onClick={() => expand(true)}>
              {t("diff.expandAll")}
            </button>
            <button className="button" onClick={() => expand(false)}>
              {t("diff.collapseAll")}
            </button>
          </div>
        </div>
      )}
      <div
        className={
          navigation && showTree
            ? "grid grid-cols-[232px_minmax(0,1fr)] gap-4 max-md:grid-cols-[minmax(0,1fr)]"
            : undefined
        }
      >
        {navigation && showTree && (
          <nav
            className="diff-file-tree sticky top-14 max-h-[calc(100vh-72px)] min-w-0 self-start overflow-auto max-md:static max-md:max-h-72"
            aria-label={t("diff.changedFilesNav")}
          >
            <h2 className="mb-3 text-sm font-semibold">
              {t("diff.changedFilesNav")}
            </h2>
            <FileTreeNodes node={tree} depth={0} onOpen={openFile} />
          </nav>
        )}
        <div className="min-w-0" ref={container}>
          {navigation && !visibleFiles.length && (
            <EmptyState title={issueText("files.noMatches")} />
          )}
          {visibleFiles.map((file) => (
            <DiffFileView
              key={file.name}
              file={file}
              parallel={parallel}
              navigation={navigation}
              onComment={onComment}
              control={fileControl?.(file.name)}
              afterLine={afterLine}
              fileRef={fileRef}
              repository={repository}
              tables={tables}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface Gap {
  /** First and last hidden line of the new file (end unknown at EOF). */
  start: number;
  end?: number;
  offset: number;
}

function DiffFileView({
  file,
  parallel,
  navigation,
  onComment,
  control,
  afterLine,
  fileRef,
  repository,
  tables,
}: {
  file: DiffFile;
  parallel: boolean;
  navigation: boolean;
  onComment?: Parameters<typeof DiffView>[0]["onComment"];
  control?: ReactNode;
  afterLine?: Parameters<typeof DiffView>[0]["afterLine"];
  fileRef?: string;
  repository: string;
  tables?: EscapeTables;
}) {
  const { t, i18n } = useTranslation("mergeRequests");
  const { lines, name, added, removed, blobs } = file;
  const [loadLarge, setLoadLarge] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [revealed, setRevealed] = useState<
    Record<number, { top: number; bottom: number }>
  >({});
  const rows = useMemo(
    () => diffRows(lines.slice(1), parallel),
    [lines, parallel],
  );
  const hunks = useMemo(() => diffHunks(rows), [rows]);
  const expandable = !!repository && !!blobs.after && !!blobs.before;
  const wanted = Object.keys(revealed).length > 0;
  const source = useQuery({
    queryKey: ["diff-blob", repository, blobs.after],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        native(`${repository}/raw/blob/${blobs.after}`),
        { credentials: "same-origin", signal },
      );
      if (!response.ok) throw new Error(t("diff.contextFailed"));
      const content = await response.text();
      const result = content.split("\n");
      if (result.at(-1) === "") result.pop();
      return result.map((line) => line.replace(/\r$/, ""));
    },
    enabled: expandable && wanted,
    staleTime: Infinity,
  });
  const status = useMemo(() => {
    if (!tables) return escapeStatus([]);
    const marks: EscapeMark[][] = [];
    for (const row of rows) {
      if (row.kind === "meta") continue;
      marks.push(
        escapeMarks(row.text || "", tables),
        escapeMarks(row.oldText || "", tables),
        escapeMarks(row.newText || "", tables),
      );
    }
    return escapeStatus(marks);
  }, [rows, tables]);
  const large = lines.length > 500 || lines.join("\n").length > 100000;
  // Hidden unchanged lines before each hunk and after the last one.
  const gaps: Gap[] = useMemo(() => {
    const result: Gap[] = [];
    let previousEndNew = 0,
      previousEndOld = 0;
    for (const hunk of hunks) {
      const startNew = hunk.newCount === 0 ? hunk.newStart + 1 : hunk.newStart;
      const startOld = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
      result.push({
        start: previousEndNew + 1,
        end: startNew - 1,
        offset: startOld - startNew,
      });
      previousEndNew =
        hunk.newCount === 0 ? hunk.newStart : hunk.newStart + hunk.newCount - 1;
      previousEndOld =
        hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1;
    }
    if (hunks.length)
      result.push({
        start: previousEndNew + 1,
        end: source.data ? source.data.length : undefined,
        offset: previousEndOld - previousEndNew,
      });
    return result;
  }, [hunks, source.data]);
  const reveal = (gap: number, part: "top" | "bottom" | "all") =>
    setRevealed((current) => {
      const state = current[gap] ?? { top: 0, bottom: 0 };
      return {
        ...current,
        [gap]:
          part === "all"
            ? { top: Number.MAX_SAFE_INTEGER, bottom: 0 }
            : part === "top"
              ? { ...state, top: state.top + expandStep }
              : { ...state, bottom: state.bottom + expandStep },
      };
    });
  // Context rows shown in a gap and how many lines remain hidden.
  const gapView = (index: number) => {
    const gap = gaps[index];
    const state = revealed[index] ?? { top: 0, bottom: 0 };
    if (!gap) return { top: [], bottom: [], hidden: 0, unknown: false };
    const end = gap.end;
    const unknown = end === undefined;
    const count = unknown ? Infinity : Math.max(0, end - gap.start + 1);
    if (!source.data || !count)
      return { top: [], bottom: [], hidden: count, unknown };
    const top = Math.min(count, state.top);
    const bottom = Math.min(count - top, state.bottom);
    const last = end ?? source.data.length;
    return {
      top: contextRows(source.data, gap.start, gap.start + top - 1, gap.offset),
      bottom: bottom
        ? contextRows(source.data, last - bottom + 1, last, gap.offset)
        : [],
      hidden: Math.max(
        0,
        (end ?? source.data.length) - gap.start + 1 - top - bottom,
      ),
      unknown: false,
    };
  };
  const expander = (index: number, header?: DiffRow) => {
    const view = gapView(index);
    if (!view.hidden && !header) return null;
    const first = index === 0;
    const trailing = index === hunks.length;
    const loading = source.isFetching && !source.data;
    const buttons =
      expandable && view.hidden > 0 ? (
        <span className="flex w-full">
          {loading ? (
            <span className="grid h-6 place-items-center text-xs">…</span>
          ) : view.hidden !== Infinity && view.hidden <= expandStep ? (
            <button
              className={expandButton}
              aria-label={t("diff.expandAllLines", { count: view.hidden })}
              title={t("diff.expandAllLines", { count: view.hidden })}
              onClick={() => reveal(index, "all")}
            >
              <ChevronsUpDown size={14} />
            </button>
          ) : (
            <>
              {!first && (
                <button
                  className={expandButton}
                  aria-label={t("diff.expandDown")}
                  title={t("diff.expandDown")}
                  onClick={() => reveal(index, "top")}
                >
                  <ChevronsDown size={14} />
                </button>
              )}
              {!trailing && (
                <button
                  className={expandButton}
                  aria-label={t("diff.expandUp")}
                  title={t("diff.expandUp")}
                  onClick={() => reveal(index, "bottom")}
                >
                  <ChevronsUp size={14} />
                </button>
              )}
            </>
          )}
        </span>
      ) : null;
    if (!buttons) return header ? renderRow(header, `hunk-${index}`) : null;
    return (
      <div
        key={`gap-${index}`}
        className={`diff-line diff-expander meta flex min-h-6 bg-[#f4f3f7] text-[13px] leading-6 text-muted dark:bg-surface-subtle ${parallel ? "w-full" : "w-max min-w-full"}`}
      >
        <span className="flex w-[88px] shrink-0 items-stretch border-r border-black/5 bg-[#e9eef8] dark:border-line dark:bg-[#24314a]">
          {buttons}
        </span>
        <code className="px-3 whitespace-pre">
          {header ? header.text || header.oldText : ""}
          {!header && source.error ? (source.error as Error).message : null}
        </code>
      </div>
    );
  };
  const renderRow = (row: DiffRow, key: string, context = false) => (
    <Fragment key={key}>
      <div
        className={`diff-line group/line text-[13px] leading-6 ${row.kind} ${context ? "diff-context-expanded" : ""} ${onComment ? "relative" : ""} ${parallel ? "grid w-full min-w-0 grid-cols-subgrid" : "flex w-max min-w-full"} ${
          row.kind === "added"
            ? parallel
              ? "bg-success-bg [&>:nth-child(-n+2)]:bg-code"
              : "bg-success-bg"
            : row.kind === "removed"
              ? parallel
                ? "bg-danger-bg [&>:nth-child(n+3)]:bg-code"
                : "bg-danger-bg"
              : row.kind === "meta"
                ? "bg-[#f4f3f7] text-muted dark:bg-surface-subtle"
                : row.kind === "changed" && parallel
                  ? "[&>code.added]:bg-success-bg [&>code.removed]:bg-danger-bg"
                  : context
                    ? "bg-[#fafafa] dark:bg-[#26252b]"
                    : ""
        }`}
      >
        <span className={gutter}>{row.before}</span>
        {parallel && (
          <code className={`${row.oldKind} ${parallelCode}`}>
            {row.oldText === undefined ? (
              ""
            ) : row.kind === "meta" ? (
              row.oldText
            ) : (
              <DiffCode
                filename={name}
                text={row.oldText || " "}
                tables={tables}
                escaped={escaped}
              />
            )}
          </code>
        )}
        <span className={gutter}>{row.after}</span>
        <code
          className={
            parallel ? `${row.newKind} ${parallelCode}` : "px-3 whitespace-pre"
          }
        >
          {row.kind === "meta" ? (
            row.text
          ) : (
            <>
              {!parallel && row.prefix}
              <DiffCode
                filename={name}
                text={(parallel ? row.newText : row.text) || " "}
                tables={tables}
                escaped={escaped}
              />
            </>
          )}
        </code>
        {onComment && row.kind !== "meta" && (
          <>
            {parallel && row.before !== undefined && (
              <button
                className={`${commentButton} left-[27px]`}
                aria-label={t("diff.commentPreviousLine", {
                  name,
                  line: row.before,
                })}
                onClick={() =>
                  onComment({
                    path: name,
                    line: row.before!,
                    side: "previous",
                  })
                }
              >
                <Plus size={13} />
              </button>
            )}
            {(!parallel || row.after !== undefined) && (
              <button
                className={`${commentButton} ${parallel ? "left-[calc(50%+27px)]" : "left-[27px]"}`}
                aria-label={t("diff.commentLine", {
                  name,
                  line: row.after ?? row.before,
                })}
                onClick={() =>
                  onComment({
                    path: name,
                    line: (row.after ?? row.before)!,
                    side: row.after !== undefined ? "proposed" : "previous",
                  })
                }
              >
                <Plus size={13} />
              </button>
            )}
          </>
        )}
      </div>
      {row.kind !== "meta" && afterLine?.(name, row.before, row.after)}
    </Fragment>
  );
  const body: ReactNode[] = [];
  let hunkIndex = 0;
  rows.forEach((row, index) => {
    const hunk = hunks[hunkIndex];
    if (hunk && hunk.row === index) {
      const view = gapView(hunkIndex);
      view.top.forEach((context, i) =>
        body.push(renderRow(context, `gap-${hunkIndex}-top-${i}`, true)),
      );
      if (view.hidden > 0 || !expandable || !revealed[hunkIndex])
        body.push(expander(hunkIndex, row));
      view.bottom.forEach((context, i) =>
        body.push(renderRow(context, `gap-${hunkIndex}-bottom-${i}`, true)),
      );
      hunkIndex++;
      return;
    }
    body.push(renderRow(row, `row-${index}`));
  });
  if (hunks.length && expandable) {
    const view = gapView(hunks.length);
    view.top.forEach((context, i) =>
      body.push(renderRow(context, `gap-end-${i}`, true)),
    );
    if (view.hidden > 0) body.push(expander(hunks.length));
  }
  return (
    <details
      open
      className={`diff-file group/diff-file my-4 scroll-mt-16 overflow-hidden rounded-lg border border-line ${parallel ? "diff-parallel" : ""} ${navigation ? "first:mt-0" : ""}`}
    >
      <summary className="flex cursor-pointer items-center gap-2 border-b border-line bg-[#fafafa] px-3 py-3 text-sm font-semibold max-md:flex-wrap dark:bg-surface-subtle [&_svg]:shrink-0">
        <ChevronRight
          size={14}
          className="[transition:transform_160ms_ease] group-open/diff-file:[transform:rotate(90deg)]"
        />
        <FileDiff size={16} />
        <span className="min-w-0 break-all">{name}</span>
        <span
          className={`ml-auto flex shrink-0 items-center gap-2 text-xs font-normal ${control ? "" : "max-md:ml-6"}`}
        >
          <span className="text-success">+{added}</span>
          <span className="text-danger">−{removed}</span>
        </span>
        {status.escaped && (
          <EscapeToggle
            escaped={escaped}
            onToggle={() => setEscaped(!escaped)}
            className="button min-h-7 px-2 text-xs font-normal"
          />
        )}
        {fileRef && blobs.after !== undefined && (
          <Link
            className="button min-h-7 px-2 text-xs font-normal"
            to={`/projects${repository}?${new URLSearchParams({ ref: fileRef, path: name })}`}
            onClick={(event) => event.stopPropagation()}
            title={t("diff.viewFileTitle", { name })}
          >
            <FileCode2 size={13} />
            {t("diff.viewFile")}
          </Link>
        )}
        {control}
      </summary>
      {status.escaped && (
        <div className={escapeStyles}>
          <EscapeWarning status={status} file={false} />
        </div>
      )}
      {mediaDiffKind(name) && repository && (blobs.before || blobs.after) ? (
        <AdvancedDiff
          name={name}
          repository={repository}
          before={blobs.before}
          after={blobs.after}
        />
      ) : large && !loadLarge ? (
        <div className="p-6 text-center text-muted">
          <p>
            {t("diff.large", {
              count: Math.max(0, lines.length - 1),
              lines: new Intl.NumberFormat(i18n.language).format(
                Math.max(0, lines.length - 1),
              ),
            })}
          </p>
          <button className="button mt-3" onClick={() => setLoadLarge(true)}>
            {t("diff.loadFile", { name })}
          </button>
        </div>
      ) : (
        <div className={`overflow-auto ${escapeStyles}`}>
          <div
            className={
              parallel
                ? "grid w-max min-w-[max(760px,100%)] grid-cols-[44px_minmax(max-content,1fr)_44px_minmax(max-content,1fr)] [&>*]:col-span-full"
                : undefined
            }
          >
            {body}
          </div>
          {source.isFetching && !source.data && wanted && <Pending />}
        </div>
      )}
    </details>
  );
}
