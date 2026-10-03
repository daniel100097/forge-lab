import { type ReactNode } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  LogOut,
  FileQuestion,
  Plus,
} from "lucide-react";
import { get, nativeForm, nativePage, type Bootstrap } from "./api";
import { uiRoute } from "./routes";
import type { RepoContext } from "./App";
import { ProfileForm } from "./AccountPreferences";
import { pageClass, pageHeadingClass, useTitle } from "./UI";
import { SelectControl } from "./SelectControl";
import {
  ProjectInitializationFields,
  type RepositoryCreationData,
} from "./ProjectCreation";
import { WorkspaceWorkPage } from "./WorkspaceActivity";
import { IssueCreationPage } from "./IssueCreation";
import { NewMergeRequestPage } from "./NewMergeRequest";

function Pending() {
  const { t } = useTranslation("shell");
  return (
    <div
      className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted"
      role="status"
    >
      <LoaderCircle className="animate-spin" size={20} /> {t("loading")}
    </div>
  );
}
function Feedback({ error }: { error: Error | null }) {
  return error ? (
    <div className="form-error" role="alert">
      {error.message}
    </div>
  ) : null;
}
function FormPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("shell");
  return (
    <section className={pageClass}>
      <Link
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        to="/projects"
      >
        <ArrowLeft size={14} /> {t("pages.allProjects")}
      </Link>
      <h1 className="mt-2">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <div className="mt-4 max-w-3xl rounded border border-line bg-surface p-6 max-md:p-4">
        {children}
      </div>
    </section>
  );
}
function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form)) as Record<string, string>;
}
export function NotFoundPage() {
  const { t } = useTranslation("shell");
  useTitle(t("pages.notFound.title"));
  return (
    <section className={pageClass}>
      <div className="mx-auto my-12 flex max-w-xl flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-hover text-muted dark:text-ink">
          <FileQuestion size={28} />
        </span>
        <span className="mb-2 text-xs font-medium text-muted">404</span>
        <h1 className="text-xl">{t("pages.notFound.title")}</h1>
        <p className="text-sm leading-6 text-muted">
          {t("pages.notFound.body")}
        </p>
        <Link className="button primary" to="/projects">
          {t("pages.notFound.goToProjects")}
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
export function AccountPage({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("shell");
  useTitle(t("pages.account.title"));
  const client = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: async () => {
      await nativeForm("/user/logout", {});
      const data = await get<Bootstrap>("/-/ui/data/bootstrap");
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "bootstrap" });
      client.setQueryData(["bootstrap"], data);
      navigate("/login", { replace: true });
    },
  });
  if (!bootstrap.user) return <Navigate to="/login" replace />;
  return (
    <section className="max-w-3xl">
      <div className={pageHeadingClass}>
        <h1 className="text-xl max-md:text-[22px]">
          {t("pages.account.title")}
        </h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        {t("pages.account.description")}
      </p>
      <div className="flex items-center gap-4">
        <img
          src={bootstrap.user.avatar}
          alt=""
          className="size-12 rounded-full"
        />
        <div>
          <h2>{bootstrap.user.name || bootstrap.user.username}</h2>
          <p className="text-sm text-muted">@{bootstrap.user.username}</p>
        </div>
      </div>
      <ProfileForm />
      <div className="my-6 border-t border-line" />
      <Feedback error={logout.error} />
      <button
        className="button"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut size={16} /> {t("pages.account.signOut")}
      </button>
    </section>
  );
}
export function NewProjectPage({ bootstrap }: { bootstrap: Bootstrap }) {
  const { t } = useTranslation("shell");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const options = useQuery({
    queryKey: ["new-project-options"],
    queryFn: ({ signal }) =>
      nativePage<RepositoryCreationData>("/repo/create", signal),
    enabled: !!bootstrap.user,
  });
  const create = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      const result = await nativeForm("/repo/create", {
        ...fields,
      });
      if (!result.redirect) throw new Error(t("pages.newProject.createFailed"));
      await client.invalidateQueries({ queryKey: ["projects"] });
      navigate(uiRoute(result.redirect));
    },
  });
  if (!bootstrap.user)
    return <Navigate to="/login?next=%2Fprojects%2Fnew" replace />;
  if (options.isPending) return <Pending />;
  if (options.error) return <Feedback error={options.error} />;
  const owners = options.data.owners;
  const selectedOwner =
    owners.find(
      (owner) => owner.name === (params.get("org") || params.get("owner")),
    ) || owners[0];
  return (
    <FormPanel
      title={t("pages.newProject.title")}
      description={t("pages.newProject.description")}
    >
      <form
        className="workspace-form mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(values(e.currentTarget));
        }}
      >
        <Feedback error={create.error} />
        <label>
          {t("pages.newProject.namespace")}
          <SelectControl
            name="uid"
            label={t("pages.newProject.namespace")}
            defaultValue={String(selectedOwner?.id || "")}
            options={owners.map((owner) => ({
              value: String(owner.id),
              label: owner.name,
              description: owner.organization
                ? t("pages.newProject.organization")
                : t("pages.newProject.personalNamespace"),
            }))}
          />
        </label>
        <label>
          {t("pages.newProject.name")}
          <input
            name="repo_name"
            placeholder={t("pages.newProject.namePlaceholder")}
            required
            maxLength={100}
          />
        </label>
        <label>
          {t("pages.newProject.descriptionLabel")}
          <textarea
            name="description"
            rows={3}
            placeholder={t("pages.newProject.descriptionPlaceholder")}
            maxLength={2048}
          />
        </label>
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr]">
          <label>
            {t("pages.newProject.visibility")}
            <SelectControl
              label={t("pages.newProject.visibility")}
              name="private"
              defaultValue="on"
              options={[
                {
                  value: "on",
                  label: t("pages.newProject.private"),
                  description: t("pages.newProject.privateDescription"),
                },
                ...(!options.data.forced_private
                  ? [
                      {
                        value: "",
                        label: t("pages.newProject.public"),
                        description: t("pages.newProject.publicDescription"),
                      },
                    ]
                  : []),
              ]}
            />
          </label>
          <label>
            {t("pages.newProject.defaultBranch")}
            <input
              name="default_branch"
              defaultValue={options.data.default_branch || "main"}
              required
            />
          </label>
        </div>
        <ProjectInitializationFields data={options.data} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="button primary"
            disabled={create.isPending || !selectedOwner}
          >
            <Plus size={16} />
            {create.isPending
              ? t("pages.newProject.creating")
              : t("pages.newProject.create")}
          </button>
          <Link className="button" to="/projects">
            {t("pages.newProject.cancel")}
          </Link>
        </div>
      </form>
    </FormPanel>
  );
}
export function NewBoardPage() {
  const { t } = useTranslation("shell");
  const { path } = useOutletContext<RepoContext>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      const result = await nativeForm(`${path}/projects/new`, {
        ...fields,
      });
      if (!result.redirect) throw new Error(t("pages.newBoard.createFailed"));
      await client.invalidateQueries({ queryKey: ["boards", path] });
      navigate(uiRoute(result.redirect));
    },
  });
  return (
    <div className="mt-4 max-w-xl rounded border border-line bg-surface p-6 max-md:p-4">
      <h2 className="mb-2">{t("pages.newBoard.title")}</h2>
      <p className="text-sm text-muted">{t("pages.newBoard.description")}</p>
      <form
        className="workspace-form mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(values(e.currentTarget));
        }}
      >
        <Feedback error={create.error} />
        <label>
          {t("pages.newBoard.name")}
          <input
            name="title"
            required
            maxLength={100}
            placeholder={t("pages.newBoard.namePlaceholder")}
          />
        </label>
        <label>
          {t("pages.newBoard.descriptionLabel")}
          <textarea name="content" rows={3} />
        </label>
        <label>
          {t("pages.newBoard.layout")}
          <SelectControl
            label={t("pages.newBoard.layout")}
            name="template_type"
            defaultValue="1"
            options={[
              {
                value: "1",
                label: t("pages.newBoard.kanban"),
                description: t("pages.newBoard.kanbanDescription"),
              },
              { value: "2", label: t("pages.newBoard.bugTriage") },
              { value: "0", label: t("pages.newBoard.blank") },
            ]}
          />
        </label>
        <label>
          {t("boards.parity.cardStyle")}
          <SelectControl
            name="card_type"
            label={t("boards.parity.cardStyle")}
            defaultValue="0"
            options={[
              { value: "0", label: t("boards.parity.textOnly") },
              { value: "1", label: t("boards.parity.imagesAndText") },
            ]}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="button primary" disabled={create.isPending}>
            {t("pages.newBoard.create")}
          </button>
          <Link className="button" to=".." relative="path">
            {t("pages.newBoard.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
export function NewIssuePage({ pulls = false }: { pulls?: boolean }) {
  return pulls ? <NewMergeRequestPage /> : <IssueCreationPage />;
}
export function WorkPage({
  bootstrap,
  pulls = false,
}: {
  bootstrap: Bootstrap;
  pulls?: boolean;
}) {
  return <WorkspaceWorkPage bootstrap={bootstrap} pulls={pulls} />;
}
