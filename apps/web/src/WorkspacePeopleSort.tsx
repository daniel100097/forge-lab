import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SelectControl } from "./SelectControl";

export function WorkspacePeopleSort() {
  const { t } = useTranslation("workspace");
  const [params, setParams] = useSearchParams();
  return (
    <div className="my-4">
      <SelectControl
        label={t("repoFilters.sort")}
        value={params.get("sort") || "alphabetically"}
        options={(
          [
            "alphabetically",
            "reversealphabetically",
            "newest",
            "oldest",
          ] as const
        ).map((value) => ({ value, label: t(`repoFilters.sorts.${value}`) }))}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("sort", value);
          next.delete("page");
          setParams(next);
        }}
      />
    </div>
  );
}
