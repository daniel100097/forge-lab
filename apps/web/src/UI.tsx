import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

// Page frame shared by top-level pages inside the application shell.
export const pageClass =
  "mx-auto w-full max-w-[1304px] pt-2 pr-7 pb-8 pl-3 max-md:px-3 max-md:pt-3 max-md:pb-6";
export const pageHeadingClass =
  "mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
export const emptyStateClass =
  "mx-auto my-8 flex max-w-2xl flex-col items-center gap-3 px-6 py-12 text-center max-md:px-2 max-md:py-8 [&>svg]:text-[#737278]";
export const loadingClass =
  "flex min-h-40 items-center justify-center gap-3 text-sm text-muted";
export const paginationClass =
  "mt-5 flex items-center justify-between gap-3 text-sm text-muted";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Forgejo`;
  }, [title]);
}
export function IssueLabel({ name, color }: { name: string; color: string }) {
  const hex = color.replace(/^#/, "");
  const background = /^[\da-f]{6}$/i.test(hex) ? `#${hex}` : "#dcdcde";
  const rgb = background
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const channel = parseInt(v, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (
    <span
      className="label"
      style={{ background, color: luminance > 0.179 ? "#18171d" : "#fff" }}
    >
      {name}
    </span>
  );
}
export function Pending() {
  const { t } = useTranslation("common");
  return (
    <div className={loadingClass} role="status">
      <LoaderCircle className="animate-spin" size={20} /> {t("loading")}
    </div>
  );
}
export function Feedback({ error }: { error?: Error | null }) {
  return error ? (
    <div className="form-error" role="alert">
      {error.message}
    </div>
  ) : null;
}
export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={emptyStateClass}>
      {icon}
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="max-w-lg text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}
export { relativeDate } from "./i18n";
export function Pagination({
  page,
  total,
  size = 30,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation("common");
  if (total <= size && page === 1) return null;
  return (
    <div className={paginationClass}>
      <span>{t("pagination.results", { count: total })}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t("pagination.previous")}
        </button>
        <span>{t("pagination.page", { page })}</span>
        <button
          type="button"
          className="button"
          disabled={page * size >= total}
          onClick={() => onPage(page + 1)}
        >
          {t("pagination.next")}
        </button>
      </div>
    </div>
  );
}
export { Markdown } from "./Markdown";
export { MarkdownEditor } from "./MarkdownEditor";
export function CopyButton({
  value,
  label: customLabel,
  compact = false,
}: {
  value: string;
  label?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("common");
  const label = customLabel ?? t("copy.label");
  const [result, setResult] = useState<"" | "copied" | "failed">("");
  const status =
    result === "copied"
      ? t("copy.copied")
      : result === "failed"
        ? t("copy.manual")
        : "";
  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Select the URL and copy it manually.");
      }
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }
  return (
    <button
      type="button"
      className={`button ${compact ? "copy-icon size-8 min-h-0 rounded-none border-0 border-l border-control px-0" : ""}`}
      aria-label={label}
      title={status || label}
      onClick={() => void copy()}
    >
      {result === "copied" ? <Check size={15} /> : <Copy size={15} />}
      <span role="status" className={compact ? "sr-only" : undefined}>
        {status || label}
      </span>
    </button>
  );
}
