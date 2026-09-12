import type { GenerateSWOptions } from "workbox-build";
import type { Plugin } from "vite";

/**
 * Workbox options for precaching the app shell.
 *
 * Shared between the `vite-plugin-pwa` manifest config and the standalone
 * service-worker build below.
 */
export const pwaWorkbox = {
  // The shell, its hashed assets, and the static icons/manifest. Control-plane
  // calls (`/trpc`, `/api`) are never precached.
  globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}"],
  // Offline navigations (including `/room/<id>`) get the cached shell; the
  // router then boots and reads room state from IndexedDB.
  navigateFallback: "/_shell.html",
  navigateFallbackDenylist: [/^\/trpc/, /^\/api/, /^\/_serverFn/],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
} satisfies Partial<GenerateSWOptions>;

/**
 * Builds the PWA service worker after TanStack Start has finished building.
 *
 * `vite-plugin-pwa` cannot do this under TanStack Start: its build plugin skips
 * generation when the captured Vite config reports `build.ssr`, and Start
 * resolves the SSR environment's config last, so that flag is always set by the
 * time the client bundle closes (vite-pwa/vite-plugin-pwa#902). Start also
 * prerenders `_shell.html` in a post-build step, after the client bundle closes,
 * so the shell can't be globbed at that point anyway.
 *
 * Running as a `buildApp` post hook means `dist/client` is complete — shell,
 * hashed assets and web manifest all on disk — so one Workbox pass precaches
 * the whole shell. `vite-plugin-pwa` still owns the manifest and the
 * `virtual:pwa-register` module.
 */
export function pwaServiceWorker(): Plugin {
  let clientOutDir = "dist/client";

  return {
    name: "meldspace:pwa-service-worker",
    apply: "build",
    // `enforce: "post"` keeps this after TanStack Start's own post-build plugin
    // (which is also `enforce: "post"`), so the shell exists before we glob.
    enforce: "post",
    configResolved(config) {
      clientOutDir = config.environments.client?.build.outDir ?? `${config.build.outDir}/client`;
    },
    buildApp: {
      order: "post",
      async handler() {
        const { generateSW } = await import("workbox-build");
        const { count, size, warnings } = await generateSW({
          ...pwaWorkbox,
          globDirectory: clientOutDir,
          swDest: `${clientOutDir}/sw.js`,
        });

        for (const warning of warnings) {
          console.warn(`[pwa] ${warning}`);
        }
        console.log(`[pwa] precached ${count} files, ${(size / 1024).toFixed(1)} KiB`);
      },
    },
  };
}
