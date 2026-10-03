import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  codeTokens,
  codeLanguage,
  HighlightedText,
  HighlightedSource,
} from "./Highlight";
describe("repository syntax highlighting", () => {
  it("preserves multiline source and distinguishes comments from executable code", () => {
    const code = "/* first line\n   const fake = true */\nconst answer = 42;\n";
    const tokens = codeTokens(code, "ts");
    expect(tokens.map((t) => t.value).join("")).toBe(code);
    expect(
      tokens
        .filter((t) => t.className === "comment")
        .map((t) => t.value)
        .join(""),
    ).toContain("const fake = true");
    expect(
      tokens.some((t) => t.className === "keyword" && t.value === "const"),
    ).toBe(true);
    const html = renderToStaticMarkup(
      <HighlightedSource code={code} filename="example.ts" />,
    );
    expect(html).toContain('id="L4"');
    expect(html).toContain("th-comment");
  });
  it("renders hostile source as text without creating executable elements", () => {
    const code =
      '<script>alert("source")</script><img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(
      <HighlightedText code={code} language="html" />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;");
    expect(
      codeTokens(code, "html")
        .map((t) => t.value)
        .join(""),
    ).toBe(code);
  });
  it("keeps unsupported language content intact and maps common file names", () => {
    const code = 'fn main() { println!("hello"); }';
    expect(
      codeTokens(code, "rust")
        .map((t) => t.value)
        .join(""),
    ).toBe(code);
    expect(codeLanguage("src/app.tsx")).toBe("tsx");
    expect(codeLanguage("Dockerfile")).toBe("dockerfile");
    expect(codeLanguage(".forgejo/workflows/test.yml")).toBe("yaml");
  });
});
