import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SelectControl } from "./SelectControl";

export const repositorySorts = {
  recentupdate: ["updated", "desc"],
  leastupdate: ["updated", "asc"],
  newest: ["created", "desc"],
  oldest: ["created", "asc"],
  alphabetically: ["alpha", "asc"],
  reversealphabetically: ["alpha", "desc"],
  moststars: ["stars", "desc"],
  feweststars: ["stars", "asc"],
  mostforks: ["forks", "desc"],
  fewestforks: ["forks", "asc"],
  size: ["size", "asc"],
  reversesize: ["size", "desc"],
} as const;

export function normalizeRepositorySort(value: string) {
  const aliases: Record<string, string> = {
    updated: "recentupdate",
    created: "newest",
    alpha: "alphabetically",
    stars: "moststars",
  };
  return aliases[value] || value;
}

export function WorkspaceRepoFilters({
  dashboard = false,
  projectTypes = false,
  language = true,
  sizes = true,
}: {
  dashboard?: boolean;
  projectTypes?: boolean;
  language?: boolean;
  sizes?: boolean;
}) {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  };
  return (
    <div className="my-4 flex flex-wrap items-center gap-3">
      {projectTypes && (
        <SelectControl
          label={t("repoFilters.projectType")}
          value={params.get("mode") || ""}
          onValueChange={(value) => change("mode", value)}
          options={[
            { value: "", label: t("repoFilters.types.all") },
            { value: "source", label: t("repoFilters.types.source") },
            { value: "fork", label: t("repoFilters.types.fork") },
            { value: "mirror", label: t("repoFilters.types.mirror") },
            {
              value: "collaborative",
              label: t("repoFilters.types.collaborative"),
            },
          ]}
        />
      )}
      <SelectControl
        label={t("repoFilters.sort")}
        value={normalizeRepositorySort(params.get("sort") || "recentupdate")}
        onValueChange={(value) => change("sort", value)}
        options={Object.keys(repositorySorts)
          .filter((value) => sizes || !["size", "reversesize"].includes(value))
          .map((value) => ({
            value,
            label: t(
              `repoFilters.sorts.${value as keyof typeof repositorySorts}`,
            ),
          }))}
      />
      {(dashboard
        ? ["archived", "private", "template"]
        : ["archived", "fork", "mirror", "template", "private"]
      ).map((key) => (
        <SelectControl
          key={key}
          label={t(
            `repoFilters.${key as "archived" | "fork" | "mirror" | "template" | "private"}`,
          )}
          value={params.get(key) || ""}
          onValueChange={(value) => change(key, value)}
          options={[
            {
              value: "",
              label: t(
                `repoFilters.${key as "archived" | "fork" | "mirror" | "template" | "private"}`,
              ),
            },
            { value: "true", label: t("repoFilters.yes") },
            { value: "false", label: t("repoFilters.no") },
          ]}
        />
      ))}
      {language && (
        <label className="flex min-w-0 items-center gap-2 text-sm">
          {t("repoFilters.language")}
          <input
            className="min-w-0 rounded border border-input bg-surface px-3 py-2"
            value={params.get("language") || ""}
            onChange={(event) => change("language", event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
