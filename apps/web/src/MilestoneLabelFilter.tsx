import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "@base-ui/react/popover";
import { Ban, Check, ChevronDown, Search } from "lucide-react";
import { IssueLabel } from "./UI";
import {
  milestoneLabelIDs,
  milestoneLabelSelection,
  type MilestoneFilterLabel,
} from "./milestoneLabels";

export function MilestoneLabelFilter({
  labels,
  value,
  archived,
  onValueChange,
  onArchivedChange,
}: {
  labels: MilestoneFilterLabel[];
  value: string;
  archived: boolean;
  onValueChange: (value: string) => void;
  onArchivedChange: (value: boolean) => void;
}) {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = milestoneLabelIDs(value);
  const change = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };
  const single = labels.find((label) => label.id === selected[0]);
  const caption =
    value === "0"
      ? t("nativeManagement.noLabels")
      : selected.length === 1 && single
        ? single.name
        : selected.length
          ? t("nativeManagement.selectedLabels", { count: selected.length })
          : t("nativeManagement.allLabels");
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="select-trigger max-w-full"
        aria-label={t("nativeManagement.filterLabels")}
      >
        {selected.some((labelID) => labelID < 0) && <Ban size={14} />}
        <span className="max-w-48 truncate">{caption}</span>
        <ChevronDown size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="dropdown-positioner"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup
            className="dropdown-popup w-80 max-w-[calc(100vw-24px)]"
            aria-label={t("nativeManagement.filterLabels")}
          >
            <div className="dropdown-heading">
              {t("nativeManagement.filterLabels")}
            </div>
            <label className="dropdown-search">
              <Search size={16} />
              <input
                aria-label={t("nativeManagement.searchLabels")}
                placeholder={t("nativeManagement.searchLabels")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="check-field px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => onArchivedChange(event.target.checked)}
              />
              {t("nativeManagement.showArchivedLabels")}
            </label>
            <button
              type="button"
              className="menu-item w-full"
              aria-pressed={!value}
              onClick={() => change("")}
            >
              {t("nativeManagement.allLabels")}
              {!value && <Check size={15} className="ml-auto" />}
            </button>
            <button
              type="button"
              className="menu-item w-full"
              aria-pressed={value === "0"}
              onClick={() => change("0")}
            >
              {t("nativeManagement.noLabels")}
              {value === "0" && <Check size={15} className="ml-auto" />}
            </button>
            <div className="max-h-72 overflow-y-auto border-t border-line">
              {labels
                .filter(
                  (label) =>
                    (archived ||
                      !label.archived ||
                      selected.some(
                        (labelID) => Math.abs(labelID) === label.id,
                      )) &&
                    label.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                )
                .map((label) => (
                  <div key={label.id} className="flex items-center gap-1 px-1">
                    <button
                      type="button"
                      className="menu-item min-w-0 flex-1"
                      aria-label={label.name}
                      aria-pressed={selected.includes(label.id)}
                      onClick={() =>
                        change(milestoneLabelSelection(value, labels, label))
                      }
                    >
                      <IssueLabel name={label.name} color={label.color} />
                      {label.archived && (
                        <span className="badge">{t("labels.archived")}</span>
                      )}
                      {selected.includes(label.id) && (
                        <Check size={15} className="ml-auto shrink-0" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`icon-button shrink-0 ${selected.includes(-label.id) ? "bg-selected text-danger" : "text-muted"}`}
                      aria-label={t(
                        selected.includes(-label.id)
                          ? "nativeManagement.unexcludeLabel"
                          : "nativeManagement.excludeLabel",
                        { name: label.name },
                      )}
                      aria-pressed={selected.includes(-label.id)}
                      onClick={() =>
                        change(
                          milestoneLabelSelection(value, labels, label, true),
                        )
                      }
                    >
                      <Ban size={15} />
                    </button>
                  </div>
                ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
