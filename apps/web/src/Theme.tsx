import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronRight, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appSubUrl, nativeForm, nativePage } from "./api";

export type ColorMode = "light" | "dark" | "system";
const storageKey = `forgejo-ui:${appSubUrl || "/"}:color-mode:v1`;
// The account theme last read from or saved to Forgejo. A different value on
// the server means the theme was changed elsewhere (another browser/device).
const serverKey = `forgejo-ui:${appSubUrl || "/"}:account-theme:v1`;
interface ThemeContextValue {
  mode: ColorMode;
  /** Applies a color mode in this browser only. */
  setMode: (mode: ColorMode) => void;
  /**
   * Applies a color mode and saves it as the account's Forgejo theme. `current`
   * is the account theme (to keep its variant), `themes` the instance's list.
   */
  saveMode: (
    mode: ColorMode,
    options?: { current?: string; themes?: string[] },
  ) => Promise<string | null>;
  /** Adopts the account's Forgejo theme (when it changed since the last sync). */
  applyServerTheme: (theme: string, force?: boolean) => void;
}
const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
  saveMode: async () => null,
  applyServerTheme: () => {},
});

// Forgejo themes are named <family>-<light|dark|auto>[-<variant>], for example
// forgejo-dark or forgejo-auto-tritanopia (modules/setting/ui.go). This
// interface renders the light and dark modes; families and colour-vision
// variants only affect Forgejo's own pages.
const themePattern = /^(forgejo|gitea)-(light|dark|auto)(-.+)?$/;
export function themeMode(theme: string): ColorMode | null {
  const match = themePattern.exec(theme);
  if (!match) return null;
  return match[2] === "auto" ? "system" : (match[2] as ColorMode);
}
/** True when the theme is one of the plain Forgejo light/dark/auto themes. */
export const isPlainTheme = (theme: string) =>
  /^forgejo-(light|dark|auto)$/.test(theme);
/** The account theme for a color mode, keeping the current family and variant. */
export function themeForMode(
  mode: ColorMode,
  current = "",
  available?: string[],
): string | null {
  const name = mode === "system" ? "auto" : mode;
  const match = themePattern.exec(current);
  const candidates = [
    match && `${match[1]}-${name}${match[3] || ""}`,
    match?.[3] && `forgejo-${name}${match[3]}`,
    `forgejo-${name}`,
    `gitea-${name}`,
  ].filter((value): value is string => !!value);
  if (!available) return candidates[0];
  return (
    candidates.find((theme) => available.includes(theme)) ||
    available.find((theme) => themeMode(theme) === mode) ||
    null
  );
}
/** Reads the signed-in account's Forgejo theme (Preferences → Theme). */
export const loadServerTheme = () =>
  nativePage<{ theme?: string }>("/user/settings/appearance").then(
    (data) => data.theme || null,
  );

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    // A browser with storage disabled still supports a session preference.
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The selection remains effective until this page is closed.
  }
}

function readMode(): ColorMode {
  const stored = read(storageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyMode(mode: ColorMode, systemDark: boolean) {
  const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  document.documentElement.dataset.colorMode = mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor =
    theme === "dark" ? "#050506" : "#ececef";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#050506" : "#ececef");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(readMode);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyMode(mode, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setMode(readMode());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const chooseMode = useCallback((next: ColorMode) => {
    applyMode(next, window.matchMedia("(prefers-color-scheme: dark)").matches);
    setMode(next);
    write(storageKey, next);
  }, []);
  const saveMode = useCallback(
    async (
      next: ColorMode,
      options: { current?: string; themes?: string[] } = {},
    ) => {
      chooseMode(next);
      const current = options.current ?? (read(serverKey) || "");
      const theme = themeForMode(next, current, options.themes);
      if (!theme) return null;
      if (theme !== current)
        await nativeForm("/user/settings/appearance/theme", { theme });
      write(serverKey, theme);
      return theme;
    },
    [chooseMode],
  );
  const applyServerTheme = useCallback(
    (theme: string, force = false) => {
      if (!force && read(serverKey) === theme) return;
      write(serverKey, theme);
      const next = themeMode(theme);
      if (next) chooseMode(next);
    },
    [chooseMode],
  );
  return (
    <ThemeContext.Provider
      value={{ mode, setMode: chooseMode, saveMode, applyServerTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useColorMode() {
  return useContext(ThemeContext);
}

const modes = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function AppearanceMenu() {
  const { t } = useTranslation("common");
  const { mode, saveMode } = useContext(ThemeContext);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className="menu-item" openOnHover={!compact}>
        <Monitor size={16} />
        <span className="flex-1">{t("theme.appearance")}</span>
        <ChevronRight size={14} />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          className="dropdown-positioner"
          sideOffset={6}
          alignOffset={-4}
          collisionPadding={12}
        >
          <Menu.Popup
            className="dropdown-popup action-menu w-56"
            aria-label={t("theme.appearance")}
          >
            <Menu.RadioGroup
              value={mode}
              // The menu is only offered to signed-in users: like Forgejo's
              // theme setting, the choice follows the account.
              onValueChange={(value: ColorMode) =>
                void saveMode(value).catch(() => {})
              }
              aria-label={t("theme.colorMode")}
            >
              <Menu.GroupLabel className="menu-group-label">
                {t("theme.colorMode")}
              </Menu.GroupLabel>
              {modes.map(({ value, icon: Icon }) => (
                <Menu.RadioItem key={value} value={value} className="menu-item">
                  <Icon size={16} />
                  <span className="flex-1">{t(`theme.${value}`)}</span>
                  <span className="flex w-4 justify-center">
                    <Menu.RadioItemIndicator>
                      <Check size={16} />
                    </Menu.RadioItemIndicator>
                  </span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <p className="-mx-1 mt-1 -mb-1 border-t border-line px-4 py-2.5 text-xs leading-[18px] text-muted">
              {t("theme.systemHint")}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}
