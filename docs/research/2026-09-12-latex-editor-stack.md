# LaTeX authoring on the MeldSpace stack: editor packages and a multi-file Yjs project model

- **Date:** 2026-09-12
- **Access date for all sources:** 2026-09-12
- **Scope:** What it takes to put a real multi-file LaTeX authoring experience on the existing
  MeldSpace stack (CodeMirror 6 + `y-codemirror.next` + Yjs v13 + `y-webrtc` +
  `y-indexeddb`), and how to model a paper project (many `.tex` files, `.bib`, figures) in Yjs.
- **Method:** primary sources only — official package registries, official docs, upstream source
  code, GitHub issues, and published papers. Anything inferred rather than documented is marked
  **[inference]**.
- **Constraint honored:** no code was modified apart from this file; no servers started; no Paper
  MCP tools used.

---

## TL;DR

- **There is no official CodeMirror LaTeX package.** `@codemirror/lang-latex` does not exist (npm
  returns 404). The only first-party option is the legacy `stex` stream mode in
  `@codemirror/legacy-modes`, which is highlighting-only.
- **Use `codemirror-lang-latex`** (Lezer grammar derived from Overleaf's, with highlighting,
  indentation, folding, command/environment completion, snippets, hover, and a built-in linter).
  Pair it with **`codemirror-lang-bib`** for `.bib` editing. **Licensing is the catch**: current
  versions are **AGPL-3.0-or-later** (v0.5.0+, including 0.6.1); v0.4.2 was MIT but the grammar's
  upstream (Overleaf) is AGPL, so the MIT relicense is dubious. Pin deliberately.
- **Project-aware `\ref`/`\label`/`\cite`/path completion does not come in any package.**
  `codemirror-lang-latex` completes commands/environments/packages/options only. Citation,
  label, and `\input`/`\include`/`\includegraphics` completion must be custom, built on a state
  index of the file tree. TeXlyre ships exactly these custom handlers; they are app code, not a library.
- **texlab cannot run in the browser today.** No published WASM build exists; it is a native Rust
  LSP and every browser LaTeX product found connects to a local/native texlab over an LSP socket
  (or uses the client-side linter). Plan on the built-in `latexLinter`, or a sidecar LSP.
