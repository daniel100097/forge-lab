import { describe, expect, it } from "vitest";
import { activeProjectNavigationSegment } from "./projectNavigationState";

describe("project navigation selection", () => {
  const settings = [
    "settings",
    "settings/branches",
    "settings/hooks",
    "settings/hooks/git",
    "settings/actions/runners",
  ];

  it("selects nested settings instead of General", () => {
    expect(
      activeProjectNavigationSegment("settings/branches/edit", settings),
    ).toBe("settings/branches");
    expect(
      activeProjectNavigationSegment("settings/actions/runners/42", settings),
    ).toBe("settings/actions/runners");
  });

  it("distinguishes Git hooks from webhooks", () => {
    expect(
      activeProjectNavigationSegment(
        "settings/hooks/git/pre-receive",
        settings,
      ),
    ).toBe("settings/hooks/git");
    expect(activeProjectNavigationSegment("settings/hooks/42", settings)).toBe(
      "settings/hooks",
    );
    expect(
      activeProjectNavigationSegment("settings/hooks-other", [
        "settings/hooks",
      ]),
    ).toBeUndefined();
  });

  it("retains the explicit General alias and repository file operations", () => {
    expect(activeProjectNavigationSegment("settings/general", settings)).toBe(
      "settings",
    );
    expect(activeProjectNavigationSegment("edit", ["?view=files"])).toBe(
      "?view=files",
    );
    expect(
      activeProjectNavigationSegment("commit/abc123", ["?view=files"]),
    ).toBe("?view=files");
  });

  it("keeps detail pages in their most specific destination", () => {
    expect(activeProjectNavigationSegment("issues/12", ["issues"])).toBe(
      "issues",
    );
    expect(
      activeProjectNavigationSegment("activity/contributors", [
        "activity",
        "activity/contributors",
      ]),
    ).toBe("activity/contributors");
  });
});
