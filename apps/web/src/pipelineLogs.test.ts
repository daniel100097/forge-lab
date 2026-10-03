import { describe, expect, it } from "vitest";
import { ansiSegments, groupLogs } from "./pipelineLogs";
describe("pipeline logs", () => {
  it("preserves text and handles ANSI resets without HTML", () => {
    expect(ansiSegments("<script>\u001b[31mred\u001b[0mplain")).toEqual([
      { text: "<script>" },
      { text: "red", color: "#ef6b73" },
      { text: "plain" },
    ]);
  });
  it("nests groups and tolerates unmatched endings", () => {
    const result = groupLogs(
      [
        "##[endgroup]",
        "##[group]outer",
        "##[group]inner",
        "text",
        "##[endgroup]",
        "end",
      ].map((message, index) => ({ message, index })),
    );
    expect(result[0].line.message).toBe("outer");
    expect(result[0].children?.[0].children?.[0].line.message).toBe("text");
    expect(result[0].children?.[1].line.message).toBe("end");
  });
});
