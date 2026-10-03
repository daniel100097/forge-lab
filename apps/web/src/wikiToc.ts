export function wikiTocBody(html: string) {
  return html
    .trim()
    .replace(
      /^<details\b[^>]*>\s*<summary\b[^>]*>[\s\S]*?<\/summary>([\s\S]*)<\/details>$/,
      "$1",
    );
}
