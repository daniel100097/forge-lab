import { useState } from "react";
import {
  Link,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  ChevronDown,
  GitBranch,
  KeyRound,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Tag,
  UnlockKeyhole,
} from "lucide-react";
import { get, native, nativeForm, nativePage, nativeText } from "./api";
import type { RepoContext } from "./App";
import {
  CopyButton,
  Feedback,
  Markdown,
  Pending,
  relativeDate,
  useTitle,
} from "./UI";
import { DiffOptions, DiffView, useDiffOptions } from "./Diff";
import {
  ActionMenu,
  MenuAction,
  MenuDownload,
  MenuLink,
  MenuSeparator,
} from "./ActionMenu";
import { commitAvatarClass } from "./CodeExtras";

const headingClass =
  "mb-3 flex min-h-10 items-center justify-between gap-4 max-md:gap-3";
const actionsClass = "flex flex-wrap items-center gap-2";

interface Person {
  name: string;
  display_name: string;
  avatar_url: string;
}
export interface Signature {
  signed?: boolean;
  verified: boolean;
  warning: boolean;
  reason: string;
  trust: string;
  email?: string;
  signer?: Person & { id: number };
  key_id?: string;
  ssh_fingerprint?: string;
}
interface CommitDetails {
  sha: string;
  message: string;
  author: string;
  authored_at: string;
  author_user?: Person | null;
  committer: string;
  committed_at: string;
  committer_user?: Person | null;
  parents: string[];
  note: string | null;
  note_author?: { name: string; date: string; user?: Person | null };
  statuses: {
    context: string;
    state: string;
    description: string;
    target_url: string;
  }[];
  signature: Signature;
}
const statusStates = [
  "pending",
  "success",
  "error",
  "failure",
  "warning",
] as const;
const isStatusState = (state: string): state is (typeof statusStates)[number] =>
  (statusStates as readonly string[]).includes(state);

