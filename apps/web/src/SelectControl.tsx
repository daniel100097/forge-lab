import { useState, type ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

// Lets a catalog lower-case an interpolated label where its language needs it
// ("Search {{label, lowercase}}") while other languages keep the label as is.
i18n.services.formatter?.add("lowercase", (value, lng) =>
  String(value).toLocaleLowerCase(lng),
);

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}
interface Props {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  menuTitle?: string;
  align?: "start" | "end";
}

export function SelectControl({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  searchable,
  searchPlaceholder: customSearchPlaceholder,
  onSearchChange,
  placeholder: customPlaceholder,
  icon,
  className = "",
  menuTitle,
  align = "start",
}: Props) {
  const { t } = useTranslation("common");
  const searchPlaceholder =
    customSearchPlaceholder ?? t("select.searchPlaceholder");
  const placeholder = customPlaceholder ?? t("select.placeholder");
  const [internal, setInternal] = useState(defaultValue);
  const selected =
    value ?? internal ?? options.find((o) => !o.disabled)?.value ?? null;
  const choose = (next: string | null) => {
    if (next === null) return;
    setInternal(next);
    onValueChange?.(next);
  };
  const triggerClass = `select-trigger ${className}`;
  if (searchable) {
    return (
      <Combobox.Root<SelectOption>
        items={options}
        value={options.find((o) => o.value === selected) ?? null}
        onValueChange={(option) => choose(option?.value ?? null)}
        isItemEqualToValue={(a, b) => a.value === b.value}
        name={name}
        required={required}
        disabled={disabled}
        autoHighlight
      >
        <Combobox.Trigger className={triggerClass} aria-label={label}>
          {icon}
          <span className="select-value">
            {options.find((o) => o.value === selected)?.label ?? placeholder}
          </span>
          <ChevronDown size={14} className="select-chevron" />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner
            className="dropdown-positioner"
            style={{ zIndex: 160 }}
            sideOffset={4}
            align={align}
            collisionPadding={12}
          >
            <Combobox.Popup className="dropdown-popup searchable-popup">
              <div className="dropdown-heading">{menuTitle || label}</div>
              <div className="dropdown-search">
                <Search size={16} />
                <Combobox.Input
                  aria-label={t("select.searchLabel", { label })}
                  placeholder={searchPlaceholder}
                  onChange={(event) => onSearchChange?.(event.target.value)}
                />
              </div>
              <Combobox.Empty className="dropdown-empty">
                {t("select.noMatches")}
              </Combobox.Empty>
              <Combobox.List className="dropdown-list">
                {(option: SelectOption) => (
                  <Combobox.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className="dropdown-option"
                  >
                    <span className="option-indicator">
                      <Combobox.ItemIndicator>
                        <Check size={16} />
                      </Combobox.ItemIndicator>
                    </span>
                    {option.icon}
                    <span className="option-copy">
                      <span>{option.label}</span>
                      {option.description && (
                        <small>{option.description}</small>
                      )}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    );
  }
  return (
    <Select.Root<SelectOption>
      items={options}
      value={options.find((option) => option.value === selected) ?? null}
      onValueChange={(option) => choose(option?.value ?? null)}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      name={name}
      required={required}
      disabled={disabled}
    >
      <Select.Trigger className={triggerClass} aria-label={label}>
        {icon}
        <Select.Value className="select-value">
          {options.find((option) => option.value === selected)?.label ??
            placeholder}
        </Select.Value>
        <Select.Icon className="select-chevron">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="dropdown-positioner"
          style={{ zIndex: 160 }}
          sideOffset={4}
          align={align}
          alignItemWithTrigger={false}
          collisionPadding={12}
        >
          <Select.Popup className="dropdown-popup">
            {menuTitle && <div className="dropdown-heading">{menuTitle}</div>}
            <Select.List className="dropdown-list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="dropdown-option"
                >
                  <span className="option-indicator">
                    <Select.ItemIndicator>
                      <Check size={16} />
                    </Select.ItemIndicator>
                  </span>
                  {option.icon}
                  <span className="option-copy">
                    <Select.ItemText>{option.label}</Select.ItemText>
                    {option.description && <small>{option.description}</small>}
                  </span>
                </Select.Item>
              ))}
              {!options.length && (
                <div className="dropdown-empty">{t("select.noOptions")}</div>
              )}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
