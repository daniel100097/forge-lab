import { describe, expect, it } from "vitest";
import { wikiTocBody } from "./wikiToc";

describe("native wiki table of contents", () => {
  it("preserves native links while removing the native disclosure label", () => {
    const body = '<ul><li><a href="#heading">Heading</a></li></ul>';
    expect(
      wikiTocBody(
        `<details open><summary>Table of contents</summary>${body}</details>\n`,
      ),
    ).toBe(body);
    expect(
      wikiTocBody(
        `<details><summary>Inhaltsverzeichnis</summary>${body}</details>`,
      ),
    ).toBe(body);
  });
  it("preserves already unwrapped contents", () => {
    expect(wikiTocBody("<ul><li>Heading</li></ul>")).toBe(
      "<ul><li>Heading</li></ul>",
    );
  });
});
