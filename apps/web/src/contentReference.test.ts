import { describe, expect, it } from "vitest";
import { referenceIssueBody } from "./contentReference";

describe("reference issue prefill", () => {
  it("keeps a native-parsable issue reference and description anchor", () => {
    expect(
      referenceIssueBody(
        "/studio/zz-test-p3/issues/2#issue-42",
        "description",
        "http://localhost:5173",
      ),
    ).toBe(
      "studio/zz-test-p3#2\nhttp://localhost:5173/studio/zz-test-p3/issues/2#issue-42\n\n> description",
    );
  });

  it("uses the native pull-request reference syntax", () => {
    expect(
      referenceIssueBody(
        "/studio/zz-test-p3/pulls/4#issuecomment-81",
        "review",
        "https://forgejo.example",
      ),
    ).toMatch(/^studio\/zz-test-p3!4\n/);
  });

  it("handles deployment subpaths and encoded repository names", () => {
    expect(
      referenceIssueBody(
        "/forgejo/studio/zz-test-%C3%BCber/issues/3#issuecomment-12",
        "comment",
        "https://forgejo.example",
      ),
    ).toContain("studio/zz-test-über#3\n");
  });

  it("quotes every source line", () => {
    expect(
      referenceIssueBody(
        "/studio/zz-test-p3/issues/1",
        "first\n\nlast",
        "https://forgejo.example",
      ),
    ).toMatch(/> first\n> \n> last$/);
  });

  it("preserves unknown absolute destinations as a fallback", () => {
    expect(
      referenceIssueBody(
        "https://forgejo.example/other",
        "body",
        "https://ui.example",
      ),
    ).toBe("https://forgejo.example/other\n\n> body");
  });
});
