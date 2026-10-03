import { describe, expect, it } from "vitest";
import { escapeMarks, escapeStatus, type EscapeTables } from "./escape";

// A small slice of Forgejo's tables: U+200B (zero width space) and U+202E
// (right-to-left override) are invisible; Cyrillic "\u0430" is confusable with "a".
const tables: EscapeTables = {
  enabled: true,
  skip: [],
  invisible: [
    [0x200b, 0x200f, 1],
    [0x202a, 0x202e, 1],
  ],
  ambiguous: [[0x430, 0x61]],
};

describe("Unicode escape marks (modules/charset/escape_stream.go)", () => {
  it("ignores plain ASCII", () => {
    expect(escapeMarks("const value = 1;\t// fine", tables)).toEqual([]);
  });
  it("marks invisible characters", () => {
    const marks = escapeMarks("zero\u200bwidth", tables);
    expect(marks).toEqual([
      { start: 4, end: 5, kind: "invisible", codePoint: 0x200b },
    ]);
  });
  it("marks ambiguous letters in mixed words only", () => {
    expect(escapeMarks("\u0430dmin", tables)).toEqual([
      {
        start: 0,
        end: 1,
        kind: "ambiguous",
        codePoint: 0x430,
        confusable: 0x61,
      },
    ]);
    // A word made only of non-ASCII letters is not escaped.
    expect(escapeMarks("\u0430\u0431\u0432", tables)).toEqual([]);
  });
  it("marks control characters and broken runes", () => {
    expect(escapeMarks("a\u202ez", tables)[0].kind).toBe("invisible");
    expect(escapeMarks("bad\ufffd", tables)[0].kind).toBe("broken");
    expect(escapeMarks("tab\u0007", tables)[0].kind).toBe("invisible");
  });
  it("summarizes the status", () => {
    const status = escapeStatus([
      escapeMarks("\u0430dmin", tables),
      escapeMarks("a\u200bb", tables),
    ]);
    expect(status).toEqual({ escaped: true, invisible: true, ambiguous: true });
  });
});
