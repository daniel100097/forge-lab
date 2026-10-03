import { useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  Plus,
  Rss,
  Search,
  Tag,
} from "lucide-react";
import { get, native, nativeForm } from "./api";
import { Feedback } from "./UI";

/** Path segments escaped individually (slashes kept), like PathEscapeSegments. */
export const escapeSegments = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");

export function useReferenceNames(path: string, enabled = true) {
  const branches = useQuery({
    queryKey: ["branches", path],
    queryFn: ({ signal }) =>
      get<{ results: string[] }>(`${path}/branches/list`, signal),
    enabled,
  });
  const tags = useQuery({
    queryKey: ["tag-names", path],
    queryFn: ({ signal }) =>
      get<{ results: string[] | null }>(`${path}/tags/list`, signal),
    enabled,
  });
  return {
    branches: branches.data?.results ?? [],
    tags: tags.data?.results ?? [],
    loaded: !!branches.data && !!tags.data,
  };
}

export type RefKind = "branch" | "tag" | "commit";

/** Whether a ref name is a branch, a tag or a commit ID. */
export function refKind(
  value: string,
  names: { branches: string[]; tags: string[] },
): RefKind {
  if (names.branches.includes(value)) return "branch";
  if (names.tags.includes(value)) return "tag";
  return /^[0-9a-f]{7,64}$/i.test(value) ? "commit" : "branch";
}

/**
 * The native branch/tag dropdown (BranchTagSelector): branch and tag tabs,
 * filtering, and "create branch/tag … from …" for a name that does not exist.
 */
export function RefSwitcher({
  path,
  value,
  onSelect,
  canCreate = false,
  showTags = true,
  className = "",
  label,
  feeds = false,
  align = "start",
}: {
  path: string;
  value: string;
  onSelect: (ref: string, kind: RefKind) => void;
  canCreate?: boolean;
  showTags?: boolean;
  className?: string;
  label?: string;
  /** Show the branch RSS feed links (native enableFeed). */
  feeds?: boolean;
  align?: "start" | "end";
}) {
  const { t } = useTranslation("repository");
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const names = useReferenceNames(path);
  const current = refKind(value, names);
  const [tab, setTab] = useState<"branches" | "tags">(
    current === "tag" ? "tags" : "branches",
  );
  const [filter, setFilter] = useState("");
  const list = tab === "tags" ? names.tags : names.branches;
  const visible = useMemo(
    () =>
      list.filter((name) =>
        name.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [list, filter],
  );
  const wanted = filter.trim();
  const exists = list.includes(wanted);
  const create = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/branches/_new/${current}/${escapeSegments(value)}`, {
        new_branch_name: wanted,
        create_tag: String(tab === "tags"),
        current_path: "",
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["branches", path] });
      await client.invalidateQueries({ queryKey: ["tag-names", path] });
      await client.invalidateQueries({ queryKey: ["reference-list", path] });
      setOpen(false);
      setFilter("");
      onSelect(wanted, tab === "tags" ? "tag" : "branch");
    },
  });
  const Icon =
    current === "tag"
      ? Tag
      : current === "commit"
        ? GitCommitHorizontal
        : GitBranch;
  const display = current === "commit" ? value.slice(0, 10) : value;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTab(current === "tag" ? "tags" : "branches");
        else setFilter("");
      }}
    >
      <Popover.Trigger
        className={`select-trigger ref-switcher min-w-0 font-mono ${className}`}
        aria-label={label ?? t("refs.switch")}
        title={value}
      >
        <Icon size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">{display}</span>
        <ChevronDown size={14} className="ml-auto shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="dropdown-positioner"
          align={align}
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup
            className="dropdown-popup w-80 max-w-[calc(100vw-24px)] p-0"
            aria-label={label ?? t("refs.switch")}
          >
            <div className="border-b border-line px-3 py-2 text-sm font-semibold">
              {t("refs.title")}
            </div>
            <div className="p-2">
              <label className="filter-input w-full">
                <Search size={14} />
                <input
                  autoFocus
                  aria-label={t(
                    showTags
                      ? "refs.filterBranchesTags"
                      : "refs.filterBranches",
                  )}
                  placeholder={t(
                    showTags
                      ? "refs.filterBranchesTags"
                      : "refs.filterBranches",
                  )}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      wanted &&
                      !exists &&
                      canCreate &&
                      !create.isPending
                    ) {
                      event.preventDefault();
                      create.mutate();
                    }
                  }}
                />
              </label>
            </div>
            {showTags && (
              <div
                className="tabs mx-2 mb-1 [&_button]:min-h-8 [&_button]:py-1"
                role="tablist"
              >
                {(["branches", "tags"] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    className={tab === name ? "active" : ""}
                    onClick={() => setTab(name)}
                  >
                    {t(name === "branches" ? "refs.branches" : "refs.tags")}
                  </button>
                ))}
              </div>
            )}
            <div
              className="max-h-72 overflow-auto py-1"
              role="listbox"
              aria-label={t(tab === "tags" ? "refs.tags" : "refs.branches")}
            >
              {visible.map((name) => (
                <div
                  key={name}
                  className="group/ref flex items-center hover:bg-hover"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={name === value}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left font-mono text-sm"
                    onClick={() => {
                      setOpen(false);
                      setFilter("");
                      onSelect(name, tab === "tags" ? "tag" : "branch");
                    }}
                  >
                    <span className="inline-flex w-4 shrink-0">
                      {name === value && <Check size={14} />}
                    </span>
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                  {feeds && tab === "branches" && (
                    <a
                      className="mr-2 hidden rounded p-1 text-muted group-hover/ref:inline-flex hover:text-ink"
                      href={native(
                        `${path}/rss/branch/${escapeSegments(name)}`,
                      )}
                      title={t("feeds.branch", { name })}
                      aria-label={t("feeds.branch", { name })}
                    >
                      <Rss size={13} />
                    </a>
                  )}
                </div>
              ))}
              {!visible.length && (
                <p className="px-3 py-2 text-sm text-muted">
                  {names.loaded ? t("refs.noResults") : t("refs.loading")}
                </p>
              )}
            </div>
            {canCreate && wanted && !exists && (
              <div className="border-t border-line p-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-60"
                  disabled={create.isPending}
                  onClick={() => create.mutate()}
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {t(
                      tab === "tags"
                        ? "refs.createTagFrom"
                        : "refs.createBranchFrom",
                      { name: wanted, from: display },
                    )}
                  </span>
                </button>
                <div className="px-2">
                  <Feedback error={create.error} />
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
