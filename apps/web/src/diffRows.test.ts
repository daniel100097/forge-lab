import { describe, expect, it } from "vitest";
import { diffFileName, diffRows } from "./diffRows";
describe("Git diff line positions", () => {
  const input = [
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -4,3 +4,4 @@",
    " before",
    "-old",
    "+new",
    "+extra",
    " after",
    "",
  ];
  it("keeps independent line counters in unified view", () => {
    expect(
      diffRows(input, false)
        .slice(1)
        .map((row) => [row.kind, row.before, row.after]),
    ).toEqual([
      ["context", 4, 4],
      ["removed", 5, undefined],
      ["added", undefined, 5],
      ["added", undefined, 6],
      ["context", 6, 7],
    ]);
  });
  it("aligns replacements without losing comment positions", () => {
    expect(
      diffRows(input, true)
        .slice(1)
        .map((row) => [
          row.kind,
          row.before,
          row.after,
          row.oldText,
          row.newText,
        ]),
    ).toEqual([
      ["context", 4, 4, "before", "before"],
      ["changed", 5, 5, "old", "new"],
      ["added", undefined, 6, undefined, "extra"],
      ["context", 6, 7, "after", "after"],
    ]);
  });
  it("does not merge deleted blocks across separate hunks", () => {
    const rows = diffRows(
      ["@@ -1 +0,0 @@", "-removed", "@@ -8,0 +8 @@", "+added"],
      true,
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "meta",
      "removed",
      "meta",
      "added",
    ]);
  });
});

it("preserves quoted Git paths for review comment placement", () => {
  expect(
    diffFileName(
      'diff --git "a/a\\tb.txt" "b/a\\tb.txt"\n--- "a/a\\tb.txt"\n+++ "b/a\\tb.txt"\n@@ -1 +1 @@\n-old\n+new\n',
    ),
  ).toBe("a\tb.txt");
  expect(
    diffFileName(
      "diff --git a/deleted.txt b/deleted.txt\ndeleted file mode 100644\n--- a/deleted.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n",
    ),
  ).toBe("deleted.txt");
});

it("retains content that resembles file headers and advances both line counters", () => {
  const rows = diffRows(
    [
      "--- a/test.txt",
      "+++ b/test.txt",
      "@@ -4,2 +4,2 @@",
      "--- deleted source",
      "+++ added source",
      " tail",
    ],
    false,
  );
  expect(
    rows.slice(1).map((row) => [row.kind, row.before, row.after, row.text]),
  ).toEqual([
    ["removed", 4, undefined, "-- deleted source"],
    ["added", undefined, 4, "++ added source"],
    ["context", 5, 5, "tail"],
  ]);
});
