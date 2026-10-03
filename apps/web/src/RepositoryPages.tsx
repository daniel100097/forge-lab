import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, GitFork, Star } from "lucide-react";
import { get, nativeForm, nativePage } from "./api";
import type { RepoContext } from "./App";
import { uiRoute } from "./routes";
import {
  EmptyState,
  Feedback,
  Pagination,
  Pending,
  useTitle,
  relativeDate,
} from "./UI";
import { SelectControl } from "./SelectControl";
import {
  actionsClass,
  avatarClass,
  contentClass,
  formClass,
  formLabelClass,
  headerClass,
  pageClass,
  rowClass,
  rowIconClass,
  rowMutedClass,
  rowTitleClass,
  titleClass,
} from "./repositoryStyles";

export { BranchesPage, TagsPage } from "./RepositoryReferences";
export { ComparePage } from "./RepositoryCompare";
export { BlamePage } from "./RepositoryBlame";
export { GraphPage } from "./RepositoryGraph";
export { RepositorySearchPage } from "./RepositorySearch";
export {
  RepositoryActivityPage,
  RepositoryAnalyticsPage,
} from "./RepositoryAnalytics";

interface Person {
  id: number;
  username?: string;
  name: string;
  avatar_url: string;
  full_name?: string;
  description?: string;
  private?: boolean;
  updated_at?: string;
}
export function RepositoryPeoplePage({
  kind,
}: {
  kind: "stars" | "watchers" | "forks";
}) {
  const { t } = useTranslation("repository");
  const { path, dataPath, repository } = useOutletContext<RepoContext>();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1),
    title = t(`people.${kind}.title`);
  const query = useQuery({
    queryKey: ["repository-people", path, kind, page],
    queryFn: ({ signal }) =>
      get<{ items: Person[]; total: number }>(
        `${dataPath}/${kind}?page=${page}`,
        signal,
      ),
  });
  useTitle(title);
  const Icon = kind === "stars" ? Star : kind === "watchers" ? Bell : GitFork;
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <h1 className={titleClass}>
          {title}{" "}
          {query.data && (
            <span className="counter ml-1 align-middle text-sm font-normal">
              {query.data.total}
            </span>
          )}
        </h1>
        {kind === "forks" && repository.signed_in && (
          <Link className="button primary" to={`/projects${path}/fork`}>
            <GitFork size={16} />
            {t("people.forkProject")}
          </Link>
        )}
      </header>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <div>
              {query.data.items.map((item) => (
                <article key={item.id} className={rowClass}>
                  <img className={avatarClass} src={item.avatar_url} alt="" />
                  <div className={contentClass}>
                    {kind === "forks" ? (
                      <Link
                        className={rowTitleClass}
                        to={`/projects/${item.full_name}`}
                      >
                        {item.full_name}
                      </Link>
                    ) : (
                      <Link
                        className={rowTitleClass}
                        to={`/users/${item.username}`}
                      >
                        {item.name}
                      </Link>
                    )}
                    <p className={rowMutedClass}>
                      {kind === "forks"
                        ? item.description
                        : `@${item.username}`}
                    </p>
                    {item.updated_at && (
                      <span className={rowMutedClass}>
                        {t("people.updated", {
                          date: relativeDate(item.updated_at),
                        })}
                      </span>
                    )}
                  </div>
                  <Icon size={17} className={rowIconClass} />
                </article>
              ))}
            </div>
            {!query.data.items.length && (
              <EmptyState title={t(`people.${kind}.empty`)}>
                {t("people.emptyBody")}
              </EmptyState>
            )}
            <Pagination
              page={page}
              total={query.data.total}
              onPage={(p) => setParams({ page: String(p) })}
            />
          </>
        )
      )}
    </section>
  );
}
interface ForkOptions {
  owners: { id: number; name: string }[];
  can_fork: boolean;
  name: string;
  description: string;
  private: boolean;
  branches: string[];
}
export function ForkPage() {
  const { t } = useTranslation("repository");
  const { path } = useOutletContext<RepoContext>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["fork-options", path],
    queryFn: ({ signal }) => nativePage<ForkOptions>(`${path}/fork`, signal),
  });
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      nativeForm(`${path}/fork`, values),
    onSuccess: async (result) => {
      await client.invalidateQueries();
      if (result.redirect) navigate(uiRoute(result.redirect));
    },
  });
  useTitle(t("fork.title"));
  return (
    <section className="mx-auto min-w-0 max-w-3xl">
      <header className={headerClass}>
        <h1 className={titleClass}>{t("fork.title")}</h1>
      </header>
      <p>{t("fork.intro")}</p>
      <Feedback error={query.error || mutation.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <form
            className={formClass}
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                Object.fromEntries(new FormData(e.currentTarget)) as Record<
                  string,
                  string
                >,
              );
            }}
          >
            <label className={formLabelClass}>
              {t("fork.name")}
              <input
                name="repo_name"
                defaultValue={query.data.name}
                required
                maxLength={100}
              />
            </label>
            <label className={formLabelClass}>
              {t("fork.namespace")}
              <SelectControl
                label={t("fork.namespace")}
                name="uid"
                required
                options={query.data.owners.map((owner) => ({
                  value: String(owner.id),
                  label: owner.name,
                }))}
              />
            </label>
            <label className={formLabelClass}>
              {t("fork.description")}
              <textarea
                name="description"
                defaultValue={query.data.description}
                maxLength={2048}
              />
            </label>
            <label className={formLabelClass}>
              {t("fork.branches")}
              <SelectControl
                label={t("fork.branchesLabel")}
                name="fork_single_branch"
                options={[
                  { value: "", label: t("fork.allBranches") },
                  ...query.data.branches.map((branch) => ({
                    value: branch,
                    label: branch,
                  })),
                ]}
              />
            </label>
            <label className="flex items-center gap-2 [&_input]:w-4">
              <input
                type="checkbox"
                name="private"
                value="true"
                defaultChecked={query.data.private}
                disabled={query.data.private}
              />
              {t("fork.private")}
            </label>
            {query.data.private && (
              <input type="hidden" name="private" value="true" />
            )}
            <div className={actionsClass}>
              <button
                className="button primary"
                disabled={mutation.isPending || !query.data.can_fork}
              >
                {t("fork.submit")}
              </button>
              <Link className="button" to={`/projects${path}`}>
                {t("shared.cancel")}
              </Link>
            </div>
          </form>
        )
      )}
    </section>
  );
}
