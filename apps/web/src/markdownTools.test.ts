import { describe, expect, it } from "vitest";
import {
  continueMarkdown,
  markdownHeading,
  indentMarkdown,
  markdownTable,
} from "./markdownTools";

describe("native markdown toolbar equivalents", () => {
  it("creates the requested table dimensions with padded cells", () => {
    const table = markdownTable(2, 3, "Header", "Cell");
    expect(table.split("\n").filter(Boolean)).toHaveLength(4);
    expect(table.split("\n")[0]).toBe("| Header | Header | Header |");
    expect(table.split("\n")[2]).toBe("| Cell   | Cell   | Cell   |");
  });
  it("rejects invalid dimensions", () => {
    expect(markdownTable(0, 2, "H", "C")).toBe("");
    expect(markdownTable(2, NaN, "H", "C")).toBe("");
    expect(markdownTable(1.5, 2, "H", "C")).toBe("");
  });
  it("indents selected lines without changing adjacent lines", () => {
    const result = indentMarkdown("before\nfirst\nsecond\nafter", 7, 20, false);
    expect(result.value).toBe("before\n    first\n    second\nafter");
  });
  it("removes spaces, tabs and quote indentation like native", () => {
    expect(
      indentMarkdown("    first\n\tsecond\n> third", 0, 26, true).value,
    ).toBe("first\nsecond\nthird");
  });
  it("nests quote selections instead of converting them to code", () => {
    expect(indentMarkdown("> first\n> second", 0, 16, false).value).toBe(
      "> > first\n> > second",
    );
    expect(indentMarkdown("> > first", 0, 9, true).value).toBe("> first");
  });
  it("preserves a collapsed caret when indenting", () => {
    expect(indentMarkdown("first", 3, 3, false)).toEqual({
      value: "    first",
      start: 7,
      end: 7,
    });
  });
  it("adjusts heading levels without leaving old markers", () => {
    expect(markdownHeading("## first\nnext", 2, 2, -1)).toEqual({
      start: 0,
      end: 8,
      text: "# first",
    });
    expect(markdownHeading("###### first", 0, 12, 1).text).toBe("###### first");
  });
  it("sets heading levels and toggles the same heading back to plain text", () => {
    expect(markdownHeading("### first", 0, 9, 1, true).text).toBe("# first");
    expect(markdownHeading("## first", 0, 8, 2, true).text).toBe("first");
  });
  it("continues numbered lists and resets checked tasks", () => {
    expect(continueMarkdown("9. first", 8, 8)?.text).toBe("\n10. ");
    expect(continueMarkdown("- [x] first", 11, 11)?.text).toBe("\n- [ ] ");
    expect(continueMarkdown("> first", 7, 7)?.text).toBe("\n> ");
  });
  it("ends empty lists and leaves plain text and selections to the browser", () => {
    expect(continueMarkdown("- ", 2, 2)).toEqual({
      start: 0,
      end: 2,
      text: "\n",
    });
    expect(continueMarkdown("plain", 5, 5)).toBeNull();
    expect(continueMarkdown("- first", 2, 7)).toBeNull();
  });
});
