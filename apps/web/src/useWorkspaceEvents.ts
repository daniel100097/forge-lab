import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { native } from "./api";

export function useWorkspaceEvents(signedIn: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!signedIn || typeof EventSource === "undefined") return;
    let stream: EventSource | undefined;
    const close = () => {
      stream?.close();
      stream = undefined;
    };
    const connect = () => {
      if (stream) return;
      const current = new EventSource(native("/user/events"));
      stream = current;
      current.addEventListener("notification-count", () => {
        void client.invalidateQueries({ queryKey: ["notification-count"] });
        void client.invalidateQueries({ queryKey: ["notifications"] });
      });
      current.addEventListener("stopwatches", () => {
        void client.invalidateQueries({ queryKey: ["issue-metadata"] });
        void client.invalidateQueries({ queryKey: ["active-stopwatch"] });
      });
      current.addEventListener("logout", (event) => {
        if (
          (event as MessageEvent).data === '"here"' ||
          (event as MessageEvent).data === "here"
        ) {
          close();
          client.removeQueries({
            predicate: (q) => q.queryKey[0] !== "bootstrap",
          });
          void client.invalidateQueries({ queryKey: ["bootstrap"] });
        }
      });
      current.addEventListener("close", () => {
        close();
        void client.invalidateQueries({ queryKey: ["bootstrap"] });
      });
    };
    // Close explicitly before a document unload. Safari can otherwise report
    // an aborted notification stream as an access-control error on navigation.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) connect();
    };
    connect();
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", restore);
      close();
    };
  }, [client, signedIn]);
}
