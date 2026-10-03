import { describe, expect, it } from "vitest";
import { parsePullRange } from "./pullRange";

describe("parsePullRange", () => {
  it("defaults to all changes", () => {
    expect(parsePullRange(new URLSearchParams())).toEqual({ from: "", to: "" });
  });
  it("preserves a single commit", () => {
    expect(parsePullRange(new URLSearchParams("tab=changes&to=abc"))).toEqual({
      from: "",
      to: "abc",
    });
  });
  it("preserves an explicit range", () => {
    expect(parsePullRange(new URLSearchParams("from=abc&to=def"))).toEqual({
      from: "abc",
      to: "def",
    });
  });
  it("preserves a range ending at head", () => {
    expect(parsePullRange(new URLSearchParams("from=abc"))).toEqual({
      from: "abc",
      to: "",
    });
  });
  it("uses the commit prop only when to is absent", () => {
    expect(parsePullRange(new URLSearchParams(), "abc").to).toBe("abc");
    expect(parsePullRange(new URLSearchParams("to="), "abc").to).toBe("");
  });
});
