export interface OrganizationSettingsFeatures {
  webhooks: boolean;
  applications: boolean;
  packages: boolean;
  actions: boolean;
  storage: boolean;
}

export function organizationSettingsNavigation(
  owner: boolean,
  features?: OrganizationSettingsFeatures,
) {
  if (!owner) return [];
  return (
    [
      { id: "general", label: "general", segment: "settings", show: true },
      { id: "avatar", label: "avatar", segment: "settings/avatar", show: true },
      { id: "labels", label: "labels", segment: "settings/labels", show: true },
      {
        id: "package-settings",
        label: "packages",
        segment: "settings/packages",
        show: features?.packages,
      },
      {
        id: "applications",
        label: "applications",
        segment: "settings/applications",
        show: features?.applications,
      },
      {
        id: "webhooks",
        label: "hooks",
        segment: "settings/hooks",
        show: features?.webhooks,
      },
      {
        id: "runners",
        label: "runners",
        segment: "settings/actions/runners",
        show: features?.actions,
      },
      {
        id: "secrets",
        label: "secrets",
        segment: "settings/actions/secrets",
        show: features?.actions,
      },
      {
        id: "variables",
        label: "variables",
        segment: "settings/actions/variables",
        show: features?.actions,
      },
      {
        id: "storage",
        label: "storage",
        segment: "settings/storage_overview",
        show: features?.storage,
      },
      {
        id: "blocked",
        label: "blocked",
        segment: "settings/blocked_users",
        show: true,
      },
      { id: "delete", label: "delete", segment: "settings/delete", show: true },
    ] as const
  ).filter((item) => item.show);
}
