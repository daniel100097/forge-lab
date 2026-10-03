import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { native } from "./api";
import { Feedback, Pending } from "./UI";
import { mediaDiffKind, parseCSV } from "./csvDiff";

export function AdvancedDiff({
  name,
  repository,
  before,
  after,
}: {
  name: string;
  repository: string;
  before?: string;
  after?: string;
}) {
  const { t, i18n } = useTranslation("issues");
  const [mode, setMode] = useState("side"),
    [position, setPosition] = useState(50),
    [limit, setLimit] = useState(200);
  const [dimensions, setDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const kind = mediaDiffKind(name);
  const url = (sha: string) => native(`${repository}/raw/blob/${sha}`);
  const query = useQuery({
    queryKey: ["media-diff", repository, before, after, kind],
    staleTime: Infinity,
    queryFn: async ({ signal }) =>
      Promise.all(
        [before, after].map(async (sha) => {
          if (!sha) return null;
          const response = await fetch(url(sha), {
            signal,
            credentials: "same-origin",
          });
          if (!response.ok) throw new Error(t("advancedDiff.loadError"));
          const blob = await response.blob();
          if (blob.size > 25 * 1024 * 1024)
            throw new Error(t("advancedDiff.tooLarge"));
          try {
            return {
              bytes: blob.size,
              rows: kind === "csv" ? parseCSV(await blob.text()) : [],
            };
          } catch {
            throw new Error(t("advancedDiff.loadError"));
          }
        }),
      ),
  });
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  if (kind === "csv") {
    const oldRows = query.data[0]?.rows || [],
      newRows = query.data[1]?.rows || [];
    const count = Math.max(oldRows.length, newRows.length);
    const columns = Math.max(
      oldRows.reduce((width, row) => Math.max(width, row.length), 0),
      newRows.reduce((width, row) => Math.max(width, row.length), 0),
    );
    return (
      <div className="overflow-auto p-3">
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left text-muted">
            {t("advancedDiff.csvLegend")}
          </caption>
          <thead>
            <tr>
              <th className="border border-line p-2">
                {t("advancedDiff.row")}
              </th>
              {Array.from({ length: columns }, (_, column) => (
                <th className="border border-line p-2" key={column}>
                  {t("advancedDiff.column", { number: column + 1 })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(count, limit) }, (_, rowIndex) => (
              <tr key={rowIndex}>
                <th className="border border-line p-2 text-muted">
                  {rowIndex + 1}
                </th>
                {Array.from({ length: columns }, (_, column) => {
                  const oldCell = oldRows[rowIndex]?.[column],
                    newCell = newRows[rowIndex]?.[column];
                  const changed = oldCell !== newCell;
                  return (
                    <td
                      key={column}
                      className={`border border-line p-2 whitespace-pre-wrap ${changed ? "bg-info-bg" : ""}`}
                    >
                      {changed ? (
                        <>
                          <del className="block text-danger">{oldCell}</del>
                          <ins className="block text-success no-underline">
                            {newCell}
                          </ins>
                        </>
                      ) : (
                        newCell
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {count > limit && (
          <button className="button mt-3" onClick={() => setLimit(limit + 200)}>
            {t("advancedDiff.moreRows", { count: count - limit })}
          </button>
        )}
      </div>
    );
  }
  const image = (sha: string, side: "before" | "after", className = "") => (
    <img
      src={url(sha)}
      alt={t(`advancedDiff.${side}`, { name })}
      className={className}
      onLoad={(event) => {
        const width = event.currentTarget.naturalWidth,
          height = event.currentTarget.naturalHeight;
        setDimensions((current) => ({ ...current, [side]: { width, height } }));
      }}
    />
  );
  return (
    <div className="p-4">
      {before && after && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["side", "swipe", "overlay"].map((value) => (
            <button
              key={value}
              className="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {t(`advancedDiff.modes.${value as "side" | "swipe" | "overlay"}`)}
            </button>
          ))}
        </div>
      )}
      {mode === "side" || !before || !after ? (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {([before, after] as const).map(
            (sha, index) =>
              sha && (
                <figure className="min-w-0" key={sha + index}>
                  <figcaption className="mb-2 font-semibold">
                    {t(
                      index === 0
                        ? "advancedDiff.before"
                        : "advancedDiff.after",
                      { name },
                    )}
                  </figcaption>
                  {image(
                    sha,
                    index === 0 ? "before" : "after",
                    "max-h-96 max-w-full object-contain",
                  )}
                </figure>
              ),
          )}
        </div>
      ) : (
        <>
          <label className="mb-3 flex items-center gap-3 text-sm">
            {t(
              mode === "swipe"
                ? "advancedDiff.swipePosition"
                : "advancedDiff.opacity",
            )}
            <input
              aria-label={t(
                mode === "swipe"
                  ? "advancedDiff.swipePosition"
                  : "advancedDiff.opacity",
              )}
              type="range"
              min="0"
              max="100"
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              className="min-w-0 flex-1"
            />
          </label>
          <div className="relative h-80 overflow-hidden rounded border border-line bg-surface-subtle">
            {image(
              before,
              "before",
              "absolute inset-0 h-full w-full object-contain",
            )}
            <div
              className="absolute inset-0"
              style={
                mode === "swipe"
                  ? { clipPath: `inset(0 ${100 - position}% 0 0)` }
                  : { opacity: position / 100 }
              }
            >
              {image(after, "after", "h-full w-full object-contain")}
            </div>
          </div>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {["before", "after"].map(
          (side, index) =>
            query.data[index] && (
              <p key={side}>
                {t("advancedDiff.dimensions", {
                  side: t(
                    side === "before"
                      ? "advancedDiff.before"
                      : "advancedDiff.after",
                    { name },
                  ),
                  width: dimensions[side]?.width || 0,
                  height: dimensions[side]?.height || 0,
                  bytes: new Intl.NumberFormat(i18n.language).format(
                    query.data[index]!.bytes,
                  ),
                })}
              </p>
            ),
        )}
      </div>
    </div>
  );
}
