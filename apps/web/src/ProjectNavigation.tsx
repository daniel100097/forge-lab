import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  ChevronRight,
  Code2,
  LayoutGrid,
  Pin,
  PinOff,
  Settings,
  Terminal,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { nativePage, appSubUrl, type Repository } from "./api";
import type { GeneralSettings } from "./ProjectSettings";
import { activeProjectNavigationSegment } from "./projectNavigationState";

const pinIds = [
  "issues",
  "merge-requests",
  "boards",
  "wiki",
  "repository",
  "actions",
  "releases",
  "packages",
  "settings",
  "branches",
  "tags",
  "history",
  "compare",
  "graph",
  "search",
  "activity",
  "contributors",
  "labels",
  "milestones",
] as const;
type PinId = (typeof pinIds)[number];
const defaultPins: PinId[] = ["issues", "merge-requests", "boards"];
const storageKey = `forgejo-ui:${appSubUrl || "/"}:project-pins:v1`;

function readPins(): PinId[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    );
    if (Array.isArray(value)) {
      return [
        ...new Set(value.filter((id): id is PinId => pinIds.includes(id))),
      ];
    }
  } catch {
    // Invalid or unavailable storage must not prevent navigation.
  }
  return defaultPins;
}

function usePinnedNavigation() {
  const [pins, setPins] = useState(readPins);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(pins));
    } catch {
      // Keep this session's preference when browser storage is unavailable.
    }
  }, [pins]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPins(readPins());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return {
    pins,
    toggle: (id: PinId) =>
      setPins((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      ),
  };
}

// Sidebar row styles shared by the global, project and workspace navigation.
export const sidebarRow =
  "relative flex min-h-7.5 w-full items-center gap-3 rounded-lg border-0 py-1 text-left text-sm leading-5 transition-[background-color,border-color,color] duration-100 ease-[ease]";
const sidebarRowHover = "hover:bg-black/5 dark:hover:bg-hover";
const sidebarRowCurrent =
  "bg-selected font-semibold text-heading before:absolute before:-left-2 before:top-1 before:bottom-1 before:w-0.5 before:rounded before:bg-muted";
export const sidebarLink = (current: boolean) =>
  `${sidebarRow} px-2 ${current ? sidebarRowCurrent : sidebarRowHover}`;
export const sidebarUtility = `${sidebarRow} px-2 ${sidebarRowHover}`;
const sidebarChildLink = (current: boolean) =>
  `${sidebarRow} pl-9 pr-4 group-hover/item:pr-9 group-focus-within/item:pr-9 [@media(hover:none)]:pr-9 ${current ? sidebarRowCurrent : sidebarRowHover}`;
export const sidebarCount =
  "ml-auto text-xs font-normal tabular-nums text-muted";
export const sidebarDivider =
  "mx-2 my-3 border-t border-[#d2d2d5] dark:border-line";
export const projectSwitch = (current: boolean) =>
  current
    ? "relative mb-1 flex h-8 items-center gap-2 rounded-lg bg-selected px-2 font-semibold text-heading before:absolute before:-left-2 before:top-1 before:bottom-1 before:w-0.5 before:rounded before:bg-muted dark:hover:bg-hover"
    : "mb-1 flex h-8 items-center gap-2 rounded-lg px-2 hover:bg-black/5 dark:hover:bg-hover";

