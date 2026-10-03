import { describe, expect, it } from "vitest";
import {
  mergeFormFields,
  selectedMergeStyle,
  type MergeMetadata,
  type MergeStyle,
} from "./pullMerge";

const merge: MergeStyle = {
  name: "merge",
  title: "Native merge title",
  message: "Native merge body",
  has_message: true,
  can_merge: true,
  can_schedule: true,
};
const squash: MergeStyle = {
  ...merge,
  name: "squash",
  title: "Native squash title",
  message: "Commit list\nNative squash body",
};
const metadata: MergeMetadata = {
  allowed: true,
  form_available: true,
  styles: [merge, squash],
  default_style: "squash",
  can_force: true,
  branch_deletable: true,
  default_delete_branch: true,
  instructions: {},
  show_merge_instructions: true,
  autodetect_manual_merge: false,
  default_title: merge.title,
  default_message: merge.message,
};
const values = {
  metadata,
  style: squash,
  head: "head-sha",
  title: "Edited title",
  message: "Edited body",
  commit: " merge-sha ",
  deleteBranch: true,
  force: true,
  schedule: false,
};

describe("native merge selection", () => {
  it("uses the native default rather than the first allowed method", () => {
    expect(selectedMergeStyle(metadata, "")).toBe(squash);
  });
  it("preserves an eligible selection", () => {
    expect(selectedMergeStyle(metadata, "merge")).toBe(merge);
  });
  it("drops selections that become ineligible", () => {
    expect(selectedMergeStyle({ ...metadata, styles: [merge] }, "squash")).toBe(
      merge,
    );
  });
  it("falls back to the first native eligible method when the default is ineligible", () => {
    expect(
      selectedMergeStyle({ ...metadata, default_style: "rebase" }, ""),
    ).toBe(merge);
  });
  it("does not invent a method when none is eligible", () => {
    expect(
      selectedMergeStyle({ ...metadata, styles: [] }, "merge"),
    ).toBeUndefined();
  });
});

describe("native merge form", () => {
  it("posts the selected method, editable message, head and delete/force flags", () => {
    expect(mergeFormFields(values)).toEqual({
      do: "squash",
      head_commit_id: "head-sha",
      merge_title_field: "Edited title",
      merge_message_field: "Edited body",
      delete_branch_after_merge: "true",
      force_merge: "true",
      merge_when_checks_succeed: "false",
    });
  });
  it("schedules the selected method and deletion without forcing protection checks", () => {
    expect(mergeFormFields({ ...values, schedule: true })).toMatchObject({
      do: "squash",
      delete_branch_after_merge: "true",
      force_merge: "false",
      merge_when_checks_succeed: "true",
    });
  });
  it("never sends branch deletion or force without native permission", () => {
    expect(
      mergeFormFields({
        ...values,
        metadata: { ...metadata, branch_deletable: false, can_force: false },
      }),
    ).toMatchObject({
      delete_branch_after_merge: "false",
      force_merge: "false",
    });
  });
  it("honors unchecked branch deletion and force", () => {
    expect(
      mergeFormFields({ ...values, deleteBranch: false, force: false }),
    ).toMatchObject({
      delete_branch_after_merge: "false",
      force_merge: "false",
    });
  });
  it("only posts the SHA when marking as manually merged", () => {
    expect(
      mergeFormFields({
        ...values,
        style: { ...merge, name: "manually-merged", has_message: false },
      }),
    ).toEqual({ do: "manually-merged", merge_commit_id: "merge-sha" });
  });
  it("does not send hidden commit message fields for rebase or fast-forward", () => {
    for (const name of ["rebase", "fast-forward-only"])
      expect(
        mergeFormFields({
          ...values,
          style: { ...merge, name, has_message: false },
        }),
      ).toMatchObject({
        do: name,
        merge_title_field: "",
        merge_message_field: "",
      });
  });
});
