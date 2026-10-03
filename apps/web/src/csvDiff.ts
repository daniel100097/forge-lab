export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    rowStarted = false;
  for (let position = 0; position < text.length; position++) {
    const character = text[position];
    rowStarted = true;
    if (character === '"') {
      if (quoted && text[position + 1] === '"') {
        field += '"';
        position++;
      } else quoted = !quoted;
    } else if (
      !quoted &&
      (character === "," || character === "\n" || character === "\r")
    ) {
      row.push(field);
      field = "";
      if (character !== ",") {
        rows.push(row);
        row = [];
        rowStarted = false;
        if (character === "\r" && text[position + 1] === "\n") position++;
      }
    } else field += character;
  }
  if (quoted) throw new Error("Unterminated CSV field");
  if (rowStarted || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function mediaDiffKind(name: string) {
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(name)) return "image";
  if (/\.csv$/i.test(name)) return "csv";
  return null;
}
