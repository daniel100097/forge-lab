import { describe, expect, it } from "vitest";
import { pullChangedFiles, viewedFileCount } from "./pullFiles";

const patch =
  "diff --git a/src/old.ts b/src/old.ts\ndeleted file mode 100644\n--- a/src/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\ndiff --git a/src/new.ts b/src/new.ts\n--- a/src/new.ts\n+++ b/src/new.ts\n@@ -1 +1 @@\n-old\n+new\n";

describe("pull changed files", () => {
  it("matches diff names and recognizes deleted files", () => {
    expect(pullChangedFiles(patch)).toEqual([
      { name: "src/old.ts", deleted: true },
      { name: "src/new.ts", deleted: false },
    ]);
  });
  it("counts only viewed files in the selected diff, not stale or unrelated files", () => {
    expect(
      viewedFileCount(pullChangedFiles(patch), {
        "src/old.ts": "has-changed",
        "src/new.ts": "viewed",
        unrelated: "viewed",
      }),
    ).toBe(1);
  });
  it("includes the optimistic checkbox state", () => {
    const files = pullChangedFiles(patch);
    expect(
      viewedFileCount(
        files,
        { "src/new.ts": "viewed" },
        { file: "src/old.ts", checked: true },
      ),
    ).toBe(2);
    expect(
      viewedFileCount(
        files,
        { "src/new.ts": "viewed" },
        { file: "src/new.ts", checked: false },
      ),
    ).toBe(0);
  });
});
