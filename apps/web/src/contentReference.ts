export function referenceIssueBody(
  reference: string,
  body: string,
  origin: string,
) {
  const url = new URL(reference, origin);
  const issue = url.pathname.match(
    /\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)$/,
  );
  const label = issue
    ? `${decodeURIComponent(issue[1])}/${decodeURIComponent(issue[2])}${issue[3] === "pulls" ? "!" : "#"}${issue[4]}`
    : url.href;
  const quote = body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${issue ? `${label}\n${url.href}` : url.href}\n\n${quote}`;
}