/** Commit avatar: the account picture, or initials like before. */
export function PersonAvatar({
  user,
  name,
  size = "size-8",
}: {
  user?: Person | null;
  name: string;
  size?: string;
}) {
  return user?.avatar_url ? (
    <img
      className={`${size} shrink-0 rounded-full object-cover`}
      src={user.avatar_url}
      alt=""
    />
  ) : (
    <span className={`${commitAvatarClass} ${size}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * The native signature row: trust state, signer and key, or why the
 * signature could not be verified.
 */
export function SignatureDetails({ signature }: { signature: Signature }) {
  const { t } = useTranslation("repository");
  const tone = signature.verified
    ? signature.trust === "trusted" || !signature.trust
      ? "border-[#91d4a8] bg-success-bg"
      : "border-[#e9be74] bg-[#fdf1dd] dark:border-[#8f5d0b] dark:bg-[#4a3a1c]"
    : signature.warning
      ? "border-danger bg-danger-bg"
      : "border-line bg-surface-subtle";
  const Icon = signature.verified
    ? signature.trust === "trusted" || !signature.trust
      ? ShieldCheck
      : ShieldAlert
    : signature.warning
      ? ShieldAlert
      : UnlockKeyhole;
  return (
    <div
      className={`commit-signature mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-sm ${tone}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0" />
        {signature.verified ? (
          <>
            <span>
              {t(
                signature.trust === "untrusted"
                  ? "commit.signature.signedByUntrusted"
                  : signature.trust === "unmatched"
                    ? "commit.signature.signedByUnmatched"
                    : "commit.signature.signedBy",
              )}
            </span>
            {signature.signer && signature.signer.id > 0 ? (
              <Link
                className="flex items-center gap-1.5 font-semibold hover:underline"
                to={`/users/${encodeURIComponent(signature.signer.name)}`}
              >
                <img
                  className="size-5 rounded-full"
                  src={signature.signer.avatar_url}
                  alt=""
                />
                {signature.signer.display_name}
              </Link>
            ) : (
              <strong title={t("commit.signature.defaultKey")}>
                {signature.signer?.display_name || signature.email}
              </strong>
            )}
          </>
        ) : (
          <span>{signature.reason}</span>
        )}
      </span>
      {(signature.key_id || signature.ssh_fingerprint) && (
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs break-all">
          <KeyRound size={14} className="shrink-0" />
          {signature.ssh_fingerprint
            ? t("commit.signature.sshFingerprint", {
                value: signature.ssh_fingerprint,
              })
            : t("commit.signature.gpgKey", { value: signature.key_id })}
        </span>
      )}
    </div>
  );
}

/** Compact signature badge for lists (native shabox colouring). */
export function SignatureBadge({
  signature,
}: {
  signature?: Signature | null;
}) {
  const { t } = useTranslation("repository");
  if (!signature) return null;
  const label = signature.verified
    ? t("commit.verified")
    : signature.warning
      ? t("commit.signature.bad")
      : t("commit.unverified");
  const tone = signature.verified
    ? signature.trust === "trusted" || !signature.trust
      ? "bg-success-bg text-success"
      : "bg-[#fdf1dd] text-[#8f4700] dark:bg-[#4a3a1c] dark:text-[#e9c77b]"
    : signature.warning
      ? "bg-danger-bg text-danger"
      : "bg-hover text-muted";
  return (
    <span
      className={`signature-badge inline-flex items-center gap-1 rounded-full px-2 text-xs leading-5 ${tone}`}
      title={
        signature.verified && signature.signer
          ? `${label}: ${signature.signer.display_name}`
          : signature.reason
      }
    >
      {signature.verified ? (
        <LockKeyhole size={11} />
      ) : (
        <UnlockKeyhole size={11} />
      )}
      {label}
    </span>
  );
}

function ContainingReferences({ path, sha }: { path: string; sha: string }) {
  const { t } = useTranslation("repository");
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["commit-references", path, sha],
    queryFn: ({ signal }) =>
      get<{
        branches: { name: string }[];
        tags: { name: string }[];
        default_branch: string;
      }>(
        `${path}/commit/${encodeURIComponent(sha)}/load-branches-and-tags`,
        signal,
      ),
    enabled: open,
  });
  const root = `/projects${path}`;
  return (
    <div className="commit-references mt-3 border-t border-line pt-3 text-sm">
      {!open ? (
        <button
          className="button min-h-7 px-2"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {t("commit.references.load")}
        </button>
      ) : query.isPending ? (
        <Pending />
      ) : query.error ? (
        <Feedback error={query.error} />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-muted">{t("commit.references.title")}</span>
          {query.data.branches.some(
            (branch) => branch.name === query.data.default_branch,
          ) && (
            <span className="text-xs text-muted">
              {t("commit.references.inDefault")}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <GitBranch size={15} className="shrink-0 text-muted" />
            {query.data.branches.length ? (
              query.data.branches.map((branch) => (
                <Link
                  key={branch.name}
                  className="label font-mono hover:underline"
                  to={`${root}?${new URLSearchParams({ ref: branch.name })}`}
                >
                  {branch.name}
                </Link>
              ))
            ) : (
              <span className="text-muted">{t("commit.references.none")}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size={15} className="shrink-0 text-muted" />
            {query.data.tags.length ? (
              query.data.tags.map((tag) => (
                <Link
                  key={tag.name}
                  className="label font-mono hover:underline"
                  to={`${root}?${new URLSearchParams({ ref: tag.name })}`}
                >
                  {tag.name}
                </Link>
              ))
            ) : (
              <span className="text-muted">{t("commit.references.none")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Create a branch or tag at this commit (native commit "Operations"). */
function CreateReferenceForm({
  path,
  sha,
  kind,
  onClose,
}: {
  path: string;
  sha: string;
  kind: "branch" | "tag";
  onClose: () => void;
}) {
  const { t } = useTranslation("repository");
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [done, setDone] = useState("");
  const create = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/branches/_new/commit/${encodeURIComponent(sha)}`, {
        new_branch_name: name,
        create_tag: String(kind === "tag"),
      }),
    onSuccess: async () => {
      setDone(name);
      await client.invalidateQueries({ queryKey: ["branches", path] });
      await client.invalidateQueries({ queryKey: ["tag-names", path] });
      await client.invalidateQueries({ queryKey: ["reference-list", path] });
      await client.invalidateQueries({
        queryKey: ["commit-references", path, sha],
      });
    },
  });
  return (
    <form
      className="create-reference workspace-form my-4 max-w-xl gap-3 rounded-md border border-line bg-surface-subtle p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-base font-semibold">
        {t(kind === "tag" ? "commit.createTag" : "commit.createBranch")}
      </h2>
      <p className="text-sm text-muted">
        {t(
          kind === "tag" ? "commit.createTagFrom" : "commit.createBranchFrom",
          {
            sha: sha.slice(0, 10),
          },
        )}
      </p>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        {t(
          kind === "tag"
            ? "references.tags.nameLabel"
            : "references.branches.nameLabel",
        )}
        <input
          autoFocus
          required
          maxLength={100}
          className="font-normal"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Feedback error={create.error} />
      {done && (
        <p className="form-success text-sm" role="status">
          <Trans
            t={t}
            i18nKey={
              kind === "tag" ? "commit.tagCreated" : "commit.branchCreated"
            }
            values={{ name: done }}
            components={{
              anchor: (
                <Link
                  className="font-semibold text-primary hover:underline"
                  to={`/projects${path}?${new URLSearchParams({ ref: done })}`}
                />
              ),
            }}
          />
        </p>
      )}
      <div className={actionsClass}>
        <button className="button primary" disabled={create.isPending}>
          {t(
            kind === "tag"
              ? "references.tags.create"
              : "references.branches.create",
          )}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t("shared.cancel")}
        </button>
      </div>
    </form>
  );
}

export function CommitPage() {
  const { t } = useTranslation("repository");
  const { path, repository } = useOutletContext<RepoContext>();
  const { sha = "" } = useParams();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const [editingNote, setEditingNote] = useState(false);
  const [removingNote, setRemovingNote] = useState(false);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState<"branch" | "tag" | null>(null);
  const options = useDiffOptions();
  const files = params.getAll("files");
  useTitle(t("commit.documentTitle", { sha: sha.slice(0, 8) }));
  const details = useQuery({
    queryKey: ["commit-detail", path, sha],
    queryFn: ({ signal }) =>
      nativePage<CommitDetails>(
        `${path}/commit/${encodeURIComponent(sha)}`,
        signal,
      ),
  });
  const query = useQuery({
    queryKey: ["diff", path, sha, options.whitespace, files.join("\n")],
    queryFn: ({ signal }) =>
      nativeText(
        `/-/ui/data/repos${path}/diff?${new URLSearchParams([
          ["commit", sha],
          ["whitespace", options.whitespace],
          ...files.map((file) => ["file", file]),
        ])}`,
        signal,
      ),
  });
  const saveNote = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/commit/${encodeURIComponent(sha)}/notes`, {
        notes: note,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["commit-detail", path, sha],
      });
      setEditingNote(false);
    },
  });
  const removeNote = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/commit/${encodeURIComponent(sha)}/notes/remove`, {}),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["commit-detail", path, sha],
      });
      setRemovingNote(false);
    },
  });
  const canWrite = repository.permissions?.write_code && !repository.archived;
  const commitSha = details.data?.sha || sha;
  const operationParams = new URLSearchParams({
    sha: commitSha,
    ref: repository.default_branch,
  });
  const data = details.data;
  return (
    <div>
      <div className={headingClass}>
        <h1 className="max-md:text-[22px]">
          {t("commit.title", { sha: sha.slice(0, 8) })}
        </h1>
        <div className={actionsClass}>
          <Link className="button" to={`..?ref=${encodeURIComponent(sha)}`}>
            {t("commit.browseFiles")}
          </Link>
          <ActionMenu
            label={t("commit.actions")}
            trigger={
              <>
                {t("commit.options")} <ChevronDown size={14} />
              </>
            }
          >
            {canWrite && (
              <>
                <MenuAction onClick={() => setCreating("branch")}>
                  {t("commit.createBranch")}
                </MenuAction>
                <MenuAction onClick={() => setCreating("tag")}>
                  {t("commit.createTag")}
                </MenuAction>
                <MenuLink to={`../cherry-pick?${operationParams}`}>
                  {t("commit.cherryPick")}
                </MenuLink>
                <MenuLink to={`../revert?${operationParams}`}>
                  {t("commit.revert")}
                </MenuLink>
                {!data?.note && (
                  <MenuAction
                    onClick={() => {
                      setNote("");
                      setEditingNote(true);
                    }}
                  >
                    {t("commit.notes.add")}
                  </MenuAction>
                )}
                <MenuSeparator />
              </>
            )}
            <MenuDownload
              href={native(`${path}/commit/${encodeURIComponent(sha)}.diff`)}
            >
              {t("commit.downloadDiff")}
            </MenuDownload>
            <MenuDownload
              href={native(`${path}/commit/${encodeURIComponent(sha)}.patch`)}
            >
              {t("commit.downloadPatch")}
            </MenuDownload>
          </ActionMenu>
        </div>
      </div>
      <Feedback error={details.error} />
      {creating && (
        <CreateReferenceForm
          key={creating}
          path={path}
          sha={commitSha}
          kind={creating}
          onClose={() => setCreating(null)}
        />
      )}
      {data && (
        <section className="commit-detail-summary mb-4 rounded-md border border-line bg-surface-subtle p-4">
          <h2 className="text-lg font-semibold">
            {data.message.split("\n")[0]}
          </h2>
          {data.message.trim().includes("\n") && (
            <pre className="mt-3 font-sans text-sm leading-6 whitespace-pre-wrap">
              {data.message.trim().split("\n").slice(1).join("\n").trim()}
            </pre>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <PersonAvatar user={data.author_user} name={data.author} />
            <span>
              <Trans
                t={t}
                i18nKey={
                  data.committer !== data.author
                    ? "commit.authoredCommitted"
                    : "commit.authored"
                }
                values={{ date: relativeDate(data.authored_at) }}
                components={{
                  author: data.author_user ? (
                    <Link
                      className="font-semibold text-ink hover:underline"
                      to={`/users/${encodeURIComponent(data.author_user.name)}`}
                    >
                      {data.author_user.display_name || data.author}
                    </Link>
                  ) : (
                    <strong>{data.author}</strong>
                  ),
                  committer: data.committer_user ? (
                    <Link
                      className="font-semibold text-ink hover:underline"
                      to={`/users/${encodeURIComponent(data.committer_user.name)}`}
                    >
                      {data.committer}
                    </Link>
                  ) : (
                    <strong>{data.committer}</strong>
                  ),
                }}
              />
            </span>
            {data.signature.signed && (
              <span className="label" title={data.signature.reason}>
                {t(
                  data.signature.verified
                    ? "commit.verified"
                    : "commit.unverified",
                )}
              </span>
            )}
          </div>
          {data.signature.signed && (
            <SignatureDetails signature={data.signature} />
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
            <code className="break-all">{data.sha}</code>
            <CopyButton
              value={data.sha}
              label={t("shared.copyCommitSha")}
              compact
            />
            <span className="ml-auto text-muted">
              {t("commit.parents", { count: data.parents.length })}
            </span>
            {data.parents.map((parent) => (
              <Link
                className="text-primary hover:underline"
                to={`../commit/${parent}`}
                key={parent}
              >
                <code>{parent.slice(0, 8)}</code>
              </Link>
            ))}
          </div>
          {data.statuses.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              {data.statuses.map((check, index) => (
                <div
                  key={`${check.context}:${index}`}
                  className="flex flex-wrap items-center gap-2 py-1 text-sm"
                >
                  <span className="label">
                    {isStatusState(check.state)
                      ? t(`commit.status.${check.state}`)
                      : check.state}
                  </span>
                  <strong>{check.context}</strong>
                  <span>{check.description}</span>
                  {/^(https?:\/\/|\/(?!\/))/.test(check.target_url) && (
                    <a
                      className="ml-auto text-primary hover:underline"
                      href={check.target_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("commit.details")}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          <ContainingReferences path={path} sha={data.sha} />
        </section>
      )}
      {(data?.note || editingNote) && (
        <section className="commit-notes mb-5 rounded-md border border-line p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t("commit.notes.title")}
              {data?.note_author && (
                <span className="font-normal text-muted">
                  {t("commit.notes.by", {
                    name:
                      data.note_author.user?.display_name ||
                      data.note_author.name,
                    date: relativeDate(data.note_author.date),
                  })}
                </span>
              )}
            </h2>
            {canWrite && !editingNote && data?.note && (
              <div className={actionsClass}>
                <button
                  className="button"
                  onClick={() => {
                    setNote(data.note || "");
                    setEditingNote(true);
                  }}
                >
                  {t("commit.notes.edit")}
                </button>
                <button
                  className="button"
                  onClick={() => setRemovingNote(true)}
                >
                  {t("commit.notes.remove")}
                </button>
              </div>
            )}
          </div>
          {removingNote && (
            <div
              className="mb-3 rounded-md border border-line bg-surface-subtle p-3 text-sm"
              role="alertdialog"
              aria-labelledby="remove-note-title"
            >
              <strong id="remove-note-title" className="block">
                {t("commit.notes.removeTitle")}
              </strong>
              <p className="my-2">{t("commit.notes.removeBody")}</p>
              <Feedback error={removeNote.error} />
              <div className={actionsClass}>
                <button
                  className="button"
                  disabled={removeNote.isPending}
                  onClick={() => removeNote.mutate()}
                >
                  {t("commit.notes.remove")}
                </button>
                <button
                  className="button"
                  onClick={() => setRemovingNote(false)}
                >
                  {t("shared.cancel")}
                </button>
              </div>
            </div>
          )}
          {editingNote ? (
            <form
              className="workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveNote.mutate();
              }}
            >
              <label>
                {t("commit.notes.label")}
                <textarea
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <Feedback error={saveNote.error} />
              <div className={actionsClass}>
                <button
                  className="button primary"
                  disabled={saveNote.isPending}
                >
                  {saveNote.isPending
                    ? t("shared.saving")
                    : t("commit.notes.save")}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditingNote(false)}
                >
                  {t("shared.cancel")}
                </button>
              </div>
            </form>
          ) : data?.note ? (
            <Markdown>{data.note}</Markdown>
          ) : null}
        </section>
      )}
      {files.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("commit.filesFilter", { files: files.join(", ") })}
          <Link
            className="text-primary hover:underline"
            to={`../commit/${sha}`}
          >
            {t("commit.allFiles")}
          </Link>
        </p>
      )}
      <DiffOptions options={options} />
      <Feedback error={query.error} />
      {query.isPending ? (
        <Pending />
      ) : (
        query.data !== undefined && (
          <DiffView
            text={query.data}
            navigation
            parallel={options.parallel}
            fileRef={commitSha}
          />
        )
      )}
    </div>
  );
}
