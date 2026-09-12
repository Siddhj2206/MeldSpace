# 2. The client is a SPA/PWA, not SSR

Date: 2026-09-12
Status: accepted

## Context

The product's claim is that the room survives the network. Room state is already local
(Yjs + y-indexeddb), but the app shell was server-rendered, so a refresh while disconnected
could not mount the app. A server dependency for the shell contradicts the claim.

## Decision

The web client is a pure SPA and an installable PWA. TanStack Start runs in SPA mode;
`vite-plugin-pwa` precaches the app shell into the service worker Cache Storage. Room state
stays in IndexedDB. The control plane is reached only when online; offline it is unavailable
and the app degrades gracefully.

## Consequences

- Offline reload works: the shell is served from cache and the room loads from IndexedDB.
- One server function (`get-user`) and the SSR query integration move to the client.
- Service workers and install require a secure context (HTTPS or localhost). A LAN-IP demo
  cannot exercise them, so a cross-machine demo needs a TLS origin.
- SSR first-paint/SEO benefits are forfeited; irrelevant behind a room URL.

## Alternatives considered

- **Keep SSR for non-room routes** — rejected: the shell still fails to boot offline, and the
  room is the product.
- **Native shell (Tauri) or serve the app locally** — deferred: a PWA gets installability and
  an offline boot without a native build.
