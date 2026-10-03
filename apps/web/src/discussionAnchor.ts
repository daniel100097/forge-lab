export function discussionCommentID(hash: string) {
  return (
    /^#(?:issuecomment|event|discussion)-([1-9]\d*)$/.exec(hash)?.[1] || ""
  );
}
