import { describe, expect, it } from "vitest";
import {
  timelineDate,
  timelineDeadline,
  timelineDuration,
} from "./timelineFormat";

describe("timeline formatting", () => {
  it("formats legacy Unix dates and ISO dates", () => {
    expect(timelineDate("1767225600", "de")).toBe("1.1.2026");
    expect(timelineDate("2026-01-01", "en-US")).toBe("1/1/2026");
  });
  it("preserves legacy non-date explanations", () => {
    expect(timelineDate("unknown", "en")).toBe("unknown");
  });
  it("shows native deadline changes in chronological from/to order", () => {
    expect(timelineDeadline("2026-10-01|2026-09-01", 17, "en-US")).toBe(
      "9/1/2026 → 10/1/2026",
    );
    expect(timelineDeadline("2026-10-01|2026-09-01", 17, "de")).toBe(
      "1.9.2026 → 1.10.2026",
    );
    expect(timelineDeadline("2026-09-01", 18, "de")).toBe("1.9.2026");
  });
  it("formats time seconds without exposing raw values", () => {
    expect(timelineDuration("3723")).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 3,
    });
    expect(timelineDuration("-60")).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 0,
    });
    expect(timelineDuration("|3661")).toEqual({
      hours: 1,
      minutes: 1,
      seconds: 1,
    });
    expect(timelineDuration("|-60")).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 0,
    });
    expect(timelineDuration("legacy text")).toBeNull();
  });
});
