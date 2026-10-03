import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, History, Link2, RotateCcw } from "lucide-react";
import type { HighlightToken } from "@tanstack/highlight/core";
import { native, nativePage } from "./api";
import type { RepoContext } from "./App";
import { EmptyState, Feedback, Pending, relativeDate, useTitle } from "./UI";
import { codeLanguage, codeTokens } from "./Highlight";
import { RefSwitcher, escapeSegments } from "./RefSwitcher";
import {
  EscapeToggle,
  EscapeWarning,
  MarkedTokens,
  escapeStyles,
  useLineEscapes,
} from "./SourceView";
import {
  actionsClass,
  headerClass,
  mutedClass,
  noticeClass,
  pageClass,
  titleClass,
} from "./repositoryStyles";

interface Blame {
  items: {
    sha: string;
    previous_sha: string;
    previous_path: string;
    lines: string[];
    message: string;
    author: string;
    date: string;
  }[];
  commit_id?: string;
  is_branch?: boolean;
  too_large: boolean;
  uses_ignore_revs: boolean;
  faulty_ignore_revs: boolean;
}

const optionClass =
  "button m-0 min-h-8 rounded-none px-2.5 py-1 whitespace-nowrap text-ink first:rounded-l-md last:rounded-r-md";

export function BlamePage() {
  const { t } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const [escaped, setEscaped] = useState(false);
  const ref = params.get("ref") || repository.default_branch,
    file = params.get("path") || "",
    type = params.get("type") || "branch",
    bypass = params.get("ignore") === "0";
  const result = useQuery({
    queryKey: ["blame", path, ref, type, file, bypass],
    queryFn: ({ signal }) =>
      nativePage<Blame>(
        `${path}/blame/${encodeURIComponent(type)}/${escapeSegments(ref)}/${escapeSegments(file)}?bypass-blame-ignore=${bypass}`,
        signal,
      ),
    enabled: !!file,
  });
  useTitle(t("blame.documentTitle", { file }));
  // Highlight the whole file once so multi-line tokens keep their colours.
  const lines = useMemo(
    () => result.data?.items.flatMap((part) => part.lines) ?? [],
    [result.data],
  );
  const tokens = useMemo(() => {
    const out: HighlightToken[][] = [[]];
    const code = lines.join("\n");
    const all =
      code.length > 1024 * 1024
        ? [{ value: code } as HighlightToken]
        : codeTokens(code, codeLanguage(file));
    for (const token of all)
      token.value.split("\n").forEach((value, index) => {
        if (index) out.push([]);
        if (value) out.at(-1)!.push({ ...token, value });
      });
    return out;
  }, [lines, file]);
  const escapes = useLineEscapes(lines, "file-view");
  const commit = result.data?.commit_id || ref;
  const root = `/projects${path}`;
  let line = 0;
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <div className="min-w-0">
          <h1 className={titleClass}>{t("blame.title")}</h1>
          <p className={`${mutedClass} break-all`}>{file}</p>
        </div>
        <div className={actionsClass}>
          {file && (
            <RefSwitcher
              path={path}
              value={ref}
              className="max-w-[200px]"
              onSelect={(value, kind) =>
                setParams({ ref: value, path: file, type: kind })
              }
            />
          )}
          {escapes.status.escaped && (
            <EscapeToggle
              escaped={escaped}
              onToggle={() => setEscaped(!escaped)}
            />
          )}
          {file && (
            <div className="flex items-stretch" role="group">
              <a
                className={optionClass}
                href={native(
                  `${path}/raw/commit/${encodeURIComponent(commit)}/${escapeSegments(file)}`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={14} />
                {t("code.file.raw")}
              </a>
              {result.data?.commit_id && type !== "commit" && (
                <Link
                  className={`${optionClass} [border-left:0]`}
                  to={`?${new URLSearchParams({ ref: result.data.commit_id, path: file, type: "commit" })}`}
                >
                  <Link2 size={14} />
                  {t("code.file.permalink")}
                </Link>
              )}
              <Link
                className={`${optionClass} [border-left:0]`}
                to={`${root}/history?${new URLSearchParams({ ref, path: file })}`}
              >
                <History size={14} />
                {t("code.history")}
              </Link>
              <Link
                className={`${optionClass} [border-left:0]`}
                to={`${root}?${new URLSearchParams({ ref, path: file })}`}
              >
                {t("blame.viewFile")}
              </Link>
            </div>
          )}
        </div>
      </header>
      <Feedback error={result.error} />
      {result.isPending && file && <Pending />}
      {!file && (
        <EmptyState title={t("blame.chooseFileTitle")}>
          {t("blame.chooseFileBody")}
        </EmptyState>
      )}
      {result.data?.too_large && (
        <EmptyState title={t("blame.tooLargeTitle")}>
          {t("blame.tooLargeBody")}
        </EmptyState>
      )}
      {(result.data?.uses_ignore_revs || bypass) && (
        <div className={noticeClass}>
          {t(bypass ? "blame.showingAll" : "blame.ignoredHidden")}
          <button
            className="button"
            onClick={() =>
              setParams({ ref, path: file, type, ignore: bypass ? "1" : "0" })
            }
          >
            {t(bypass ? "blame.respectIgnored" : "blame.showIgnored")}
          </button>
        </div>
      )}
      {result.data?.faulty_ignore_revs && (
        <p className={noticeClass}>{t("blame.faultyIgnore")}</p>
      )}
      {result.data && !result.data.too_large && (
        <div
          className={`overflow-hidden rounded-md border border-line ${escapeStyles}`}
        >
          <EscapeWarning status={escapes.status} />
          <div className="overflow-auto">
            {result.data.items.map((part, index) => (
              <div
                className="grid grid-cols-[280px_minmax(400px,1fr)] border-b border-line last:border-b-0 max-md:grid-cols-[180px_minmax(360px,1fr)]"
                key={`${part.sha}-${index}`}
              >
                <div className="repository-blame-commit flex flex-col gap-1 border-r border-line bg-surface-subtle px-3 py-2 text-xs">
                  <Link
                    className="text-sm font-semibold"
                    to={`${root}/commit/${part.sha}`}
                  >
                    {part.message}
                  </Link>
                  <span className="text-muted">
                    {part.author} · {relativeDate(part.date)}
                  </span>
                  <div className={actionsClass}>
                    <Link to={`${root}/commit/${part.sha}`}>
                      {part.sha.slice(0, 8)}
                    </Link>
                    {part.previous_sha && (
                      <Link
                        title={t("blame.before")}
                        aria-label={t("blame.before")}
                        to={`${root}/blame?${new URLSearchParams({ ref: part.previous_sha, type: "commit", path: part.previous_path || file })}`}
                      >
                        <RotateCcw size={14} />
                      </Link>
                    )}
                  </div>
                </div>
                <div className="bg-code py-1">
                  {part.lines.map((text) => {
                    const number = ++line;
                    return (
                      <div
                        id={`L${number}`}
                        className="repository-blame-line flex min-h-5 scroll-mt-20 text-[12px] leading-5 target:bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]"
                        key={number}
                      >
                        <a
                          className="w-12 shrink-0 px-2 text-right font-mono text-muted"
                          href={`#L${number}`}
                        >
                          {number}
                        </a>
                        <code className="px-3 whitespace-pre">
                          {text ? (
                            <MarkedTokens
                              tokens={tokens[number - 1] ?? [{ value: text }]}
                              marks={escapes.marks[number - 1]}
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
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
