import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function localLinks(markdown) {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "");
  return [...prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:[a-z]+:|\/|#)/i.test(target))
    .map((target) => decodeURIComponent(target.split(/[?#]/)[0]));
}

function main() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((file) => file && existsSync(file));
  const failures = [];
  for (const file of files)
    for (const target of localLinks(readFileSync(file, "utf8")))
      if (!existsSync(resolve(dirname(file), target)))
        failures.push(`${file}: ${target}`);
  if (failures.length)
    throw new Error(`Broken local Markdown links:\n${failures.join("\n")}`);
  console.log(
    `Local Markdown file/directory links pass (${files.length} documents).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
