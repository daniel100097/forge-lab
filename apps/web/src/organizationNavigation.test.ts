import { describe, expect, it } from "vitest";
import { organizationSettingsNavigation } from "./organizationNavigation";

const enabled = {
  webhooks: true,
  applications: true,
  packages: true,
  actions: true,
  storage: true,
};

describe("organization settings navigation", () => {
  it("preserves every destination exactly once for owners", () => {
    const items = organizationSettingsNavigation(true, enabled);
    expect(items.map((item) => item.label)).toEqual([
      "general",
      "avatar",
      "labels",
      "packages",
      "applications",
      "hooks",
      "runners",
      "secrets",
      "variables",
      "storage",
      "blocked",
      "delete",
    ]);
    expect(new Set(items.map((item) => item.segment)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
  it("hides owner-only destinations from members and visitors", () => {
    expect(organizationSettingsNavigation(false, enabled)).toEqual([]);
  });
  it("omits disabled native features without hiding unconditional settings", () => {
    const features = {
      webhooks: false,
      applications: false,
      packages: false,
      actions: false,
      storage: false,
    };
    expect(
      organizationSettingsNavigation(true, features).map((item) => item.label),
    ).toEqual(["general", "avatar", "labels", "blocked", "delete"]);
    expect(organizationSettingsNavigation(true)).toEqual(
      organizationSettingsNavigation(true, features),
    );
  });
});
