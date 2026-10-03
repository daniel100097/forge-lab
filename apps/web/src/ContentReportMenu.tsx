import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionMenu, MenuAction, MenuLink } from "./ActionMenu";
import { referenceIssueBody } from "./contentReference";
import { Feedback } from "./UI";

export function ContentReportMenu({
  id,
  type,
  canReport = true,
  body,
  reference,
  newIssueURL,
  canQuote = false,
}: {
  id: number;
  type: "issue" | "pull" | "comment";
  canReport?: boolean;
  body?: string;
  reference?: string;
  newIssueURL?: string;
  canQuote?: boolean;
}) {
  const { t } = useTranslation("issues");
  const [error, setError] = useState<Error | null>(null);
  const selection = useRef("");
  return (
    <>
      <span
        className="inline-flex"
        onPointerDownCapture={(event) => {
          if (event.currentTarget.contains(event.target as Node))
            selection.current = window.getSelection()?.toString() || "";
        }}
        onKeyDownCapture={(event) => {
          if (
            event.currentTarget.contains(event.target as Node) &&
            ["Enter", " ", "ArrowDown"].includes(event.key)
          )
            selection.current = window.getSelection()?.toString() || "";
        }}
      >
        <ActionMenu
          label={t("contentMenu.label")}
          trigger={<Ellipsis size={16} />}
          className="icon-button"
        >
          {reference && (
            <MenuAction
              onClick={() => {
                if (!navigator.clipboard) {
                  setError(new Error(t("contentMenu.copyError")));
                  return;
                }
                navigator.clipboard
                  .writeText(new URL(reference, location.origin).href)
                  .catch(() => setError(new Error(t("contentMenu.copyError"))));
              }}
            >
              {t("contentMenu.copyLink")}
            </MenuAction>
          )}
          {canQuote && body !== undefined && (
            <MenuAction
              onClick={() => {
                const text =
                  selection.current ||
                  window.getSelection()?.toString() ||
                  body;
                window.dispatchEvent(
                  new CustomEvent("forgejo-quote-reply", {
                    detail: {
                      text:
                        text
                          .split("\n")
                          .map((line) => `> ${line}`)
                          .join("\n") + "\n\n",
                    },
                  }),
                );
              }}
            >
              {t("contentMenu.quote")}
            </MenuAction>
          )}
          {canQuote && newIssueURL && (
            <MenuLink
              to={`${newIssueURL}?${new URLSearchParams({
                blank: "1",
                body: referenceIssueBody(
                  reference || "",
                  body || "",
                  location.origin,
                ),
              })}`}
            >
              {t("contentMenu.reference")}
            </MenuLink>
          )}
          {canReport && (
            <MenuLink
              to={`/report-abuse?${new URLSearchParams({ type, id: String(id) })}`}
            >
              {t("contentMenu.report")}
            </MenuLink>
          )}
        </ActionMenu>
      </span>
      <Feedback error={error} />
    </>
  );
}
