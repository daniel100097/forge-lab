import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { get, type Tree } from "./api";

export function FileIcon({
  name,
  folder = false,
}: {
  name: string;
  folder?: boolean;
}) {
  if (folder) return <Folder size={16} />;
  if (/^\.git/.test(name))
    return <GitBranch size={16} className="text-[#d54b27]!" />;
  if (/\.json$/i.test(name))
    return <FileJson2 size={16} className="text-[#a66a00]!" />;
  if (/\.(md|markdown)$/i.test(name))
    return <FileText size={16} className="text-[#1f75cb]!" />;
  if (/\.(tsx?|jsx?|go|rs|py|css|html|sh)$/i.test(name))
    return <FileCode2 size={16} className="text-[#1f75cb]!" />;
  if (/\.ya?ml$/i.test(name))
    return <FileCode2 size={16} className="text-[#d8425b]!" />;
  return <File size={16} />;
}

interface FileTreeProps {
  dataPath: string;
  path: string;
  revision: string;
  selected: string;
  filter: string;
  onSelect: (path: string) => void;
  directory?: string;
  depth?: number;
}

export function FileTree({
  directory = "",
  depth = 0,
  ...props
}: FileTreeProps) {
  const { t } = useTranslation("repository");
  const tree = useQuery({
    queryKey: ["tree", props.path, props.revision, directory],
    queryFn: ({ signal }) =>
      get<Tree>(
        `${props.dataPath}/tree?${new URLSearchParams({ ref: props.revision, path: directory })}`,
        signal,
      ),
  });
  if (tree.isPending)
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
        <LoaderCircle size={14} className="animate-spin" /> {t("files.loading")}
      </div>
    );
  if (tree.error)
    return (
      <button
        className="flex items-center gap-2 px-3 py-2 text-xs text-primary"
        onClick={() => void tree.refetch()}
      >
        {t("files.retry")}
      </button>
    );
  return (
    <ul className="m-0 list-none p-0">
      {tree.data.entries
        ?.filter(
          (entry) =>
            entry.type === "tree" ||
            entry.name.toLowerCase().includes(props.filter.toLowerCase()),
        )
        .map((entry) => (
          <FileTreeRow
            key={entry.path}
            {...props}
            directory={directory}
            depth={depth}
            entry={entry as TreeEntry}
          />
        ))}
    </ul>
  );
}

type TreeEntry = NonNullable<Tree["entries"]>[number] & {
  symlink?: boolean;
  submodule?: { url: string; commit: string };
};

function FileTreeRow({
  entry,
  depth = 0,
  ...props
}: FileTreeProps & { entry: TreeEntry }) {
  const { t } = useTranslation("repository");
  const isFolder = entry.type === "tree";
  const containsSelection =
    props.selected.startsWith(entry.path + "/") ||
    props.selected === entry.path;
  const [expanded, setExpanded] = useState(containsSelection);
  useEffect(() => {
    if (containsSelection) setExpanded(true);
  }, [containsSelection]);
  return (
    <li>
      <div
        className={
          props.selected === entry.path
            ? "flex h-8 min-w-0 items-center rounded-lg bg-hover font-semibold [transition:background-color_100ms_ease,border-color_100ms_ease,color_100ms_ease] hover:bg-hover dark:text-ink"
            : "flex h-8 min-w-0 items-center rounded-lg [transition:background-color_100ms_ease,border-color_100ms_ease,color_100ms_ease] hover:bg-hover"
        }
        style={{ paddingLeft: depth * 16 }}
      >
        {isFolder ? (
          <button
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded text-muted"
            aria-label={t(
              expanded ? "files.collapseFolder" : "files.expandFolder",
              { name: entry.name },
            )}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded text-muted" />
        )}
        {entry.submodule ? (
          <a
            className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg pr-2 text-left text-sm [&_svg]:shrink-0 [&_svg]:text-muted"
            href={
              entry.submodule.url
                ? `${entry.submodule.url}/commit/${entry.submodule.commit}`
                : undefined
            }
            target="_blank"
            rel="noopener noreferrer"
            title={entry.submodule.url}
          >
            <FolderGit2 size={16} />
            <span className="truncate">{entry.name}</span>
          </a>
        ) : (
          <button
            className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg pr-2 text-left text-sm [&_svg]:shrink-0 [&_svg]:text-muted"
            aria-current={props.selected === entry.path ? "page" : undefined}
            onClick={() => props.onSelect(entry.path)}
          >
            {entry.symlink ? (
              <Link2 size={16} />
            ) : (
              <FileIcon name={entry.name} folder={isFolder} />
            )}
            <span className="truncate">{entry.name}</span>
          </button>
        )}
      </div>
      {isFolder && expanded && (
        <FileTree {...props} directory={entry.path} depth={depth + 1} />
      )}
    </li>
  );
}
