export interface MergeStyle {
  name: string;
  title: string;
  message: string;
  has_message: boolean;
  can_merge: boolean;
  can_schedule: boolean;
}

export interface MergeMetadata {
  allowed: boolean;
  form_available: boolean;
  styles: MergeStyle[];
  default_style: string;
  can_force: boolean;
  branch_deletable: boolean;
  default_delete_branch: boolean;
  instructions: Record<string, string>;
  show_merge_instructions: boolean;
  autodetect_manual_merge: boolean;
  default_title: string;
  default_message: string;
}

export function selectedMergeStyle(metadata: MergeMetadata, selection: string) {
  return (
    metadata.styles.find((style) => style.name === selection) ||
    metadata.styles.find((style) => style.name === metadata.default_style) ||
    metadata.styles[0]
  );
}

export function mergeFormFields({
  style,
  head,
  title,
  message,
  commit,
  deleteBranch,
  force,
  schedule,
  metadata,
}: {
  style: MergeStyle;
  head: string;
  title: string;
  message: string;
  commit: string;
  deleteBranch: boolean;
  force: boolean;
  schedule: boolean;
  metadata: MergeMetadata;
}): Record<string, string> {
  if (style.name === "manually-merged")
    return { do: style.name, merge_commit_id: commit.trim() };
  return {
    do: style.name,
    head_commit_id: head,
    merge_title_field: style.has_message ? title : "",
    merge_message_field: style.has_message ? message : "",
    delete_branch_after_merge: String(
      metadata.branch_deletable && deleteBranch,
    ),
    force_merge: String(metadata.can_force && force && !schedule),
    merge_when_checks_succeed: String(schedule),
  };
}
