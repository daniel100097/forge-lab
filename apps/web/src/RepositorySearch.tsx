import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileCode2 } from "lucide-react";
import { nativePage } from "./api";
import type { RepoContext } from "./App";
import {
  EmptyState,
  Feedback,
  Pagination,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { RefSwitcher, escapeSegments } from "./RefSwitcher";
import { repositoryDetails } from "./CodeExtras";
import { SearchForm } from "./RepositoryReferences";
import {
  headerClass,
  pageClass,
  titleClass,
  toolbarClass,
} from "./repositoryStyles";

interface SearchResults {
  page_size: number;
  items: {
    path: string;
    sha: string;
    language: string;
    color?: string;
    updated_at?: string;
    lines: { number: number; html: string }[];
  }[];
  total: number;
  mode?: string;
  modes: string[];
  unavailable: boolean;
  indexed: boolean;
  languages?: { language: string; color: string; count: number }[];
}

const knownModes = ["exact", "union", "regexp", "fuzzy"] as const;

/**
 * Repository code search like the native page: Forgejo registers
 * /search/{branch,tag}/{ref} only for git grep (indexer disabled); the
 * indexer searches the default branch at /search and adds a language facet.
 */
export function RepositorySearchPage() {
  const { t } = useTranslation("repository");
  const context = useOutletContext<RepoContext>();
  const { path } = context;
  const repository = repositoryDetails(context.repository);
  const [params, setParams] = useSearchParams();
  const keyword = params.get("q") || "",
    mode = params.get("mode") || "",
    page = Number(params.get("page") || 1),
    language = params.get("l") || "",
    scope = params.get("path") || "",
    ref = params.get("ref") || repository.default_branch,
    type = params.get("type") === "tag" ? "tag" : "branch";
  const indexed = !!repository.code_indexer;
  const endpoint =
    indexed || (!params.get("ref") && !params.get("type"))
      ? `${path}/search`
      : `${path}/search/${type}/${escapeSegments(ref)}`;
  const query = useQuery({
    queryKey: ["code-search", path, endpoint, params.toString()],
    queryFn: ({ signal }) =>
      nativePage<SearchResults>(
        `${endpoint}?${new URLSearchParams({
          q: keyword,
          ...(mode ? { mode } : {}),
          page: String(page),
          path: scope,
          ...(language ? { l: language } : {}),
        })}`,
        signal,
      ),
    enabled: !repository.empty,
  });
  const update = (changes: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    const current = {
      q: keyword,
      mode,
      l: language,
      path: scope,
      ...(indexed ? {} : params.get("ref") ? { ref, type } : {}),
      ...changes,
    };
    for (const [key, value] of Object.entries(current))
      if (value) next[key] = value;
    setParams(next);
  };
  useTitle(t("search.title"));
  const selectedMode = mode || query.data?.mode || "exact";
  const root = `/projects${path}`;
  const fileLink = (item: SearchResults["items"][number], line?: number) =>
    `${root}?${new URLSearchParams({ ref: item.sha, path: item.path })}${line ? `#L${line}` : ""}`;
  const scopeParts = scope.split("/").filter(Boolean);
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>{t("search.title")}</h1>
      </header>
      <div className={toolbarClass}>
        {!indexed && (
          <RefSwitcher
            path={path}
            value={ref}
            className="max-w-[200px] shrink-0"
            onSelect={(value, kind) =>
              update({
                ref: value,
                type: kind === "tag" ? "tag" : "branch",
                page: undefined,
              })
            }
          />
        )}
        <SearchForm
          key={keyword}
          value={keyword}
          label={t("search.label")}
          placeholder={t("search.placeholder")}
          onSearch={(q) => update({ q, page: undefined })}
        />
        <SelectControl
          label={t("search.mode")}
          value={selectedMode}
          onValueChange={(value) => update({ mode: value, page: undefined })}
          options={(query.data?.modes || ["exact", "union", "regexp"]).map(
            (value) => ({
              value,
              label: (knownModes as readonly string[]).includes(value)
                ? t(`search.modes.${value as (typeof knownModes)[number]}`)
                : value,
            }),
          )}
        />
      </div>
      {scope && (
        <nav
          className="code-search-scope mt-4 flex flex-wrap items-center gap-1 text-sm"
          aria-label={t("search.scope")}
        >
          <span className="text-muted">{t("search.inPath")}</span>
          <button
            className="font-mono text-primary hover:underline"
            onClick={() => update({ path: undefined, page: undefined })}
          >
            @
          </button>
          {scopeParts.map((part, index) => (
            <span key={index} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-muted" />
              <button
                className="font-mono text-primary hover:underline"
                onClick={() =>
                  update({
                    path: scopeParts.slice(0, index + 1).join("/"),
                    page: undefined,
                  })
                }
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
      )}
      {!!query.data?.languages?.length && keyword && (
        <div
          className="code-search-languages mt-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("search.languages")}
        >
          {query.data.languages.map((item) => (
            <button
              key={item.language}
              className="label gap-1.5 border border-line bg-surface py-0.5 hover:bg-hover aria-pressed:border-primary aria-pressed:font-semibold"
              aria-pressed={language === item.language}
              onClick={() =>
                update({
                  l: language === item.language ? undefined : item.language,
                  page: undefined,
                })
              }
            >
              <i
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color || "var(--color-muted)" }}
              />
              {item.language}
              <span className="counter">{item.count}</span>
            </button>
          ))}
        </div>
      )}
      <Feedback error={query.error} />
      {query.isFetching ? (
        <Pending />
      ) : query.data?.unavailable ? (
        <EmptyState title={t("search.indexingTitle")}>
          {t("search.indexingBody")}
        </EmptyState>
      ) : !keyword ? (
        <EmptyState title={t("search.promptTitle")}>
          {t("search.promptBody")}
        </EmptyState>
      ) : (
        query.data && (
          <>
            <p className="my-5 text-sm text-muted">
              {t("search.matchingFiles", { count: query.data.total })}
            </p>
            {query.data.items.map((item) => (
              <article
                className="repository-search-result mb-4 overflow-hidden rounded-md border border-line"
                key={`${item.path}-${item.sha}`}
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-subtle px-4 py-3 font-semibold">
                  <Link className="min-w-0 break-all" to={fileLink(item)}>
                    {item.path}
                  </Link>
                  <Link
                    className="button min-h-7 px-2 text-xs font-normal"
                    to={fileLink(item)}
                  >
                    <FileCode2 size={13} />
                    {t("search.viewFile")}
                  </Link>
                </header>
                <div className="markup overflow-auto bg-code py-2 [&_.search-highlight]:bg-[color-mix(in_srgb,#c99700_25%,transparent)]">
                  {item.lines.map((line, index) => (
                    <div key={index}>
                      {index > 0 &&
                        item.lines[index - 1].number + 1 !== line.number && (
                          <div className="my-1 border-t-4 border-line" />
                        )}
                      <div className="flex font-mono text-xs leading-6">
                        <Link
                          className="w-12 shrink-0 pr-3 text-right text-muted"
                          to={fileLink(item, line.number)}
                        >
                          {line.number}
                        </Link>
                        <code
                          className="chroma bg-transparent! px-3 whitespace-pre"
                          dangerouslySetInnerHTML={{ __html: line.html }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {(item.language || item.updated_at) && (
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      {item.language && (
                        <>
                          <i
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor:
                                item.color || "var(--color-muted)",
                            }}
                          />
                          {item.language}
                        </>
                      )}
                    </span>
                    {item.updated_at && (
                      <span>
                        {t("search.lastIndexed", {
                          date: relativeDate(item.updated_at),
                        })}
                      </span>
                    )}
                  </footer>
                )}
              </article>
            ))}
            {!query.data.total && (
              <EmptyState title={t("search.noMatchesTitle")}>
                {t("search.noMatchesBody")}
              </EmptyState>
            )}
            <Pagination
              page={page}
              total={query.data.total}
              size={query.data.page_size}
              onPage={(p) => update({ page: String(p) })}
            />
          </>
        )
      )}
    </section>
  );
}
