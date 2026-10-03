export function parsePullRange(params: URLSearchParams, commit = "") {
  return {
    from: params.get("from") || "",
    to: params.get("to") ?? commit,
  };
}
