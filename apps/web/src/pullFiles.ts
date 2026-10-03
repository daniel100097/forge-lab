import { diffFileName } from "./diffRows";

export function pullChangedFiles(text: string) {
  return text
    .split(/(?=^diff --git )/m)
    .filter((patch) => patch.startsWith("diff --git "))
    .map((patch) => ({
      name: diffFileName(patch),
      deleted: /^\+\+\+ \/dev\/null$/m.test(patch),
    }));
}

export function viewedFileCount(
  files: { name: string }[],
  viewed: Record<string, string>,
  pending?: { file: string; checked: boolean },
) {
  return files.filter((file) =>
    pending?.file === file.name
      ? pending.checked
      : viewed[file.name] === "viewed",
  ).length;
}
