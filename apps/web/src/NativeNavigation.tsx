import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { appSubUrl, uiBase } from "./api";
import { Feedback, pageClass, Pending } from "./UI";
import { uiRoute } from "./routes";

// Resolves only same-origin native page links with ambiguous branch/file paths.
// HEAD follows the native page redirect without loading any legacy page content.
export default function NativeNavigationPage() {
  const { t } = useTranslation("shell");
  const [params] = useSearchParams();
  const path = params.get("path") || "";
  const query = useQuery({
    queryKey: ["native-navigation", path],
    queryFn: async ({ signal }) => {
      const url = new URL(path, location.origin);
      const prefix = `${appSubUrl}/`;
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix))
        throw new Error(t("nativeNavigation.invalid"));
      const nativePath = url.pathname.slice(appSubUrl.length);
      if (
        !/^\/[^/]+\/[^/]+\/(src|commits|blame|_edit|_new|_upload|_delete|_diffpatch)\//.test(
          nativePath,
        )
      )
        throw new Error(t("nativeNavigation.unresolvable"));
      const response = await fetch(url.pathname + url.search, {
        method: "HEAD",
        credentials: "same-origin",
        headers: { Accept: "text/html" },
        signal,
      });
      const destination = new URL(response.url);
      if (
        !response.ok ||
        destination.origin !== location.origin ||
        !destination.pathname.startsWith(`${uiBase}/`)
      )
        throw new Error(t("nativeNavigation.notFound"));
      return uiRoute(destination.pathname + destination.search + url.hash);
    },
    retry: false,
  });
  if (query.isPending) return <Pending />;
  if (query.error)
    return (
      <section className={pageClass}>
        <h1>{t("nativeNavigation.title")}</h1>
        <Feedback error={query.error} />
        <Link className="button" to="/projects">
          {t("nativeNavigation.goToProjects")}
        </Link>
      </section>
    );
  return <Navigate to={query.data} replace />;
}
