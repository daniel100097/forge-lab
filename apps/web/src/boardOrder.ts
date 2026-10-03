export interface BoardMove {
  issue: number;
  column: number;
  before?: number;
}

export function orderedBoardIssues(
  columns: { id: number; issues: { id: number }[] }[],
  move: BoardMove,
) {
  const target = columns.find((column) => column.id === move.column);
  if (
    !target ||
    !columns.some((column) =>
      column.issues.some((issue) => issue.id === move.issue),
    )
  )
    return null;
  if (move.before === move.issue)
    return target.issues.map((issue, sorting) => ({
      issueID: issue.id,
      sorting,
    }));
  const ids = target.issues
    .filter((issue) => issue.id !== move.issue)
    .map((issue) => issue.id);
  const position = move.before === undefined ? -1 : ids.indexOf(move.before);
  ids.splice(position < 0 ? ids.length : position, 0, move.issue);
  return ids.map((issueID, sorting) => ({ issueID, sorting }));
}
