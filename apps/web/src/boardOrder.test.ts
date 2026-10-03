import { describe, expect, it } from "vitest";
import { orderedBoardIssues } from "./boardOrder";

const columns = [
  { id: 1, issues: [{ id: 11 }, { id: 12 }, { id: 13 }] },
  { id: 2, issues: [{ id: 21 }, { id: 22 }] },
];
const ids = (order: ReturnType<typeof orderedBoardIssues>) =>
  order?.map((issue) => issue.issueID);

describe("native board card ordering", () => {
  it("moves within a column before a specified card", () => {
    expect(
      ids(orderedBoardIssues(columns, { issue: 13, column: 1, before: 11 })),
    ).toEqual([13, 11, 12]);
  });
  it("moves across columns without losing existing target cards", () => {
    expect(
      orderedBoardIssues(columns, { issue: 12, column: 2, before: 22 }),
    ).toEqual([
      { issueID: 21, sorting: 0 },
      { issueID: 12, sorting: 1 },
      { issueID: 22, sorting: 2 },
    ]);
  });
  it("appends at the end of a column", () => {
    expect(ids(orderedBoardIssues(columns, { issue: 11, column: 1 }))).toEqual([
      12, 13, 11,
    ]);
  });
  it("does not move a card when dropped on itself", () => {
    expect(
      ids(orderedBoardIssues(columns, { issue: 12, column: 1, before: 12 })),
    ).toEqual([11, 12, 13]);
  });
  it("retains hidden cards when a filtered visible card is reordered", () => {
    expect(
      ids(orderedBoardIssues(columns, { issue: 13, column: 1, before: 12 })),
    ).toEqual([11, 13, 12]);
  });
  it("rejects unknown cards or columns", () => {
    expect(orderedBoardIssues(columns, { issue: 99, column: 1 })).toBeNull();
    expect(orderedBoardIssues(columns, { issue: 11, column: 99 })).toBeNull();
  });
  it("does not mutate the cached column data", () => {
    orderedBoardIssues(columns, { issue: 11, column: 1 });
    expect(columns[0].issues.map((issue) => issue.id)).toEqual([11, 12, 13]);
  });
});
