import { describe, expect, it } from "vitest";
import { discussionCommentID } from "./discussionAnchor";

describe("discussion anchors", () => {
  it("resolves comment, event and thread identifiers", () => {
    for (const prefix of ["issuecomment", "event", "discussion"])
      expect(discussionCommentID(`#${prefix}-123`)).toBe("123");
  });
  it("ignores markup anchors and malformed identifiers", () => {
    for (const hash of [
      "",
      "#summary",
      "#issuecomment-0",
      "#issuecomment--1",
      "#issuecomment-12?x",
      "#issuecomment-1/2",
    ])
      expect(discussionCommentID(hash)).toBe("");
  });
});
