export function wikiPath(page: string): string {
  return page
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment)
        .replace(/%2B/g, "+")
        .replace(/%25(?=[\da-f]{2})/gi, "%"),
    )
    .join("/");
}
