import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import {
  ansiSegments,
  groupLogs,
  type LogGroup,
  type LogLine,
} from "./pipelineLogs";

export function PipelineLogs({
  step,
  lines,
  timestamps,
  seconds,
}: {
  step: number;
  lines: LogLine[];
  timestamps: boolean;
  seconds: boolean;
}) {
  const { i18n } = useTranslation("workspace");
  useEffect(() => {
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    for (
      let parent = target.parentElement;
      parent;
      parent = parent.parentElement
    )
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    target.scrollIntoView({ block: "center" });
  }, [lines]);
  function renderLine(line: LogLine) {
    const identifier = `jobstep-${step}-${line.index}`;
    return (
      <span id={identifier} className="flex min-w-max gap-3">
        <a
          className="w-10 shrink-0 text-right text-[#aaaaaa] hover:text-white"
          href={`#${identifier}`}
        >
          {line.index}
        </a>
        {timestamps && line.timestamp !== undefined && (
          <span className="text-[#aaaaaa]">
            {new Date(line.timestamp * 1000).toLocaleString(i18n.language)}
          </span>
        )}
        {seconds && line.timestamp !== undefined && (
          <span className="text-[#aaaaaa]">
            {Math.floor(
              line.timestamp - (lines[0]?.timestamp || line.timestamp),
            )}
            s
          </span>
        )}
        <span>
          {ansiSegments(line.message).map(({ text, ...style }, index) => (
            <span key={index} style={style}>
              {text}
            </span>
          ))}
        </span>
      </span>
    );
  }
  function renderGroups(groups: LogGroup[]) {
    return groups.map((group) =>
      group.children ? (
        <details key={group.line.index} className="pl-2">
          <summary className="cursor-pointer">{renderLine(group.line)}</summary>
          {renderGroups(group.children)}
        </details>
      ) : (
        <div key={group.line.index}>{renderLine(group.line)}</div>
      ),
    );
  }
  return (
    <div className="job-log max-h-120 overflow-auto whitespace-pre bg-[#1f1e24] p-4 font-mono text-xs leading-6 text-[#ececef]">
      {renderGroups(groupLogs(lines))}
    </div>
  );
}
