# Research: Offline-converging, browser-first P2P stack for MeldSpace

- **Date:** 2026-09-12
- **Access date for all sources:** 2026-09-12
- **Scope:** Which live-sync engine + transport + durability stack lets a 2-person, 36-hour
  hackathon ship a browser-first room where a peer can go fully offline, edit locally, then
  reconnect and automatically converge — with a control plane that is _not_ the source of truth.
- **Method:** primary sources only — official docs, READMEs, source code, npm registry,
  GitHub issues. Where a claim is inference rather than a documented fact it is marked
  **[inference]**.
- **Convention note:** This repo has no research-notes directory yet; findings are placed in
  `docs/research/` as the sensible home.

---

## TL;DR recommendation

**Build on Yjs (stable v13) + `y-webrtc` (WebRTC mesh) + `y-indexeddb` (offline persistence), with
a self-hosted signaling server. Make the text/code editor the hero of the offline demo. Cut tldraw
from the offline path entirely. Replace "Git-backed history" with a content-addressed checkpoint
log.**

tldraw sync is a server-authoritative WebSocket engine with an open, unassigned "offline support"
issue and no official P2P path; it fails the "server is not the source of truth" requirement and
cannot deliver the core demo. Yjs is the only stack here with mature editor bindings _and_ a
genuine CRDT merge guarantee _and_ a working P2P transport _and_ browser offline persistence — all
maintained enough to stand on in 36 hours.

---

## 1. tldraw sync engine

**Current version.** `@tldraw/sync-core` 5.4.0, published within 24h of 2026-09-12; ~84.8k weekly
downloads. (`npm i @tldraw/sync-core`)

**Server-authoritative over WebSocket — confirmed.**

