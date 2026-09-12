import { useEffect } from "react";

/**
 * Registers the PWA service worker on the client.
 *
 * The import is dynamic and only runs in the browser: TanStack Start prerenders
 * the shell on the server, where `navigator` and `workbox-window` do not exist.
 * With `devOptions.enabled: false` there is no service worker in `bun run dev`,
 * so this resolves to a no-op there.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  }, []);

  return null;
}
