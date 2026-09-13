# Mapping MeldSpace onto a local-first LaTeX paper editor

Date: 2026-09-12. Author: architecture mapping pass (read-only; no code changed).

Scope: take the existing MeldSpace substrate — Yjs + `y-webrtc` + `y-indexeddb`, the SPA/PWA
shell, the Postgres control plane, the "Quiet Room" design system — and map it onto a pivot: a
local-first / peer-to-peer Overleaf, i.e. collaborative multi-file LaTeX paper writing. Then
propose the minimal architecture and the smallest demo that shows the unique value.

Method: read the working tree (branch `feat/15-room-shell`, which contains uncommitted WIP),
`HEAD`, the issue tracker, the frozen design exports, and primary sources for the browser-TeX
and CodeMirror-LaTeX pieces. Claims are marked `[inference]` where they are engineering
judgement, not something read off disk or a cited source.

---

## 0. TL;DR

- **The substrate survives the pivot almost intact.** The `Y.Doc` + `y-webrtc` + `y-indexeddb`
  trio in `apps/web/src/room/room-provider.tsx` is exactly the stack a P2P LaTeX editor needs.
  The control plane (#4) needs **no schema change**: `room.name` is the paper title, membership
  and join codes are unchanged, and the "no content / no authority columns" invariant still
  holds.
- **The pivot is mostly a re-labelling of "room → project" plus three new surfaces:** a LaTeX
  editor, a compiled-PDF preview, and a project file tree. The existing shell (#15, built as
  uncommitted WIP) already hosts surfaces and a history rail; it needs its flat artifact model
  replaced by a file tree.
- **The planned #6 checkpoint log is not optional any more — it is the product's version
  history.** A LaTeX paper is *the* thing users already manage with Git, so #6/#7 become the
  strongest reuse story in the pivot. The `HistoryStore` interface should store a Yjs state
  update per checkpoint (content-addressed), and "rewind" should be a normal forward edit that
  writes the old content back.
- **Compiling LaTeX in a Web Worker is a solved problem with a mature reference
  implementation:** TeXlyre already ships a local-first, Yjs + WebRTC, offline, PWA LaTeX/Typst
  editor using WASM TeX engines ([TeXlyre](https://github.com/TeXlyre/texlyre)). BusyTeX
  (`texlyre-busytex`) supports multi-file `additionalFiles`, a Web Worker, and SyncTeX; its
  assets are ~32 MB WASM + 90–400 MB of TeX Live data. This is the single largest cost and risk.
- **Biggest technical risks, by module:** Yjs doc size (`room-provider.tsx`), per-file
  persistence (same file), worker + WASM + asset plumbing
  (`apps/web/src/workers/latex-compile.worker.ts`), PWA caching of multi-MB assets
  (`vite-plugins/pwa-service-worker.ts`), and the design system having no artboard for a LaTeX
  project (`docs/design/exports/`).
- **Recommended minimal scope:** one project, multi-file `.tex` + `.bib`, LaTeX editor, in-browser
  pdfLaTeX via a Worker, file tree, checkpoint history + inspect, figures via a content-addressed
  BlobStore (inline backend for the demo), offline edit + reload, coordinator. **Cut Excalidraw
  (#11/#14), comments, and Typst.**

---

## 1. What actually exists today (verified by reading the tree)

### 1.1 The P2P substrate

`apps/web/src/room/room-provider.tsx` is the whole substrate, built once per room:

```ts
const doc = new Y.Doc();
const persistence = new IndexeddbPersistence(`meldspace-${roomId}`, doc);
const provider = new WebrtcProvider(roomId, doc, {
  signaling: [signalingUrl()],
  maxConns: 20,
  filterBcConns: true,
});
```

It exposes `RoomRuntime { doc, awareness, provider, persistence }`, plus presence (`peers`),
mesh peer count, a derived room status (`room-status.ts`), online/offline, a control-plane
`meta` query (`room.byId`, best-effort), and a share URL. Presence rides `y-protocols`
awareness; durability rides `y-indexeddb` keyed by room.

The editable content is a **single text field**: `room/artifacts.ts` declares
`DOCUMENT_ARTIFACT = { sourceKey: "content", ... }`, and `room/surfaces.tsx` binds
`runtime.doc.getText("content")` to CodeMirror via `yCollab`, with a `Y.UndoManager`. At `HEAD`
this same pattern lived directly in `apps/web/src/routes/room.$roomId.tsx` (the route has been
rewritten by the WIP shell branch).

### 1.2 The SPA/PWA shell (#20)

- `apps/web/vite.config.ts`: TanStack Start **SPA mode**, `VitePWA` with `injectRegister: false`,
  `registerType: "autoUpdate"`, manifest, `devOptions.enabled: false`.
- `apps/web/vite-plugins/pwa-service-worker.ts`: a custom post-build Workbox pass. `pwaWorkbox`
  precaches `**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}`, `navigateFallback:
  "/_shell.html"`, denylist `/trpc`, `/api`, `/_serverFn`.
- `apps/web/src/components/pwa-register.tsx`: dynamic `virtual:pwa-register`.
- `apps/web/src/router.tsx` and `apps/web/src/routes/__root.tsx`: client-owned QueryClient, tRPC
  HTTP batch link, PWA manifest link, `.dark` pinned on `<html>`.
- `apps/web/src/index.css` self-hosts Inter + JetBrains Mono so typography survives an offline
  reload.

**This is the pivot's offline-boot guarantee and it survives unchanged.** The one gap for LaTeX
is asset caching (see §6.4).

### 1.3 The control plane (#4)

- `packages/db/src/schema/room.ts`: `room` / `device` / `member` / `invite`. The header comment
  is explicit: *"No room content (no document/canvas/CRDT/blob columns). No authority columns
  (no owner/coordinator/epoch)."* `device.userId` nullable; `member` keys on `deviceId`, not
  `doc.clientID`.
- `packages/db/src/schema/auth.ts`: Better Auth `user` / `session` / `account` / `verification`.
- `packages/api/src/routers/`: `room.create | byId | join`, `device.register`, `member.list`.
  `room.create` allocates a 6-char join code with collision retry.
- `packages/auth/src/index.ts`: Better Auth + Drizzle, LAN-aware cookie attributes.
- `apps/signaling/`: a `y-webrtc-signaling` process, pinned to `y-webrtc@10.3.0`.

**No schema or API change is required by the pivot.** "Create room" becomes "create project";
`room.name` becomes the paper title; the join flow is the invite flow. The only content-shaped
thing that *could* tempt a schema change — the main `.tex` filename or engine choice — must stay
out of Postgres to preserve invariant #3 (no room content in the control plane). Store project
metadata in the CRDT.

### 1.4 The shell (#15) is built but uncommitted

`apps/web/src/room/` (untracked) implements most of #15: `room-shell.tsx` (sidebar + tab strip +
presence + share + rail + palette), `room-sidebar.tsx` (room switcher, status footer, `COORD · R<n>`,
`PRESENT`), `room-rail.tsx` (Details / People / History, with explicit placeholders for #6/#7),
`command-palette.tsx` (⌘K, disabled "Create checkpoint · arrives #6"), `share-dialog.tsx` (link +
QR + code), `roster.ts`, `identity.ts`, `coordinator.ts` (reads a `coordinator` Y.Map; empty
until #10), `icons.tsx`. `git status` shows it as WIP on `feat/15-room-shell`, and
`packages/ui` gained sidebar/tabs/dialog/command/etc. **Treat the shell as real, landed work for
the pivot — do not rebuild it.**

### 1.5 Planned-but-unbuilt pieces

- **#6 checkpoint log / `HistoryStore`** — no code. Referenced by string only (`room-rail.tsx`,
  `command-palette.tsx`). Design (per issue + the offline-stack research): content-addressed
  (SHA-256) checkpoints in Yjs, `{id, parentId(s), timestamp, author, snapshotHash, blob}`,
  replicated P2P, persisted in IndexedDB, isomorphic-git export only.
- **#7 history UI** — placeholder rail; designs exist (frames 6/7 in the remaining-screens
  export).
- **#8 content-addressed blob transport** — no code. Images transferred P2P separately from room
  metadata; a small reference in the Yjs doc.
- **#9 image surface** — placeholder.
- **#10 coordinator + epoch** — `coordinator.ts` reads the register; nothing writes it yet.
  Canonical rule in `CONTEXT.md` and `docs/adr/0001-coordination-authority.md`.
- **#11/#14 Excalidraw board** — not built; spike #14 never ran.
- **#17 auth + join** — designed, not built; current login/launcher are scaffold.

### 1.6 The design system

- Brief: `docs/research/2026-09-12-design-brief.md` ("The Quiet Room": instrument black × amber
  signal, identity hues for people only, Inter + JetBrains Mono).
- Tokens: `packages/ui/src/styles/globals.css` (authoritative), mirrored in
  `docs/design/exports/tokens.css`.
- Frozen artboards in `docs/design/exports/`: `room-shell-editor.jsx`,
  `room-shell-board.jsx`, `room-remaining-screens.jsx` (auth, create, join, share, history,
  rewind, image/file surface, command palette, offline status).
- The editor artboard is a **single Markdown document** (`meeting-notes.md`) under group labels
  `DOCUMENTS / FILES / BOARDS / COMMENTS`. A content search of the exports for
  `pdf|PDF|compile|LaTeX|latex|.tex|file tree|figures|bibliograph` returns **no matches**. The
  design system does not know what a LaTeX project is (see §6.5).

---

## 2. The pivot as a mapping

| MeldSpace today | LaTeX-editor pivot | New invariant |
| --- | --- | --- |
| Room | Paper project | A project is the shared distributed object. |
| Room id (`/room/$roomId`) | Project id (`/room/$roomId`, keep the URL shape) | Same URL, no migration. |
| One `Y.Text("content")` | `Y.Map<Y.Text>` keyed by file path (`main.tex`, `sections/intro.tex`, `refs.bib`) | One project = one `Y.Doc` (extend #11's rule). |
| Markdown editor surface | LaTeX editor surface (`codemirror-lang-latex`) | Editor reads the active file's `Y.Text`. |
| (none) | Compiled-PDF preview surface | PDF is derived, never a Yjs type; bytes are content-addressed. |
| Flat artifact list (Documents/Files/Boards/Comments) | Project file tree | The sidebar shows paths, not artifact kinds. |
| Checkpoint log (#6, unbuilt) | Paper version history | Every "submitted draft" is a checkpoint; inspect + restore. |
| Image blob transport (#8, unbuilt) | Figure / asset channel | `\includegraphics` bytes stay out of the CRDT. |
| Coordinator + epoch (#10, unbuilt) | Who named the checkpoint / who admits a peer | Unchanged. |
| Excalidraw board (#11) | Diagrams (optional) | **Out of minimal scope.** |

---

## 3. Piece-by-piece disposition

Legend: **S** survives unchanged · **C** changes · **N** new.

### 3.1 Substrate, shell, platform

| Piece | Path | Disposition | Note |
| --- | --- | --- | --- |
| P2P runtime | `apps/web/src/room/room-provider.tsx` | **S** (small C) | Add a project-store handle; optionally per-file docs later. |
| Sync-status vocabulary | `apps/web/src/room/room-status.ts` | **S** | Add a compile status alongside; keep Local/Queued/Converged. |
| Coordinator reader | `apps/web/src/room/coordinator.ts` | **S** | Fed by #10. |
| Roster / identity / share | `roster.ts`, `identity.ts`, `share-dialog.tsx` | **S** | Share dialog = invite to project. |
| Shell chrome | `room-shell.tsx` | **C** | `artifacts` currently hardcodes `[DOCUMENT_ARTIFACT]`; derive from the file tree. |
| Sidebar | `room-sidebar.tsx` | **C** | Replace grouped artifact list with a file tree. |
| Rail | `room-rail.tsx` | **C** | Details = project (main file, engine, compile); History becomes real (#7). |
| Command palette | `command-palette.tsx` | **C** | Add compile / new file / go-to-file; enable "Create checkpoint". |
| Icons | `room/icons.tsx` | **C** | Add `.tex`/`.bib`/`.pdf`/image glyphs. |
| Artifact model | `apps/web/src/room/artifacts.ts` | **C** | Becomes the project/file model; keep the "surface ≠ data" separation. |
| Surface registry | `apps/web/src/room/surfaces.tsx` | **C** | `document` → `latex`; add `pdf`, `image`. |
| Room route | `apps/web/src/routes/room.$roomId.tsx` | **C** (cosmetic) | Works as-is; optionally rename `roomId` → `projectId`. |
| SPA/PWA wiring | `vite.config.ts`, `vite-plugins/pwa-service-worker.ts`, `pwa-register.tsx`, `router.tsx`, `__root.tsx` | **S** (C for caching) | Cache the TeX engine (see §6.4). |
| Shared UI primitives | `packages/ui/**` | **S** | Sidebar/tabs/dialog/command already added by #15. |
| Design tokens | `packages/ui/src/styles/globals.css` | **S** | Quiet Room palette carries over unchanged. |

### 3.2 Control plane (#4)

| Piece | Path | Disposition |
| --- | --- | --- |
| Schema | `packages/db/src/schema/{auth,room}.ts` | **S** — no content/authority columns added. |
| Routers | `packages/api/src/routers/{room,member,device}.ts` | **S** — `room.create` = create project; `room.join` = join project. |
| Auth | `packages/auth/src/index.ts` | **S** |
| Signaling | `apps/signaling/**` | **S** |

### 3.3 Planned pieces

| Issue | Piece | Disposition |
| --- | --- | --- |
| #6 | Checkpoint log / `HistoryStore` | **C → core.** Becomes paper version history. Store a content-addressed Yjs state update per checkpoint. |
| #7 | History UI | **C.** Timeline + "what changed while you were away" + inspect; rewind becomes restore-backup. |
| #8 | Content-addressed blob transport | **C.** Now carries figures (PNG/PDF/EPS) and optionally compiled PDFs. |
| #9 | Image surface | **C.** Figure viewer; also inline `\includegraphics` preview. |
| #10 | Coordinator + epoch | **S.** Coordinator names checkpoints, admits peers. |
| #11/#14 | Excalidraw board | **Cut (deferred).** Diagrams are not the pivot; TeXlyre's answer is embedded TikZ/Draw.io, not a tldraw-style board. |
| #15 | Room shell | **S.** Already built; extend with the file tree. |
| #17 | Auth + join | **S.** Relabel to project create/join; still anonymous-device friendly. |
| #20 | SPA + PWA | **S.** Add engine asset caching. |

### 3.4 Entirely new

1. **Project model** — a `Y.Map<Y.Text>` of files + metadata + main-file pointer.
2. **File tree UI** and path handling (POSIX-relative paths, directories, binary vs text).
3. **LaTeX editor surface** using `codemirror-lang-latex` instead of `@codemirror/lang-markdown`.
4. **Compile worker** wrapping a WASM TeX engine, plus a compile-status/log surface.
5. **PDF preview surface** (pdf.js) with optional SyncTeX line mapping.
6. **BlobStore** implementation behind #8's frozen interface (figures).
7. **Checkpoint serializer/restore** built on the #6 interface over project docs.

---

## 4. Proposed minimal architecture

### 4.1 Room → project

Keep the word "room" in code and the URL (`/room/$roomId`) to avoid a migration and churn in
#15/#17. Present it as a "project" in copy. The control plane is untouched: `room.name` is the
paper title, `joinCode` is the invite code, `member` is the author list.

### 4.2 Document shape (one `Y.Doc` per project)

Extend the current single `Y.Text` into a small schema inside the same doc. This preserves the
"one room = one `Y.Doc`" rule from #11 and requires no provider changes:

```text
files        Y.Map<Y.Text>                 key = relative path ("main.tex", "sections/intro.tex", "refs.bib")
fileMeta     Y.Map<{ kind, mime, blobHash? }>   key = path; tells a text file from a binary one
projectMeta  Y.Map<{ schemaVersion, mainFile, engine, title }>
blobs        Y.Map<{ hash, size, mime, name }>  metadata only; bytes live in BlobStore
history      Y.Array<Checkpoint>           #6
coordinator  Y.Map<{ epoch, clientID }>    #10
```

Why one doc for the demo: `Y.Text` is cheap, a paper's text is small (hundreds of KB, not GB),
and the current `room-provider.tsx` already persists exactly one doc in one
`IndexeddbPersistence`. The scale path is per-file docs (`roomId:path`) with a project-index doc
— but that multiplies `WebrtcProvider` instances because y-webrtc keys by room name, so it is
explicitly deferred. `[inference]`

### 4.3 File tree and surfaces

`artifacts.ts` becomes `project/`:

- `project/types.ts` — `ProjectFile { path, kind: "tex"|"bib"|"image"|"pdf"|"text", mime, blobHash? }`.
- `project/project-store.ts` — create/rename/delete/move files, read the active `Y.Text`, resolve
  `\input`/`\include`/`\bibliography` for the compile snapshot.
- `project/file-tree.ts` — fold flat paths into a directory tree.
- `project/sample-paper.ts` — a seed project so the demo is one click.

The surface registry in `surfaces.tsx` keeps its switch:

- `latex` → `surfaces/latex-surface.tsx` (CodeMirror + `codemirror-lang-latex` + `yCollab` +
  `Y.UndoManager`; reuse the Quiet Room CodeMirror theme from the current `DocumentSurface`).
- `pdf` → `surfaces/pdf-surface.tsx` (pdfjs-dist canvas viewer; compile output object URL).
- `image` → keep #9's surface, now fed by the BlobStore.

The shell already opens tabs and renders `Surface`; the sidebar swaps its grouped list for
`file-tree.tsx`. Tabs are keyed by path, so multi-file "feels like an IDE" for free.

### 4.4 PDF compile in a Web Worker

- `apps/web/src/workers/latex-compile.worker.ts` owns the WASM engine; the main thread never
  blocks.
- `apps/web/src/room/compile/runner.ts` snapshots the project (`mainFile` + every text file +
  every referenced figure as `Uint8Array`) and posts it to the worker; the worker runs
  `initialize(true)` and `PdfLatex.compile({ input, additionalFiles, bibtex, rerun })`.
- `apps/web/src/room/compile/use-compile.ts` debounces (e.g. 800 ms after the last edit),
  exposes `{ status: idle|compiling|ok|error, pdf?, log }`, and guards against overlapping runs.
- `apps/web/src/room/compile/log-parser.ts` maps `! LaTeX Error: ... l.NN` to a CodeMirror
  diagnostic / clickable line.
- Client-only: the surface is `ssr: false` (already the room route) and the engine is loaded
  lazily, mirroring #11's Excalidraw pattern.

Engine choice: **BusyTeX** (via `texlyre-busytex`, or the upstream `busytex` WASM build) because
it documents multi-file `additionalFiles`, Web Worker support, pdfLaTeX/XeLaTeX/LuaLaTeX, BibTeX
and SyncTeX. SwiftLaTeX (TeX Live 2020) is the older fallback. Both are browser-only and
server-free, which is the whole point of the pivot.

### 4.5 Checkpoint log = paper version history (#6/#7)

- Interface (frozen for the client UI):
  `HistoryStore { create(label?): Checkpoint; list(): Checkpoint[]; get(id): Checkpoint; diff(a,b); restore(id) }`.
- `Checkpoint = { id, parentIds, timestamp, author, label, snapshotHash, update }`, where `update`
  is `Y.encodeStateAsUpdate(doc)` at capture time and `snapshotHash = SHA-256(update)`.
  Content addressing dedupes identical states (e.g. two "no-op" saves).
- Persist the snapshot bytes in a content-addressed store (reuse the BlobStore / a sibling
  IndexedDB store); replicate via the same blob channel or in the `Y.Array` for small states.
- **"Rewind" is a forward edit, not a history rewrite.** Yjs updates are monotonic; you cannot
  delete a change. `restore(id)` reads the snapshot's file contents and writes them back into the
  `Y.Text`s, then records a new checkpoint ("restored 2026-09-12 draft"). This is honest and
  converges like any other edit. `[inference]`
- `room-rail.tsx`'s History panel and `command-palette.tsx`'s "Create checkpoint" become live;
  `hasCheckpoints` stops being hardcoded `false`.
- Because a paper already has a Git mental model, this is the pivot's clearest "why MeldSpace"
  surface: history that lives with the paper, offline, with no GitHub account and no server.

### 4.6 Figures via the blob channel (#8)

- `apps/web/src/room/blobs/blob-store.ts` defines the frozen interface:
  `put(bytes, mime): contentHash`, `get(hash): Promise<Uint8Array>`, `has(hash)`.
- Two backends behind it:
  1. `yjs-inline` — bytes in a `Y.Map<Uint8Array>` for small figures. **Demo backend.**
  2. `webrtc-channel` — a real peer-to-peer data channel for large files. y-webrtc has **no file
     channel**; it only carries the Yjs doc and awareness. This needs `simple-peer` (already a
     y-webrtc dependency) or a PeerJS/FilePizza-style channel, matching TeXlyre's FilePizza
     integration. **This is #8's actual work.**
- The `Y.Doc` only ever holds `{hash, size, mime, name}`; figures never enter the CRDT. That keeps
  the doc small and respects invariant #3 (bytes never touch the control plane).

---

## 5. Smallest demo that shows the unique value

The unique claim is **"the paper survives the network, the device, and the person who made it —
no server holds it."** Overleaf cannot show this; Git can't merge live. The smallest sequence:

1. **Alice, offline-capable, one machine.** Opens the installed PWA, creates a project from the
   sample paper (`main.tex`, `sections/intro.tex`, `refs.bib`, one figure). Edits a sentence;
   the PDF recompiles **in the browser** in a Web Worker; no server compiled it.
2. **Invite.** Alice clicks Share → link/QR/join code (existing `share-dialog.tsx`). Bob opens
   the link on a second machine and sees the same file tree. Bob opens `sections/intro.tex` and
   types; Alice sees Bob's cursor (`yCollab` + awareness) and a peer dot move.
3. **Partition + local compile.** Bob opens DevTools → Offline (or pulls the WiFi) and keeps
   editing. The status pill shows `LOCAL`/`QUEUED` (existing `room-status.ts`); the PDF **still
   compiles locally** because the TeX engine is WASM and cached. This is the part a cloud editor
   cannot do.
4. **Converge.** Reconnect. Both peers converge; there is no conflict dialog, because Yjs merges.
5. **History.** Alice (or the coordinator) creates a checkpoint, "submitted draft". The History
   rail shows the timeline; Bob inspects an earlier checkpoint, then restores a section. The
   restore is a normal edit and reaches Alice.
6. **Survive the author.** Alice closes her laptop. Bob keeps the project; the coordinator badge
   moves. Alice returns with a stale epoch and yields automatically (Act 4, #10).

Optional seventh beat (if #8's channel is in): Bob drops `results.png`; it appears in Alice's file
tree and is pulled into the next compile via `\includegraphics`.

Do **not** put the board, comments, or Typst in this demo.

---

## 6. Top technical risks

### 6.1 Yjs doc size for a large paper — `apps/web/src/room/room-provider.tsx`

One `Y.Doc` for all files means every file's `Y.Text` plus the checkpoint `Y.Array` and blob
metadata are loaded and persisted together. A few hundred KB of text is fine; a thesis with many
figures, a long history, and never-GC'd tombstones is where memory and IndexedDB grow. The
current provider has no GC tuning and one `IndexeddbPersistence` for the whole doc.

Mitigation: keep binary bytes out of the doc; cap checkpoint payloads (store the Yjs update, not
full text copies); add `Y.Doc({ gc: true })` awareness; defer per-file docs until a real paper
size is measured. Design the `project-store.ts` seam so a file can move to its own doc without
touching surfaces.

### 6.2 Per-file persistence — `room-provider.tsx` + `project/project-store.ts`

`IndexeddbPersistence` is doc-level: you cannot lazily load one file. If the pivot needs
"open `main.tex` without loading 40 chapters," it must use one `Y.Doc` per file. But y-webrtc's
provider is keyed by room name, so per-file docs mean N providers (or a custom multiplexed
provider), N IndexedDB stores, and a project-index doc to stitch them. That is real work and a
real failure surface (provider lifecycle, partial convergence).

Minimal call: one doc for the demo; document the split as the scale path. Flag this explicitly so
nobody assumes lazy loading exists.

### 6.3 Compiling in a Worker — `apps/web/src/workers/latex-compile.worker.ts`, `room/compile/runner.ts`

Risks stack here:

- Worker + WASM + Emscripten FS plumbing; asset URL resolution under Vite/TanStack Start.
- Serialising a multi-file project into/out of the worker (structured clone of `Uint8Array`s).
- Engine memory (the engine plus a full TeX Live data set can be hundreds of MB).
- Multi-pass semantics (`bibtex`, `makeindex`, `rerun`) and error extraction from TeX logs.
- Blocking/debounce policy so a compile in flight isn't superseded by the next keystroke.

BusyTeX documents all the needed primitives (`additionalFiles`, `initialize(true)` for a worker,
`bibtex`, `makeindex`, `rerun`, `synctex`). Mitigation: pin the engine, sanitise assets to a
curated subset, keep a single worker (queue, don't parallelise), and treat the PDF as
disposable derived state.

### 6.4 Caching a multi-MB TeX engine in the PWA — `apps/web/vite-plugins/pwa-service-worker.ts`, `apps/web/vite.config.ts`

This is an immediate, concrete gap:

- `pwaWorkbox.globPatterns` lists `js,css,html,svg,png,ico,webmanifest,woff,woff2` — **no `wasm`,
  no `.data`**. The engine would not be precached.
- Workbox's default `maximumFileSizeToCacheInBytes` is ~2 MiB `[verify]`, far below a ~32 MB WASM
  binary; precaching it as-is would silently exclude it.
- BusyTeX assets are ~32 MB WASM + 90–400 MB data from GitHub Releases; a cold, never-warmed
  client cannot compile offline.
- BusyTeX's example uses Emscripten's `EM_PRELOAD_CACHE` (IndexedDB) to persist downloaded
  `.data` packages across reloads — offline compile is achievable only *after* a first online
  warm-up.

Mitigation: self-host a curated engine bundle under `apps/web/public/core/` (same-origin, range
requests), add a CacheFirst runtime route for it, raise `maximumFileSizeToCacheInBytes`, and add
an explicit "Prepare offline engine" step that warms the subset. Test cold-vs-warm offline
explicitly. This lands squarely on `pwa-service-worker.ts` and `vite.config.ts`.

### 6.5 The design system assumes a document/board, not a LaTeX project — `docs/design/exports/`, `artifacts.ts`, `surfaces.tsx`, `room-sidebar.tsx`

The frozen artboards have a Markdown editor (`meeting-notes.md`), artifact groups
`DOCUMENTS/FILES/BOARDS/COMMENTS`, a board, an image/file surface, history, share, and auth.
There is **no** file tree, no LaTeX source view, no PDF preview, no compile status/error surface.
The Quiet Room *tokens* (instrument black, amber signal, identity hues, type scale) carry over
intact; the *IA* does not.

Mitigation: one new Paper artboard, "Project shell — LaTeX" (file tree + LaTeX editor +
PDF pane + compile bar), authored locally per the MCP-budget method, then pushed in a handful of
`write_html` calls. Reuse the existing history/rewind, share, and offline-status frames. Do not
redesign the tokens.

### 6.6 Licensing — `apps/web/package.json`, no root `LICENSE`

The mature reference implementation (TeXlyre), the `texlyre-busytex` wrapper, and
`codemirror-lang-latex` are **AGPL-3.0**. BusyTeX upstream is MIT (per the wrapper's
acknowledgments) and SwiftLaTeX is separately licensed `[verify]`. MeldSpace has **no LICENSE
file** and no `license` fields in any `package.json`. If MeldSpace is not AGPL-compatible, the
cheapest path is to depend on the MIT upstream BusyTeX WASM build directly rather than the
AGPL wrapper, and to use a non-AGPL LaTeX CodeMirror grammar or write a minimal one. Resolve
before adding dependencies.

### 6.7 Blob transport does not exist yet — `apps/web/src/room/blobs/`, #8

y-webrtc carries the Yjs doc and awareness only; there is no file channel. "Figures via the blob
channel" therefore means building one. For the demo, inline small figures in the `Y.Doc`; for
real papers, #8 is a PeerJS/`simple-peer` data channel (TURN-aware). Do not let inlining become
the permanent design — large PDFs/figures will bloat the doc and break §6.1.

---

## 7. Concrete add / change list

### Add

| Path | Purpose |
| --- | --- |
| `apps/web/src/room/project/types.ts` | `Project`, `ProjectFile`, `FileKind`. |
| `apps/web/src/room/project/project-store.ts` | `Y.Map<Y.Text>` CRUD, main-file resolution, compile snapshot. |
| `apps/web/src/room/project/file-tree.ts` | Flat paths → directory tree. |
| `apps/web/src/room/project/sample-paper.ts` | Seed project (`main.tex`, `sections/intro.tex`, `refs.bib`, figure). |
| `apps/web/src/room/file-tree.tsx` | Sidebar file-tree UI. |
| `apps/web/src/room/surfaces/latex-surface.tsx` | CodeMirror + `codemirror-lang-latex` + `yCollab`. |
| `apps/web/src/room/surfaces/pdf-surface.tsx` | pdf.js canvas viewer. |
| `apps/web/src/room/surfaces/image-surface.tsx` | Figure surface (#9). |
| `apps/web/src/workers/latex-compile.worker.ts` | WASM TeX engine in a Web Worker. |
| `apps/web/src/room/compile/runner.ts` | Worker client + project→`additionalFiles`. |
| `apps/web/src/room/compile/use-compile.ts` | Debounce, status, single-flight. |
| `apps/web/src/room/compile/log-parser.ts` | TeX log → diagnostics / line links. |
| `apps/web/src/room/blobs/blob-store.ts` | #8 interface + `yjs-inline` backend. |
| `apps/web/src/room/blobs/use-blob.ts` | Resolve a `blobHash` to bytes/object URL. |
| `apps/web/src/room/history/history-store.ts` | #6 content-addressed checkpoint log + restore. |
| `apps/web/src/room/history/use-history.ts` | React binding for the timeline. |
| `apps/web/src/room/version-timeline.tsx` | #7 timeline / inspect / rewind UI. |

### Change

| Path | Change |
| --- | --- |
| `apps/web/src/room/artifacts.ts` | Replace `DOCUMENT_ARTIFACT` + kind groups with project files. |
| `apps/web/src/room/surfaces.tsx` | Register `latex`, `pdf`, `image`; drop the Markdown case. |
| `apps/web/src/room/room-shell.tsx` | Derive `artifacts` from the project store; enable "New file". |
| `apps/web/src/room/room-sidebar.tsx` | Render the file tree; keep room switcher/status/coordinator. |
| `apps/web/src/room/room-rail.tsx` | Project details + real history panel (#7). |
| `apps/web/src/room/command-palette.tsx` | Compile / new file / go-to-file; enable "Create checkpoint". |
| `apps/web/src/room/room-provider.tsx` | Expose the project store; keep the substrate. |
| `apps/web/src/room/icons.tsx` | File-type glyphs. |
| `apps/web/src/routes/room.$roomId.tsx` | Cosmetic `project` naming only. |
| `apps/web/src/routes/index.tsx`, `components/room-launcher.tsx` | Project create/open/join (with #17). |
| `apps/web/vite.config.ts` | Engine asset handling; manifest copy. |
| `apps/web/vite-plugins/pwa-service-worker.ts` | Runtime-cache `wasm`/`.data`; raise size limit; offline-engine warm step. |
| `apps/web/package.json` | Add `codemirror-lang-latex`, TeX engine, `pdfjs-dist`, `@codemirror/lint`. |
| `packages/ui/src/styles/globals.css` | Only if file-type/tree tokens are needed. |

### Explicitly unchanged

`packages/db/src/schema/**`, `packages/api/src/**`, `packages/auth/src/index.ts`,
`apps/signaling/**`, `apps/web/src/room/{coordinator,room-status,roster,identity,share-dialog}.ts(x)`,
`packages/ui/**` primitives, and the SPA/PWA boot chain (`router.tsx`, `__root.tsx`,
`pwa-register.tsx`, `apps/web/src/index.css`).

### Cut / defer

#11 + #14 (Excalidraw), comments/annotations, Typst, comments-in-history, and true #8 data-channel
transport (stub with `yjs-inline` for the demo).

---

## 8. Recommendation for the minimal scope

Ship the **paper-project pivot on the existing shell and substrate**, with one project = one
`Y.Doc` containing a `Y.Map<Y.Text>` of files, and exactly five capabilities:

1. **LaTeX editor** over the active file's `Y.Text` (`codemirror-lang-latex` + `yCollab`).
2. **File tree** in the existing sidebar, with tabs for open files.
3. **In-browser pdfLaTeX** in a Web Worker, rendered by pdf.js, triggered on a debounce and
   manually.
4. **Checkpoint history** (#6/#7) built on a content-addressed Yjs-update log, with inspect and
   restore-as-forward-edit.
5. **Figures** via the #8 `BlobStore` interface with the `yjs-inline` backend (true data channel
   deferred).

Keep the control plane, auth, join flow, signaling, PWA shell, and Quiet Room tokens as they are.
Add one design artboard for the LaTeX project shell; do not rebuild the design system. Resolve
the AGPL licensing question before adding the engine. Measure doc size on a realistic paper
before deciding whether per-file docs are needed.

This is a pivot of **surfaces and data model**, not of infrastructure. The distributed-room claim
and its entire implementation survive; what changes is what the room is *about*.

---

## Sources

### Repository (files read)

- `apps/web/src/room/room-provider.tsx`, `room-shell.tsx`, `room-sidebar.tsx`, `room-rail.tsx`,
  `command-palette.tsx`, `share-dialog.tsx`, `surfaces.tsx`, `artifacts.ts`, `coordinator.ts`,
  `room-status.ts`, `roster.ts`, `identity.ts`, `icons.tsx`
- `apps/web/src/routes/room.$roomId.tsx` (working tree and `HEAD`),
  `routes/_auth/{route,dashboard}.tsx`, `routes/{index,login}.tsx`
- `apps/web/src/components/{room-launcher,header,pwa-register,sign-in-form,sign-up-form,user-menu}.tsx`
- `apps/web/vite.config.ts`, `apps/web/vite-plugins/pwa-service-worker.ts`,
  `apps/web/src/router.tsx`, `apps/web/src/routes/__root.tsx`, `apps/web/src/index.css`,
  `apps/web/package.json`
- `packages/db/src/schema/{auth,room,index}.ts`, `packages/db/src/index.ts`,
  `packages/api/src/{index,context}.ts`, `packages/api/src/routers/{room,member,device,index}.ts`,
  `packages/auth/src/index.ts`
- `packages/ui/src/styles/globals.css`, `packages/ui/src/components/**`, `packages/ui/package.json`
- `apps/signaling/package.json`
- `CONTEXT.md`, `docs/adr/0001-coordination-authority.md`, `docs/adr/0002-spa-pwa-client.md`,
  `docs/review-1-brief.md`, `docs/design/README.md`, `docs/design/exports/*`,
  `docs/research/2026-09-12-design-brief.md`, `docs/research/2026-09-12-offline-p2p-collab-stack.md`,
  `docs/research/2026-09-12-paper-mcp-budget.md`, `docs/research/2026-09-12-drawing-board-options.md`,
  `MeldSpace Idea.md`
- `git log`, `git status`, branch `feat/15-room-shell` (shell WIP is uncommitted)

### Issue tracker (`gh issue view`, repo `Siddhj2206/MeldSpace`)

- #6 checkpoint log + `HistoryStore` · #7 history UI · #8 content-addressed blob transport ·
  #9 image surface · #10 coordinator role + epoch · #11 Excalidraw board · #14 board spike ·
  #15 room shell · #17 auth + join · #20 SPA/PWA

### External (primary, accessed 2026-09-12)

- TeXlyre — local-first LaTeX/Typst editor, Yjs + WebRTC + IndexedDB + WASM engine + PWA +
  FilePizza file transfer: <https://github.com/TeXlyre/texlyre>
- `texlyre-busytex` — WASM BusyTeX API (TeX Live 2026), multi-file `additionalFiles`, Web Worker,
  SyncTeX; asset sizes (~32 MB WASM + 90–400 MB data): <https://github.com/TeXlyre/texlyre-busytex>
- `codemirror-lang-latex` — Lezer LaTeX from the Overleaf grammar: <https://github.com/texlyre/codemirror-lang-latex>
- BusyTeX — WebAssembly port of TeX Live: <https://github.com/busytex/busytex>
- SwiftLaTeX — pdfTeX/XeTeX compiled to WebAssembly: <https://github.com/SwiftLaTeX/SwiftLaTeX>
- GlyphTeX — local-first LaTeX editor (Tectonic + Git, desktop/Tauri): <https://glyphtex.nexonauts.com>
- pdf.js — PDF rendering: <https://github.com/mozilla/pdf.js>

---

## Unverified / caveats

- **I read an uncommitted working tree.** The #15 shell (`apps/web/src/room/**`, the route
  rewrite, `packages/ui` additions) is untracked/modified on `feat/15-room-shell`, not committed.
  Another agent's or the user's WIP could change or be discarded. `HEAD` still has the original
  single-`Y.Text` route.
- **No engine has been benchmarked here.** Compile latency, memory, and cold/warm offline
  behaviour for a realistic paper are unmeasured. The asset sizes are from the `texlyre-busytex`
  README; actual cache behaviour under this repo's Workbox config is untested.
- **Workbox `maximumFileSizeToCacheInBytes` default (~2 MiB) is stated from memory `[verify]`**
  against `workbox-build` docs/config before relying on it. What matters is that the current
  `globPatterns` exclude `wasm` and data files regardless.
- **#8's "data channel" is an assumption.** y-webrtc does not document a file-transfer channel;
  TeXlyre uses FilePizza (PeerJS) as a separate channel. The exact minimal P2P file transfer for
  MeldSpace is undesigned.
- **Restore-as-forward-edit is an inference**, not a documented Yjs pattern; validate that
  writing old content into a `Y.Text` produces acceptable convergence with concurrent editors
  (it should, but test it).
- **Licensing claims** (TeXlyre / `texlyre-busytex` / `codemirror-lang-latex` AGPL-3.0; BusyTeX
  upstream MIT; SwiftLaTeX license) are read from READMEs/badges, not legal review. MeldSpace has
  no `LICENSE` file, so the compatible path is undecided.
- **The design gap is asserted from a content search** of the frozen exports; the Paper file may
  have artboards that were not exported. Do not spend MCP budget re-checking unless the in-app
  design is known to have changed.
- **"One `Y.Doc` per project" is a deliberate simplification.** Whether a real thesis needs the
  per-file split (§6.2) is unmeasured.
