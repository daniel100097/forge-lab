import { describe, expect, it } from "vitest";
import { wikiPath } from "./wikiPath";

describe("native wiki web paths", () => {
  it.each([
    "Home-Page",
    "zz-test-Guide+with+spaces.-",
    "zz-test-100%25+%2B+%3F.-",
    "zz-test-nested%2Ftitle.-",
    "zz-test-literal%252Ftitle.-",
  ])("preserves canonical native escapes: %s", (page) => {
    expect(wikiPath(page)).toBe(page);
  });

  it("encodes raw query and fragment delimiters", () => {
    expect(wikiPath("zz-test-page?redirect=x#fragment")).toBe(
      "zz-test-page%3Fredirect%3Dx%23fragment",
    );
  });
});
