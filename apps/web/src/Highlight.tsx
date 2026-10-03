import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  createHighlighter,
  type HighlightToken,
} from "@tanstack/highlight/core";
import * as languages from "@tanstack/highlight/languages";
import "./highlight.css";

// Explicit registry: unsupported languages retain their original plain text.
const highlighter = createHighlighter({
  languages: Object.values(languages),
  fallbackLanguage: "plaintext",
});
export function codeLanguage(filename: string) {
  const name = filename.split("/").at(-1)?.toLowerCase() || "";
  if (name === "dockerfile" || name.startsWith("dockerfile."))
    return "dockerfile";
  if (name === ".env" || name.startsWith(".env.")) return "env";
  const extension = name.split(".").at(-1) || "";
  return (
    (
      {
        mjs: "js",
        cjs: "js",
        mts: "ts",
        cts: "ts",
        yml: "yaml",
        md: "markdown",
        sh: "shell",
        bash: "shell",
        zsh: "shell",
        py: "python",
        htm: "html",
        svg: "html",
      } as Record<string, string>
    )[extension] || extension
  );
}
export function codeTokens(code: string, language: string) {
  return highlighter.tokenize(code, { lang: language }).tokens;
}
function Tokens({ tokens }: { tokens: HighlightToken[] }) {
  return (
    <>
      {tokens.map((token, i) =>
        token.className ? (
          <span className={`th-${token.className}`} key={i}>
            {token.value}
          </span>
        ) : (
          token.value
        ),
      )}
    </>
  );
}
export function HighlightedText({
  code,
  filename,
  language,
}: {
  code: string;
  filename?: string;
  language?: string;
}) {
  const tokens = useMemo(
    () => codeTokens(code, language || codeLanguage(filename || "")),
    [code, filename, language],
  );
  return <Tokens tokens={tokens} />;
}
export function HighlightedSource({
  code,
  filename,
}: {
  code: string;
  filename: string;
}) {
  const { t } = useTranslation("common");
  const lines = useMemo(() => {
    const result: HighlightToken[][] = [[]];
    for (const token of codeTokens(code, codeLanguage(filename))) {
      const parts = token.value.split("\n");
      parts.forEach((value, index) => {
        if (index) result.push([]);
        if (value) result.at(-1)!.push({ ...token, value });
      });
    }
    return result;
  }, [code, filename]);
  return (
    <div className="source-code overflow-auto py-3 text-[13px] leading-6 [tab-size:4]">
      {lines.map((tokens, i) => (
        <div
          className="source-line flex w-max min-w-full target:scroll-mt-[100px] target:bg-info-bg"
          id={`L${i + 1}`}
          key={i}
        >
          <a
            href={`#L${i + 1}`}
            className="source-line-number"
            aria-label={t("code.line", { number: i + 1 })}
          >
            {i + 1}
          </a>
          <code className="pr-4 whitespace-pre">
            {tokens.length ? <Tokens tokens={tokens} /> : " "}
          </code>
        </div>
      ))}
    </div>
  );
}
