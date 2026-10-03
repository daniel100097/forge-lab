import { useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  GitCommitHorizontal,
} from "lucide-react";
import { native, nativePage, nativeText, repoPath, type Commit } from "./api";
import type { RepoContext } from "./App";
import {
  CopyButton,
  EmptyState,
  Feedback,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { SelectControl } from "./SelectControl";
import { DiffOptions, DiffView, useDiffOptions } from "./Diff";
import { ActionMenu, MenuDownload } from "./ActionMenu";
import { RefSwitcher } from "./RefSwitcher";
import { repositoryDetails } from "./CodeExtras";
import {
  contentClass,
  headerClass,
  listClass,
  mutedClass,
  noticeClass,
  pageClass,
  rowClass,
  rowIconClass,
  rowMutedClass,
  rowTitleClass,
  titleClass,
} from "./repositoryStyles";

interface Comparison {
  nothing_to_compare: boolean;
  commit_count: number;
  commits: Commit[];
  commits_truncated: boolean;
  existing_pull?: { number: number; title: string };
  can_create?: boolean;
  base_sha?: string;
  head_sha?: string;
  head_repository?: string;
  head_repositories?: string[];
}

export function CommitRow({ commit, root }: { commit: Commit; root: string }) {
  return (
    <article className={rowClass}>
      <GitCommitHorizontal size={18} className={rowIconClass} />
      <div className={contentClass}>
        <Link className={rowTitleClass} to={`${root}/commit/${commit.sha}`}>
          {commit.message}
        </Link>
        <span className={rowMutedClass}>
          {commit.author} · {relativeDate(commit.date)}
        </span>
      </div>
      <Link to={`${root}/commit/${commit.sha}`}>{commit.sha.slice(0, 8)}</Link>
      <CopyButton value={commit.sha} />
    </article>
  );
}

/** "owner/repo:branch" → repository and branch (the native head syntax). */
function splitSource(source: string, fallback: string) {
  const colon = source.indexOf(":");
  if (colon > 0 && source.slice(0, colon).includes("/"))
    return { repository: source.slice(0, colon), ref: source.slice(colon + 1) };
  return { repository: fallback, ref: source };
}

export function ComparePage() {
  const { t } = useTranslation("repository");
  const context = useOutletContext<RepoContext>();
  const { path } = context;
  const repository = repositoryDetails(context.repository);
  const [params, setParams] = useSearchParams();
  const selectedSource = params.get("source") || "",
    selectedTarget = params.get("target") || repository.default_branch,
    selectedMethod = params.get("method") === ".." ? ".." : "...";
  const head = splitSource(selectedSource, repository.full_name);
  const [target, setTarget] = useState(selectedTarget);
  const [headRepository, setHeadRepository] = useState(head.repository);
  const [source, setSource] = useState(head.ref);
  const [method, setMethod] = useState(selectedMethod);
  const [tab, setTab] = useState("changes");
  const options = useDiffOptions();
  const sameRepository = head.repository === repository.full_name;
  const encodeRef = (value: string) =>
    value.split("/").map(encodeURIComponent).join("/");
  const sourceSpec = sameRepository
    ? encodeRef(head.ref)
    : `${head.repository.split("/").map(encodeURIComponent).join("/")}:${encodeRef(head.ref)}`;
  const comparePath = `${path}/compare/${encodeRef(selectedTarget)}${selectedMethod}${sourceSpec}`;
  const compared = !!selectedSource && selectedSource !== selectedTarget;
  const comparison = useQuery({
    queryKey: ["comparison", comparePath],
    queryFn: ({ signal }) => nativePage<Comparison>(comparePath, signal),
    enabled: compared,
  });
  const data = comparison.data;
  // Same-repository comparisons use the diff endpoint with whitespace
  // options and full blob IDs (expandable context); forks the native diff.
  const diffUrl =
    sameRepository && data?.base_sha && data.head_sha
      ? `/-/ui/data/repos${path}/diff?${new URLSearchParams({ base: data.base_sha, head: data.head_sha, whitespace: options.whitespace })}`
      : `${comparePath}.diff`;
  const diff = useQuery({
    queryKey: ["comparison-diff", diffUrl],
    queryFn: ({ signal }) => nativeText(diffUrl, signal),
    enabled: !!data && !data.nothing_to_compare,
  });
  useTitle(t("compare.title"));
  const headRepositories = [
    ...new Set(
      [
        repository.full_name,
        repository.fork_parent?.full_name,
        ...(data?.head_repositories ?? []),
        head.repository,
      ].filter((value): value is string => !!value),
    ),
  ];
  const headPath =
    headRepository === repository.full_name
      ? path
      : repoPath(...(headRepository.split("/") as [string, string]));
  const submit = (next?: { target: string; source: string }) => {
    const values = next ?? { target, source };
    const spec =
      headRepository === repository.full_name
        ? values.source
        : `${headRepository}:${values.source}`;
    setParams({ source: spec, target: values.target, method });
  };
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>{t("compare.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {compared && (
            <ActionMenu
              label={t("compare.download")}
              trigger={
                <>
                  {t("compare.download")} <ChevronDown size={14} />
                </>
              }
            >
              <MenuDownload href={native(`${comparePath}.diff`)}>
                {t("commit.downloadDiff")}
              </MenuDownload>
              <MenuDownload href={native(`${comparePath}.patch`)}>
                {t("commit.downloadPatch")}
              </MenuDownload>
            </ActionMenu>
          )}
          {compared && data?.can_create !== false && repository.signed_in && (
            <Link
              className="button primary"
              to={`/projects${path}/merge-requests/new?${new URLSearchParams({
                source_branch: head.ref,
                target_branch: selectedTarget,
                step: "create",
                ...(sameRepository ? {} : { source_project: head.repository }),
              })}`}
            >
              {t("compare.createMergeRequest")}
            </Link>
          )}
        </div>
      </header>
      <form
        className="compare-form mb-6 flex flex-wrap items-end gap-4 rounded-md border border-line bg-surface-subtle p-4 max-md:flex-col max-md:items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex min-w-44 flex-1 flex-col gap-2">
          <span className="font-semibold">{t("compare.target")}</span>
          <RefSwitcher
            path={path}
            value={target}
            onSelect={setTarget}
            label={t("compare.target")}
            className="w-full"
          />
        </div>
        <button
          type="button"
          className="icon-button mb-0.5 max-md:self-center"
          aria-label={t("compare.swap")}
          title={t("compare.swap")}
          disabled={headRepository !== repository.full_name}
          onClick={() => {
            setTarget(source);
            setSource(target);
            if (source && target) submit({ target: source, source: target });
          }}
        >
          <ArrowLeftRight size={16} className="max-md:hidden" />
          <ArrowRight size={16} className="hidden rotate-90 max-md:block" />
        </button>
        <div className="flex min-w-44 flex-[1.4] flex-col gap-2">
          <span className="font-semibold">{t("compare.source")}</span>
          <div className="flex min-w-0 flex-wrap gap-2">
            {headRepositories.length > 1 && (
              <SelectControl
                label={t("compare.headRepository")}
                value={headRepository}
                onValueChange={(value) => {
                  setHeadRepository(value);
                  setSource("");
                }}
                options={headRepositories.map((name) => ({
                  value: name,
                  label: name,
                }))}
              />
            )}
            <RefSwitcher
              key={headPath}
              path={headPath}
              value={source || t("compare.chooseSource")}
              onSelect={setSource}
              label={t("compare.source")}
              className="min-w-40 flex-1"
            />
          </div>
        </div>
        <SelectControl
          label={t("compare.method")}
          value={method}
          onValueChange={setMethod}
          options={[
            { value: "...", label: t("compare.onlyIncoming") },
            { value: "..", label: t("compare.includeTarget") },
          ]}
        />
        <button className="button primary" disabled={!source}>
          {t("compare.submit")}
        </button>
      </form>
      <Feedback error={comparison.error || diff.error} />
      {comparison.isFetching && <Pending />}
      {selectedSource === selectedTarget && (
        <EmptyState title={t("compare.sameTitle")}>
          {t("compare.sameBody")}
        </EmptyState>
      )}
      {data && (
        <>
          {data.existing_pull && (
            <div className={noticeClass}>
              <Trans
                t={t}
                i18nKey="compare.existingPull"
                components={{
                  link: (
                    <Link
                      to={`/projects${path}/merge-requests/${data.existing_pull.number}`}
                    >
                      {data.existing_pull.title}
                    </Link>
                  ),
                }}
              />
            </div>
          )}
          <nav className="tabs" aria-label={t("compare.tabs")}>
            <button
              className={tab === "changes" ? "active" : ""}
              onClick={() => setTab("changes")}
            >
              {t("compare.changes")}
            </button>
            <button
              className={tab === "commits" ? "active" : ""}
              onClick={() => setTab("commits")}
            >
              {t("compare.commits")}{" "}
              <span className="counter">{data.commit_count}</span>
            </button>
          </nav>
          {data.nothing_to_compare ? (
            <EmptyState title={t("compare.noChangesTitle")}>
              {t("compare.noChangesBody")}
            </EmptyState>
          ) : tab === "changes" ? (
            <div className="mt-4">
              <DiffOptions options={options} whitespace={sameRepository} />
              {diff.isPending ? (
                <Pending />
              ) : (
                diff.data !== undefined && (
                  <DiffView
                    text={diff.data}
                    navigation
                    parallel={options.parallel}
                    fileRef={sameRepository ? data.head_sha : undefined}
                  />
                )
              )}
            </div>
          ) : (
            <div className={listClass}>
              {data.commits.map((commit) => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  root={`/projects${path}`}
                />
              ))}
            </div>
          )}
          {data.commits_truncated && (
            <p className={mutedClass}>{t("compare.truncated")}</p>
          )}
        </>
      )}
    </section>
  );
}
