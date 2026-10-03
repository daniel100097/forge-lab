import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BookOpen,
  Box,
  Calendar,
  Code2,
  LayoutGrid,
  Pin,
  Search,
  Settings,
  Star,
  Users,
  UserRound,
  Eye,
} from "lucide-react";
import { appSubUrl } from "./api";
import {
  NavGroup,
  SidebarNavItem,
  projectSwitch,
  sidebarCount,
  sidebarDivider,
  sidebarLink,
} from "./ProjectNavigation";
import type { WorkspaceData } from "./WorkspaceManagement";
import { organizationSettingsNavigation } from "./organizationNavigation";
export function WorkspaceNavigation({
  kind,
  name,
  data,
}: {
  kind: "profile" | "organization";
  name: string;
  data?: WorkspaceData;
}) {
  const { t } = useTranslation("shell");
  const { t: workspaceText } = useTranslation("workspace");
  const location = useLocation(),
    root = `/${kind === "profile" ? "users" : "organizations"}/${encodeURIComponent(name)}`;
  const tail = location.pathname.slice(root.length).replace(/^\//, ""),
    tab = new URLSearchParams(location.search).get("tab") || "overview";
  const key = `forgejo-ui:${appSubUrl || "/"}:organization-pins:v1`;
  const allowed = [
    "members",
    "teams",
    "issues",
    "boards",
    "merge-requests",
    "milestones",
    "search",
    "activity",
    "packages",
    "general",
    "labels",
    "runners",
    "webhooks",
    "avatar",
    "package-settings",
    "applications",
    "secrets",
    "variables",
    "storage",
    "blocked",
    "delete",
  ];
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(stored))
        return [...new Set(stored.filter((v) => allowed.includes(v)))];
    } catch {}
    return ["members", "issues", "boards", "merge-requests"];
  });
  const [pinsExpanded, setPinsExpanded] = useState(true);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(pins));
    } catch {}
  }, [key, pins]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      try {
        const stored = JSON.parse(event.newValue);
        if (Array.isArray(stored))
          setPins([...new Set(stored.filter((v) => allowed.includes(v)))]);
      } catch {}
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const atOverview = !tail && (kind === "organization" || tab === "overview");
  const title = data?.profile?.full_name || data?.profile?.name || name;
  const top = (
    <Link
      to={root}
      className={projectSwitch(atOverview)}
      aria-current={atOverview ? "page" : undefined}
    >
      {data?.profile?.avatar ? (
        <img
          src={data.profile.avatar}
          alt=""
          className="project-avatar size-5 rounded text-[10px]"
        />
      ) : (
        <span className="project-avatar color-2 size-5 rounded text-[10px]">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <strong className="truncate font-semibold text-ink">{title}</strong>
    </Link>
  );
  if (kind === "profile") {
    const items = [
      ["activity", t("nav.items.activity"), Activity],
      ["repositories", t("nav.items.personalProjects"), BookOpen],
      ["stars", t("nav.items.starredProjects"), Star],
      ["watching", t("nav.items.watching"), Eye],
      ["followers", t("nav.items.followers"), Users],
      ["following", t("nav.items.following"), UserRound],
    ] as const;
    return (
      <>
        {top}
        <nav aria-label={t("nav.profileNavigation")}>
          {data?.federation_enabled && data.viewer_id === data.profile?.id && (
            <Link
              className={sidebarLink(tab === "feed")}
              to={`${root}?tab=feed`}
            >
              {t("nav.profileFeed")}
            </Link>
          )}
          {items.map(([value, label, Icon]) => (
            <Link
              key={value}
              to={`${root}?tab=${value}`}
              className={sidebarLink(!tail && tab === value)}
              aria-current={!tail && tab === value ? "page" : undefined}
            >
              <Icon size={16} />
              {label}
              {["followers", "following"].includes(value) && (
                <span className={sidebarCount}>
                  {data?.[value as "followers" | "following"] ?? ""}
                </span>
              )}
            </Link>
          ))}
          <Link
            to={`${root}/boards`}
            className={sidebarLink(tail.startsWith("boards"))}
            aria-current={tail.startsWith("boards") ? "page" : undefined}
          >
            <LayoutGrid size={16} />
            {t("nav.items.boards")}
          </Link>
          <Link
            to={`${root}/search`}
            className={sidebarLink(tail === "search")}
            aria-current={tail === "search" ? "page" : undefined}
          >
            <Search size={16} />
            {t("nav.items.searchCode")}
          </Link>
        </nav>
      </>
    );
  }
  const items = [
    {
      id: "members",
      label: t("nav.items.members"),
      group: "manage",
      segment: "members",
      show: true,
    },
    {
      id: "teams",
      label: t("nav.items.teams"),
      group: "manage",
      segment: "teams",
      show: data?.is_member,
    },
    {
      id: "activity",
      label: t("nav.items.activity"),
      group: "manage",
      segment: "activity",
      show: data?.is_member,
    },
    {
      id: "issues",
      label: t("nav.items.issues"),
      group: "plan",
      segment: "issues",
      show: data?.is_member,
    },
    {
      id: "boards",
      label: t("nav.items.boards"),
      group: "plan",
      segment: "boards",
      show: true,
    },
    {
      id: "milestones",
      label: t("nav.items.milestones"),
      group: "plan",
      segment: "milestones",
      show: data?.is_member,
    },
    {
      id: "merge-requests",
      label: t("nav.items.mergeRequests"),
      group: "code",
      segment: "merge-requests",
      show: data?.is_member,
    },
    {
      id: "search",
      label: t("nav.items.searchCode"),
      group: "code",
      segment: "search",
      show: true,
    },
    {
      id: "packages",
      label: t("nav.items.packages"),
      group: "deploy",
      segment: "packages",
      show: data?.packages_enabled,
    },
    ...organizationSettingsNavigation(
      !!data?.is_owner,
      data?.settings_features,
    ).map((item) => ({
      ...item,
      label: workspaceText(`organization.settings.nav.${item.label}`),
      group: "settings",
      show: true,
    })),
  ].filter((i) => i.show);
  const selected = items
    .filter((i) => tail === i.segment || tail.startsWith(i.segment + "/"))
    .sort((a, b) => b.segment.length - a.segment.length)[0]?.id;
  const render = (item: (typeof items)[number], inPinned = false) => (
    <SidebarNavItem
      key={item.id}
      to={
        item.id === "packages"
          ? `/packages/${encodeURIComponent(name)}`
          : `${root}/${item.segment}`
      }
      current={selected === item.id && (!inPinned || pinsExpanded)}
      pinned={pins.includes(item.id)}
      label={item.label}
      onToggle={() =>
        setPins((values) =>
          values.includes(item.id)
            ? values.filter((v) => v !== item.id)
            : [...values, item.id],
        )
      }
    >
      <span className="truncate">{item.label}</span>
    </SidebarNavItem>
  );
  const pinned = items.filter((i) => pins.includes(i.id));
  return (
    <>
      {top}
      <nav aria-label={t("nav.organizationNavigation")}>
        <NavGroup
          label={t("nav.pinned")}
          icon={<Pin size={16} />}
          open={pinsExpanded}
          onToggle={() => setPinsExpanded(!pinsExpanded)}
        >
          {pinned.map((item) => render(item, true))}
        </NavGroup>
        <div className={sidebarDivider} />
        {(
          [
            ["manage", t("nav.groups.manage"), Users],
            ["plan", t("nav.groups.plan"), Calendar],
            ["code", t("nav.groups.code"), Code2],
            ["deploy", t("nav.groups.deploy"), Box],
            ["settings", t("nav.groups.settings"), Settings],
          ] as const
        ).map(([id, label, GroupIcon]) => {
          const group = items.filter(
            (i) => i.group === id && (!pinsExpanded || !pins.includes(i.id)),
          );
          return (
            !!group.length && (
              <NavGroup
                key={id}
                label={label}
                icon={<GroupIcon size={16} />}
                active={group.some((i) => i.id === selected)}
              >
                {group.map((item) => render(item))}
              </NavGroup>
            )
          );
        })}
      </nav>
    </>
  );
}
