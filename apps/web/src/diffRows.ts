import { parsePatch } from "diff";

export interface DiffRow {
  kind: "meta" | "added" | "removed" | "context" | "changed";
  before?: number;
  after?: number;
  text: string;
  prefix?: string;
  oldText?: string;
  newText?: string;
  oldKind?: "added" | "removed" | "context";
  newKind?: "added" | "removed" | "context";
}

// Preserve Git line positions while pairing replacement blocks for split view.
export function diffRows(lines: string[], parallel: boolean): DiffRow[] {
  const rows: DiffRow[] = [];
  let before = 0,
    after = 0,
    inHunk = false;
  for (const [index, line] of lines.entries()) {
    if (
      (!inHunk && /^(index |--- |\+\+\+ )/.test(line)) ||
      (index === lines.length - 1 && !line)
    )
      continue;
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      inHunk = true;
      before = Number(hunk[1]);
      after = Number(hunk[2]);
    }
    const meta =
      !!hunk ||
      /^(new file|deleted file|old mode|new mode|similarity |rename |Binary |\\)/.test(
        line,
      ) ||
      (!before && !after);
    const kind = meta
      ? "meta"
      : line.startsWith("+")
        ? "added"
        : line.startsWith("-")
          ? "removed"
          : "context";
    const oldLine = !meta && kind !== "added" ? before++ : undefined;
    const newLine = !meta && kind !== "removed" ? after++ : undefined;
    const content = meta ? line : line.slice(1);
    rows.push({
      kind,
      before: oldLine,
      after: newLine,
      text: content,
      prefix: meta ? undefined : line[0],
      oldText: oldLine !== undefined || meta ? content : undefined,
      newText: newLine !== undefined || meta ? content : undefined,
      oldKind: kind === "removed" ? "removed" : "context",
      newKind: kind === "added" ? "added" : "context",
    });
  }
  if (!parallel) return rows;
  const paired: DiffRow[] = [];
  for (let index = 0; index < rows.length;) {
    if (rows[index].kind !== "removed") {
      paired.push(rows[index++]);
      continue;
    }
    const removed: DiffRow[] = [],
      added: DiffRow[] = [];
    while (rows[index]?.kind === "removed") removed.push(rows[index++]);
    while (rows[index]?.kind === "added") added.push(rows[index++]);
    for (let n = 0; n < Math.max(removed.length, added.length); n++) {
      const left = removed[n],
        right = added[n];
      paired.push({
        kind: left && right ? "changed" : left ? "removed" : "added",
        before: left?.before,
        after: right?.after,
        text: "",
        oldText: left?.text,
        newText: right?.text,
        oldKind: left ? "removed" : "context",
        newKind: right ? "added" : "context",
      });
    }
  }
  return paired;
}

export function diffFileName(patch: string): string {
  try {
    const parsed = parsePatch(patch)[0];
    const filename =
      parsed?.newFileName === "/dev/null"
        ? parsed.oldFileName
        : parsed?.newFileName;
    if (filename) return filename.replace(/^[ab]\//, "");
  } catch {
    /* Preserve malformed native metadata for inspection. */
  }
  return patch.split("\n")[0].replace(/^diff --git a\/.* b\//, "");
}

export interface DiffHunk {
  /** Index of the hunk header in the rows of the file. */
  row: number;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/** Hunk headers of a file's rows (as produced by diffRows). */
export function diffHunks(rows: DiffRow[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  rows.forEach((row, index) => {
    if (row.kind !== "meta") return;
    const match = (row.text || row.oldText || "").match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    );
    if (match)
      hunks.push({
        row: index,
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      });
  });
  return hunks;
}

/** Full blob IDs from the "index" line of a file diff (git diff --full-index). */
export function diffBlobs(lines: string[]) {
  for (const line of lines) {
    if (line.startsWith("@@")) break;
    const match = line.match(/^index ([0-9a-f]+)\.\.([0-9a-f]+)/);
    if (match) {
      const full = (id: string) =>
        (id.length === 40 || id.length === 64) && !/^0+$/.test(id)
          ? id
          : undefined;
      return { before: full(match[1]), after: full(match[2]) };
    }
  }
  return {};
}

/** Context rows for unchanged lines between hunks (native blob_excerpt). */
export function contextRows(
  source: string[],
  fromNew: number,
  toNew: number,
  offset: number,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let line = fromNew; line <= toNew && line <= source.length; line++) {
    const text = source[line - 1] ?? "";
    rows.push({
      kind: "context",
      before: line + offset,
      after: line,
      text,
      prefix: " ",
      oldText: text,
      newText: text,
      oldKind: "context",
      newKind: "context",
    });
  }
  return rows;
}
