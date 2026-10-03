import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// One catalog per area of the app; every area has a file per language.
export const namespaces = [
  "common",
  "shell",
  "workspace",
  "repository",
  "issues",
  "mergeRequests",
  "settings",
  "admin",
  "account",
] as const;
export type Namespace = (typeof namespaces)[number];
export const uiLanguages = ["en", "de"] as const;
export type UiLanguage = (typeof uiLanguages)[number];

type Catalog = { default: Record<string, unknown> };
// English ships with the bundle so the first render never waits for it;
// other languages load on demand.
const english = import.meta.glob<Catalog>("./locales/en/*.json", {
  eager: true,
});
const translations = import.meta.glob<Catalog>([
  "./locales/*/*.json",
  "!./locales/en/*.json",
]);
const namespaceOf = (path: string) =>
  path.slice(path.lastIndexOf("/") + 1, -".json".length);

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  supportedLngs: uiLanguages,
  ns: namespaces,
  defaultNS: "common",
  resources: {
    en: Object.fromEntries(
      Object.entries(english).map(([path, catalog]) => [
        namespaceOf(path),
        catalog.default,
      ]),
    ),
  },
  partialBundledLanguages: true,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Maps a Forgejo or browser locale such as "de-DE" to a UI language. */
export function uiLanguage(locale?: string | null): UiLanguage {
  const base = (locale || "").toLowerCase().split(/[-_]/)[0];
  return (uiLanguages as readonly string[]).includes(base)
    ? (base as UiLanguage)
    : "en";
}

/** Loads the catalogs for a locale (if needed) and switches the UI to it. */
export async function setLanguage(locale?: string | null) {
  const language = uiLanguage(locale);
  if (language !== "en" && !i18n.hasResourceBundle(language, "common")) {
    await Promise.all(
      Object.entries(translations)
        .filter(([path]) => path.startsWith(`./locales/${language}/`))
        .map(async ([path, load]) =>
          i18n.addResourceBundle(
            language,
            namespaceOf(path),
            (await load()).default,
            true,
            true,
          ),
        ),
    );
  }
  if (i18n.language !== language) await i18n.changeLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
  return language;
}

export function relativeDate(date?: string) {
  if (!date) return "";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000),
  );
  return days < 30
    ? new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }).format(
        -days,
        "day",
      )
    : new Date(date).toLocaleDateString(i18n.language);
}

export default i18n;
