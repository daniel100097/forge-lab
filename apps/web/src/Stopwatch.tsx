import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CircleDot,
  CircleStop,
  GitMerge,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import {
  get,
  nativeForm,
  repoPath,
  type ActiveStopwatch,
  type Bootstrap,
} from "./api";
import { ActionMenu, MenuAction, MenuLink, MenuSeparator } from "./ActionMenu";

/** Elapsed time as h:mm:ss (m:ss below one hour). */
export function formatElapsed(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * The running time tracker of the signed-in user, like the native navbar's
 * active stopwatch: links to the issue and stops or discards the timer.
 */
export function StopwatchIndicator({
  initial,
}: {
  initial?: ActiveStopwatch | null;
}) {
  const { t } = useTranslation("shell");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["active-stopwatch"],
    queryFn: ({ signal }) =>
      get<Bootstrap>("/-/ui/data/bootstrap", signal).then(
        (data) => data.stopwatch ?? null,
      ),
    initialData: initial ?? null,
    initialDataUpdatedAt: () =>
      client.getQueryState(["bootstrap"])?.dataUpdatedAt,
    refetchInterval: 5 * 60_000,
  });
  // Starting or stopping a timer on an issue refreshes its metadata; follow it.
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "success" &&
          event.query.queryKey[0] === "issue-metadata"
        )
          void client.invalidateQueries({ queryKey: ["active-stopwatch"] });
      }),
    [client],
  );
  const [now, setNow] = useState(() => Date.now());
  const active = query.data;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const action = useMutation({
    mutationFn: async (operation: "toggle" | "cancel") => {
      await nativeForm(
        `${repoPath(active!.owner, active!.repo)}/issues/${active!.index}/times/stopwatch/${operation}`,
        {},
      );
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["active-stopwatch"] });
      await client.invalidateQueries({ queryKey: ["issue-metadata"] });
      await client.invalidateQueries({ queryKey: ["discussion"] });
    },
  });
  if (!active) return null;
  const elapsed = formatElapsed(
    active.seconds + (now - query.dataUpdatedAt) / 1000,
  );
  const reference = `${active.owner}/${active.repo}${active.pull ? "!" : "#"}${active.index}`;
  const link = `/projects${repoPath(active.owner, active.repo)}/${active.pull ? "merge-requests" : "issues"}/${active.index}`;
  return (
    <>
      {action.error && (
        <div
          className="fixed top-14 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 shadow-lg dark:border-[#a34a44] dark:bg-danger-bg dark:text-danger"
          role="alert"
        >
          {action.error.message}
          <button
            className="icon-button"
            aria-label={t("stopwatch.dismissError")}
            onClick={() => action.reset()}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <ActionMenu
        label={t("stopwatch.label", { elapsed })}
        className="active-stopwatch icon-button w-auto gap-1.5 px-2 font-mono text-xs text-primary tabular-nums"
        popupClassName="w-80"
        trigger={
          <>
            <Timer size={17} />
            <span className="max-md:sr-only">{elapsed}</span>
          </>
        }
      >
        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">
          {t("stopwatch.title")}
        </div>
        <MenuLink to={link}>
          {active.pull ? (
            <GitMerge size={16} className="shrink-0" />
          ) : (
            <CircleDot size={16} className="shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{active.title}</span>
            <span className="block truncate text-xs text-muted">
              {reference}
            </span>
          </span>
          <span className="font-mono text-xs tabular-nums">{elapsed}</span>
        </MenuLink>
        <MenuSeparator />
        <MenuAction
          onClick={() => action.mutate("toggle")}
          disabled={action.isPending}
        >
          <CircleStop size={16} />
          {t("stopwatch.stop")}
        </MenuAction>
        <MenuAction
          onClick={() => action.mutate("cancel")}
          disabled={action.isPending}
        >
          <Trash2 size={16} />
          {t("stopwatch.discard")}
        </MenuAction>
      </ActionMenu>
    </>
  );
}
