import { Download, Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { native, nativeForm, request } from "./api";
export interface Attachment {
  id: number;
  name: string;
  uuid: string;
  size: number;
  browser_download_url: string;
  download_url?: string;
}
export function AttachmentList({ files }: { files?: Attachment[] }) {
  return files?.length ? (
    <ul className="my-4 list-none p-0">
      {files.map((file) => (
        <li
          className="flex items-center gap-3 py-2 text-[13px]"
          key={file.uuid}
        >
          <a
            className="inline-flex items-center gap-1.5 text-primary [overflow-wrap:anywhere]"
            href={native(
              file.browser_download_url ||
                file.download_url ||
                `/attachments/${file.uuid}`,
            )}
            download
          >
            <Download size={14} />
            {file.name}
          </a>
          <span className="whitespace-nowrap text-[12px] text-muted">
            {Math.ceil(file.size / 1024)} KiB
          </span>
        </li>
      ))}
    </ul>
  ) : null;
}
export function AttachmentPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const { t } = useTranslation("issues");
  return (
    <div className="discussion-upload flex flex-wrap items-center gap-2 text-[12px]">
      <label className="button relative inline-flex cursor-pointer flex-row items-center gap-1.5 overflow-hidden">
        <Paperclip size={14} />
        {t("attachments.attach")}
        <input
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          aria-label={t("attachments.attach")}
          type="file"
          multiple
          onChange={(event) => {
            onChange([
              ...files,
              ...Array.from(event.currentTarget.files || []),
            ]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {files.map((file, index) => (
        <span className="inline-flex items-center gap-1.5" key={index}>
          {file.name}
          <button
            type="button"
            className="icon-button"
            aria-label={t("attachments.remove", { name: file.name })}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}
export async function submitWithAttachments(
  path: string,
  endpoint: string,
  values: Record<string, string>,
  files: File[],
  existing: string[] = [],
  attachmentField = "files",
) {
  const uploaded: string[] = [],
    fields = new URLSearchParams(values);
  existing.forEach((uuid) => fields.append(attachmentField, uuid));
  try {
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      const response = await request<{ uuid: string }>(
        `${path}/issues/attachments`,
        { method: "POST", headers: { "X-Forgejo-UI": "1" }, body },
      );
      uploaded.push(response.data.uuid);
      fields.append(attachmentField, response.data.uuid);
    }
    return (
      await request(endpoint, {
        method: "POST",
        headers: {
          "X-Forgejo-UI": "1",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: fields,
      })
    ).data;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((file) =>
        nativeForm(`${path}/issues/attachments/remove`, { file }),
      ),
    );
    throw error;
  }
}
