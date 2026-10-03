import { describe, expect, it } from "vitest";
import { milestoneLabelIDs, milestoneLabelSelection } from "./milestoneLabels";

const labels = [
  { id: 9, name: "type/bug", color: "000000", exclusive: true },
  { id: 10, name: "type/feature", color: "000000", exclusive: true },
  { id: 11, name: "priority/high", color: "000000", exclusive: true },
  { id: 12, name: "plain", color: "000000" },
];

describe("native milestone label filter selection", () => {
  it("accepts canonical positive and negative IDs", () => {
    expect(milestoneLabelIDs("9,9,-10,0,invalid,1.5")).toEqual([9, -10]);
  });
  it("combines independent labels and clears the without-label sentinel", () => {
    expect(milestoneLabelSelection("0", labels, labels[0])).toBe("9");
    expect(milestoneLabelSelection("12", labels, labels[0])).toBe("9,12");
  });
  it("toggles positive selection", () => {
    expect(milestoneLabelSelection("9,12", labels, labels[0])).toBe("12");
  });
  it("replaces positive labels in the same exclusive scope", () => {
    expect(milestoneLabelSelection("10,11,12", labels, labels[0])).toBe(
      "9,11,12",
    );
  });
  it("preserves exclusions in the same exclusive scope", () => {
    expect(milestoneLabelSelection("-10,11", labels, labels[0])).toBe(
      "-10,9,11",
    );
  });
  it("changes an excluded label to positive selection", () => {
    expect(milestoneLabelSelection("-9,12", labels, labels[0])).toBe("9,12");
  });
  it("excludes a positive label without changing other scopes", () => {
    expect(milestoneLabelSelection("9,10,12", labels, labels[0], true)).toBe(
      "-9,10,12",
    );
  });
  it("toggles exclusion off", () => {
    expect(milestoneLabelSelection("-9,12", labels, labels[0], true)).toBe(
      "12",
    );
  });
});
