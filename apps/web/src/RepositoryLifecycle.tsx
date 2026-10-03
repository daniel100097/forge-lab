import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { get, nativeForm, type Repository } from "./api";
import { uiRoute } from "./routes";
import { Feedback } from "./UI";
interface LifecycleRepository extends Repository {
  status?: number;
  migration?: { id?: number; status: number; message: string };
  transfer?: { recipient: string };
  can_accept_transfer?: boolean;
}
/** Native migration/transfer state shown before any repository content. */
export function RepositoryLifecycle({
  path,
  repository,
}: {
  path: string;
  repository: LifecycleRepository;
}) {
  const { t } = useTranslation("repository");
  const client = useQueryClient(),
    navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const id = repository.migration?.id;
  const progress = useQuery({
    queryKey: ["repository-migration", id],
    queryFn: () => get<{ status: number; message: string }>(`/user/task/${id}`),
    enabled: !!id,
    refetchInterval: (query) =>
      [3, 4].includes(query.state.data?.status ?? -1) ? false : 3000,
  });
  const action = useMutation({
    mutationFn: (kind: string) =>
      nativeForm(
        kind === "delete"
          ? `${path}/settings`
          : kind === "retry" || kind === "cancel"
            ? `${path}/settings/migrate/${kind}`
            : `${path}/action/${kind}`,
        kind === "delete" ? { action: "delete", repo_name: confirmation } : {},
      ),
    onSuccess: async (data) => {
      await client.invalidateQueries();
      if (data.redirect) navigate(uiRoute(data.redirect));
      else if (deleting) navigate("/projects");
    },
  });
  if (repository.status === 2 && repository.transfer)
    return (
      <div className="my-4 flex flex-wrap items-center gap-2 rounded border border-line bg-surface-subtle p-3 text-sm">
        <div>
          <strong>{t("lifecycle.transferPending")}</strong>
          <p>
            {t("lifecycle.transferWaiting", {
              recipient: repository.transfer.recipient,
            })}
          </p>
        </div>
        {repository.can_accept_transfer && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button primary"
              disabled={action.isPending}
              onClick={() => action.mutate("accept_transfer")}
            >
              {t("lifecycle.acceptTransfer")}
            </button>
            <button
              className="button"
              disabled={action.isPending}
              onClick={() => action.mutate("reject_transfer")}
            >
              {t("lifecycle.rejectTransfer")}
            </button>
          </div>
        )}
        <Feedback error={action.error} />
      </div>
    );
  if (repository.status !== 1 && repository.status !== 3) return null;
  const state = progress.data || repository.migration;
  const completed = state?.status === 4,
    failed = state?.status === 3 || repository.status === 3;
  return (
    <div
      className="my-4 flex flex-wrap items-center gap-2 rounded border border-line bg-surface-subtle p-3 text-sm"
      role="status"
    >
      <div>
        <strong>
          {t(
            completed
              ? "lifecycle.importComplete"
              : failed
                ? "lifecycle.importFailed"
                : "lifecycle.importing",
          )}
        </strong>
        <p>
          {state?.message && !state.message.startsWith("{")
            ? state.message
            : t("lifecycle.preparing")}
        </p>
      </div>
      {completed ? (
        <button
          className="button primary"
          onClick={() => client.invalidateQueries()}
        >
          {t("lifecycle.openProject")}
        </button>
      ) : (
        repository.permissions?.admin && (
          <div className="flex flex-wrap items-center gap-2">
            {failed && (
              <button
                className="button primary"
                disabled={action.isPending}
                onClick={() => action.mutate("retry")}
              >
                {t("lifecycle.retryImport")}
              </button>
            )}
            {failed && (
              <button
                type="button"
                className="button"
                disabled={action.isPending}
                onClick={() => setDeleting(true)}
              >
                {t("lifecycle.deleteImport")}
              </button>
            )}
            {!failed && (
              <button
                className="button"
                disabled={action.isPending}
                onClick={() => action.mutate("cancel")}
              >
                {t("lifecycle.cancelImport")}
              </button>
            )}
          </div>
        )
      )}
      {deleting && failed && repository.permissions?.admin && (
        <form
          className="workspace-form basis-full"
          role="alertdialog"
          aria-label={t("lifecycle.deleteImport")}
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmation === repository.full_name) action.mutate("delete");
          }}
        >
          <p>{t("lifecycle.deleteWarning")}</p>
          <label>
            {t("lifecycle.confirmName", { name: repository.full_name })}
            <input
              className="filter-input w-full min-w-0"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="button"
              disabled={
                action.isPending || confirmation !== repository.full_name
              }
            >
              {t("lifecycle.deleteImport")}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setDeleting(false)}
            >
              {t("lifecycle.cancelDelete")}
            </button>
          </div>
        </form>
      )}
      <Feedback error={action.error || progress.error} />
    </div>
  );
}
