import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { get } from "./api";
import { EmptyState, Feedback, Pending } from "./UI";
import { FileIcon } from "./RepositoryFiles";

export function RepositoryFinder({
  path,
  sha,
  filter,
  onSelect,
}: {
  path: string;
  sha: string;
  filter: string;
  onSelect: (file: string) => void;
}) {
  const { t } = useTranslation("repository");
  const query = useQuery({
    queryKey: ["repository-files", path, sha],
    queryFn: ({ signal }) =>
      get<string[]>(
        `${path}/tree-list/commit/${encodeURIComponent(sha)}`,
        signal,
      ),
  });
  const words = filter.toLowerCase().trim().split(/\s+/);
  const matches =
    query.data?.filter((file) =>
      words.every((word) => file.toLowerCase().includes(word)),
    ) ?? [];
  return (
    <section
      className="overflow-hidden rounded-md border border-line"
      aria-label={t("finder.label")}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface-subtle px-4 py-3 text-sm">
        <FileSearch size={16} />
        <strong>{t("finder.title")}</strong>
        <span className="ml-auto text-xs text-muted">
          {t("finder.files", { count: matches.length })}
        </span>
      </div>
      {query.isPending ? (
        <Pending />
      ) : query.error ? (
        <Feedback error={query.error} />
      ) : matches.length ? (
        <>
          <div className="max-h-[65vh] overflow-auto">
            {matches.slice(0, 100).map((file) => (
              <button
                key={file}
                className="flex w-full items-center gap-2 border-b border-line px-4 py-2 text-left text-sm last:border-b-0 hover:bg-hover"
                onClick={() => onSelect(file)}
              >
                <FileIcon name={file} />
                <span className="truncate">{file}</span>
              </button>
            ))}
          </div>
          {matches.length > 100 && (
            <p className="border-t border-line px-4 py-3 text-sm text-muted">
              {t("finder.truncated")}
            </p>
          )}
        </>
      ) : (
        <EmptyState title={t("finder.emptyTitle")}>
          {t("finder.emptyBody")}
        </EmptyState>
      )}
    </section>
  );
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length && rows.length <= 500; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (quoted || value === "") quoted = !quoted;
      else value += char;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else value += char;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export function DelimitedPreview({
  text,
  filename,
}: {
  text: string;
  filename: string;
}) {
  const { t } = useTranslation("repository");
  const rows = parseDelimited(text, /\.tsv$/i.test(filename) ? "\t" : ",");
  return (
    <div className="delimited-preview max-h-[75vh] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {rows[0]?.slice(0, 100).map((value, index) => (
              <th
                key={index}
                className="sticky top-0 max-w-120 border-r border-b border-line bg-surface-subtle px-3 py-2 text-left font-semibold whitespace-pre-wrap"
              >
                {value || t("preview.column", { number: index + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1, 501).map((row, index) => (
            <tr key={index}>
              {row.slice(0, 100).map((value, column) => (
                <td
                  key={column}
                  className="max-w-120 border-r border-b border-line px-3 py-2 text-left whitespace-pre-wrap"
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          {t("preview.rowLimit")}
        </p>
      )}
    </div>
  );
}

const TerminalPreview = lazy(() => import("./TerminalPreview"));
const ModelPreview = lazy(() => import("./ModelPreview"));
export const canPreviewMedia = (filename: string) =>
  /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|pdf|mp4|webm|m4v|ogv|mov|mp3|wav|ogg|flac|m4a|stl|obj|glb|gltf|3mf|cast)$/i.test(
    filename,
  );
export function MediaPreview({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const { t } = useTranslation("repository");
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const pdf = /\.pdf$/i.test(filename);
  useEffect(() => {
    setError(null);
    if (!pdf) return;
    const controller = new AbortController();
    let localUrl = "";
    setObjectUrl("");
    setError(null);
    void (async () => {
      const response = await fetch(url, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(t("preview.pdfLoadFailed"));
      const reader = response.body?.getReader();
      if (!reader) throw new Error(t("preview.pdfEmpty"));
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 20 * 1024 * 1024) {
            await reader.cancel();
            throw new Error(t("preview.pdfTooLarge"));
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const blob = new Blob(chunks as BlobPart[]);
      if (controller.signal.aborted) return;
      const head = await blob.slice(0, 5).text();
      if (head !== "%PDF-") throw new Error(t("preview.pdfInvalid"));
      localUrl = URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      setObjectUrl(localUrl);
    })().catch((reason) => {
      if (!controller.signal.aborted) setError(reason);
    });
    return () => {
      controller.abort();
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [url, pdf]);
  if (/\.cast$/i.test(filename))
    return (
      <Suspense fallback={<Pending />}>
        <TerminalPreview url={url} />
      </Suspense>
    );
  if (/\.(stl|obj|glb|gltf|3mf)$/i.test(filename))
    return (
      <Suspense fallback={<Pending />}>
        <ModelPreview url={url} filename={filename} />
      </Suspense>
    );
  if (pdf)
    return error ? (
      <Feedback error={error} />
    ) : objectUrl ? (
      <iframe
        className="pdf-preview h-[75vh] w-full border-0"
        src={objectUrl}
        title={t("preview.label", { name: filename })}
      />
    ) : (
      <Pending />
    );
  if (/\.(mp4|webm|m4v|ogv|mov)$/i.test(filename))
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <video
          className="max-h-[600px] max-w-full"
          controls
          preload="metadata"
          src={url}
          aria-label={t("preview.label", { name: filename })}
          onError={() => setError(new Error(t("preview.videoFailed")))}
        />
        <Feedback error={error} />
      </div>
    );
  if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(filename))
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <audio
          className="w-full max-w-xl"
          controls
          preload="metadata"
          src={url}
          aria-label={t("preview.label", { name: filename })}
          onError={() => setError(new Error(t("preview.audioFailed")))}
        />
        <Feedback error={error} />
      </div>
    );
  return (
    <div className="image-preview flex min-h-60 flex-col items-center justify-center gap-4 p-8 [background-image:conic-gradient(var(--ui-surface-subtle)_25%,transparent_0_50%,var(--ui-surface-subtle)_0_75%,transparent_0)] [background-size:20px_20px]">
      <img
        className="max-h-[75vh] max-w-full object-contain"
        src={url}
        alt={filename}
        onError={() => setError(new Error(t("preview.imageFailed")))}
      />
      <Feedback error={error} />
    </div>
  );
}
