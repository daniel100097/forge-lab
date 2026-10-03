export function activeProjectNavigationSegment(
  section: string,
  segments: readonly string[],
) {
  const root = section.split("/")[0];
  const normalized = [
    "files",
    "commit",
    "edit",
    "new",
    "upload",
    "delete",
  ].includes(root)
    ? "?view=files"
    : section === "settings/general"
      ? "settings"
      : section;
  return segments
    .filter(
      (segment) =>
        normalized === segment || normalized.startsWith(`${segment}/`),
    )
    .sort((first, second) => second.length - first.length)[0];
}
