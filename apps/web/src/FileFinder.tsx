import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { GitBranch, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { get, type Tree } from "./api";
import type { RepoContext } from "./App";
import { RepositoryFinder } from "./RepositoryPreviews";
import { EmptyState, Feedback, Pending, useTitle } from "./UI";

/** Native "Go to file" page (/{owner}/{repo}/find/{type}/{ref}). */
export default function FileFinderPage() {
  const { t } = useTranslation("shell");
  const { repository, path, dataPath } = useOutletContext<RepoContext>();
  const [params] = useSearchParams();
  const ref = params.get("ref") || repository.default_branch;
  const [filter, setFilter] = useState(params.get("q") ?? "");
  const navigate = useNavigate();
  useTitle(t("fileFinder.documentTitle", { name: repository.name }));
  const tree = useQuery({
    queryKey: ["tree", path, ref, ""],
    queryFn: ({ signal }) =>
      get<Tree>(
        `${dataPath}/tree?${new URLSearchParams({ ref, path: "" })}`,
        signal,
      ),
    enabled: !!repository.units?.code && !repository.empty,
  });
  const files = `/projects${path}?ref=${encodeURIComponent(ref)}`;
  return (
    <div className="file-finder-page pt-2">
      <div className="mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3">
        <h1 className="max-md:text-[22px]">{t("fileFinder.title")}</h1>
        <Link className="button min-w-0" to={files}>
          <GitBranch size={15} className="shrink-0" />
          <span className="truncate font-mono">{ref}</span>
        </Link>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-3" role="search">
        <label className="filter-input w-auto min-w-0 flex-1">
          <Search size={16} />
          <input
            autoFocus
            aria-label={t("fileFinder.filterLabel")}
            placeholder={t("fileFinder.filterPlaceholder")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>
      {!repository.units?.code || repository.empty ? (
        <EmptyState title={t("fileFinder.emptyTitle")}>
          {t("fileFinder.emptyBody")}
        </EmptyState>
      ) : tree.isPending ? (
        <Pending />
      ) : tree.error ? (
        <Feedback error={tree.error} />
      ) : (
        <RepositoryFinder
          path={path}
          sha={tree.data.sha}
          filter={filter}
          onSelect={(file) =>
            navigate(`${files}&${new URLSearchParams({ path: file })}`)
          }
        />
      )}
    </div>
  );
}
