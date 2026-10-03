import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { parse } from "yaml";
import { native } from "./api";
import {
  Feedback,
  Markdown,
  pageClass,
  pageHeadingClass,
  Pending,
  useTitle,
} from "./UI";
import { HighlightedText } from "./Highlight";
import { ApiExplorer } from "./ApiExplorer";
interface Schema {
  info: { title: string; version: string; description?: string };
  basePath?: string;
  paths: Record<string, Record<string, Operation>>;
  definitions?: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
}
interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    type?: string;
    schema?: unknown;
  }[];
  responses?: Record<
    string,
    { description?: string; schema?: unknown; content?: unknown }
  >;
  requestBody?: unknown;
  security?: unknown;
}
export function ApiReferencePage({ forgejo = false }: { forgejo?: boolean }) {
  const { t } = useTranslation("shell");
  const [params, setParams] = useSearchParams();
  const interactive = params.get("mode") !== "reference";
  const [filter, setFilter] = useState("");
  const source = forgejo ? "/assets/forgejo/api.v1.yml" : "/swagger.v1.json";
  const query = useQuery({
    queryKey: ["api-reference", source],
    enabled: !interactive,
    queryFn: async ({ signal }) => {
      const response = await fetch(native(source), {
        signal,
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(t("apiReference.unavailable"));
      const text = await response.text();
      return (forgejo ? parse(text) : JSON.parse(text)) as Schema;
    },
  });
  useTitle(t("apiReference.title"));
  const operations = useMemo(
    () =>
      Object.entries(query.data?.paths || {})
        .flatMap(([path, methods]) =>
          Object.entries(methods)
            .filter(([method]) =>
              [
                "get",
                "post",
                "put",
                "patch",
                "delete",
                "head",
                "options",
              ].includes(method),
            )
            .map(([method, op]) => ({ path, method, op })),
        )
        .filter(({ path, method, op }) =>
          `${method} ${path} ${op.summary} ${op.tags}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        ),
    [query.data, filter],
  );
  return (
    <section className={pageClass}>
      <div className={pageHeadingClass}>
        <div>
          <h1 className="max-md:text-[22px]">
            {query.data?.info.title || t("apiReference.title")}
          </h1>
          <p className="mt-2 text-sm text-muted">{query.data?.info.version}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="button"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("mode", interactive ? "reference" : "interactive");
              setParams(next);
            }}
          >
            {t(
              interactive ? "apiReference.reference" : "apiReference.explorer",
            )}
          </button>
          <a className="button" href={native(source)} download>
            {t("apiReference.download")}
          </a>
        </div>
      </div>
      <nav className="tabs">
        <Link className={!forgejo ? "active" : ""} to="/help/api">
          {t("apiReference.compatible")}
        </Link>
        <Link className={forgejo ? "active" : ""} to="/help/api/forgejo">
          {t("apiReference.forgejo")}
        </Link>
      </nav>
      <Feedback error={query.error} />
      {interactive ? (
        <ApiExplorer forgejo={forgejo} />
      ) : query.isPending ? (
        <Pending />
      ) : (
        query.data && (
          <>
            <Markdown>{query.data.info.description || ""}</Markdown>
            <label className="workspace-form my-5">
              {t("apiReference.find")}
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("apiReference.findPlaceholder")}
              />
            </label>
            <p className="mb-4 text-sm text-muted">
              {t("apiReference.endpoints", { count: operations.length })}
            </p>
            {operations.map(({ method, path, op }) => (
              <details
                key={method + path}
                className="border border-line rounded-lg mb-3 group"
              >
                <summary className="flex flex-wrap gap-4 p-4 cursor-pointer">
                  <span
                    className={`badge ${method === "get" ? "text-primary" : ""}`}
                  >
                    {method.toUpperCase()}
                  </span>
                  <code className="break-all">
                    {query.data.basePath}
                    {path}
                  </code>
                  <span className="text-muted">{op.summary}</span>
                </summary>
                <div className="p-5 border-t border-line">
                  <Markdown>{op.description || op.summary || ""}</Markdown>
                  {op.parameters?.length ? (
                    <>
                      <h3 className="font-semibold my-4">
                        {t("apiReference.parameters")}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr>
                              <th>{t("apiReference.name")}</th>
                              <th>{t("apiReference.location")}</th>
                              <th>{t("apiReference.description")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {op.parameters.map((p, i) => (
                              <tr className="border-t border-line" key={i}>
                                <td className="p-3">
                                  <code>{p.name}</code>
                                  {p.required && (
                                    <span className="text-danger"> *</span>
                                  )}
                                </td>
                                <td>{p.in}</td>
                                <td>
                                  <Markdown>{p.description || ""}</Markdown>
                                  {!!p.schema && (
                                    <pre className="overflow-auto text-xs">
                                      <HighlightedText
                                        language="json"
                                        code={JSON.stringify(p.schema, null, 2)}
                                      />
                                    </pre>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                  {!!op.requestBody && (
                    <>
                      <h3 className="font-semibold my-4">
                        {t("apiReference.requestBody")}
                      </h3>
                      <pre className="overflow-auto">
                        <HighlightedText
                          language="json"
                          code={JSON.stringify(op.requestBody, null, 2)}
                        />
                      </pre>
                    </>
                  )}
                  <h3 className="font-semibold my-4">
                    {t("apiReference.responses")}
                  </h3>
                  {Object.entries(op.responses || {}).map(([status, r]) => (
                    <details key={status} className="border-t border-line py-3">
                      <summary>
                        {status} — {r.description}
                      </summary>
                      {!!(r.schema || r.content) && (
                        <pre className="overflow-auto text-xs p-3">
                          <HighlightedText
                            language="json"
                            code={JSON.stringify(
                              r.schema || r.content,
                              null,
                              2,
                            )}
                          />
                        </pre>
                      )}
                    </details>
                  ))}
                </div>
              </details>
            ))}
            <h2 className="my-6 text-xl">{t("apiReference.schemas")}</h2>
            {Object.entries(
              query.data.definitions || query.data.components?.schemas || {},
            ).map(([name, definition]) => (
              <details key={name} className="border-t border-line py-3">
                <summary className="cursor-pointer font-semibold">
                  {name}
                </summary>
                <pre className="overflow-auto my-3 text-xs">
                  <HighlightedText
                    language="json"
                    code={JSON.stringify(definition, null, 2)}
                  />
                </pre>
              </details>
            ))}
          </>
        )
      )}
    </section>
  );
}
