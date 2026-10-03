export interface LogLine {
  index: number;
  message: string;
  timestamp?: number;
}
export interface LogGroup {
  line: LogLine;
  children?: LogGroup[];
}
export function groupLogs(lines: LogLine[]): LogGroup[] {
  const roots: LogGroup[] = [];
  const stack = [roots];
  for (const line of lines) {
    if (line.message.startsWith("##[endgroup]")) {
      if (stack.length > 1) stack.pop();
    } else if (line.message.startsWith("##[group]")) {
      const group: LogGroup = {
        line: { ...line, message: line.message.slice(9) },
        children: [],
      };
      stack.at(-1)!.push(group);
      stack.push(group.children!);
    } else stack.at(-1)!.push({ line });
  }
  return roots;
}
export function ansiSegments(message: string) {
  const colors = [
    "#444444",
    "#ef6b73",
    "#73d391",
    "#e5c66b",
    "#7aa9ef",
    "#cb91e9",
    "#75ced5",
    "#eeeeee",
    "#999999",
    "#ff8991",
    "#a3efa5",
    "#fce88b",
    "#a0c6ff",
    "#e2b6ff",
    "#a6eef5",
    "#ffffff",
  ];
  const segments: {
    text: string;
    color?: string;
    backgroundColor?: string;
    fontWeight?: number;
    fontStyle?: string;
    textDecoration?: string;
  }[] = [];
  let style: Omit<(typeof segments)[number], "text"> = {};
  let cursor = 0;
  for (const match of message.matchAll(/\u001b\[([\d;]*)m/g)) {
    if (match.index > cursor)
      segments.push({ text: message.slice(cursor, match.index), ...style });
    const codes = (match[1] || "0").split(";").map(Number);
    for (let codeIndex = 0; codeIndex < codes.length; codeIndex++) {
      const code = codes[codeIndex];
      if (code === 38 || code === 48) {
        let color: string | undefined;
        if (codes[codeIndex + 1] === 2 && codes.length > codeIndex + 4) {
          const channels = codes
            .slice(codeIndex + 2, codeIndex + 5)
            .map((value) => Math.max(0, Math.min(255, value)));
          color = `rgb(${channels.join(",")})`;
          codeIndex += 4;
        } else if (codes[codeIndex + 1] === 5 && codes.length > codeIndex + 2) {
          const palette = Math.max(0, Math.min(255, codes[codeIndex + 2]));
          if (palette < 16) color = colors[palette];
          else if (palette > 231)
            color = `rgb(${Array(3)
              .fill((palette - 232) * 10 + 8)
              .join(",")})`;
          else {
            const cube = palette - 16;
            const channel = (value: number) =>
              value === 0 ? 0 : 55 + value * 40;
            color = `rgb(${[Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6].map(channel).join(",")})`;
          }
          codeIndex += 2;
        }
        if (color) {
          if (code === 38) style.color = color;
          else style.backgroundColor = color;
        }
      } else if (code === 0) style = {};
      else if (code === 1) style.fontWeight = 700;
      else if (code === 3) style.fontStyle = "italic";
      else if (code === 4) style.textDecoration = "underline";
      else if (code === 22) delete style.fontWeight;
      else if (code === 23) delete style.fontStyle;
      else if (code === 24) delete style.textDecoration;
      else if (code === 39) delete style.color;
      else if (code === 49) delete style.backgroundColor;
      else if (code >= 30 && code <= 37) style.color = colors[code - 30];
      else if (code >= 90 && code <= 97) style.color = colors[code - 90 + 8];
      else if (code >= 40 && code <= 47)
        style.backgroundColor = colors[code - 40];
      else if (code >= 100 && code <= 107)
        style.backgroundColor = colors[code - 100 + 8];
    }
    cursor = match.index + match[0].length;
  }
  segments.push({
    text: message.slice(cursor).replace(/\u001b\[[\d;?]*[A-Za-z]/g, ""),
    ...style,
  });
  return segments;
}
