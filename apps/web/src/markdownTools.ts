export function markdownTable(
  rows: number,
  columns: number,
  header: string,
  content: string,
) {
  if (
    !Number.isSafeInteger(rows) ||
    !Number.isSafeInteger(columns) ||
    rows < 1 ||
    columns < 1
  )
    return "";
  const width = Math.max(header.length, content.length);
  const line = (text: string) =>
    `| ${Array(columns).fill(text.padEnd(width)).join(" | ")} |\n`;
  return (
    line(header) +
    `|-${Array(columns)
      .fill("-".repeat(Math.max(3, width)))
      .join("-|-")}-|\n` +
    Array(rows).fill(line(content)).join("")
  );
}

export function indentMarkdown(
  value: string,
  start: number,
  end: number,
  outdent: boolean,
) {
  const first = value.lastIndexOf("\n", start - 1) + 1;
  const last = value.indexOf(
    "\n",
    end > start && value[end - 1] === "\n" ? end - 1 : end,
  );
  const limit = last < 0 ? value.length : last;
  const lines = value.slice(first, limit).split("\n");
  const quote = lines.every((line) => line.startsWith(">"));
  const changed = lines.map((line) =>
    quote
      ? outdent
        ? line.replace(/^>\s{0,4}>/, ">")
        : "> " + line
      : outdent
        ? line.replace(/^( {1,4}|\t|> {0,4})/, "")
        : "    " + line,
  );
  const replacement = changed.join("\n");
  const movement = changed[0].length - lines[0].length;
  return {
    value: value.slice(0, first) + replacement + value.slice(limit),
    start: Math.max(first, start + movement),
    end: Math.max(first, end + replacement.length - (limit - first)),
  };
}

export function markdownHeading(
  value: string,
  start: number,
  end: number,
  change: number,
  absolute = false,
) {
  const first = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.indexOf("\n", end);
  const limit = next < 0 ? value.length : next;
  const text = value
    .slice(first, limit)
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+/.exec(line);
      const level = absolute
        ? change
        : Math.max(1, Math.min(6, (match?.[1].length || 0) + change));
      const content = line.replace(/^#{1,6}\s+/, "");
      return absolute && match?.[1].length === level
        ? content
        : "#".repeat(level) + " " + content;
    })
    .join("\n");
  return { start: first, end: limit, text };
}

export function continueMarkdown(value: string, start: number, end: number) {
  if (start !== end) return null;
  const first = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.indexOf("\n", start);
  const line = value.slice(first, next < 0 ? value.length : next);
  const match =
    /^\s*((\d+)[.)]\s|[-*+]\s{1,4}\[[ x]\]\s?|[-*+]\s|(>\s?)+)?/.exec(line);
  let prefix = match?.[0] || "";
  if (!prefix || first + prefix.length > start) return null;
  if ((prefix.length % 2 === 1 && /^ +$/.test(prefix)) || /^\t+ $/.test(prefix))
    prefix = prefix.slice(0, -1);
  else if (prefix.length === line.length)
    return { start: first, end: first + line.length, text: "\n" };
  const number = /\d+/.exec(prefix);
  if (number) prefix = prefix.replace(number[0], String(Number(number[0]) + 1));
  return { start, end, text: "\n" + prefix.replace("[x]", "[ ]") };
}
