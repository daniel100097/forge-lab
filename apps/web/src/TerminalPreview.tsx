import { useEffect, useRef, useState } from "react";
import { create } from "asciinema-player";
import "asciinema-player/dist/bundle/asciinema-player.css";
import { useTranslation } from "react-i18next";
import { Feedback } from "./UI";
export default function TerminalPreview({ url }: { url: string }) {
  const { t } = useTranslation("repository");
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!host.current) return;
    setError(null);
    const player = create(
      { url, fetchOpts: { credentials: "same-origin" } },
      host.current,
      {
        autoPlay: false,
        preload: true,
        fit: "width",
        terminalFontFamily: "var(--font-mono)",
        logger: {
          log() {},
          debug() {},
          info() {},
          warn() {},
          error() {
            setError(new Error(t("preview.terminalFailed")));
          },
        },
      },
    );
    return () => player.dispose();
  }, [url]);
  return (
    <section className="p-4 [&_.ap-wrapper]:max-w-full">
      <Feedback error={error} />
      <div ref={host} aria-label={t("preview.terminalLabel")} />
    </section>
  );
}
