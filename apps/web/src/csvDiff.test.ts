import { describe, expect, it } from "vitest";
import { parseCSV, mediaDiffKind } from "./csvDiff";

describe("CSV diffs", () => {
  it("handles quotes, commas, escaped quotes and embedded newlines", () => {
    expect(parseCSV('a,"b,c"\r\n"d""e","f\ng"\n')).toEqual([
      ["a", "b,c"],
      ['d"e', "f\ng"],
    ]);
  });
  it("handles empty values and empty files", () => {
    expect(parseCSV("a,,\n")).toEqual([["a", "", ""]]);
    expect(parseCSV("")).toEqual([]);
    expect(parseCSV('""')).toEqual([[""]]);
    expect(parseCSV('""\n')).toEqual([[""]]);
  });
  it("rejects incomplete quoted fields", () => {
    expect(() => parseCSV('"bad')).toThrow();
  });
  it("recognizes supported image and CSV extensions", () => {
    expect(mediaDiffKind("image.PNG")).toBe("image");
    expect(mediaDiffKind("data.csv")).toBe("csv");
    expect(mediaDiffKind("script.ts")).toBeNull();
  });
});