export function SidebarNavItem({
  current,
  to,
  pinned,
  label,
  onToggle,
  title,
  children,
}: {
  current: boolean;
  to: string;
  pinned: boolean;
  label: string;
  onToggle: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("shell");
  const action = t(pinned ? "nav.unpin" : "nav.pin", { label });
  return (
    <div className="group/item relative">
      <Link
        to={to}
        className={sidebarChildLink(current)}
        aria-current={current ? "page" : undefined}
      >
        {children}
      </Link>
      <button
        className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded border-0 bg-transparent text-muted opacity-0 transition-[opacity,background-color] duration-100 ease-[ease] group-focus-within/item:opacity-100 group-hover/item:opacity-100 hover:bg-black/10 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-hover"
        aria-label={action}
        title={title}
        onClick={onToggle}
      >
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </div>
  );
}

export function NavGroup({
  label,
  icon,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(!!active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);
  const isOpen = open ?? expanded;
  return (
    <div role="group" aria-label={label}>
      <button
        className={`group/toggle ${sidebarUtility}`}
        aria-expanded={isOpen}
        onClick={onToggle ?? (() => setExpanded(!expanded))}
      >
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight
          size={14}
          className="transition-transform duration-[160ms] ease-[ease] group-aria-expanded/toggle:rotate-90"
        />
      </button>
      <div
        className="invisible grid grid-rows-[0fr] opacity-0 [transition:grid-template-rows_180ms_ease,opacity_150ms_ease,visibility_180ms] data-[open=true]:visible data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100"
        data-open={isOpen}
        inert={!isOpen}
        aria-hidden={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

type NavGroupId = "plan" | "code" | "build" | "deploy" | "analyze" | "settings";
interface NavItem {
  id: PinId;
  label: string;
  group: NavGroupId;
  segment: string;
  count?: number;
  enabled?: boolean;
}

export function ProjectNavigation({
  repository: r,
  root,
  section,
}: {
  repository?: Repository;
  root: string;
  section: string;
}) {
  const { t } = useTranslation("shell");
  const { t: settingsLabel } = useTranslation("settings");
  const { pins, toggle } = usePinnedNavigation();
  const details = r as
    | (Repository & { external?: { issues?: string; wiki?: string } })
    | undefined;
  const nativeRoot = r
    ? `/${r.full_name.split("/").map(encodeURIComponent).join("/")}/settings`
    : "";
  const settings = useQuery({
    queryKey: ["project-settings", nativeRoot],
    enabled: !!r?.permissions?.admin,
    queryFn: ({ signal }) => nativePage<GeneralSettings>(nativeRoot, signal),
  });
  const code = settings.data?.code_enabled !== false;
  const settingLinks = [
    ["units", settingsLabel("project.tabs.units"), true],
    ["collaboration", settingsLabel("project.tabs.collaboration"), true],
    [
      "branches",
      settingsLabel("project.tabs.branches"),
      code && !(settings.data?.repository.empty ?? r?.empty),
    ],
    ["tags", settingsLabel("project.tabs.tags"), code],
    ["keys", settingsLabel("project.tabs.keys"), code],
    [
      "hooks",
      settingsLabel("project.tabs.hooks"),
      settings.data?.webhooks_enabled !== false,
    ],
    [
      "hooks/git",
      settingsLabel("project.tabs.gitHooks"),
      code && !!settings.data?.git_hooks_enabled,
    ],
    [
      "lfs",
      settingsLabel("project.tabs.lfs"),
      code && !!settings.data?.lfs_enabled,
    ],
    [
      "flags",
      settingsLabel("project.tabs.flags"),
      !!settings.data?.flags_enabled,
    ],
    [
      "actions/runners",
      settingsLabel("project.tabs.runners"),
      settings.data?.actions_enabled !== false,
    ],
    [
      "actions/secrets",
      settingsLabel("project.tabs.secrets"),
      settings.data?.actions_enabled !== false,
    ],
    [
      "actions/variables",
      settingsLabel("project.tabs.variables"),
      settings.data?.actions_enabled !== false,
    ],
  ] as const;
  const [pinsExpanded, setPinsExpanded] = useState(true);
  // Pins are browser preferences shared across projects. Each project still
  // filters them through its available units and the current user's access.
  const projectItems: NavItem[] = [
    {
      id: "issues",
      label: t("nav.items.issues"),
      group: "plan",
      segment: "issues",
      count: r?.open_issues_count,
      enabled: r?.units?.issues,
    },
    {
      id: "boards",
      label: t("nav.items.boards"),
      group: "plan",
      segment: "boards",
      enabled: r?.units?.projects,
    },
    {
      id: "wiki",
      label: t("nav.items.wiki"),
      group: "plan",
      segment: "wiki",
      enabled: r?.units?.wiki,
    },
    {
      id: "merge-requests",
      label: t("nav.items.mergeRequests"),
      group: "code",
      segment: "merge-requests",
      count: r?.open_pr_counter,
      enabled: r?.units?.pulls,
    },
    {
      id: "repository",
      label: t("nav.items.repository"),
      group: "code",
      segment: "?view=files",
      enabled: r?.units?.code,
    },
    {
      id: "actions",
      label: t("nav.items.actions"),
      group: "build",
      segment: "actions",
      enabled: r?.units?.actions,
    },
    {
      id: "packages",
      label: t("nav.items.packages"),
      group: "deploy",
      segment: "packages",
      enabled: true,
    },
    {
      id: "releases",
      label: t("nav.items.releases"),
      group: "deploy",
      segment: "releases",
      enabled: r?.units?.releases,
    },
    {
      id: "settings",
      label: settingsLabel("project.tabs.general"),
      group: "settings",
      segment: "settings",
      enabled: r?.permissions?.admin,
    },
  ];
  projectItems.push(
    ...(
      [
        ["branches", t("nav.items.branches")],
        ["tags", t("nav.items.tags")],
        ["history", t("nav.items.history")],
        ["compare", t("nav.items.compare")],
        ["graph", t("nav.items.graph")],
        ["search", t("nav.items.search")],
      ] as const
    ).map(([id, label]) => ({
      id,
      label,
      segment: id,
      group: "code" as const,
      enabled: r?.units?.code,
    })),
    {
      id: "activity",
      label: t("nav.items.activity"),
      segment: "activity",
      group: "analyze",
      enabled: true,
    },
    {
      id: "contributors",
      label: t("nav.items.contributors"),
      segment: "activity/contributors",
      group: "analyze",
      enabled: r?.units?.code,
    },
    {
      id: "labels",
      label: t("nav.items.labels"),
      segment: "labels",
      group: "plan",
      enabled: r?.units?.issues || r?.units?.pulls,
    },
    {
      id: "milestones",
      label: t("nav.items.milestones"),
      segment: "milestones",
      group: "plan",
      enabled: r?.units?.issues || r?.units?.pulls,
    },
  );
  const items = projectItems.filter((item) => item.enabled);
  const pinnedItems = pins.flatMap((id) =>
    items.filter((item) => item.id === id),
  );
  const visibleSettingLinks =
    settings.data && r?.permissions?.admin
      ? settingLinks.filter(([, , shown]) => shown)
      : [];
  const activeSegment = activeProjectNavigationSegment(section, [
    ...items.map((item) => item.segment),
    ...visibleSettingLinks.map(([key]) => `settings/${key}`),
  ]);
  const activeItem = items.find((item) => item.segment === activeSegment);
  const highlightPinned =
    pinsExpanded && !!activeItem && pins.includes(activeItem.id);
  const groups: { id: NavGroupId; label: string; icon: ReactNode }[] = [
    { id: "plan", label: t("nav.groups.plan"), icon: <LayoutGrid size={16} /> },
    { id: "code", label: t("nav.groups.code"), icon: <Code2 size={16} /> },
    { id: "build", label: t("nav.groups.build"), icon: <Terminal size={16} /> },
    { id: "deploy", label: t("nav.groups.deploy"), icon: <Box size={16} /> },
    {
      id: "analyze",
      label: t("nav.groups.analyze"),
      icon: <LayoutGrid size={16} />,
    },
    {
      id: "settings",
      label: t("nav.groups.settings"),
      icon: <Settings size={16} />,
    },
  ];
  const renderItem = (item: NavItem, inPinned: boolean) => {
    const pinned = pins.includes(item.id);
    const selected =
      item.id === activeItem?.id &&
      (inPinned ? highlightPinned : !highlightPinned);
    return (
      <SidebarNavItem
        key={item.id}
        to={
          root +
          (item.segment.startsWith("?")
            ? item.segment
            : item.segment
              ? `/${item.segment}`
              : "")
        }
        current={selected}
        pinned={pinned}
        label={item.label}
        title={t(pinned ? "nav.unpin" : "nav.pin", { label: item.label })}
        onToggle={() => toggle(item.id)}
      >
        <span className="truncate">{item.label}</span>
        {item.count !== undefined && (
          <span className={sidebarCount}>{item.count}</span>
        )}
      </SidebarNavItem>
    );
  };
  return (
    <nav aria-label={t("nav.projectNavigation")}>
      <NavGroup
        label={t("nav.pinned")}
        icon={<Pin size={16} />}
        open={pinsExpanded}
        onToggle={() => setPinsExpanded(!pinsExpanded)}
      >
        {pinnedItems.map((item) => renderItem(item, true))}
        {!pinnedItems.length && (
          <p className="px-9 py-2 text-xs text-muted">{t("nav.pinHint")}</p>
        )}
      </NavGroup>
      <div className={sidebarDivider} />
      {groups.map((group) => {
        const children = items.filter(
          (item) =>
            item.group === group.id &&
            (!pinsExpanded || !pins.includes(item.id)),
        );
        return children.length ||
          (group.id === "settings" && visibleSettingLinks.length) ||
          (group.id === "plan" && details?.external?.issues) ||
          (group.id === "code" && details?.external?.wiki) ? (
          <NavGroup
            key={group.id}
            label={group.label}
            icon={group.icon}
            active={
              (activeItem?.group === group.id && !highlightPinned) ||
              (group.id === "settings" &&
                (activeSegment === "settings" ||
                  activeSegment?.startsWith("settings/")))
            }
          >
            {children.map((item) => renderItem(item, false))}
            {group.id === "plan" && details?.external?.issues && (
              <a
                className={sidebarLink(false)}
                href={details.external.issues}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("nav.externalIssues")}
              </a>
            )}
            {group.id === "code" && details?.external?.wiki && (
              <a
                className={sidebarLink(false)}
                href={details.external.wiki}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("nav.externalWiki")}
              </a>
            )}
            {group.id === "settings" &&
              visibleSettingLinks.map(([key, label]) => (
                <Link
                  key={key}
                  className={sidebarChildLink(
                    activeSegment === `settings/${key}`,
                  )}
                  aria-current={
                    activeSegment === `settings/${key}` ? "page" : undefined
                  }
                  to={`${root}/settings/${key}`}
                >
                  {label}
                </Link>
              ))}
          </NavGroup>
        ) : null;
      })}
    </nav>
  );
}
