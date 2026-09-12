# Drawing board options — research brief

Date: 2026-09-12. Verified against npm registry, GitHub, and primary docs.

## Verdict

**Excalidraw (`@excalidraw/excalidraw`, MIT) driven by our own Yjs binding (`y-excalidraw`) on the same `Y.Doc` as the text surface.**

One room = one `Y.Doc`. Text lives in a `Y.Text` (y-codemirror), board elements in the binding's `Y.Array`/`Y.Map`, images in its `yAssets` map. Transport `y-webrtc` (full mesh), persistence `y-indexeddb`, presence `y-protocols` awareness — all shared with the text surface.

Spike **#14** gates **#11** with a hard 4h go/no-go. If it fails, fall back to a Yjs-native board.

## Why Excalidraw + y-excalidraw

- Excalidraw is a real board: freehand, rectangle/ellipse/diamond, arrows with bindings, text, frames, images, selection/transform/zoom. MIT, actively maintained.
- `y-excalidraw` is a thin binding whose own README wires `WebrtcProvider` directly; it supports awareness cursors/selections, a shared `Y.UndoManager`, and a `yAssets` map for files.
- It preserves the thesis: no server owns content, and offline converges because the Y.Doc is the source of truth.
- It is strictly less work than hand-building a board and gives a much better drawing surface.

## Versions

| Package | Version | Date | License | Notes |
|---|---|---|---|---|
| `@excalidraw/excalidraw` | 0.18.1 | 2026-04-20 | MIT | Client-only, no SSR; main bundle ~353KB gzip |
| `y-excalidraw` | 2.0.12 | 2024-12-10 | MIT | Targets Excalidraw `^0.17.6`; the de-facto reference |
| `@mizuka-wu/y-excalidraw` | 2.0.16 | 2025-08-16 | MIT | Fork targeting Excalidraw `^0.18.0` |
| `@excalidraw-yjs/*` (alkem-io) | 0.5.2 | 2026-08-26 | MIT | Native hard fork; per-property `Y.Map` + tombstones + host-owned assets. Architecturally correct, 0★, unproven |

Pin decision belongs to #14. Do **not** use Excalidraw's built-in collaboration: it is a socket.io relay (server-relayed, no offline merge), even though it is E2E-encrypted.

## Alternatives considered

| Option | Reliability | Effort | Thesis | Drawing quality |
|---|---|---|---|---|
| Excalidraw + `y-excalidraw` | Medium (stale pin) | Low (~16–20h) | High | High |
| Custom Yjs board (react-konva/SVG + `perfect-freehand`/`roughjs`) | High | High (~22–28h) | Highest | Medium–High |
| Konva / Fabric + Yjs (manual) | High | High | Highest | Medium |
| Loro | Medium | High | Low (no official WebRTC/IndexedDB adapters) | Medium |
| Automerge Repo | Medium | High | Medium (WebRTC adapter is stale, `latest` is an alpha) | Medium |
| WBO / SpaceDeck / js-draw / tldraw | Low–Medium | Low | Low (server-relayed, AGPL, unmaintained, or license-locked) | High |

Loro and Automerge would mean a second document, provider, persistence store, and undo stack in one room, with no document-level bridge to Yjs. Do not mix CRDTs.

## Risks

1. **Binding staleness.** `y-excalidraw` pins Excalidraw `^0.17.6`; current is 0.18.1. Either pin 0.17.6 or use the `mizuka-wu` fork.
2. **Whole-element LWW.** Concurrent edits to the *same* element clobber (e.g. two people typing in one text element). Fine for a board; do not demo simultaneous typing in one label.
3. **No sticky-note tool.** Compose rectangle + text. Images need the `yAssets` path.
4. **Operational.** `y-webrtc` needs self-hosted signaling and likely TURN; the mesh is capped around 20–35 connections; some default signaling endpoints are dead.
5. **Bundle/SSR.** Excalidraw does not support SSR; lazy-load with `ssr: false` + `ClientOnly`.

## Fallback (if #14 is NO-GO)

A Yjs-native board: `Y.Map` objects keyed by stable id, freehand strokes as `Y.Array` of points rendered with `perfect-freehand`, shapes with `roughjs` (store the `seed` so every peer renders identically), `Y.UndoManager` for per-user undo, awareness cursors. Highest thesis fidelity, most work.

## Sources

- `github.com/excalidraw/excalidraw` · `github.com/RahulBadenkal/y-excalidraw` · `github.com/mizuka-wu/y-excalidraw` · `github.com/alkem-io/excalidraw-yjs`
- `plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature/`
- npm registry metadata for all packages above (retrieved 2026-09-12)
