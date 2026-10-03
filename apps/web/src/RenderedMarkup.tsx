import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { appSubUrl, request } from "./api";
import { replaceMarkup, type MarkupEdit } from "./markup";
import { isNativeResource, uiRoute } from "./routes";

const headingIds = "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]";
let diagramCount = 0;

/** Finds the element a markup fragment link points at (ids get a prefix). */
function anchorTarget(root: HTMLElement, hash: string) {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep the raw fragment */
  }
  if (!id) return null;
  const candidates = [id, `user-content-${id}`];
  for (const candidate of candidates) {
    const found = root.ownerDocument.getElementById(candidate);
    if (found && root.contains(found)) return found;
  }
  return null;
}

/** Toggles "[ ]"/"[x]" at a renderer byte offset, like Forgejo's tasklist.js. */
export function toggleTask(raw: string, sourcePosition: number, done: boolean) {
  const position = sourcePosition + 1;
  const bytes = new TextEncoder().encode(raw);
  const char = (index: number) => String.fromCharCode(bytes[index] ?? 0);
  if (
    char(position - 1) !== "[" ||
    ![" ", "x", "X"].includes(char(position)) ||
    char(position + 1) !== "]"
  )
    return null;
  bytes[position] = (done ? "x" : " ").charCodeAt(0);
  return new TextDecoder().decode(bytes);
}

async function renderMath(root: HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>("code.language-math")];
  if (!nodes.length) return;
  const [{ default: katex }] = await Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ]);
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const block = node.parentElement?.matches("pre.code-block") ?? false;
    const target = document.createElement(block ? "div" : "span");
    target.className = block ? "markup-math markup-math-block" : "markup-math";
    try {
      katex.render(node.textContent ?? "", target, {
        displayMode: block,
        throwOnError: false,
        maxSize: 25,
        maxExpand: 50,
      });
    } catch {
      continue;
    }
    (block ? node.parentElement! : node).replaceWith(target);
  }
}

async function renderMermaid(root: HTMLElement) {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      "pre.code-block code.language-mermaid, .markup-mermaid",
    ),
  ];
  if (!nodes.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme:
      document.documentElement.dataset.theme === "dark" ? "dark" : "default",
  });
  for (const node of nodes) {
    const block = node.classList.contains("markup-mermaid")
      ? node
      : node.parentElement!;
    const source = node.dataset.mermaidSource ?? node.textContent ?? "";
    if (!block.isConnected) continue;
    try {
      const { svg } = await mermaid.render(
        `markup-mermaid-${++diagramCount}`,
        source,
      );
      const chart = document.createElement("div");
      if (!block.isConnected) continue;
      chart.className = "markup-mermaid";
      chart.dataset.mermaidSource = source;
      chart.innerHTML = svg;
      block.replaceWith(chart);
    } catch {
      block.classList.remove("is-loading");
    }
  }
}

/**
 * Forgejo-rendered (server-sanitized) markup: internal links navigate within
 * the application, heading anchors and footnotes scroll, task lists toggle via
 * the native edit endpoint, and math/Mermaid load their renderers on demand.
 */
export function RenderedMarkup({
  html,
  raw,
  edit,
  context,
}: {
  html: string;
  raw: string;
  edit?: MarkupEdit;
  context: string;
}) {
  const { t } = useTranslation("common");
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState("");
  // The latest saved text and version. After a toggle the page still holds the
  // previous text until it refetches; that stale text must not be edited.
  const current = useRef({ raw, edit });
  const stale = useRef<string | null>(null);
  useEffect(() => {
    if (stale.current !== null && raw === stale.current) return;
    stale.current = null;
    current.current = { raw, edit };
  }, [raw, edit]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    for (const heading of element.querySelectorAll<HTMLElement>(headingIds)) {
      if (
        !heading.id.startsWith("user-content-") ||
        heading.querySelector(".anchor")
      )
        continue;
      const anchor = document.createElement("a");
      anchor.className = "anchor";
      anchor.href = `#${heading.id.slice("user-content-".length)}`;
      anchor.setAttribute("aria-hidden", "true");
      anchor.tabIndex = -1;
      anchor.textContent = "#";
      heading.prepend(anchor);
    }
    const target = anchorTarget(element, window.location.hash);
    if (target) target.scrollIntoView();
    void renderMath(element);
    let disposed = false;
    let rendering = false;
    let pending = false;
    const refresh = async () => {
      pending = true;
      if (rendering) return;
      rendering = true;
      try {
        while (pending && !disposed) {
          pending = false;
          await renderMermaid(element);
        }
      } finally {
        rendering = false;
      }
    };
    const observer = new MutationObserver(() => void refresh());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    void refresh();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [html]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const boxes = [
      ...element.querySelectorAll<HTMLInputElement>(
        ".task-list-item input[type=checkbox][data-source-position]",
      ),
    ];
    for (const box of boxes) box.disabled = !edit;
    if (!edit) return;
    let busy = false;
    const change = async (event: Event) => {
      const box = event.target as HTMLInputElement;
      if (!boxes.includes(box)) return;
      const { raw: before, edit: target } = current.current;
      const next =
        !busy && target
          ? toggleTask(before, Number(box.dataset.sourcePosition), box.checked)
          : null;
      if (!next || !target) {
        box.checked = !box.checked;
        return;
      }
      busy = true;
      setError("");
      for (const item of boxes) item.setAttribute("aria-busy", "true");
      try {
        const url = target.url.startsWith(appSubUrl + "/")
          ? target.url.slice(appSubUrl.length)
          : target.url;
        const { data } = await request<{
          content?: string;
          contentVersion?: number;
        }>(url, {
          method: "POST",
          headers: {
            "X-Forgejo-UI": "1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            content: next,
            context: target.url.replace(
              /\/(?:(?:issues|pulls)\/\d+\/content|comments\/\d+)$/,
              "",
            ),
            content_version: String(target.version),
            ignore_attachments: "true",
          }),
        });
        const saved = {
          url: target.url,
          version: data?.contentVersion ?? target.version + 1,
        };
        current.current = { raw: next, edit: saved };
        stale.current = before;
        if (data?.content)
          replaceMarkup(context, before, next, {
            html: data.content,
            edit: saved,
          });
        await client.invalidateQueries();
      } catch (failure) {
        box.checked = !box.checked;
        setError(
          failure instanceof Error && failure.message
            ? failure.message
            : t("markup.taskFailed"),
        );
      } finally {
        busy = false;
        for (const item of boxes) item.removeAttribute("aria-busy");
      }
    };
    element.addEventListener("change", change);
    return () => element.removeEventListener("change", change);
  }, [html, edit, client, context, t]);

  function click(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as Element).closest?.("a[href]");
    if (
      !anchor ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      anchor.hasAttribute("download") ||
      (anchor.getAttribute("target") || "_self") !== "_self"
    )
      return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("#")) {
      const target = anchorTarget(root.current!, href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView();
      // Relative to the page, not to <base href>.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + href,
      );
      return;
    }
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || isNativeResource(url.pathname))
      return;
    event.preventDefault();
    navigate(uiRoute(url.href));
  }

  return (
    <>
      <div
        ref={root}
        className="markdown markup"
        onClick={click}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {error && (
        <div className="form-error mt-2" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
