import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RepoContext } from "./App";
import { get, nativeForm } from "./api";
import { usePullReview } from "./PullReview";
import {
  mergeFormFields,
  selectedMergeStyle,
  type MergeMetadata,
} from "./pullMerge";
import { SelectControl } from "./SelectControl";
import { Feedback, Pending } from "./UI";

export function PullMergePanel({ index }: { index: number | string }) {
  const query = usePullReview(index);
  if (query.isPending) return <Pending />;
  if (query.error) return <Feedback error={query.error} />;
  const data = query.data;
  if (!data.merge || data.closed || data.merged) return null;
  return (
    <MergeOptions
      key={`${index}:${data.head_sha}`}
      index={index}
      metadata={data.merge}
      head={data.head_sha}
      scheduled={data.auto_merge}
    />
  );
}

function MergeOptions({
  index,
  metadata,
  head,
  scheduled,
}: {
  index: number | string;
  metadata: MergeMetadata;
  head: string;
  scheduled: boolean;
}) {
  const { t } = useTranslation("mergeRequests");
  const { path, dataPath } = useOutletContext<RepoContext>();
  const client = useQueryClient();
  const [selection, setSelection] = useState("");
  const [edits, setEdits] = useState<
    Record<string, { title: string; message: string }>
  >({});
  const [deleteBranch, setDeleteBranch] = useState(
    metadata.default_delete_branch,
  );
  const [force, setForce] = useState(false);
  const [commit, setCommit] = useState("");
  const style = selectedMergeStyle(metadata, selection);
  const title = style
    ? (edits[style.name]?.title ?? style.title)
    : metadata.default_title;
  const message = style
    ? (edits[style.name]?.message ?? style.message)
    : metadata.default_message;
  const manual = style?.name === "manually-merged";
  const action = useMutation({
    mutationFn: async (operation: "merge" | "schedule" | "cancel") => {
      if (operation === "cancel") {
        await nativeForm(`${path}/pulls/${index}/cancel_auto_merge`, {});
      } else {
        if (!style) return;
        await nativeForm(
          `${path}/pulls/${index}/merge`,
          mergeFormFields({
            style,
            metadata,
            head,
            title,
            message,
            commit,
            deleteBranch,
            force,
            schedule: operation === "schedule",
          }),
        );
      }
      await client.invalidateQueries();
      const current = await get<{ pull: { merged: boolean } }>(
        `${dataPath}/pulls/${index}`,
      );
      if (operation === "merge" && !current.pull?.merged)
        throw new Error(t("mergeOptions.incomplete"));
      if (operation !== "merge" && !current.pull?.merged) {
        const review = await get<{ auto_merge: boolean }>(
          `${dataPath}/pulls/${index}/review`,
        );
        if (review.auto_merge !== (operation === "schedule"))
          throw new Error(t("mergeOptions.incomplete"));
      }
    },
  });
  const labels: Record<string, string> = {
    merge: t("mergeOptions.styles.merge"),
    rebase: t("mergeOptions.styles.rebase"),
    "rebase-merge": t("mergeOptions.styles.rebaseMerge"),
    squash: t("mergeOptions.styles.squash"),
    "fast-forward-only": t("mergeOptions.styles.fastForward"),
    "manually-merged": t("mergeOptions.styles.manual"),
  };
  const edit = (field: "title" | "message", value: string) => {
    if (style)
      setEdits((current) => ({
        ...current,
        [style.name]: { title, message, [field]: value },
      }));
  };
  const instructions =
    metadata.instructions[style?.name || metadata.default_style] ||
    Object.values(metadata.instructions)[0];
  return (
    <div className="border-t border-line bg-surface-subtle px-4 py-3">
      <Feedback error={action.error} />
      {metadata.allowed && style && !scheduled && (
        <form
          className="workspace-form max-w-none space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate("merge");
          }}
        >
          <SelectControl
            label={t("mergeOptions.method")}
            menuTitle={t("mergeOptions.method")}
            value={style.name}
            onValueChange={setSelection}
            disabled={action.isPending}
            options={metadata.styles.map((option) => ({
              value: option.name,
              label: labels[option.name] || option.name,
            }))}
          />
          {style.has_message && (
            <>
              <label className="block">
                {t("mergeOptions.title")}
                <input
                  className="mt-1 w-full"
                  value={title}
                  disabled={action.isPending}
                  onChange={(event) => edit("title", event.target.value)}
                />
              </label>
              <label className="block">
                {t("mergeOptions.message")}
                <textarea
                  className="mt-1 w-full"
                  aria-label={t("mergeOptions.message")}
                  rows={5}
                  value={message}
                  disabled={action.isPending}
                  onChange={(event) => edit("message", event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className="button"
                  type="button"
                  disabled={action.isPending}
                  onClick={() =>
                    setEdits((current) => ({
                      ...current,
                      [style.name]: {
                        title: style.title,
                        message: style.message,
                      },
                    }))
                  }
                >
                  {t("mergeOptions.reset")}
                </button>
                {style.name === "squash" && (
                  <button
                    className="button"
                    type="button"
                    disabled={action.isPending}
                    onClick={() => edit("message", metadata.default_message)}
                  >
                    {t("mergeOptions.clearCommits")}
                  </button>
                )}
              </div>
            </>
          )}
          {manual && (
            <label className="block">
              {t("mergeOptions.commit")}
              <input
                className="mt-1 w-full"
                required
                value={commit}
                disabled={action.isPending}
                onChange={(event) => setCommit(event.target.value)}
              />
            </label>
          )}
          {!manual && metadata.branch_deletable && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={deleteBranch}
                disabled={action.isPending}
                onChange={(event) => setDeleteBranch(event.target.checked)}
              />
              {t("mergeOptions.deleteBranch")}
            </label>
          )}
          {!manual && metadata.can_force && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={force}
                disabled={action.isPending}
                onChange={(event) => setForce(event.target.checked)}
              />
              {t("mergeOptions.force")}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button primary"
              disabled={
                action.isPending ||
                !style.can_merge ||
                (metadata.can_force && !manual && !force) ||
                (manual && !commit.trim())
              }
            >
              {action.isPending
                ? t("mergeOptions.working")
                : manual
                  ? t("mergeOptions.styles.manual")
                  : t("mergeOptions.merge")}
            </button>
            {style.can_schedule && (
              <button
                type="button"
                className="button"
                disabled={action.isPending}
                onClick={() => action.mutate("schedule")}
              >
                {t("review.settings.setAutoMerge")}
              </button>
            )}
          </div>
        </form>
      )}
      {scheduled && metadata.allowed && (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("mergeOptions.scheduled")}</span>
          <button
            className="button"
            disabled={action.isPending}
            onClick={() => action.mutate("cancel")}
          >
            {t("review.settings.cancelAutoMerge")}
          </button>
        </div>
      )}
      {metadata.form_available && metadata.allowed && !style && !scheduled && (
        <p className="text-sm text-muted">{t("mergeOptions.noStyles")}</p>
      )}
      {metadata.form_available && !metadata.allowed && (
        <p className="text-sm text-muted">{t("mergeOptions.noPermission")}</p>
      )}
      {instructions && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">
            {t("mergeOptions.instructions")}
          </summary>
          {metadata.show_merge_instructions &&
            !metadata.autodetect_manual_merge && (
              <p className="my-2">{t("mergeOptions.manualWarning")}</p>
            )}
          <pre className="my-2 overflow-x-auto rounded border border-line bg-canvas p-3">
            {instructions}
          </pre>
          <button
            type="button"
            className="button"
            onClick={() => navigator.clipboard.writeText(instructions)}
          >
            {t("mergeOptions.copyCommands")}
          </button>
          {!!metadata.default_title && (
            <>
              <label className="mt-3 block">
                {t("mergeOptions.title")}
                <textarea
                  className="mt-1 w-full"
                  aria-label={t("mergeOptions.title")}
                  readOnly
                  rows={2}
                  value={metadata.default_title}
                />
              </label>
              {!!metadata.default_message && (
                <label className="mt-2 block">
                  {t("mergeOptions.message")}
                  <textarea
                    className="mt-1 w-full"
                    aria-label={t("mergeOptions.message")}
                    readOnly
                    rows={4}
                    value={metadata.default_message}
                  />
                </label>
              )}
              <button
                type="button"
                className="button mt-2"
                onClick={() =>
                  navigator.clipboard.writeText(
                    [metadata.default_title, metadata.default_message]
                      .filter(Boolean)
                      .join("\n\n"),
                  )
                }
              >
                {t("mergeOptions.copyMessage")}
              </button>
            </>
          )}
        </details>
      )}
    </div>
  );
}
