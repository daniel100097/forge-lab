import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { native } from "./api";
import { Feedback, Pending } from "./UI";
import { apiExplorerStyles } from "./apiExplorerDocument";

export function ApiExplorer({ forgejo }: { forgejo: boolean }) {
  const { t } = useTranslation("shell");
  const frame = useRef<HTMLIFrameElement>(null);
  const detachHash = useRef<(() => void) | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const source = useMemo(
    () =>
      native(forgejo ? "/api/forgejo/swagger" : "/api/swagger") +
      "?spaui_embed=1" +
      location.hash,
    [forgejo],
  );
  const query = useQuery({
    queryKey: ["native-api-explorer", forgejo],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        native(forgejo ? "/api/forgejo/swagger" : "/api/swagger"),
        {
          signal,
          credentials: "same-origin",
          headers: { "HX-Request": "true" },
        },
      );
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error(t("apiReference.unavailable"));
      return true;
    },
    staleTime: Infinity,
  });
  function syncTheme() {
    const root = frame.current?.contentDocument?.documentElement;
    if (root)
      root.dataset.theme = document.documentElement.dataset.theme || "light";
  }
  function syncHash() {
    const window = frame.current?.contentWindow;
    if (window && window.location.hash !== location.hash)
      window.location.hash = location.hash;
  }
  function loaded() {
    const document = frame.current?.contentDocument;
    if (document) {
      const style = document.createElement("style");
      style.textContent = apiExplorerStyles;
      document.head.appendChild(style);
    }
    syncTheme();
    detachHash.current?.();
    const window = frame.current?.contentWindow;
    if (!window) return;
    const changed = () =>
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: window.location.hash,
        },
        { replace: true },
      );
    window.addEventListener("hashchange", changed);
    const history = window.history;
    const replace = history.replaceState;
    const push = history.pushState;
    history.replaceState = (...args) => {
      replace.apply(history, args);
      changed();
    };
    history.pushState = (...args) => {
      push.apply(history, args);
      changed();
    };
    detachHash.current = () => {
      window.removeEventListener("hashchange", changed);
      history.replaceState = replace;
      history.pushState = push;
    };
    syncHash();
  }
  useEffect(syncHash, [location.hash]);
  useEffect(() => () => detachHash.current?.(), []);
  useEffect(() => {
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="mt-5 min-w-0">
      <p className="mb-4 text-sm text-muted">
        {t("apiReference.explorerHint")}
      </p>
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <iframe
            ref={frame}
            key={forgejo ? "forgejo" : "compatible"}
            className="block h-[75vh] min-h-[640px] w-full rounded-lg border border-line bg-surface"
            title={t("apiReference.explorer")}
            src={source}
            onLoad={loaded}
          />
        )
      )}
    </div>
  );
}