- **Yjs model verdict: one `Y.Doc` per room containing a `Y.Map` file tree + a `Y.Map<Y.Text>`
  of file contents**, not subdocuments and not one database per file. It keeps the existing
  `y-webrtc`/`y-indexeddb` wiring, makes rename/move atomic, and enables cross-file undo. Yjs
  subdocuments are unsupported by the official `y-indexeddb` (#32 still open) and require one
  provider per subdoc in `y-webrtc`.
- **Binary figures stay out of Yjs.** Store bytes by SHA-256 in a content-addressed IndexedDB blob
  store / WebRTC blob channel and put only `{hash, mime, size}` in the tree. This is what TeXlyre does.
- **SyncTeX is feasible in the browser**: compile with `-synctex=1`, parse the `.synctex(.gz)` in
  JS, and drive pdf.js. Multiple working reference implementations exist.
- **Migration is cheap and non-breaking**: keep the room name, add a `schemaVersion`, and seed the
  first `.tex` file from the existing `Y.Text("content")` in a single transaction.

---

## Part A — Getting a real LaTeX editing experience

### 1. There is no official CodeMirror LaTeX language package

`@codemirror/lang-latex` returns **404 from the npm registry** — it is not a package. CodeMirror's
official language set (`@codemirror/lang-*`) covers C/C++, Java, JS/TS, Python, Rust, HTML, CSS,
JSON, Markdown, SQL, XML, and others, but not LaTeX. The only first-party LaTeX support is the
**legacy stream mode** `stex`/`stexMath` inside `@codemirror/legacy-modes` (latest `6.5.4`,
published 2026-09-02). [1][2]

Practical consequence: "LaTeX language support" is a build-vs-buy decision where the buy options
are third-party.

### 2. `@codemirror/legacy-modes` `stex` — works, but highlighting-only

The mode is a direct port of the CodeMirror 5 `stex` mode (`mode/stex.js`). It is a
`StreamLanguage`, not a Lezer grammar, so it produces only token styles — no syntax tree. It
recognizes `\begin`/`\end`/`\label`/`\ref`/`\eqref`/`\cite`/`\bibitem`/`\usepackage`/`\documentclass`
and switches into `$`/`$$`/`\[`/`\(` math mode. [2]

What you do **not** get: folding, indentation, bracket matching, completion, hover, linting, or
the ability to reason about "am I inside a `\cite{}` argument". Those all require a parse tree.
`legacy-modes` is maintained as a compatibility package, not a place for new LaTeX features, so
its highlighting quality is frozen at the CodeMirror 5 level. Use it only as a fallback if the
licence of the Lezer grammar below is unacceptable and you do not want to write a grammar.

### 3. `codemirror-lang-latex` — the real option, with an AGPL catch

`codemirror-lang-latex` (TeXlyre / Fares Abawi) is a Lezer-based CodeMirror 6 extension explicitly
derived from **Overleaf's Lezer LaTeX grammar**. Latest is **0.6.1** (published 2026-08-02); it
ships: [3][4][5]

- syntax highlighting, indentation, folding for environments/sections, bracket matching;
- command, environment, package and package-option autocompletion;
- snippets for common structures (`figure`, `table`, …), environment auto-closing;
- hover tooltips for commands/environments;
- a built-in `latexLinter` with `checkMissingDocumentEnv`, `checkUnmatchedEnvironments`,
  `checkMissingReferences`, `checkUnclosedBraces`, `checkDuplicateLabels`,
  `checkCitesWithoutBibliography`, `checkMathModeCommands`, `checkDeprecatedCommands`,
  `checkMissingPackages`.

The grammar specialises `\cite`, `\label`, `\ref`, `\includegraphics`, `\input`/`\include`,
`\usepackage`, sectioning, formatting, and more, exposed as tokens such as `CiteCtrlSeq`,
`LabelCtrlSeq`, `RefCtrlSeq`, `IncludeGraphicsCtrlSeq`, `InputCtrlSeq`. That tree is what makes
fold, hover, lint, and custom completion possible. [5]

**License:** the npm metadata shows the licence changed from **MIT** (through `0.4.2`, 2026-07-13)
to **AGPL-3.0-or-later** at `0.5.0` (2026-08-02) and `0.6.1`. The upstream grammar lives in
`overleaf/overleaf`, which is AGPL-3.0, and the package README acknowledges the derivation. [3][4][6]
So the earlier MIT versions are at best a grey area if you reuse the grammar, and the current
package is genuinely AGPL. **This is the single most important procurement fact in this report**:
if MeldSpace must remain non-AGPL, either pin `0.4.2` and accept the provenance risk, or write/vendor
a grammar you own, or fall back to legacy `stex`.

The same author publishes **`codemirror-lang-bib`** (BibTeX language support: highlighting,
completion for entry types/fields/values, snippets, hover, linter for missing required fields,
unknown fields, duplicate keys, syntax). It is **MIT**, latest **0.2.4** (published 2026-05-10), and
is the natural companion for `.bib` files. [7][8]

### 4. Overleaf is the reference implementation, not a dependency

Overleaf moved its source editor to CodeMirror 6 and maintains its own Lezer LaTeX grammar; its
engineers published the approach at TUGboat 2025. The grammar is in the public repo and is strong:
it handles commands, environments, math/text mode, and specialises the constructs that drive
features (cite, includegraphics, textbf, …) while accepting that static tokenisation cannot model
`\catcode` tricks. [5][6] You can read it, learn from it, or vendor it — but not copy it into a
non-AGPL product without consequence.

Other grammars exist but are not CodeMirror: `latex-lsp/tree-sitter-latex` (used by Helix/Neovim).
Using it in CodeMirror would mean a tree-sitter binding — more work than adopting the Lezer package.
[note, secondary]

### 5. Autocompletion: what exists, and why citation/label/path completion is custom

**In the package:** `latexCompletionSource` gives commands (`\section`, `\textbf`, math symbols,
Greek letters), environments (math-only ones only inside math), packages, `\documentclass` options,
package options, `\includegraphics` keys, tabular column specs, and snippets. [9]

**Not in the package:** completion against the actual project. There is no source that reads
`\label{...}` from other files, `.bib` keys, or the file tree. TeXlyre therefore builds three
handlers and merges them into one `CompletionSource`: [10][11]

- `ReferenceCompletionHandler` — `\ref`/`\eqref`/`\cref`/`\autoref` against labels indexed across
  the whole project (including `\input`/`\include`d files and per-format label maps).
- `BibliographyCompletionHandler` — `\cite`/`\parencite`/`\textcite`/… against parsed `.bib` entries.
- `FilePathCompletionHandler` — `\input`, `\include`, `\includegraphics`, `\bibliography`, etc.
  against the file tree, computing LaTeX-appropriate relative paths (`toCompileRelativePath`,
  extension stripping).

For a smaller first cut you need only: parse `\label{}`/`\bibitem{}`/`.bib` entries into a
`StateField`/module value, watch the file tree, and register one `CompletionSource` that checks the
syntax tree to decide whether the cursor is inside a cite/label/ref/`\includegraphics` argument.
That is real but bounded work. `latex-cite-editor` (MIT) is a Markdown-oriented package that does
`\cite{key}` resolution and citation completion against a `.bib`; it is a useful reference, not a
drop-in for LaTeX source editing. [12]

### 6. Linting, texlab, and WASM

`codemirror-lang-latex`'s `latexLinter` is client-side, tree/regex-based, and covers the common
errors (document environment, unmatched environments, undefined refs, duplicate labels, cite
without bibliography, math-only commands outside math, deprecated commands, unlisted packages). It
is the pragmatic default and costs nothing at runtime. [13]

**texlab is a native Rust language server; no official WASM build is published.** Its releases are
Windows/Linux/macOS binaries, and its docs describe running as a normal LSP process. TUG and product
evidence all point the same way: [14][15][16]

- TeXlyre offers "limited LSP support over WebSocket": CodeMirror acts as a client to language
  servers (LTeX LS Plus, Harper LS, **TexLab**, Tinymist, JabRef LSP) deployed either locally via
  the Chelys desktop companion or on a self-hosted sidecar.
- Scipen Studio and Oleafly bundle **native** TexLab (Oleafly pins 5.26.0) and run it as a process.
- The Hiro in-browser LSP article is about compiling a different Rust core to WASM; it is not texlab.
- glyphtex's Tectonic WASM notes explicitly that `biber` (a Perl program) has no WASM build and
  that shell-escape/`minted` cannot run in the sandbox.

**Conclusion for MeldSpace:** do not plan on texlab-in-browser. Options, best first:
1. Ship the built-in `latexLinter` now.
2. Add an optional LSP bridge: run texlab locally (or on the control plane as a sidecar) and
   connect CodeMirror over WebSocket, exactly as TeXlyre does. This preserves the local-first story
   as an opt-in power feature, not a dependency.
3. Only consider a WASM port if someone funds it; no off-the-shelf one exists. (A `chktex` WASM
   build might be cheaper than texlab, but no maintained browser package was found either.)

### 7. Snippets and keymaps

- Snippets are included in `codemirror-lang-latex` (`snippets`, e.g. `\begin{figure}` with
  `\includegraphics`/`\caption`/`\label`). CodeMirror's `@codemirror/autocomplete` also provides
  `snippetCompletion` for your own. [3][9]
- Editor keymaps are third-party and maintained: `@replit/codemirror-vim` is at **6.4.0**
  (published 2026-07-29), alongside `@replit/codemirror-emacs`; TeXlyre also lists
  `codemirror-helix`. [17][18]
- Yjs undo keybindings come from `y-codemirror.next` (`yUndoManagerKeymap`), already used in
  `apps/web/src/routes/room.$roomId.tsx`. [19]

### 8. BibTeX / biblatex

- Editing: `codemirror-lang-bib` (MIT) covers highlighting, completion and linting of `.bib`. [7][8]
- Completion from the `.tex` side is custom (see §5).
- Compilation: `bibtex8` is supported by the WASM engines. `biber` (biblatex's backend) is harder:
  it is Perl, so it needs a WASM Perl runtime. TeXlyre's `texlyre-busytex` bundles WebPerl and runs
  biber 2.19; glyphtex's Tectonic WASM declares biber unsupported. [15][20][21]
- Citation *rendering* (CSL/APA/IEEE) is a separate concern; texlab uses `citeproc-rs`, and
  `citation-js` is the JS-side option. For a first version, support `bibtex` + `.bbl` and note
  biber as a follow-up. **[inference]**

---

## Part B — Modelling a multi-file paper in Yjs

### 9. Option 1 — one `Y.Doc`, a `Y.Map` tree, and a `Y.Map<Y.Text>` of contents

The whole project lives in one Y.Doc: a `Y.Map` of file metadata (name/path/parent/type) plus a
`Y.Map` whose values are the per-file `Y.Text`s (or a nested `Y.Text` inside each metadata map).

- **Rename/move:** mutate a scalar in the metadata map inside a transaction — CRDT-safe and atomic
  across files.
- **Lazy loading:** none; the whole project is in memory. For a paper (tens of files, mostly small
  `.tex`, a `.bib`, no figures in Yjs) this is negligible.
- **Doc size:** bounded by total text history; y-indexeddb keeps one database and one room. Fine at
  paper scale; would need side-docs for a monorepo-sized project.
- **Undo/redo:** excellent — a single `Y.UndoManager` can span all files (see §13).
- **Transport/persistence:** unchanged from today (`y-webrtc` room + `y-indexeddb`).

This is the pattern Liveblocks documents for exactly this case: "subdocuments are not necessary for
displaying multiple text editors on one page… it's often best to create a `Y.Map` in your Yjs
document, and place the contents of each editor inside." [22]

### 10. Option 2 — Yjs subdocuments

Embed a `Y.Doc` per file inside a shared type in a root `Y.Doc`. Docs explicitly frame "manage
documents in a folder structure… lazily loaded to memory when needed" as the use case. [23]

But the official persistence and transport providers **do not sync subdocuments**:

- `y-indexeddb` subdocument support is an open enhancement request (#32, opened 2023-06-14, updated
  2025-03-16), assigned and unimplemented. [24]
- The Yjs docs say "not all providers support subdocuments yet" and give the workaround of creating
  a new provider per loaded subdoc (`new WebrtcProvider(subdoc.guid, subdoc)`). [23]
- `y-webrtc` treats subdocs as separate rooms; community threads describe adding custom
  `messageSubSync` frames or one connection per subdoc. [25]

You would have to write and maintain a subdoc-aware IndexedDB and WebRTC provider (AFFiNE did this
with `@toeverything/y-indexeddb`/`y-idb`, the latter now archived). Not worth it for a single paper.
**[inference]**

### 11. Option 3 — one `Y.Doc` + one `y-indexeddb` database per file (TeXlyre's model)

TeXlyre (a local-first, Yjs + WebRTC LaTeX/Typst editor — the closest existing product) implements
the project as: [26][27][28][29]

- a **metadata Y.Doc** per project (`texlyre-project-<id>-yjs_metadata`) holding `Y.Map("data")` with
  `documents` (id/name/content), `currentDocId`, `cursors`, `chatMessages`, `projectMetadata`;
- a **separate Y.Doc + `IndexeddbPersistence` per document**, database named
  `texlyre-project-<projectId>-yjs_<docId>`, holding `Y.Text("codemirror")`;
- a **separate `WebrtcProvider` per collection**, room name `<projectId>-<collectionName>` (e.g.
  `<projectId>-yjs_metadata`, `<projectId>-yjs_<docId>`), pooled and ref-counted in `CollabService`;
- **files** (text and binary) in a plain IndexedDB store via `FileStoreService`, with
  `FileNode.documentId` linking a tree path to an editor buffer and `isBinary`/`mimeType` metadata.

Trade-offs: natural lazy loading and bounded per-file docs, at the cost of N providers/rooms, no
cross-file undo, no cross-file transaction, and IndexedDB database proliferation (the Yjs community
thread notes each `y-indexeddb` provider creates its own database; browser limits are unclear). [25]
TeXlyre also bulk-opens every document for 60s to sync (`syncAllDocuments`) precisely because they
are separate rooms. This is a good **scale-up** design, not a starting design.

### 12. How existing local-first tools model "many documents"

- **automerge-repo:** every document is an independent `DocHandle` with an `AutomergeUrl`
  (`automerge:<id>`); `repo.find` loads from local storage then requests from peers; there is no
  supported repo introspection, and the maintainer's recommended approach is a **"directory
  document" that is your root folder**, holding references to child document IDs that you load
  recursively. [30][31]
- **y-sweet:** a document store and sync backend keyed by `docId`, persisting each Y.Doc to S3 or
  the filesystem; it deliberately does not define a file tree — that is the application's job. [32][33]
- **y/hub (y-redis):** keyed by `(org, docid, branch)`; again, one logical document per ID and no
  built-in tree. [34]
- **AFFiNE:** uses subdocuments plus a custom lazy-load provider factory for IndexedDB/SQLite, with
  a "load on access, don't eagerly load the tree" policy (and the lesson that lazy *offloading* via
  ref counts caused churn; they settled on lazy *loading* only). [24][35]

The convergent lesson: the ecosystem gives you **many independent documents**; the **tree is
application state** you design yourself, usually as a manifest/root document.

### 13. Undo/redo across files

`Y.UndoManager`'s documented scope is `Y.AbstractType | Array<Y.AbstractType>`, and it captures
changes to "any of the specified types, **or any of its children**". So a single manager created on
the `texts` `Y.Map` tracks every file's `Y.Text` inside it — true cross-file undo, with remote
changes excluded by `trackedOrigins`. [36]

With the current single-`Y.Text` room the manager is `new Y.UndoManager(ytext)`. Under Option 1 you
switch to `new Y.UndoManager(doc.getMap("texts"))` and **keep the same instance across file
switches**, calling `stopCapturing()` on switch so undo does not merge edits across the boundary.
`y-codemirror.next`'s `yCollab(ytext, awareness, { undoManager })` accepts it directly. [19][36]

Under Option 3 (per-file docs) an UndoManager cannot span documents: you get per-file undo only, or
you build an application-level command stack. This is a concrete UX reason to prefer Option 1 for a
paper.

### 14. Binary figures

Do not put image bytes in Yjs. The Yjs community thread is direct: Yjs is "probably not the right
tool to sync binary data"; base64-in-a-`Y.Array` forces every client to keep every historical
version, and the advice is to store bytes elsewhere and share hashes/URLs. [37]

The plan already sketched for MeldSpace (content-addressed blob channel) is exactly right and is
what TeXlyre does in production: [28][38]

- hash bytes with `crypto.subtle.digest('SHA-256', content)` and store them content-addressed in
  IndexedDB (or OPFS);
- replicate bytes over a WebRTC data channel (TeXlyre uses `filepizza-client` with
  `FilePizzaUploader`/`FilePizzaDownloader` and a `PeerFileSyncService` that compares path,
  checksum, size and `lastModified`, with `prefer-latest`/`prefer-local`/`notify` conflict modes and
  tombstone deletes);
- put only `{hash, mime, size, name}` in the Yjs file tree; the LaTeX source references the figure
  by path/name as usual, and the compile step resolves the path to bytes and injects them into the
  engine VFS (BusyTeX's `compile()` takes `additionalFiles: {path, content}[]`). [15]

The content-addressing also makes "same image in two figures" free and makes asset sync idempotent.

### 15. Source ↔ PDF sync (SyncTeX) in the browser

Feasible and demonstrated:

- WYSIWYG engines emit `-synctex=1` output. `texlyre-busytex` and Tectonic-WASM both generate
  `.synctex`/`.synctex.gz`; BusyTeX advertises "SyncTeX: generate SyncTeX files for editor
  synchronization". [15][20]
- Parse it in JS: `paleomitchelljs/latex` ships a `synctex.js` parser with reverse/forward queries;
  glyphtex ships a full `SyncTexMap` (`forward(line)`, `locate(page,x,y)`) validated against
  Tectonic output; `latex-workshop`'s `synctex.ts` shows the pdf.js forward/reverse driving code;
  there is also a standalone "SynctTeX-js" parser. [39][40][41][42]
- Render with **pdf.js** (the same engine Overleaf uses) and map clicks to page coordinates. [39][41]

Caveats: SyncTeX records source file + line, so **inverse search can switch the active editor file**
— which requires a file-path ↔ document mapping, exactly what the `tree`/`FileNode.documentId`
model provides. `synctex.gz` needs gzip decompression in the browser (e.g. `fflate`/`pako`).
**[inference]**

### 16. Migration from the current single `Y.Text("content")`

Current code (`apps/web/src/routes/room.$roomId.tsx`) creates:
`IndexeddbPersistence('meldspace-<roomId>', doc)`, `WebrtcProvider(roomId, doc)`, and edits
`doc.getText("content")`. [43]

Option 1 preserves all of that. Migration:

1. Keep the doc name and room name (`meldspace-<roomId>` / `<roomId>`) so existing replicas still
   converge.
2. Add `Y.Map("meta")` with `schemaVersion` (absent = legacy) and `Y.Map("tree")` /
   `Y.Map("texts")`.
3. On first load, if `meta.schemaVersion` is unset, run **one deterministic transaction**: create a
   `main.tex` entry and insert the current `Y.Text("content")` value into its `Y.Text`, then set
   `schemaVersion = 2`. Leave the old `content` text in place (harmless) or leave it for a later
   cleanup; do not delete it in the same release.
4. Because the migration runs inside the CRDT, two peers migrating concurrently converge on the same
   result (the transaction is idempotent provided it is guarded by `schemaVersion`). **[inference]**
5. The editor changes from a fixed `doc.getText("content")` to
   `doc.getMap("texts").get(activeFileId)` — a lookup, with the same `yCollab` call.

If instead you adopt per-file docs (Option 3), the old room's `content` becomes a legacy doc that
new peers must read once and write into `main.tex`'s new doc; old peers on the old room would not
see the new tree, so you need a version gate and a fallback UI. Option 1 avoids this entirely.

---

## Verdict

### Exact CodeMirror packages

| Package | Version | Role | Licence |
|---|---|---|---|
| `codemirror-lang-latex` | `0.6.1` (or `0.4.2` if MIT is mandatory) | Lezer LaTeX: highlight, indent, fold, completion, hover, lint | **AGPL-3.0-or-later** at ≥0.5.0; MIT at ≤0.4.2 |
| `codemirror-lang-bib` | `0.2.4` | BibTeX editing, completion, lint | MIT |
| `@codemirror/autocomplete` | `^6.20` | Completion framework + `snippetCompletion` | MIT |
| `@codemirror/lint` | `^6.9` | `linter()` host for `latexLinter` | MIT |
| `@codemirror/state`, `@codemirror/view`, `@codemirror/commands` | current (already in `apps/web`) | Editor core | MIT |
| `@replit/codemirror-vim` | `6.4.0` | Vim keymap (optional) | MIT |
| `@replit/codemirror-emacs` | current | Emacs keymap (optional) | MIT |
| `yjs`, `y-codemirror.next`, `y-indexeddb`, `y-webrtc`, `y-protocols` | keep existing | CRDT + binding + offline + P2P | MIT |

Do **not** add `@codemirror/lang-latex` (it does not exist). Keep `@codemirror/legacy-modes`
`stex` only as a fallback if the AGPL grammar is rejected and no grammar is written.

**Custom code you must write regardless of package choice:** one `CompletionSource` for project
labels (`\label`/`\ref`/`\eqref`/`\cref`), citation keys (`.bib`/`\bibitem`), and file paths
(`\input`/`\include`/`\includegraphics`), indexed from the whole file tree and gated by the syntax
tree. `codemirror-lang-latex` provides the tree and the command/environment completion; it does not
provide project awareness.

### Exact Yjs file-tree model to use

**One `Y.Doc` per room** (keep `meldspace-${roomId}`; do **not** introduce subdocuments or per-file
databases now):

```
root Y.Doc  (room: meldspace-<roomId>)
├─ Y.Map("meta")   → { schemaVersion: 2, title, mainFile: "main.tex" }
├─ Y.Map("tree")   → fileId → Y.Map({ name, path, parentId, type: "file"|"dir",
│                                    mime, isBinary, hash?, size?, mtime })
├─ Y.Map("texts")  → fileId → Y.Text          # text files only
└─ Y.Map("assets") → sha256 → { mime, size, name }   # bytes live outside Yjs
```

- **Content:** `Y.Map<Y.Text>` keyed by `fileId` (nested `Y.Text`s are fully supported).
- **Rename/move:** scalar updates on `tree` inside `doc.transact(...)` — atomic, CRDT-safe.
- **Undo:** one `new Y.UndoManager(doc.getMap("texts"))` shared across file switches; call
  `stopCapturing()` on switch.
- **Figures:** SHA-256 content-addressed bytes in IndexedDB + a WebRTC blob channel (the planned
  content-addressed channel); Yjs holds only the hash/metadata.
- **Transport/persistence:** unchanged — existing `y-webrtc` room + `y-indexeddb` database.
- **Migration:** seed `main.tex` from the legacy `Y.Text("content")` once, guarded by
  `meta.schemaVersion`, in a single transaction. Keep the old `content` text.

**Upgrade path (only if doc size demands it):** move large files into side-docs with a ref-counted
provider registry modeled on TeXlyre's `CollabService` (one Y.Doc + `IndexeddbPersistence` +
`WebrtcProvider` per file, keyed `<projectId>-<collectionName>`). Do not start there, and do not use
stock subdocuments for this.

---

## Sources

All URLs accessed **2026-09-12**.

**CodeMirror LaTeX / editor**
1. `@codemirror/lang-latex` npm registry — 404, no such package:
   <https://registry.npmjs.org/@codemirror/lang-latex>
2. `@codemirror/legacy-modes` npm registry (v6.5.4, modified 2026-09-02) and `stex` source:
   <https://registry.npmjs.org/@codemirror/legacy-modes> ·
   <https://raw.githubusercontent.com/codemirror/legacy-modes/main/mode/stex.js>
3. `codemirror-lang-latex` npm registry (latest 0.6.1, 2026-08-02; MIT→AGPL at 0.5.0):
   <https://registry.npmjs.org/codemirror-lang-latex> ·
   <https://www.npmjs.com/package/codemirror-lang-latex>
4. `codemirror-lang-latex` repo/README — <https://github.com/TeXlyre/codemirror-lang-latex>
5. Overleaf Lezer LaTeX grammar and specialisation tokens —
   <https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/source-editor/lezer-latex/latex.grammar>
6. Overleaf licence (AGPL-3.0) — <https://github.com/overleaf/overleaf/blob/main/LICENSE> ·
   TUGboat 2025, "Best-effort LaTeX parsing for interactive editing":
   <https://tug.org/TUGboat/tb46-2/tb143jakobsen-parsing-editing.pdf>
7. `codemirror-lang-bib` npm registry (latest 0.2.4, 2026-05-10) —
   <https://registry.npmjs.org/codemirror-lang-bib>
8. `codemirror-lang-bib` repo — <https://github.com/texlyre/codemirror-lang-bib>
9. `codemirror-lang-latex` completion/linter source (jsDelivr 0.6.1) —
   <https://cdn.jsdelivr.net/npm/codemirror-lang-latex@0.6.1/src/completion.ts> ·
   <https://cdn.jsdelivr.net/npm/codemirror-lang-latex@0.6.1/src/linter.ts>
10. TeXlyre `PathAndBibAutocompleteExtension.ts` —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/extensions/codemirror/PathAndBibAutocompleteExtension.ts>
11. TeXlyre `FilePathCompletionHandler.ts` —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/extensions/codemirror/autocomplete/FilePathCompletionHandler.ts>
12. `latex-cite-editor` (Markdown, citation completion against `.bib`) —
    <https://github.com/reinanbr/latex-cite-editor>
13. `codemirror-lang-latex` linter options and checks — see [3][4][9]
14. texlab repository (native LSP, precompiled Windows/Linux/macOS binaries) —
    <https://github.com/latex-lsp/texlab>
15. TeXlyre BusyTeX (`texlyre-busytex`) — engine, `additionalFiles`, SyncTeX, WASM/data sizes,
    biber/WebPerl: <https://github.com/TeXlyre/texlyre-busytex> ·
    <https://texlyre.github.io/texlyre-busytex/>
16. TeXlyre README (LSP over WebSocket, Chelys, texlab as external server) —
    <https://github.com/TeXlyre/texlyre> · Scipen Studio:
    <https://github.com/scipenai/scipen-studio> · Oleafly releases (native TexLab 5.26.0):
    <https://github.com/Oleafly/Oleafly/releases>
17. `@replit/codemirror-vim` npm registry (latest 6.4.0, 2026-07-29) —
    <https://registry.npmjs.org/@replit/codemirror-vim>
18. `@replit/codemirror-emacs` — <https://github.com/replit/codemirror-emacs>
19. `y-codemirror.next` (`yCollab`, `yUndoManagerKeymap`) —
    <https://github.com/yjs/y-codemirror.next>
20. `@typeward/texlive-wasm` (pre-alpha, per-engine WASM, `createSynctex`, biber) —
    <https://github.com/typeward/texlive-wasm>
21. glyphtex `packages/tex-engine` (Tectonic WASM; biber/minted/shell-escape unsupported) —
    <https://github.com/kanakkholwal/glyphtex/tree/main/packages/tex-engine>

**Yjs project model**
22. Liveblocks guide, "How to use Yjs subdocuments" (recommends `Y.Map` for multiple editors) —
    <https://liveblocks.io/docs/guides/how-to-use-yjs-subdocuments>
23. Yjs docs, Subdocuments (providers must sync subdocs; per-`guid` provider workaround) —
    <https://docs.yjs.dev/api/subdocuments>
24. `y-indexeddb` issue #32, "sub-doc syncing support" (open, assigned) —
    <https://github.com/yjs/y-indexeddb/issues/32>
25. Yjs Community, "Subdocuments in ws-provider" (one connection per subdoc; per-provider IndexedDB
    databases) — <https://discuss.yjs.dev/t/subdocuments-in-ws-provider/2107>
26. TeXlyre `CollabService.ts` (per-collection Y.Doc + `IndexeddbPersistence` + `WebrtcProvider`,
    room naming, ref-counting, `syncAllDocuments`) —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/services/CollabService.ts>
27. TeXlyre `ProjectDataService.ts` (metadata Y.Map, per-doc `texlyre-project-<id>-yjs_<docId>`) —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/services/ProjectDataService.ts>
28. TeXlyre `PeerFileSyncService.ts` (SHA-256 checksums, FilePizza P2P transfer, conflict modes) —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/services/PeerFileSyncService.ts>
29. TeXlyre `types/files.ts` (`FileNode`/`documentId`) —
    <https://raw.githubusercontent.com/TeXlyre/texlyre/main/src/types/files.ts>
30. Automerge Repo, DocHandles (`AutomergeUrl`, `repo.find` storage-then-network) —
    <https://automerge.org/docs/reference/repositories/dochandles/> ·
    <https://automerge.org/automerge-repo/classes/_automerge_automerge-repo.Repo.html>
31. automerge-repo issue #397, maintainer guidance to use a "directory/root folder" document —
    <https://github.com/automerge/automerge-repo/issues/397>
32. y-sweet docs — <https://docs.y-sweet.dev/> · repo:
    <https://github.com/jamsocket/y-sweet>
33. y-sweet "how it works" (per-`docId` document store; API surface) —
    <https://docs.jamsocket.com/y-sweet/concepts/how-ysweet-works>
34. y/hub (y-redis) storage keyed by `(org, docid, branch)` —
    <https://github.com/yjs/y-redis>
35. AFFiNE, "YJS Lazy Load Doc Provider" —
    <https://pengx17.vercel.app/posts/yjs-lazy-load-doc-provider>
36. Yjs docs, Undo Manager (scope `AbstractType | Array`, tracks children; `trackedOrigins`) —
    <https://docs.yjs.dev/api/undo-manager>
37. Yjs Community, "Syncing binary data" (store bytes elsewhere, share hashes) —
    <https://discuss.yjs.dev/t/syncing-binary-data/2047>
38. filepizza-client — <https://github.com/kern/filepizza>

**SyncTeX / compilation**
39. `paleomitchelljs/latex` (browser pdfTeX via BusyTeX, `synctex.js` forward/reverse, pdf.js) —
    <https://github.com/paleomitchelljs/latex>
40. glyphtex `synctex.ts` (`SyncTexMap` forward/locate) —
    <https://github.com/kanakkholwal/glyphtex/blob/main/packages/ui/src/lib/editor/synctex.ts> ·
    PDF view: <https://github.com/kanakkholwal/glyphtex/blob/main/packages/ui/src/components/application/pdf-view.svelte>
41. LaTeX-Workshop client viewer `synctex.ts` (pdf.js `convertToViewportPoint`/`getPagePoint`) —
    <https://github.com/James-Yu/LaTeX-Workshop/blob/master/viewer/components/synctex.ts>
42. SynctTeX-js (standalone JS SyncTeX parser) — <https://durieux.me/projects/synctexjs/>
43. MeldSpace current room (`Y.Text("content")`, `y-indexeddb`, `y-webrtc`) —
    `apps/web/src/routes/room.$roomId.tsx`

---

## Unverified / caveats

- **Licence provenance of `codemirror-lang-latex@0.4.2`.** The package was MIT through 0.4.2 and
  AGPL from 0.5.0, but it derives from Overleaf's AGPL grammar. I did not find a public statement
  explaining the relicense or confirming that the MIT snapshots are clean. Treat "pin 0.4.2 for MIT"
  as legally risky until reviewed. `codemirror-lang-bib` is MIT (registry metadata).
- **no texlab WASM build** could be found, but absence of evidence is not proof. It is possible an
  unreleased or experimental `wasm32-wasi` texlab target exists; I found only native releases and
  native sidecar integrations. Verify against the texlab repo/issues before committing.
- **TeXlyre's licence** is stated as AGPL-3.0 by its ecosystem page (citing the SwiftLaTeX AGPL
  dependency); the GitHub licence API call failed during research. Its `codemirror-lang-latex`
  package is AGPL regardless. Do not copy TeXlyre code into a non-AGPL product without review; the
  *architecture* (not the code) is what is cited here.
- **`@typeward/texlive-wasm` is pre-alpha** and its README says the npm `latest` tag points at a
  prerelease. `texlyre-busytex` is described as experimental and "sustained work is not guaranteed."
  WASM compile-in-browser carries large asset weights (~32 MB WASM + 90–400 MB data) and needs
  `SharedArrayBuffer` (COOP/COEP headers).
- **biber-in-browser** support differs by engine (TeXlyre/WebPerl yes, Tectonic-WASM no). Not
  independently tested here.
- **Yjs `y-indexeddb` compaction / IndexedDB database-count limits** were not measured. The Yjs
  forum notes one database per provider but does not establish a browser limit. For Option 1 it is
  one database per room, so this is mostly relevant to the Option 3 upgrade path.
- **Cross-file migration concurrency** (two offline peers each running the `schemaVersion` seed
  transaction) is reasoned to converge because it is a CRDT transaction guarded by a shared flag,
  but was not tested. **[inference]**
- **Y.UndoManager across file switches** relies on keeping one instance alive and calling
  `stopCapturing()`; the exact interaction with `yCollab` teardown/rebuild during a file switch was
  not tested here. **[inference]**
- **tree-sitter-latex in CodeMirror** is mentioned only as an alternative; no CodeMirror binding was
  evaluated.
