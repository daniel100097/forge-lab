import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Lock, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nativePage } from "./api";
import { Feedback, Pending, paginationClass } from "./UI";

// Repository pickers of the access token and authorized integration forms.
// Like the native pickers they search the repositories owned by or shared with
// the signed-in user, page through the results and exclude selected ones.
export interface PickerRepository {
  Name: string;
  OwnerName: string;
  IsPrivate?: boolean;
}
export interface PickerPage {
  Current?: number;
  Total?: number;
  TotalPages?: number;
}
const fullName = (repo: PickerRepository) => `${repo.OwnerName}/${repo.Name}`;
const listClass =
  "account-repo-picker-list flex flex-col border-t border-line text-sm";
const rowClass =
  "flex min-h-11 items-center gap-2 border-b border-line px-1 py-1.5";

function RepositoryName({ repo }: { repo: PickerRepository }) {
  const { t } = useTranslation("account");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="truncate">{fullName(repo)}</span>
      {repo.IsPrivate && (
        <Lock
          size={13}
          className="shrink-0 text-muted"
          aria-label={t("repoPicker.private")}
        />
      )}
    </span>
  );
}

function useRepositorySearch(
  endpoint: string,
  params: Record<string, string>,
  selected: string[],
  keys: { search: string; page: string; result: string; pager: string },
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      "account-repo-picker",
      endpoint,
      params,
      keys,
      search,
      page,
      selected,
    ],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams(params);
      if (search) query.set(keys.search, search);
      query.set(keys.page, String(page));
      for (const name of selected) query.append("selected_repo", name);
      return nativePage<Record<string, unknown>>(
        `${endpoint}?${query}`,
        signal,
      );
    },
    placeholderData: keepPreviousData,
  });
  const repositories = (query.data?.[keys.result] || []) as PickerRepository[];
  const pager = (query.data?.[keys.pager] || {}) as PickerPage;
  return { query, search, setSearch, page, setPage, repositories, pager };
}

function Pager({
  pager,
  onPage,
}: {
  pager: PickerPage;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation("account");
  const page = pager.Current || 1;
  const pages = pager.TotalPages || 1;
  if (pages <= 1) return null;
  return (
    <div className={paginationClass}>
      <span>{t("repoPicker.results", { count: pager.Total || 0 })}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t("repoPicker.previous")}
        </button>
        <span>{t("repoPicker.page", { page, pages })}</span>
        <button
          type="button"
          className="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {t("repoPicker.next")}
        </button>
      </div>
    </div>
  );
}

function SearchForm({
  label,
  onSearch,
}: {
  label: string;
  onSearch: (value: string) => void;
}) {
  const { t } = useTranslation("account");
  const [value, setValue] = useState("");
  // A nested <form> is not allowed; the search reacts to Enter instead.
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <div className="filter-input w-auto min-w-0 flex-1">
        <Search size={16} />
        <input
          type="search"
          className="min-h-0 border-0 bg-transparent p-0"
          aria-label={label}
          placeholder={t("repoPicker.searchPlaceholder")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch(value.trim());
            }
          }}
        />
      </div>
      <button
        type="button"
        className="button"
        onClick={() => onSearch(value.trim())}
      >
        {t("repoPicker.search")}
      </button>
    </div>
  );
}

/** Multi-select picker; selected repositories are submitted as selected_repo. */
export function AccountRepoPicker({
  endpoint,
  selected,
  onChange,
  params = {},
}: {
  endpoint: string;
  selected: PickerRepository[];
  onChange: (repositories: PickerRepository[]) => void;
  params?: Record<string, string>;
}) {
  const { t } = useTranslation("account");
  const names = selected.map(fullName);
  const { query, setSearch, setPage, repositories, pager } =
    useRepositorySearch(endpoint, params, names, {
      search: "repo_search",
      page: "set_page",
      result: "repositories",
      pager: "page",
    });
  return (
    <div className="account-repo-picker grid grid-cols-2 gap-6 font-normal max-md:grid-cols-1">
      <div className="min-w-0">
        <h3 className="mb-2 text-sm font-semibold">
          {t("repoPicker.available")}
        </h3>
        <SearchForm
          label={t("repoPicker.searchLabel")}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Feedback error={query.error} />
        {query.isPending ? (
          <Pending />
        ) : repositories.length ? (
          <div className={listClass}>
            {repositories.map((repo) => (
              <div className={rowClass} key={fullName(repo)}>
                <RepositoryName repo={repo} />
                <button
                  type="button"
                  className="button"
                  aria-label={t("repoPicker.addLabel", {
                    name: fullName(repo),
                  })}
                  onClick={() => onChange([...selected, repo])}
                >
                  {t("repoPicker.add")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("repoPicker.noneFound")}</p>
        )}
        <Pager pager={pager} onPage={setPage} />
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-sm font-semibold">
          {t("repoPicker.selected", { count: selected.length })}
        </h3>
        {selected.length ? (
          <div className={listClass}>
            {selected.map((repo) => (
              <div className={rowClass} key={fullName(repo)}>
                <input
                  type="hidden"
                  name="selected_repo"
                  value={fullName(repo)}
                />
                <RepositoryName repo={repo} />
                <button
                  type="button"
                  className="button"
                  aria-label={t("repoPicker.removeLabel", {
                    name: fullName(repo),
                  })}
                  onClick={() =>
                    onChange(
                      selected.filter((r) => fullName(r) !== fullName(repo)),
                    )
                  }
                >
                  {t("repoPicker.remove")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("repoPicker.noneSelected")}</p>
        )}
      </div>
    </div>
  );
}

/** Single-select picker for the repository that runs a Forgejo Actions workflow. */
export function AccountSourceRepoPicker({
  endpoint,
  value,
  onChange,
}: {
  endpoint: string;
  value: PickerRepository | null;
  onChange: (repository: PickerRepository | null) => void;
}) {
  const { t } = useTranslation("account");
  const { query, setSearch, setPage, repositories, pager } =
    useRepositorySearch(endpoint, {}, [], {
      search: "action_repo_search",
      page: "action_set_page",
      result: "action_repositories",
      pager: "action_page",
    });
  if (value)
    return (
      <div className={`${rowClass} border-t font-normal`}>
        <input type="hidden" name="source_repo" value={fullName(value)} />
        <RepositoryName repo={value} />
        <button type="button" className="button" onClick={() => onChange(null)}>
          {t("repoPicker.change")}
        </button>
      </div>
    );
  return (
    <div className="font-normal">
      <SearchForm
        label={t("repoPicker.searchLabel")}
        onSearch={(text) => {
          setSearch(text);
          setPage(1);
        }}
      />
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : repositories.length ? (
        <div className={listClass}>
          {repositories.map((repo) => (
            <div className={rowClass} key={fullName(repo)}>
              <RepositoryName repo={repo} />
              <button
                type="button"
                className="button"
                aria-label={t("repoPicker.selectLabel", {
                  name: fullName(repo),
                })}
                onClick={() => onChange(repo)}
              >
                {t("repoPicker.select")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{t("repoPicker.noneFound")}</p>
      )}
      <Pager pager={pager} onPage={setPage} />
    </div>
  );
}
