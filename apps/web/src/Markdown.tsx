import { HighlightedText } from "./Highlight";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { native, uiBase } from "./api";
import {
  lookupMarkup,
  nativeMarkupContext,
  uiMarkupContext,
  type MarkupEdit,
} from "./markup";
import { RenderedMarkup } from "./RenderedMarkup";
import { uiRoute, isNativeResource } from "./routes";

/** The repository or owner whose links the markup resolves against. */
function markupContext(basePath?: string) {
  if (basePath) return nativeMarkupContext(basePath);
  if (typeof window === "undefined") return "";
  const path = window.location.pathname;
  return uiMarkupContext(
    path.startsWith(uiBase + "/") ? path.slice(uiBase.length) : path,
  );
}

/**
 * Renders markdown. Text that Forgejo rendered (issue and merge request
 * descriptions and comments, READMEs, wiki pages, release notes, profile
 * READMEs) is shown as Forgejo's sanitized HTML, so references, mentions,
 * emoji, alerts, math, Mermaid and task lists match native pages; other text
 * uses the client-side renderer.
 */
export function Markdown({
  children,
  basePath,
  html,
  edit,
}: {
  children: string;
  basePath?: string;
  /** Forgejo-rendered HTML for `children`; looked up automatically if omitted. */
  html?: string;
  /** Native update endpoint enabling task-list checkboxes. */
  edit?: MarkupEdit;
}) {
  const context = markupContext(basePath);
  const rendered = html ? { html, edit } : lookupMarkup(context, children);
  if (rendered?.html)
    return (
      <RenderedMarkup
        html={rendered.html}
        raw={children}
        edit={rendered.edit}
        context={context}
      />
    );
  return <ClientMarkdown basePath={basePath}>{children}</ClientMarkdown>;
}

function ClientMarkdown({
  children,
  basePath,
}: {
  children: string;
  basePath?: string;
}) {
  function resolve(href: string, image = false) {
    if (!basePath || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;
    const url = new URL(href, new URL(native(basePath), location.origin));
    if (image) url.pathname = url.pathname.replace("/src/", "/raw/");
    return url.href;
  }
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className }) {
            const lang = /language-(\S+)/.exec(className || "")?.[1];
            return (
              <code className={className}>
                {lang ? (
                  <HighlightedText
                    code={String(children).replace(/\n$/, "")}
                    language={lang}
                  />
                ) : (
                  children
                )}
              </code>
            );
          },
          a: ({ href = "", children }) => {
            const resolved = resolve(href);
            if (resolved.startsWith("#"))
              return <a href={resolved}>{children}</a>;
            const url = new URL(resolved, location.origin);
            return url.origin === location.origin &&
              !isNativeResource(url.pathname) ? (
              <Link to={uiRoute(url.href)}>{children}</Link>
            ) : (
              <a href={resolved} rel="noreferrer">
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? resolve(src, true) : undefined}
              alt={alt ?? ""}
              loading="lazy"
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