- `TLSocketRoom` runs server-side per document and is documented as: "Store an authoritative copy
  of the document state. Transparently set up communication between multiple sync clients via
  WebSockets. Provide hooks for persisting the document state when it changes."
  ([tldraw sync docs](https://tldraw.dev/docs/sync))
- The collaboration overview states the lifecycle explicitly: clients connect over WebSocket to a
  room, "the server maintains one `TLSocketRoom` per active room", changes broadcast in real time,
  and "the server is authoritative for conflict resolution".
  ([tldraw Collaboration](https://tldraw.dev/sdk-features/collaboration))
- The client source describes a git-like **push / pull / rebase** model: local edits are applied
  optimistically, pushed to the server; the server replies `commit`, `discard`, or
  `rebase_with_diff`; the client undoes speculative changes, applies server state, then re-applies
  its own. (`packages/sync-core/src/lib/TLSyncClient.ts`, `TLSyncRoom.ts` on `main`)

**Does it support true offline editing + automatic merge on reconnect? Partially, and not durably.**

- The client _does_ keep editing while disconnected: `push()` squashes changes into
  `speculativeChanges` and returns early when `isConnectedToRoom` is false. On reconnect,
  `didReconnect()` rebases speculative changes onto the server diff and re-pushes them.
  (`TLSyncClient.ts`)
- But this is **not the CRDT-style offline guarantee the product needs**:
  1. It still requires an authoritative server to exist and hold the document. There is no
     server-less/P2P merge; take the server away and there is no convergence point at all.
  2. The offline edits live only in memory as `speculativeChanges`. Nothing persists them to
     IndexedDB. Closing/refreshing the tab loses offline work. **[inference from source]**
  3. The open feature issue **"Add offline support for tldraw sync" (#5505)** has been open since
     2025-02-26, unassigned, with no linked PR.
     ([tldraw#5505](https://github.com/tldraw/tldraw/issues/5505))
- tldraw's own offline desktop product states it "does not currently merge changes made to an open
  file by another program, sync client, Git operation, or computer."
  ([tldraw-offline README](https://github.com/tldraw/tldraw-offline))
- tldraw _does_ have independent local persistence (`persistenceKey` → IndexedDB), but the docs
  present persistence and sync as separate concerns, and there is no documented path that feeds
  IndexedDB-restored local edits into a reconnecting sync client. **[inference]**
  ([tldraw Persistence](https://tldraw.dev/docs/persistence))

**Can the transport be swapped for a WebRTC data channel? Technically yes, officially no.**

- `TLPersistentClientSocket` is a **public** interface: "Interface for persistent WebSocket-like
  connections used by TLSyncClient… Implementations should maintain connection resilience and
  handle network interruptions gracefully." `TLSyncClient` is also public and takes a
  `socket: TLPersistentClientSocket`. The doc-comment even shows a `MySocketAdapter` example and
  references an exported `ClientWebSocketAdapter`. (`TLSyncClient.ts`)
- **But** the counterpart must be an authoritative `TLSyncRoom`, which asserts it runs on
  Cloudflare Workers or Node 18+ (`isNativeStructuredClone` assertion) and is explicitly the
  server-side source of truth. Running it in a browser peer is unsupported.
- There is **no official P2P path**. The announcement only says the sync engine "uses the same
  public APIs that you can use instead to connect other backends like Yjs, Replicache, Liveblocks,
  or your own custom-built solution" — i.e. bring your own engine, not a P2P mode.
  ([Announcing tldraw sync](https://tldraw.substack.com/p/announcing-tldraw-sync))

**Multiple writers / conflicts.** Per-record application with server-side rebase; the server can
migrate records down to older client schemas, and can `discard`/`rebase` a client push. This is
server-ordered last-writer-per-record semantics, not a commutative CRDT merge. (`TLSyncRoom.ts`)

**Persistence model.** `InMemorySyncStorage` is the default (lost on restart). `SQLiteSyncStorage`
is "recommended for production" and works with Cloudflare Durable Object SQLite or Node
`better-sqlite3`/`node:sqlite`. Cloudflare template uses one Durable Object per room (SQLite) plus
R2 for assets. ([tldraw sync docs](https://tldraw.dev/docs/sync))

**Verdict:** ✅ great online collaborative canvas; ❌ wrong shape for the product's core promise
(server-authoritative, no durable offline converge, no official P2P). Do not build the offline
demo on it.

---

## 2. tldraw + CRDT bindings (Yjs / Loro)

**No first-party maintained binding exists.**

- `github.com/tldraw/tldraw-yjs-example` (the example the Loro repo points to) now **404s** — the
  official example was removed. Remaining work is community forks/examples:
  `BrianHung/tldraw-yjs`, `m8e/tldraw-yjs-example`, `partykit/sketch-tldraw`, and a Liveblocks
  tldraw+Yjs example.
  ([search results; Liveblocks example](https://liveblocks.io/examples/tldraw-whiteboard/nextjs-tldraw-whiteboard-yjs))
- **tldraw + Loro:** `loro-dev/loro-tldraw` exists but is an example repo (10 stars, 30 commits),
  not an integration shipped by tldraw. It still references the now-missing `tldraw-yjs-example`.
  ([loro-tldraw](https://github.com/loro-dev/loro-tldraw))
- tldraw officially frames custom backends as **your** responsibility: "you can use [public APIs]
  instead to connect other backends like Yjs, Replicache, Liveblocks, or your own custom-built
  solution." ([Announcing tldraw sync](https://tldraw.substack.com/p/announcing-tldraw-sync))

**What breaks in a Yjs/Loro binding.** The bindings must reconcile two different state models:

- **Ephemeral presence** (cursors, selections, camera follow) is not document state. tldraw sync
  keeps presence in a separate lane; a naive Yjs binding puts it in the CRDT, where stale presence
  is durable and wrong. tldraw's server removes presence per session; a CRDT has no such notion.
  ([tldraw sync docs "object-store lane", Collaboration overview])
- **Undo/redo:** Yjs `UndoManager` tracks the shared type and does not natively honor tldraw's
  per-user undo stack or tldraw's history interactions. This is a known hard seam.
- **Follow mode / viewport state** is per-user UI state, not shared document content.
- Every tldraw record shape (bindings, styles, assets) must be serialized/deserialized into Y
  types, and schema migrations must be mirrored. This is real work, not a wrapper.

**Verdict:** ❌ no safe 36-hour path. Binding tldraw to a CRDT is exactly the kind of custom
plumbing both the product doc and this research say to avoid.

---

## 3. Yjs path

**`y-webrtc` — P2P mesh over WebRTC, signaling-only server.**

- "Propagates document updates peer-to-peer to all users using WebRTC." Peers find each other via
  a signaling server; the package ships one at `./bin/server.js`.
- Topology is a **full mesh**: "every client is connected to every other client up until the
  maximum number of conns is reached"; default `maxConns = 20 + floor(random()*15)`, and it
  supports indirect sync if not every pair connects.
- Same-browser tabs sync over `BroadcastChannel` (no WebRTC needed); `filterBcConns` defaults true.
- Signaling payloads can be encrypted with a shared `password`, so untrusted signaling servers
  never see document data or connection info.
  ([y-webrtc README](https://github.com/yjs/y-webrtc))

**Maintenance caveat (important):** npm shows `y-webrtc@10.3.0`, **last published 3 years ago**,
with ~86.4k weekly downloads. It is stable and ubiquitous, but effectively frozen. Its _default_
signaling list includes two dead Heroku endpoints; only `wss://signaling.yjs.dev` is plausibly
alive. **Self-host signaling and pin the version.**
([npm y-webrtc](https://www.npmjs.com/package/y-webrtc))

**`y-indexeddb` — offline persistence.** "Use the IndexedDB database adapter to store your shared
data persistently in the browser… Makes offline editing possible." Exposes a `synced` event so you
can wait for local state before rendering. ([y-indexeddb README](https://github.com/yjs/y-indexeddb))

**Does Yjs genuinely converge after a full offline edit + reconnect? Yes.**
This is the core CRDT guarantee, and the canonical demo pattern is exactly MeldSpace's story:
`y-indexeddb` + `y-webrtc`, with the ProseMirror/Yjs author reporting "All content that is created
while offline is synced to the other peers when you reconnect to the internet," and tabs syncing
while offline over BroadcastChannel.
([discuss.prosemirror.net](https://discuss.prosemirror.net/t/offline-peer-to-peer-collaborative-editing-using-yjs/2488))
On reconnect y-webrtc re-runs the Yjs sync handshake (state vectors), so only missing updates
cross the wire. **[inference from Yjs sync protocol; consistent with the demo reports]**

**Editor bindings (maintained status).**

- **CodeMirror 6:** `y-codemirror.next` (`yCollab`). README: stable package targets **Yjs v13**;
  the `main` branch is the unstable `@y/codemirror` for Yjs v14. Use stable v13 + this binding.
  ([y-codemirror.next README](https://github.com/yjs/y-codemirror.next))
- **Monaco:** `y-monaco`. **ProseMirror/TipTap/Remirror:** `y-prosemirror`; the Yjs docs note
  TipTap is ProseMirror-based and the same binding applies.
  ([beta.yjs.dev ProseMirror](https://beta.yjs.dev/docs/ecosystem/editor-bindings/prosemirror))
- **Yjs v14 / `@y/*` scope is in development and unstable.** Both `y-codemirror.next` and
  `y-websocket` READMEs say most users should stay on Yjs v13 with the current packages.
- **Fallback if y-webrtc misbehaves:** `y-websocket` (central relay). Note its server holds an
  in-memory `Y.Doc`, so it _can_ be a source of truth; for MeldSpace you'd run a dumb relay or
  treat it only as rendezvous so peers still hold the authoritative replicas. The y-websocket
  README itself recommends YHub/Hocuspocus for production scaling.
  ([y-websocket](https://github.com/yjs/y-websocket))

**Known y-webrtc limits.** Full mesh (O(n²) connections) — fine at 3–4 peers, not at scale. Need
a signaling server. Public signaling unreliable. TURN may be required (see §6). Awareness/presence
works via `y-protocols` awareness but is separate from the doc.

**Verdict:** ✅ the safest offline-converge path in 36 hours, with the caveat that the transport
library is old and signaling must be self-hosted.

---

## 4. Alternative canvases with genuine offline CRDT

**Excalidraw — no; relay + LWW, not offline CRDT.**
Its collaboration is a **pseudo-P2P relay** (Socket.IO `excalidraw-room`): a central server relays
end-to-end-encrypted messages and does no coordination. Merge is: union elements by `id`, delete
via tombstone `isDeleted`, and on concurrent edits keep the higher `version`, breaking exact ties by
lower `versionNonce` — i.e. **last-writer-wins per element**, not CRDT. Multiplayer undo/redo was
unsolved (undo stack cleared on remote update). [Note: this is the canonical 2020 engineering post;
the model remains relay-based and self-hosting collab still needs a separate `excalidraw-room`
service, but treat the merge details as aged.]
([Excalidraw P2P blog](https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature),
[self-host docs](https://docs.excalidraw.com/docs/introduction/development))
**Verdict:** ❌ worse than Yjs for the offline story; LWW can silently lose concurrent same-element
edits, and no maintained CRDT canvas binding.

**Loro — strong CRDT, maturing ecosystem, DIY canvas.**
Loro 1.0 shipped stable encoding, 10–100× faster import, and version-control primitives
(Oct 2024); `loro-crdt` JS is at 1.14.1; `loro-prosemirror` v0.3.6 released 2025-10-29 and works
with TipTap; the Loro wire protocol (TS + Rust clients/servers) was open-sourced 2025-10-30.
([Loro 1.0](https://www.reddit.com/r/rust/comments/1gb3pdp/announcing_loro_10_a_highperformance_crdts),
[loro-prosemirror releases](https://github.com/loro-dev/loro-prosemirror/releases),
[Loro @loro_dev](https://x.com/loro_dev))
**Verdict:** ✅ as a Yjs alternative for **text**; ❌ no maintained canvas binding — canvas is DIY.

**Automerge — genuine offline CRDT with a real P2P adapter, no canvas binding.**
Automerge 3.0 (July 2025) cut memory >10× and is explicitly designed for offline and "not having a
server at all and doing everything peer-to-peer". `automerge-repo` 2.0 (May 2025) provides
IndexedDB storage plus WebSocket / MessageChannel / BroadcastChannel network adapters, and there is
a community **`automerge-repo-network-peerjs`** WebRTC adapter (PeerJS). Editor plugins exist for
ProseMirror/CodeMirror, but there is **no official canvas integration**.
([Automerge 3.0](https://automerge.org/blog/automerge-3),
[automerge-repo networking](https://automerge.org/docs/reference/repositories/networking),
[peerjs adapter](https://github.com/automerge/automerge-repo-network-peerjs))
**Verdict:** ✅ viable Yjs alternative (arguably cleaner P2P story via PeerJS), ❌ canvas still DIY,
and the editor-binding ecosystem is less battle-tested than Yjs. A reasonable Plan B, not Plan A.

**Safest offline-converge canvas in a short build:** a **minimal Yjs-native canvas** — shapes as
`Y.Map` records inside a `Y.Array`/`Y.Map` keyed by id, rendered with plain SVG or Konva/Fabric —
rather than trying to bind tldraw. You own the model, so presence/undo/history are explicit and
there is no serializer to write. **[inference]**

---

## 5. isomorphic-git in the browser

**Feasibility of commits against an IndexedDB / in-memory FS: yes.**
isomorphic-git is a pure-JS git that brings its own `fs` and `http`. In the browser you pair it with
a filesystem shim — **LightningFS** (same author) is the recommended one; ZenFS and Filer also
work. It supports `init/add/commit/log/merge/branch/push/pull/readObject/writeObject`, etc.
([isomorphic-git README](https://github.com/isomorphic-git/isomorphic-git))

**Two hard warnings.**

- **Corruption risk:** "LightningFS may apply file operations out of order, which can lead to
  repository corruption if the process crashes. You can mitigate this by calling `fs.flush()`
  after Git operations." A hackathon demo crashing mid-write and corrupting the history repo is a
  real failure mode.
- **CORS:** HTTP remotes need a CORS proxy (`@isomorphic-git/cors-proxy`); GitHub does not send
  CORS headers. Irrelevant for pure P2P, but it means "just push to a remote" is not free.

**Replicating a Git object store peer-to-peer (objects by SHA): not a feature.**
There is no maintained browser P2P-git example. Evidence is limited to a 2020 HN comment about
"using WebRTC to mesh up clients and using Git in a truly distributed fashion" and an open issue
requesting pluggable remotes ("not using dat only WebRTC to enable P2P git cloning") — i.e. it
was _desired_, not built.
([HN 2020](https://news.ycombinator.com/item?id=22420231),
[isomorphic-git#97](https://github.com/isomorphic-git/isomorphic-git/issues/97))
Object transfer-by-SHA (have/want negotiation, packfiles) would be a research project on top of an
already-risky dependency.

**Pragmatic choice: a content-addressed checkpoint log.**
Store checkpoints as `{ id, parentId(s), timestamp, author, snapshotHash, blob }`, replicated in a
Yjs `Y.Array`/`Y.Map` and persisted locally in IndexedDB. Hash snapshots with `crypto.subtle.digest`
(SHA-256) for content addressing. This delivers the demo-visible value — room history, rewind,
"what changed while I was away", immutable checkpoints, P2P replication — without a filesystem shim
or packfile logic. Keep isomorphic-git as a **stretch/export** (dump a `.git` dir) only.
**[inference / engineering recommendation]**

---

## 6. Transport realities

**Signaling.** y-webrtc requires a WebSocket signaling server to exchange SDP/ICE. It supports
multiple signaling servers concurrently and a `password` that encrypts the signaling payload so
untrusted servers learn nothing. The packaged server is `y-webrtc/bin/server.js`; a ~50-line `ws`
server is enough. **Do not rely on the default list** (two dead Heroku URLs).
([y-webrtc README](https://github.com/yjs/y-webrtc))

**When is TURN required?**

- Direct P2P works on host candidates (same LAN) and with STUN when NATs are port-restricted cone
  NATs — "most consumer routers today behave as port-restricted cone NATs."
- TURN (coturn) is required when a peer is behind **symmetric NAT**, restrictive corporate
  firewalls, or **carrier-grade NAT** (mobile hotspots), because those don't allow direct
  connections.
  ([webrtcHacks symmetric NAT](https://webrtchacks.com/symmetric-nat),
  [webrtc.org TURN](https://webrtc.org/getting-started/turn-server))
- y-webrtc passes `peerOpts` to simple-peer, so custom ICE servers are configured via
  `peerOpts: { config: { iceServers: [{ urls: 'turn:…', username, credential }] } }`.
  ([discuss.yjs.dev](https://discuss.yjs.dev/t/signalling-server-on-different-network/133))

**Likelihood at a hackathon venue.** Same-room peers on one WiFi are often directly connectable,
which is why lots of demos work without TURN. But guest WiFi frequently enables AP/client
isolation or sits behind CGNAT, both of which defeat direct connections. **Bring a TURN fallback
(coturn on a small VPS, or a managed TURN service) and wire the credentials in from day one.**
It is insurance, not a requirement — but the one thing that turns a working demo into a dead one.
**[inference]**

**Mesh vs star for 3–4 browser peers.** y-webrtc is a full mesh and defaults to allowing far more
than 4 connections; for 3–4 peers this is ideal — everyone replicates directly, no single peer is a
bottleneck or a new server-of-record, and same-machine tabs use BroadcastChannel. A star relay is
only needed at larger scale or as a connectivity fallback (`y-websocket`). ([y-webrtc README])

---

## 7. Recommendation

### Safest stack for the 36-hour, offline-converging P2P room

| Layer               | Choice                                                                                        | Why                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Shared state        | **Yjs v13** (`Y.Doc`)                                                                         | CRDT merge is the only thing that guarantees offline converge without a server arbiter |
| Transport           | **`y-webrtc` mesh**, self-hosted signaling; `y-websocket` relay as fallback behind an adapter | Signaling-only P2P; server never owns content; mesh is perfect at 3–4 peers            |
| Offline persistence | **`y-indexeddb`**, gate UI on the `synced` event                                              | Survives reload/crash while offline; documented offline support                        |
| Hero surface        | **CodeMirror 6 + `y-codemirror.next`** (or TipTap + `y-prosemirror`)                          | Maintained binding, smallest surface for a bulletproof offline-converge demo           |
| Canvas (if kept)    | **Minimal Yjs-native canvas** (shapes as `Y.Map`s) — _not_ tldraw                             | You control presence/undo/history; no serializer or broken binding                     |
| History             | **Content-addressed checkpoint log** in Yjs + IndexedDB; isomorphic-git only as export        | 90% of git's demo value, 10% of the risk                                               |
| Control plane       | Auth + room metadata + **signaling** only                                                     | Matches MeldSpace's stated architecture                                                |

### Make the hero **text**, not canvas

Text is where the offline story is provably safe: `y-codemirror.next` + `y-webrtc` +
`y-indexeddb` is a known-working combination, and Yjs's merge is what the demo is _about_. Canvas is
where every option forces you into either a server-authoritative engine (tldraw sync) or a custom
binding with breakable presence/undo (tldraw+Yjs/Loro). If canvas must be the hero, build a tiny
Yjs-native canvas — do not spend the hackathon fighting a tldraw binding.

### What to cut

- **tldraw sync as the sync engine.** Server-authoritative, offline issue #5505 open and unassigned,
  no official P2P. It actively contradicts "the hosted service should not be the source of truth."
- **tldraw + Yjs/Loro bindings.** No first-party maintained binding; presence, undo/redo, and follow
  mode all break. The official example repo is gone.
- **Real Git object-store replication P2P.** isomorphic-git works locally but has a documented
  corruption footgun (LightningFS ordering) and no built-in P2P remote; packfile/have-want
  negotiation is a research project.
- **Excalidraw** as the canvas. Relay-based LWW, not offline CRDT; self-hosting collab needs a
  separate room service.
- **Scale concerns.** Optimise only for 3–4 peers; ignore mesh limits beyond that.

### Ordered fallback ladder

1. Yjs + `y-webrtc` + `y-indexeddb` (default).
2. Same, with TURN credentials added to `peerOpts.config.iceServers` (venue network blocks P2P).
3. `y-websocket` relay as rendezvous (keep peers authoritative; treat the relay as dumb transport).
4. Automerge + `automerge-repo` + IndexedDB + PeerJS adapter (if you want a different CRDT and are
   willing to give up the tldraw-style canvas ecosystem entirely).

### Risks to watch

- **`y-webrtc` is unmaintained-by-recency** (last npm publish 3 years ago). Pin the version and
  self-host signaling; know the `y-websocket` fallback.
- **Yjs v14 / `@y/*`** is unstable and in development; stay on Yjs v13 with the current bindings.
- **Signaling availability** is a single point of _discovery_, not of truth — run it in the control
  plane and keep a localhost fallback for the demo.
- **TURN** is venue-dependent; test on the actual network before the demo.

---

## Sources

All URLs accessed **2026-09-12**.

**tldraw**

- tldraw sync docs — https://tldraw.dev/docs/sync
- tldraw Collaboration overview — https://tldraw.dev/sdk-features/collaboration
- tldraw Persistence — https://tldraw.dev/docs/persistence
- `@tldraw/sync-core` on npm (v5.4.0) — https://www.npmjs.com/package/@tldraw/sync-core
- `TLSyncClient.ts` source (push/pull/rebase, `TLPersistentClientSocket`) —
  https://raw.githubusercontent.com/tldraw/tldraw/main/packages/sync-core/src/lib/TLSyncClient.ts
- `TLSyncRoom.ts` source (authoritative room, per-record conflict handling) —
  https://raw.githubusercontent.com/tldraw/tldraw/main/packages/sync-core/src/lib/TLSyncRoom.ts
- Issue #5505 "Add offline support for tldraw sync" (open, unassigned) —
  https://github.com/tldraw/tldraw/issues/5505
- Announcing tldraw sync — https://tldraw.substack.com/p/announcing-tldraw-sync
- tldraw-offline README (no merge with external writers) —
  https://github.com/tldraw/tldraw-offline

**tldraw + CRDT**

- loro-tldraw example — https://github.com/loro-dev/loro-tldraw
- Liveblocks tldraw + Yjs example —
  https://liveblocks.io/examples/tldraw-whiteboard/nextjs-tldraw-whiteboard-yjs
- Community forks: https://github.com/BrianHung/tldraw-yjs ,
  https://github.com/m8e/tldraw-yjs-example ,
  https://github.com/partykit/sketch-tldraw
- `tldraw/tldraw-yjs-example` — 404 (removed)

**Yjs**

- y-webrtc README — https://github.com/yjs/y-webrtc
- y-webrtc npm (v10.3.0, last publish 3 years ago, ~86.4k weekly downloads) —
  https://www.npmjs.com/package/y-webrtc
- y-indexeddb README — https://github.com/yjs/y-indexeddb
- y-codemirror.next README (Yjs v13 stable vs unstable v14) —
  https://github.com/yjs/y-codemirror.next
- y-websocket README — https://github.com/yjs/y-websocket
- ProseMirror y-prosemirror docs — https://beta.yjs.dev/docs/ecosystem/editor-bindings/prosemirror
- Offline P2P Yjs demo (offline edits sync on reconnect) —
  https://discuss.prosemirror.net/t/offline-peer-to-peer-collaborative-editing-using-yjs/2488

**Alternatives**

- Excalidraw P2P collaboration (relay + LWW + tombstoning) —
  https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature
- Excalidraw local install / self-hosting — https://docs.excalidraw.com/docs/introduction/development
- Loro 1.0 announcement —
  https://www.reddit.com/r/rust/comments/1gb3pdp/announcing_loro_10_a_highperformance_crdts
- loro-prosemirror releases — https://github.com/loro-dev/loro-prosemirror/releases
- Loro wire protocol open-sourced — https://x.com/loro_dev
- Automerge 3.0 — https://automerge.org/blog/automerge-3
- Automerge networking / adapters —
  https://automerge.org/docs/reference/repositories/networking
- automerge-repo README — https://github.com/automerge/automerge-repo
- automerge-repo-network-peerjs — https://github.com/automerge/automerge-repo-network-peerjs

**Git in browser + transport**

- isomorphic-git README (LightningFS corruption warning, CORS) —
  https://github.com/isomorphic-git/isomorphic-git
- isomorphic-git#97 "Allow for pluggable types of remotes" —
  https://github.com/isomorphic-git/isomorphic-git/issues/97
- WebRTC P2P git meshing (2020 discussion) —
  https://news.ycombinator.com/item?id=22420231
- y-webrtc + TURN via `peerOpts` — https://discuss.yjs.dev/t/signalling-server-on-different-network/133
- Symmetric NAT and TURN — https://webrtchacks.com/symmetric-nat
- TURN server setup — https://webrtc.org/getting-started/turn-server
