// Match Forgejo's configured work-in-progress prefixes case-insensitively.
export function draftPrefix(title: string, prefixes: string[] = []) {
  return (
    prefixes.find((prefix) =>
      title.toUpperCase().startsWith(prefix.toUpperCase()),
    ) || ""
  );
}
