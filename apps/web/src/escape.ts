// Forgejo marks invisible and ambiguous Unicode characters in code, blame and
// diffs (modules/charset/escape_stream.go). The SPA renders code itself, so it
// applies the same rules with the tables Forgejo uses for the viewer's locale.

export interface EscapeTables {
  enabled: boolean;
  skip: string[] | null;
  invisible: [number, number, number][];
  ambiguous: [number, number][];
}
export type EscapeContext = "file-view" | "diff" | "wiki";
export interface EscapeMark {
  /** UTF-16 offsets within the line. */
  start: number;
  end: number;
  kind: "invisible" | "ambiguous" | "broken";
  codePoint: number;
  confusable?: number;
}
export interface EscapeStatus {
  escaped: boolean;
  invisible: boolean;
  ambiguous: boolean;
}

interface Prepared {
  invisible: Set<number>;
  ambiguous: Map<number, number>;
}
const prepared = new WeakMap<EscapeTables, Prepared>();
function prepare(tables: EscapeTables): Prepared {
  let result = prepared.get(tables);
  if (!result) {
    const invisible = new Set<number>();
    for (const [lo, hi, stride] of tables.invisible)
      for (let value = lo; value <= hi; value += Math.max(1, stride))
        invisible.add(value);
    result = { invisible, ambiguous: new Map(tables.ambiguous) };
    prepared.set(tables, result);
  }
  return result;
}

// VS Code's default word pattern as used by Forgejo (Go's \s, \d and \w are
// ASCII only, so they are spelled out).
const word =
  /(-?[0-9]*\.[0-9][0-9A-Za-z_]*)|([^`~!@#$%^&*()\-=+[{\]}\\|;:'",.<>/?\t\n\f\r \x00-\x1f]+)/gu;

const Type = {
  Basic: 0,
  Broken: 1,
  NonBasic: 2,
  Ambiguous: 3,
  Invisible: 4,
} as const;
type Type = (typeof Type)[keyof typeof Type];
function classify(code: number, tables: Prepared): Type {
  if (code === 0xfffd || (code >= 0xd800 && code <= 0xdfff)) return Type.Broken;
  if (code === 0x20 || code === 0x09 || code === 0x0a) return Type.Basic;
  if (tables.invisible.has(code)) return Type.Invisible;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return Type.Invisible;
  if (tables.ambiguous.has(code)) return Type.Ambiguous;
  if (code > 0x7e || code < 0x20) return Type.NonBasic;
  return Type.Basic;
}

/** Characters Forgejo would escape in one line of text. */
export function escapeMarks(line: string, tables: EscapeTables): EscapeMark[] {
  // Fast path: plain ASCII text never needs escaping.
  if (!/[^\x20-\x7e\t]/.test(line)) return [];
  const table = prepare(tables);
  const marks: EscapeMark[] = [];
  const push = (index: number, code: number, type: Type) => {
    const end = index + (code > 0xffff ? 2 : 1);
    if (type === Type.Ambiguous)
      marks.push({
        start: index,
        end,
        kind: "ambiguous",
        codePoint: code,
        confusable: table.ambiguous.get(code),
      });
    else if (type === Type.Invisible)
      marks.push({ start: index, end, kind: "invisible", codePoint: code });
    else if (type === Type.Broken)
      marks.push({ start: index, end, kind: "broken", codePoint: code });
  };
  let position = line.startsWith("\ufeff") ? 1 : 0;
  while (position < line.length) {
    word.lastIndex = position;
    const match = word.exec(line);
    const until = match ? match.index : line.length;
    const next = match ? match.index + Math.max(1, match[0].length) : until;
    for (let index = position; index < until;) {
      const code = line.codePointAt(index)!;
      push(index, code, classify(code, table));
      index += code > 0xffff ? 2 : 1;
    }
    if (next > until) {
      const runes: [number, number, Type][] = [];
      let basic = 0,
        plain = 0,
        ambiguous = 0,
        invisible = 0,
        broken = 0;
      for (let index = until; index < next;) {
        const code = line.codePointAt(index)!;
        const type = classify(code, table);
        runes.push([index, code, type]);
        if (type === Type.Basic) basic++;
        else if (type === Type.NonBasic) plain++;
        else if (type === Type.Ambiguous) ambiguous++;
        else if (type === Type.Invisible) invisible++;
        else broken++;
        index += code > 0xffff ? 2 : 1;
      }
      // A word made only of non-ASCII letters (e.g. Cyrillic) is fine; mixed
      // words and broken runes are escaped.
      const needsEscape =
        broken > 0 ||
        (!(basic === 0 && plain > 0) && (ambiguous > 0 || invisible > 0));
      if (needsEscape)
        for (const [index, code, type] of runes) push(index, code, type);
    }
    position = Math.max(next, position + 1);
  }
  return marks;
}

export function escapeStatus(marks: EscapeMark[][]): EscapeStatus {
  let invisible = false,
    ambiguous = false;
  for (const line of marks)
    for (const mark of line) {
      if (mark.kind === "ambiguous") ambiguous = true;
      else invisible = true;
    }
  return { escaped: invisible || ambiguous, invisible, ambiguous };
}

export const codePointLabel = (code: number) =>
  `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
