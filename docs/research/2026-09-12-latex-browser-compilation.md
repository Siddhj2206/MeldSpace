# LaTeX compilation in the browser, offline-first: engine options for MeldSpace

- **Date:** 2026-09-12
- **Access date for all sources:** 2026-09-12
- **Scope:** How to turn LaTeX source into a PDF for a local-first, P2P writing app: browser-side WASM engines and a server-side TeX Live fallback. Covers engine support, license, maintenance, npm/asset size, package coverage and on-demand fetching, offline caching, fonts/CJK, SyncTeX, multi-file projects, Vite/Web Worker/IndexedDB-OPFS integration, what Overleaf does, and known failure modes.
- **Method:** primary sources only — official repos, READMEs, source files, GitHub API metadata, npm registry, official docs. Anything inferred or unverified is marked **[inference]** or listed under **Unverified / caveats**.

---

## TL;DR

**Use BusyTeX via the maintained `texlyre-busytex` npm wrapper as MeldSpace's primary compile engine, running in a Web Worker, with XeLaTeX as the default and pdfLaTeX as the fast path — and self-host the TeX Live package endpoint with an OPFS/IndexedDB cache so an already-seen document recompiles fully offline. Keep a server-side TeX Live + `latexmk` service as an explicit, non-default escape hatch for the hard 5% (custom classes, exotic packages, giant theses).**

SwiftLaTeX is the famous option but is effectively frozen (last release Feb 2022), has no LuaTeX, no SyncTeX, an undocumented offline cache, and a mixed AGPL/EPL/GPL license story. The Tectonic WASM story has no official build; the community wrappers are one-person, weeks-old experiments. `texlive.js` (2017, pdfTeX-only) and `latex.js` (HTML not PDF, no packages) are not candidates. Note the license: `texlyre-busytex` is **AGPL-3.0-or-later**, which is a real product decision for a closed-source MeldSpace; if that is unacceptable, prefer `@typeward/texlive-wasm` (MIT wrapper over a TeX Live 2026 build) once it stabilizes, or ship your own MIT-licensed Emscripten build of BusyTeX.

---

## 1. What Overleaf actually does (the benchmark)

Overleaf does **not** compile in the browser. It is the reference server-side architecture.

1. **CLSI** (Common LaTeX Service Interface) is a REST service (`overleaf/clsi`, AGPL-3.0) listening on TCP/3013. It receives `POST /project/:id/compile` with the project files, the root file, and options; it returns PDF/log URLs. The public README documents the compile options: `compiler` one of `latex`, `pdflatex`, `xelatex`, `lualatex`; `timeout` default **60 s**. ([clsi README](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/README.md))
2. **It runs real `latexmk` on a real TeX Live install inside sibling Docker containers.** `TEXLIVE_IMAGE` defaults to a `texlive-full` image (e.g. `.../texlive-full:2025.1`), `SANDBOXED_COMPILES=true` spins up a sibling container per compile. ([clsi README](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/README.md))
3. **The exact command** (`LatexRunner.js`): `latexmk -cd -jobname=output -auxdir=$COMPILE_DIR -outdir=$COMPILE_DIR -synctex=1 -interaction=batchmode -time`, plus `-f` (run all passes despite errors) or `-halt-on-error`, plus the engine flag `latex → -pdfdvi`, `pdflatex → -pdf`, `xelatex → -xelatex`, `lualatex → -lualatex`. So Overleaf delegates aux/bib/rerun rounds to `latexmk`, exactly as a desktop user would. ([LatexRunner.js](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app/js/LatexRunner.js))
4. **SyncTeX is first-class.** `latexmk` is run with `-synctex=1`, and CLSI exposes `/project/:id/sync/code` and `/project/:id/sync/pdf` for forward/inverse search. ([LatexRunner.js](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app/js/LatexRunner.js), [clsi app.js](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app.js))
5. **TeX Live coverage and versioning.** Overleaf uses TeX Live (5,000+ packages), lets each project pin a TeX Live version including legacy releases, and switches versions shortly after each TeX Live release. ([Overleaf TeX Live docs](https://docs.overleaf.com/troubleshooting-and-support/tex-live), [Selecting compiler docs](https://docs.overleaf.com/getting-started/recompiling-your-project/selecting-a-tex-live-version-and-latex-compiler.md))
6. **Compilers.** Default is pdfLaTeX; LaTeX (DVI), XeLaTeX and LuaLaTeX are selectable. XeLaTeX/LuaLaTeX support UTF-8 plus TrueType/OpenType fonts and are recommended for non-Latin scripts (`polyglossia`); pdfLaTeX supports `.png/.jpg/.pdf` and converts `.eps` on the fly. ([Selecting compiler docs](https://docs.overleaf.com/getting-started/recompiling-your-project/selecting-a-tex-live-version-and-latex-compiler.md))
7. **Known failure modes / limits** (the list MeldSpace must design around):
   - **Compile timeouts.** Free plan **10 s**, premium **240 s**; on-prem default **180 s** (customizable). Large/complex theses “may need a longer compile time than is available on our paid plans.” ([Plan limits](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits.md), [Project limits (on-prem)](https://docs.overleaf.com/on-premises/support/project-limits), [Fixing timeouts](https://docs.overleaf.com/troubleshooting-and-support/fixing-and-preventing-compile-timeouts.md))
   - **Missing/custom packages:** `.cls`, `.sty`, `.bst` files must be **at the top level** or found via `TEXINPUTS`/`BSTINPUTS` set in a `latexmkrc`; the main document and `latexmkrc` must stay at top level. ([Adding LaTeX dependencies](https://docs.overleaf.com/managing-projects-and-files/adding-latex-dependencies))
   - **Main-document rules:** must contain `\documentclass`; `.tex` files >2 MB are “non-editable” and cannot be the main document. ([The Main document](https://docs.overleaf.com/getting-started/recompiling-your-project/the-main-document))
   - **File limits:** 2,000 files/project, 7 MB editable material, 2 MB/editable text file, 50 MB/upload; recommended project ≤500 MB (≤100 MB with Git sync). ([Plan limits](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits.md))
   - **Real-world breakage:** e.g. `jabbrv` + accented Unicode in `.bib` “can block the compilation and cause a timeout.” ([Fixing timeouts](https://docs.overleaf.com/troubleshooting-and-support/fixing-and-preventing-compile-timeouts.md))
   - **Rounds:** table of contents, cross-refs, bibliography and index routinely need multiple `latexmk` passes; Overleaf metrics literally count `latex-runs` from `latexmk` output. ([LatexRunner.js](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app/js/LatexRunner.js))
8. **Takeaway for MeldSpace:** Overleaf proves the server-side model works and that `latexmk` is the right orchestration layer (not a single engine invocation). It also proves the server-side model is expensive and slow enough that Overleaf must cap users to 10–240 s. A browser-local engine is precisely the differentiator MeldSpace can offer — if it can be made trustworthy offline.

---

## 2. Browser-compile options at a glance

| Option | Engines | License | Last repo activity | npm | On-demand packages | SyncTeX | Offline after first use |
|---|---|---|---|---|---|---|---|
| **texlyre-busytex** | pdfTeX, XeTeX, LuaHBTeX, bibtex8, biber, makeindex | **AGPL-3.0-or-later** | 2026-08-17 (push), v1.4.0 2026-08-14 | `texlyre-busytex@1.4.0` | Yes (`remoteEndpoint`), cache is your job | **Yes** (`.synctex.gz`) | Yes if you cache packages yourself |
| **BusyTeX** (upstream) | xetex, pdftex, luahbtex, bibtex8, xdvipdfmx, makeindex | Repo MIT; binaries inherit TeX Live licenses | 2026-08-29 | none | No (preloaded data packages only) | engine supports it | Only preloaded data |
| **SwiftLaTeX** | pdfTeX, XeTeX (+ dvipdfmx) | Repo AGPL-3.0; engine sources EPL-2.0/GPL-2.0+CE | Last release 2022-02; push 2024-06-18 | none | Yes (CTAN / self-host) | **No** | Undocumented |
| **texlive.js** | pdfTeX only (TeX Live 2016) | GPL-2.0 | **2017-01-24** | none | No | No | No |
| **latex.js** | none (LaTeX→HTML5 translator) | MIT | npm 0.12.6, 2023-04-23; repo push 2026-08-19 | `latex.js@0.12.6` | N/A (packages must be reimplemented in JS) | No | N/A |
| **Tectonic** (native) | XeTeX + xdvipdfmx | MIT (Tectonic code) | 2026-08-01, very active | none (Rust crate) | Yes (bundle + cache) | via engine | Yes (native cache) |
| **tectonic-wasm** (community) | XeTeX + xdvipdfmx | README says MIT; repo has no license metadata | 2026-03-15, 1★, 3 commits | none | Yes (CDN Range) | Not documented | Not documented |
| **@typeward/texlive-wasm** | pdfLaTeX, XeLaTeX, LuaLaTeX, bibtexu, biber, xdvipdfmx, makeindex | MIT wrapper; TeX Live licenses for engines | 2026-09-03, 1★, **pre-alpha** | `@typeward/texlive-wasm@0.2.4-alpha` | Yes (FetchFS) + OPFS cache | Engines emit it; parser incomplete | Yes (OPFS) |
| **@siglum/engine** | pdfLaTeX, XeLaTeX (built on BusyTeX) | MIT | 2026-05-28, 5★ | `@siglum/engine@0.1.4` | Yes (CTAN proxy) | Not documented | Yes (browser cache) |
| **Server TeX Live + latexmk** | all | TeX Live licenses; `latexmk` GPLv2 | active | N/A | N/A (full install) | **Yes** | N/A (server) |

All engine sizes, versions and dates are from the cited npm/GitHub sources listed in **Sources**.

---

## 3. SwiftLaTeX

**What it is.** `SwiftLaTeX/SwiftLaTeX` (2.3k★) compiles **pdfTeX and XeTeX** (plus `dvipdfm`) to WASM for the browser. Repo license is **AGPL-3.0**, though the engine wrapper source (`xetex.wasm/XeTeXEngine.tsx`) carries an **EPL-2.0 OR GPL-2.0-with-Classpath-exception** header — a genuinely mixed licensing picture that needs legal review before commercial use. ([repo](https://github.com/SwiftLaTeX/SwiftLaTeX), [XeTeXEngine.tsx](https://raw.githubusercontent.com/SwiftLaTeX/SwiftLaTeX/master/xetex.wasm/XeTeXEngine.tsx), [repo API metadata](https://api.github.com/repos/SwiftLaTeX/SwiftLaTeX))

- **Engine coverage:** pdfTeX + XeTeX. **No LuaTeX.** ([README](https://github.com/SwiftLaTeX/SwiftLaTeX))
- **Maintenance:** last push **2024-06-18**; last release **v20022022 (2022-02-20)**, a 2.36 MB zip. 57 commits total. ([release API](https://api.github.com/repos/SwiftLaTeX/SwiftLaTeX/releases))
- **Packaging:** not on npm (`registry.npmjs.org/swiftlatex` → 404). Integration is a `<script>` tag plus `PdfTeXEngine.js` / `XeTeXEngine.js`, or copying the release zip into your public dir. ([README](https://github.com/SwiftLaTeX/SwiftLaTeX))
- **API:** `loadEngine()`, `isReady()`, `writeMemFSFile(filename, src)`, `makeMemFSFolder()`, `setEngineMainFile()`, `compileLaTeX()`, `flushCache()`, `setTexliveEndpoint(url)`, `compileFormat()`. ([README](https://github.com/SwiftLaTeX/SwiftLaTeX))
- **Worker shape + VFS:** `XeTeXEngine` constructs `new Worker(new URL('./swiftlatexxetex.js', import.meta.url).toString())` and talks to it via `postMessage` commands (`compilelatex`, `writefile`, `mkdir`, `setmainfile`, `flushcache`, `settexliveurl`). The VFS is Emscripten **MEMFS**. ([XeTeXEngine.tsx](https://raw.githubusercontent.com/SwiftLaTeX/SwiftLaTeX/master/xetex.wasm/XeTeXEngine.tsx))
- **Package coverage / on-demand:** not a full TeX Live on disk. “All required files are fetched from CTAN … or our mirror server,” driven by a kpathsea emulation; a self-hostable Flask server exists at `SwiftLaTeX/Texlive-Ondemand` (AGPL-3.0). ([README](https://github.com/SwiftLaTeX/SwiftLaTeX), [Texlive-Ondemand](https://github.com/SwiftLaTeX/Texlive-Ondemand))
- **Offline caching:** the engine API only exposes `flushCache()`; there is no documented persistent (IndexedDB/OPFS) cache, and the on-demand fetch is per-need. Treat genuine offline reuse as **unverified**. Self-host the TeX Live endpoint and cache at the app layer if you go this route.
- **Fonts/CJK:** XeTeX handles UTF-8 and OpenType out of the box, and the demos include Chinese/Japanese and TrueType. **But** “SwiftLaTeX does not include a full ICU dataset. As a result, the locale linebreaking may not function as expected.” So CJK glyphs render, but line-breaking quality for CJK is degraded. ([README](https://github.com/SwiftLaTeX/SwiftLaTeX))
- **SyncTeX:** no support; TeXlyre explicitly states “SyncTeX … is supported only with BusyTeX engines.” ([TeXlyre README](https://github.com/TeXlyre/texlyre))
- **Multi-file:** yes, via repeated `writeMemFSFile`/`makeMemFSFolder`.
- **Speed/memory:** vendor claim “run merely 2X slower than native”; exact browser memory is not published. Treat both as vendor/unverified. ([swiftlatex.com](https://www.swiftlatex.com/))

**Verdict:** a landmark project, but the wrong dependency for a 2026 product: frozen, no LuaTeX, no SyncTeX, no npm, an undocumented offline story, and mixed licenses. It is the substrate TeXlyre forked for SwiftLaTeX compatibility — not something to build on directly.

---

## 4. BusyTeX (upstream) and `texlyre-busytex` (packaged)

### 4.1 Upstream `busytex/busytex`

- Programs from **TeX Live 2023** compiled with Emscripten into a single static binary: **xetex, pdftex, luahbtex, bibtex8, xdvipdfmx, kpsewhich/kpsestat/kpseaccess/kpsereadlink, makeindex**. ([README](https://github.com/busytex/busytex))
- **License:** repo code/scripts are **MIT**; “the published binaries … include linked TexLive code, so the respective TexLive/dependencies licenses apply.” ([README](https://github.com/busytex/busytex))
- **Maintenance:** created 2020-10-04, **2,067 commits**, last push **2026-08-29**, 75★. Actively maintained. ([repo API](https://api.github.com/repos/busytex/busytex))
- **Packaging:** **not on npm** (404). You consume GitHub Release assets: `busytex.wasm`, `busytex.js`, `busytex_worker.js`, `busytex_pipeline.js`, `texlive-basic.js/.data`, and optional `ubuntu-texlive-{latex-extra,latex-recommended,science}.js/.data`. ([README](https://github.com/busytex/busytex))
- **Sizes:** the native asset `busytexextra` is ~465 MB; `texlive-basic.tar.gz` is ~50.7 MB; the wasm/`busytex.tar` are ~3.6 MB and ~50 MB respectively. (GitHub release API, partial; treat exact wasm sizes as approximate.)
- **On-demand fetching:** **none upstream.** Packages must be preloaded in the Emscripten data packages. `tlmgr`/perl-style on-demand and Biber are explicitly listed as **future work**. ([README](https://github.com/busytex/busytex))
- **Readme state:** “Programs from TexLive 2023”. Newer TeX Live is delivered by downstream builds.

### 4.2 `texlyre-busytex` — the packaged, maintained API (recommended)

- **npm:** `texlyre-busytex@1.4.0` (latest, published **2026-08-14**); package `unpackedSize` ~157 KB because the heavy assets are downloaded separately. License **AGPL-3.0-or-later**. Repo `TeXlyre/texlyre-busytex` (31★, last push 2026-08-17). ([npm](https://registry.npmjs.org/texlyre-busytex), [repo](https://github.com/TeXlyre/texlyre-busytex))
- **Engines:** XeLaTeX (XeTeX + bibtex8 + dvipdfmx), pdfLaTeX (pdfTeX + bibtex8), LuaLaTeX (LuaHBTeX + bibtex8), plus a standalone **Biber** WASM loaded on demand. TeX Live **2026**. ([repo README](https://github.com/TeXlyre/texlyre-busytex))
- **Asset size:** repo says “WASM files (~32 MB) + data (90–400 MB).” The published `assets-v1.4.0` archive is **521,751,667 bytes (~522 MB)**; the `.data` files are split by TeX Live package set and can be preloaded selectively. ([release API](https://api.github.com/repos/TeXlyre/texlyre-busytex/releases), [repo README](https://github.com/TeXlyre/texlyre-busytex))
- **Package coverage / on-demand / offline caching — the critical caveat.** `preloadDataPackages` loads e.g. `texlive-basic`, `texlive-recommended`, `texlive-extra`; `remoteEndpoint` enables **on-demand TeX Live package fetching**. The example page “relies on Emscripten's built-in `EM_PRELOAD_CACHE` (IndexedDB) to persist downloaded `.data` packages across page refreshes, **but does not implement any additional caching layer on top of it for caching packages and fonts downloaded from the remote endpoint**.” For real offline use, TeXlyre says use its full app (or you build the cache). **This is the single most important thing for MeldSpace to implement itself.** ([npm readme](https://registry.npmjs.org/texlyre-busytex))
- **Custom `.cls`/`.sty`:** pass them in `additionalFiles`; a missing package not on the remote endpoint will fail the compile as usual. Multi-file projects use `additionalFiles` plus `\input`. ([repo README](https://github.com/TeXlyre/texlyre-busytex))
- **Fonts/CJK:** “Only fonts available in `texlive-full` are supported by XeTeX and LuaTeX (and only when TeX Live Server is pointed to, running with web worker).” TeX Live’s font tree is broad; TeXlyre additionally ships a TTF/OTF fonts repo. CJK through XeLaTeX + `fontspec` + a TL CJK font should work; verify specifics. ([npm readme](https://registry.npmjs.org/texlyre-busytex))
- **SyncTeX: yes** — `result.synctex` returns a `.synctex.gz` `Uint8Array`. This is the key capability SwiftLaTeX lacks. ([repo README](https://github.com/TeXlyre/texlyre-busytex))
- **Worker:** `await runner.initialize(true)` runs in a **Web Worker** (default in the docs); `busytexBasePath` points at your served assets. Multi-pass flags: `bibtex`, `biber`, `makeindex`, `rerun`. Controlled shell-escape executes **JavaScript handlers only**, never native commands. ([repo README](https://github.com/TeXlyre/texlyre-busytex))
- **Note:** `biber` is a separate WASM module loaded the first time a `.bcf` is produced; SVG/EPS conversion is not supported without a JS handler. ([repo README](https://github.com/TeXlyre/texlyre-busytex))

**Verdict:** the only option with a maintained npm wrapper, all three engines, Biber, SyncTeX, TeX Live 2026, and an active upstream. The AGPL-3.0 license and the “cache the long-tail yourself” gap are the two things to plan around.

---

## 5. `texlive.js` (dead)

- `manuels/texlive.js`: **TeX Live 2016**, **pdfTeX only**, GPL-2.0. ([repo](https://github.com/manuels/texlive.js))
- **Last push 2017-01-24**, 35 open issues, 60 commits. ([repo API](https://api.github.com/repos/manuels/texlive.js))
- Not on npm (404). Supports a bundled `texlive.lst` file set, not on-demand CTAN fetching.
- **Verdict:** historical ancestor of everything else here. Do not use for a new product.

---

## 6. `latex.js` (not a PDF engine)

- `michael-brade/LaTeX.js`, MIT, **LaTeX → HTML5 translator**, not a TeX engine. ([repo](https://github.com/michael-brade/LaTeX.js))
- **npm `latex.js@0.12.6`, published 2023-04-23** (repo itself pushed 2026-08-19 — active code, stale release). ([registry](https://registry.npmjs.org/latex.js/latest), [repo API](https://api.github.com/repos/michael-brade/LaTeX.js))
- Its own limitations page is decisive: “native LaTeX packages cannot be parsed and loaded. Instead, the macros those packages (and documentclasses) provide have to be implemented in JavaScript”; it is a PEG/context-free parser for a Turing-complete language; horizontal/vertical glue and pages cannot be represented in HTML. ([Limitations](https://latex.js.org/limitations.html))
- **Verdict:** useful only for an HTML preview or web export, never for producing a publisher-acceptable PDF. Not a candidate for MeldSpace's Overleaf pivot.

> Related historical Node toolchain: `latexjs/latexjs` — BSD build scripts with TeX Live artifacts, asm.js, downloads only needed files into `~/.latexjs` (an early “on-demand + cache” idea), and its README notes “there isn't a good native … or Javascript solution for [latexmk].” It is Node, not browser. ([latexjs repo](https://github.com/latexjs/latexjs))

---

## 7. Tectonic and Tectonic-WASM

### 7.1 Tectonic (native)

- **A modernized, self-contained TeX/LaTeX engine powered by XeTeX and TeX Live**, as a reusable Rust library. All I/O goes through pluggable backends; support files come from a single “bundle.” ([repo](https://github.com/tectonic-typesetting/tectonic), [Tectonic book](https://tectonic-typesetting.github.io/book/latest/introduction/))
- **License:** Tectonic's own code is **MIT**, but “elements of the system from which it is derived are licensed under an extremely wide variety of open-source licenses.” ([LICENSE](https://raw.githubusercontent.com/tectonic-typesetting/tectonic/master/LICENSE))
- **Maintenance:** 5.1k★, 4,146 commits, last push **2026-08-01** — very active. ([repo API](https://api.github.com/repos/tectonic-typesetting/tectonic))
- **On-demand + genuine caching (native):** on first build Tectonic downloads the support files it needs and builds a `latex.fmt`; “Tectonic will cache these files and avoid downloading them again,” with `TECTONIC_CACHE_DIR` controlling the cache. Bundles are a single `.ttb` format; a `texlive2023` bundle is published. ([first-document docs](https://github.com/tectonic-typesetting/tectonic/blob/master/docs/src/getting-started/first-document.md), [bundles README](https://github.com/tectonic-typesetting/tectonic/blob/master/bundles/README.md))
- This is the best **native** on-demand-and-cache model of any option — but it is not a browser package.

### 7.2 Tectonic-WASM (community only)

- **No official WASM build or npm package.** In the tracking discussion (#999, 2023), a maintainer wrote: “it would be interesting to get a WASM build going in Tectonic's CI infrastructure. I haven't looked into it at all.” ([discussion #999](https://github.com/tectonic-typesetting/tectonic/discussions/999))
- Community wrapper `nl5887/tectonic-wasm`: **3.4 MB wasm + 11 MB bundle (474 files)**, XeTeX + xdvipdfmx, two-pass, “on-demand CDN fetch — 134,980 additional packages available via Range requests,” 512 MB initial / 1 GB max, claims MIT. But: created 2026-03-13, **3 commits**, last push **2026-03-15**, 1★, and the GitHub API reports **no license metadata**. ([repo](https://github.com/nl5887/tectonic-wasm), [repo API](https://api.github.com/repos/nl5887/tectonic-wasm))
- **Verdict:** the right long-term engine, the wrong current dependency. If MeldSpace wants Tectonic, that is a research/build project (compile `tectonic` to `wasm32-unknown-emscripten`, supply a persistent cache), not an integration.

---

## 8. Newer entrants worth watching

### 8.1 `@typeward/texlive-wasm` (most promising “coming soon”)

- MIT wrapper + CLI, `@typeward/texlive-wasm@0.2.4-alpha`, built from a **hard fork of TeX Live 2026**. Engines as separate `.wasm`: pdfLaTeX 1.3 MB, XeLaTeX 2.8 MB, LuaLaTeX (LuaHBTeX 1.24) 4.8 MB, BibTeXu 877 KB, biber 9.1 MB (+14 MB VFS), xdvipdfmx 765 KB, makeindex 192 KB. ([repo](https://github.com/typeward/texlive-wasm), [npm latest](https://registry.npmjs.org/@typeward/texlive-wasm/latest))
- **Crucially, it has a designed browser cache:** VFS chain is `BundleFS` (preloaded core TDS in memory) → `TauriFS`/`OPFS` (persistent, offline) → `FETCHFS` (CDN long-tail fetch). Cross-origin bundles require a SHA-256 digest; cached files are re-checked against the manifest. ([repo](https://github.com/typeward/texlive-wasm))
- Built-in `latexmk` multi-pass driver (`bibtex`, `makeindex`, engine config per helper); **SyncTeX is emitted by every engine**, but the JS parser currently only extracts the input-file list — `forward()`/`reverse()` return empty and are “Phase 4.” ([repo](https://github.com/typeward/texlive-wasm))
- Uses Web Worker + `comlink`; ships a Vite config. Assets ~360 MB unpacked TDS. **Status: pre-alpha, 1★, first stable not shipped** (`latest` currently points at a prerelease). ([repo](https://github.com/typeward/texlive-wasm), [npm latest](https://registry.npmjs.org/@typeward/texlive-wasm/latest))
- **Verdict:** keeps the MIT/TeX-Live license shape MeldSpace may prefer, and its OPFS design is exactly what BusyTeX's example lacks. Too young to depend on today; track it and consider it the migration target if AGPL becomes a blocker.

### 8.2 `@siglum/engine` (BusyTeX packaging reference)

- MIT, built on BusyTeX, TeX Live 2025; npm `@siglum/engine@0.1.4`; 5★; last push 2026-05-28. 29 MB wasm + ~195 MB bundles (16 MB core for pdfLaTeX). CTAN proxy for on-demand fetch; “Everything is cached in the browser for offline use”; ~**512 MB RAM** for compilation; requires `SharedArrayBuffer` via **COOP/COEP** headers. ([repo](https://github.com/SiglumProject/siglum), [repo API](https://api.github.com/repos/SiglumProject/siglum), [npm latest](https://registry.npmjs.org/@siglum/engine/latest))
- **The Vite lesson is explicit:** bundlers break the automatic worker loading; copy the worker to `public/` and pass an explicit `workerUrl` in the compiler config. ([repo](https://github.com/SiglumProject/siglum))
- **Verdict:** too small to adopt, but it is the best public proof that lazy bundles + on-demand CTAN + browser-cached offline compile is workable, and its Vite/COOP/COEP guidance transfers directly.

---

## 9. Server-side TeX Live + `latexmk` fallback

This is Overleaf's model applied to MeldSpace, and it remains the correctness gold standard.

- **What runs:** a container (or VM) with a full TeX Live install, executing `latexmk -pdf/-xelatex/-lualatex -synctex=1 -interaction=batchmode` (see §1). `latexmk` is GPLv2, bundled in TeX Live and MiKTeX. ([CTAN latexmk](https://ctan.org/pkg/latexmk))
- **Coverage:** 5,000+ packages, all engines, all fonts, custom classes, `.bst`, Biber, SyncTeX — no missing-package problem. ([Overleaf TeX Live docs](https://docs.overleaf.com/troubleshooting-and-support/tex-live))
- **Failure modes** are how you configure it: compile timeout (10–240 s on Overleaf, 180 s on-prem default), container spin-up latency, disk/memory footprint of a `texlive-full` image, and the multi-pass cost of large theses. ([Plan limits](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits.md), [Project limits](https://docs.overleaf.com/on-premises/support/project-limits))
- **Architecture note:** this re-introduces a server compute dependency for compiling, though **not** a source-of-truth for content — the Yjs room stays authoritative and the server is stateless per compile (or caches by content hash). It is the right **escape hatch**, not the default.

---

## 10. Cross-cutting findings

### 10.1 Package coverage, custom classes, missing packages, offline

- **Full TeX Live in the browser is now packaging, not capability.** BusyTeX/TeXlyre ship TeX Live 2026 as 90–400 MB (a ~522 MB published archive); `texlive-wasm` ships ~360 MB of TDS; Siglum ships ~195 MB of bundles. You should **deploy the whole tree but load selectively**: preload `texlive-basic` (and `texlive-recommended`), then fetch the long tail on demand. ([texlyre-busytex release API](https://api.github.com/repos/TeXlyre/texlyre-busytex/releases), [typeward](https://github.com/typeward/texlive-wasm), [Siglum](https://github.com/SiglumProject/siglum))
- **On-demand fetching exists, but the cache is on you.** `texlyre-busytex` exposes `remoteEndpoint` and relies on Emscripten's IndexedDB `EM_PRELOAD_CACHE`; it explicitly does **not** cache remote-fetched packages/fonts. `texlive-wasm` and Siglum do implement OPFS/browser caching. For MeldSpace, write fetched packages into **OPFS** (or IndexedDB) and treat “already compiled once” as “compiles offline forever.” ([texlyre-busytex npm](https://registry.npmjs.org/texlyre-busytex), [typeward](https://github.com/typeward/texlive-wasm), [Siglum](https://github.com/SiglumProject/siglum))
- **Custom `.cls`/`.sty`:** pass them as project files into the engine's VFS (`additionalFiles`). They work when present; when absent, behavior is the classic TeX “file not found,” so MeldSpace should surface a “package missing / fetch from CTAN?” UX (Overleaf's equivalent is top-level files or a `latexmkrc` with `TEXINPUTS`). ([Overleaf deps docs](https://docs.overleaf.com/managing-projects-and-files/adding-latex-dependencies))

### 10.2 Fonts / CJK

- **pdfTeX:** no Unicode/OpenType; use Type1/TTF via `\pdfmapfile`, weak for CJK.
- **XeTeX/LuaTeX:** Unicode + TrueType/OpenType via `fontspec`; best CJK path. SwiftLaTeX's ICU omission degrades locale linebreaking; BusyTeX/TeXlyre restrict you to fonts shipped in `texlive-full`. Overleaf explicitly recommends XeLaTeX/LuaLaTeX + `polyglossia` for non-Latin scripts. ([SwiftLaTeX README](https://github.com/SwiftLaTeX/SwiftLaTeX), [texlyre-busytex npm](https://registry.npmjs.org/texlyre-busytex), [Overleaf compiler docs](https://docs.overleaf.com/getting-started/recompiling-your-project/selecting-a-tex-live-version-and-latex-compiler.md))
- **Practical CJK plan:** default XeLaTeX; ship/choose a TeX Live CJK bundle (e.g. Noto CJK) and load it into the VFS; add a project font uploader writing user `.otf/.ttf` into the engine FS.

### 10.3 SyncTeX

- **Only the BusyTeX-family engines give you SyncTeX today:** `texlyre-busytex` returns `.synctex.gz`; server `latexmk` supports it with `-synctex=1` and Overleaf exposes `/sync/code` and `/sync/pdf`. SwiftLaTeX: none. Tectonic: engine-level in newer builds. `texlive-wasm`: engines emit it, but its JS `forward()`/`reverse()` are stubbed. ([texlyre-busytex repo](https://github.com/TeXlyre/texlyre-busytex), [LatexRunner.js](https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app/js/LatexRunner.js), [typeward](https://github.com/typeward/texlive-wasm))
- **MeldSpace implication:** editor↔PDF jump is a core “Overleaf” affordance. If SyncTeX is a must-have at launch, BusyTeX is the only browser path; otherwise pair the editor with a PDF.js viewer and defer.

### 10.4 Multi-file projects and aux/bib rounds

- All browser engines support multiple files by writing into an Emscripten virtual FS. `texlyre-busytex` takes `additionalFiles`; SwiftLaTeX uses `writeMemFSFile`. ([texlyre-busytex repo](https://github.com/TeXlyre/texlyre-busytex), [SwiftLaTeX README](https://github.com/SwiftLaTeX/SwiftLaTeX))
- **Rounds are the real complexity.** A single engine pass is not a build. You need `latexmk`-equivalent orchestration: `rerun` for TOC/refs, `bibtex` or `biber` for bibliography, `makeindex` for indexes, and correct detection of convergence. `texlyre-busytex` exposes all four flags; `texlive-wasm` ships an explicit `latexmk` driver; server-side gets it free. ([texlyre-busytex repo](https://github.com/TeXlyre/texlyre-busytex), [typeward](https://github.com/typeward/texlive-wasm))

### 10.5 Vite + Web Worker + virtual FS + IndexedDB/OPFS

- **Worker shape.** SwiftLaTeX: `new Worker(new URL('./swiftlatexxetex.js', import.meta.url))`. BusyTeX/TeXlyre: `BusyTexRunner.initialize(true)` spawns its own worker; assets are fetched from `busytexBasePath` (serve them from `public/`). `texlive-wasm`: Web Worker + comlink. ([XeTeXEngine.tsx](https://raw.githubusercontent.com/SwiftLaTeX/SwiftLaTeX/master/xetex.wasm/XeTeXEngine.tsx), [texlyre-busytex repo](https://github.com/TeXlyre/texlyre-busytex), [typeward](https://github.com/typeward/texlive-wasm))
- **Vite gotcha (documented by Siglum, and generic):** bundlers pre-bundle dependencies and break automatic worker resolution; copy the worker file to `public/` and pass an explicit `workerUrl` (or serve the engine scripts untransformed from `public/`). Keep the WASM/`.data` assets out of the JS bundle. ([Siglum](https://github.com/SiglumProject/siglum))
- **Headers.** BusyTeX-class engines use `SharedArrayBuffer`, which requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (Siglum lists these, plus CORP/ACAO for assets). **This is a cross-cutting architectural constraint:** COEP can break cross-origin fetches and some third-party resources, and MeldSpace must verify it does not break y-webrtc, the signaling WebSocket, or PDF.js. ([Siglum](https://github.com/SiglumProject/siglum))
- **Virtual FS:** Emscripten MEMFS inside the worker. MeldSpace materialises the Y.Doc file tree into MEMFS per compile (or keeps it hot), then reads back `output.pdf` (+ `.synctex.gz`, `.log`). Persist compiled PDF/outputs in the room's Yjs/IndexedDB state.
- **Caching layers to build:** user project files (already in `y-indexeddb`) + engine assets (HTTP cache/CDN) + TeX Live packages/fonts (**OPFS**, keyed by content hash) + compiled-output cache keyed by a preamble/content hash (Siglum does this with `enableDocCache`). ([Siglum](https://github.com/SiglumProject/siglum))

### 10.6 Memory and CPU

- **RAM:** Siglum states ~**512 MB** for compilation (max heap) and requires COOP/COEP; `tectonic-wasm` claims 512 MB initial / 1 GB max. SwiftLaTeX vendors “~2× native”; nobody publishes reliable browser CPU figures. Treat `texlyre-busytex`'s real memory/CPU as **unmeasured** until you profile it. ([Siglum](https://github.com/SiglumProject/siglum), [tectonic-wasm](https://github.com/nl5887/tectonic-wasm), [swiftlatex.com](https://www.swiftlatex.com/))
- **First-load cost is the UX risk:** ~30 MB wasm + tens to hundreds of MB of data packages. Pre-warm the engine on room open (Siglum's documented pattern) and stream/preload progressively; this must not block editing. ([Siglum](https://github.com/SiglumProject/siglum))

### 10.7 Licensing summary

| Component | License |
|---|---|
| Overleaf CLSI | AGPL-3.0 |
| `latexmk` | GPL-2.0 |
| SwiftLaTeX repo | AGPL-3.0; engine sources EPL-2.0 / GPL-2.0+CE |
| BusyTeX upstream | MIT repo; binaries inherit TeX Live licenses |
| `texlyre-busytex` | **AGPL-3.0-or-later** (derived from BusyTeX WASM, MIT) |
| `texlive.js` | GPL-2.0 |
| `latex.js` | MIT |
| Tectonic | MIT (derived elements vary) |
| `nl5887/tectonic-wasm` | claimed MIT; no repo license metadata |
| `@typeward/texlive-wasm` | MIT wrapper; TeX Live licenses for engines |
| `@siglum/engine` | MIT |

**The AGPL point matters.** If MeldSpace is or becomes closed-source, shipping `texlyre-busytex` inside the client triggers AGPL-3.0-or-later obligations. Mitigations: (a) run the AGPL compile worker as a separately-communicating process/service where the AGPL boundary is respected (still requires care), (b) adopt the MIT `@typeward/texlive-wasm` when it matures, or (c) produce your own Emscripten build from MIT BusyTeX scripts (the binaries remain under TeX Live licenses, which is the same situation every LaTeX distributor is in). Get counsel; do not treat this as settled.

---

## 11. Verdict

**Engine choice: BusyTeX, consumed through `texlyre-busytex`, with XeLaTeX as the default and pdfLaTeX as the fast path, plus a server-side TeX Live + `latexmk` fallback for the hard cases.** This is the only browser option that combines all three engines, Biber, SyncTeX, TeX Live 2026, a maintained npm package, and an active upstream — and it is what TeXlyre already ships in production for local-first collaborative editing, which is MeldSpace's exact shape.

The two things to design around from day one are (1) **AGPL-3.0-or-later** — decide early whether that is acceptable, and if not, make `@typeward/texlive-wasm` the migration target; and (2) **the missing long-tail offline cache** — `texlyre-busytex` deliberately does not cache remote-fetched packages/fonts, so MeldSpace must implement an OPFS-backed package cache and a preamble-keyed output cache.

### Concrete integration shape

1. **Compile seam.** Define a `CompileProvider` interface (`compile({ engine, mainFile, files, options }) → { pdf, synctexGz, log, exitCode }`) with two implementations: `WasmCompileProvider` (default, in the browser) and `RemoteCompileProvider` (Overleaf-CLSI-shaped, optional fallback). Keep it a deep module: the room never knows which engine ran.
2. **Local-first worker.** A dedicated Web Worker owns the `BusyTexRunner`; the engine assets (wasm + `.data`) are copied to `apps/web/public/` and served by Vite as static files, never bundled. Use a small message protocol (mirroring SwiftLaTeX's `writefile`/`mkdir`/`compile`/`flushcache` shape) so the UI stays responsive. Pre-warm on room open.
3. **Virtual FS materialisation.** On each compile, materialise the room's file tree from the Y.Doc / `y-indexeddb` into the engine FS via `additionalFiles`. Detect the main file by scanning for `\documentclass` (Overleaf's rule) and let the user override.
4. **Round control.** Expose `rerun`, `bibtex`/`biber`, `makeindex` as build settings; default to “auto” by parsing the log/`.aux`/`.bcf` (Siglum's pre-scan and `latexmk` driver are the reference). Surface the log and errors as structured diagnostics, not a wall of TeX.
5. **Caching.** Layer 1: engine assets via HTTP cache/Service Worker. Layer 2: fetched TeX Live packages/fonts in **OPFS**, content-addressed and manifest-verified (follow `texlive-wasm`'s SHA-256 manifest discipline). Layer 3: compiled PDF keyed by a hash of preamble + main source, persisted in the room so a reload shows the last PDF instantly and can recompile offline.
6. **Self-host the package endpoint.** Run a TeX Live-on-demand mirror (BusyTeX data packages / a CTAN proxy like Siglum's, or `SwiftLaTeX/Texlive-Ondemand` as a reference) so first-fetch works, is fast, and is under your control; the browser caches it thereafter.
7. **Headers + PWA.** Serve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for `SharedArrayBuffer`, with `Cross-Origin-Resource-Policy`/CORS on assets. **Test this against y-webrtc, the signaling WebSocket, and PDF.js before committing** — COEP is the most likely integration breaker.
8. **Server fallback.** Keep the RemoteCompileProvider as an explicit, non-blocking “compile on server” escape hatch for custom classes, exotic packages and large theses. It is stateless per compile and is not a source of truth; make it opt-in, not the default path.
9. **UI parity with Overleaf.** SyncTeX forward/inverse (source↔PDF) via the returned `.synctex.gz` and a PDF.js viewer; main-file selection; multi-file tree; bibliography/index settings. These are the affordances users judge an “Overleaf” by.

---

## Sources

All URLs accessed **2026-09-12**.

**Overleaf**

- CLSI README (REST API, default 60 s timeout, sandboxed sibling containers, TeX Live image, AGPL-3.0) — https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/README.md
- `LatexRunner.js` (exact `latexmk` command, `-synctex=1`, compiler flags, default 60000 ms) — https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app/js/LatexRunner.js
- `services/clsi/app.js` (10.5 min request timeout, `/sync/code` + `/sync/pdf`) — https://raw.githubusercontent.com/overleaf/overleaf/main/services/clsi/app.js
- Overleaf TeX Live (5,000+ packages, project-pinned versions, legacy) — https://docs.overleaf.com/troubleshooting-and-support/tex-live
- Selecting a TeX Live version and compiler (pdfLaTeX/LaTeX/XeLaTeX/LuaLaTeX, Unicode fonts) — https://docs.overleaf.com/getting-started/recompiling-your-project/selecting-a-tex-live-version-and-latex-compiler.md
- Adding LaTeX dependencies (top-level `.cls/.sty/.bst`, `TEXINPUTS`) — https://docs.overleaf.com/managing-projects-and-files/adding-latex-dependencies
- The Main document (`\documentclass`, 2 MB editable limit) — https://docs.overleaf.com/getting-started/recompiling-your-project/the-main-document
- Plan limits (free 10 s / premium 240 s, 2,000 files, 7 MB, 2 MB/file) — https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits.md
- Project limits (on-prem; default 180 s) — https://docs.overleaf.com/on-premises/support/project-limits
- Fixing and preventing compile timeouts — https://docs.overleaf.com/troubleshooting-and-support/fixing-and-preventing-compile-timeouts.md
- CTAN `latexmk` (GPLv2, version 4.88, 2026-03-09) — https://ctan.org/pkg/latexmk

**SwiftLaTeX**

- Repo + README (pdfTeX/XeTeX, script-tag API, ICU omission, CTAN on-demand, AGPL-3.0) — https://github.com/SwiftLaTeX/SwiftLaTeX
- API metadata (2.3k★, 57 commits, push 2024-06-18) — https://api.github.com/repos/SwiftLaTeX/SwiftLaTeX
- Releases (latest `v20022022`, 2022-02-20, 2.36 MB zip) — https://api.github.com/repos/SwiftLaTeX/SwiftLaTeX/releases
- `XeTeXEngine.tsx` (Worker shape, MEMFS API, EPL-2.0/GPL-2.0+CE header) — https://raw.githubusercontent.com/SwiftLaTeX/SwiftLaTeX/master/xetex.wasm/XeTeXEngine.tsx
- Texlive-Ondemand server (AGPL-3.0, Flask) — https://github.com/SwiftLaTeX/Texlive-Ondemand
- swiftlatex.com (vendor speed claim “2× slower than native”, demos incl. CJK) — https://www.swiftlatex.com/

**BusyTeX / texlyre-busytex**

- BusyTeX README (TeX Live 2023, engine list, MIT repo + TeX Live binaries, future work incl. tlmgr/Biber) — https://github.com/busytex/busytex
- BusyTeX repo API (2,067 commits, push 2026-08-29) — https://api.github.com/repos/busytex/busytex
- BusyTeX release assets (`texlive-basic.tar.gz` ~50.7 MB, `busytexextra` ~465 MB) — https://api.github.com/repos/busytex/busytex/releases/latest
- texlyre-busytex repo README (engines, multi-file, SyncTeX, worker, biber, limitations) — https://github.com/TeXlyre/texlyre-busytex
- texlyre-busytex on npm (v1.4.0, 2026-08-14, AGPL-3.0-or-later, assets 32 MB + 90–400 MB, EM_PRELOAD_CACHE caveat) — https://registry.npmjs.org/texlyre-busytex
- texlyre-busytex releases (assets-v1.4.0 `busytex-assets.tar.gz` 521,751,667 B) — https://api.github.com/repos/TeXlyre/texlyre-busytex/releases
- TeXlyre app README (local-first Yjs/WebRTC editor; SyncTeX only with BusyTeX) — https://github.com/TeXlyre/texlyre

**texlive.js**

- Repo + README (TeX Live 2016, pdfTeX, GPL-2.0) — https://github.com/manuels/texlive.js
- Repo API (last push 2017-01-24) — https://api.github.com/repos/manuels/texlive.js

**LaTeX.js**

- Repo + README — https://github.com/michael-brade/LaTeX.js
- npm latest (0.12.6) — https://registry.npmjs.org/latex.js/latest
- Repo API (repo push 2026-08-19) — https://api.github.com/repos/michael-brade/LaTeX.js
- Limitations (no native package loading; context-free parser; HTML/CSS limits) — https://latex.js.org/limitations.html
- latexjs/latexjs Node toolchain (THINFS on-demand + `~/.latexjs` cache) — https://github.com/latexjs/latexjs

**Tectonic**

- Repo + README — https://github.com/tectonic-typesetting/tectonic
- Repo API (5,092★, push 2026-08-01) — https://api.github.com/repos/tectonic-typesetting/tectonic
- LICENSE (MIT for Tectonic; derived elements varied) — https://raw.githubusercontent.com/tectonic-typesetting/tectonic/master/LICENSE
- Tectonic book Introduction (self-contained, embeddable) — https://tectonic-typesetting.github.io/book/latest/introduction/
- First document (bundle download + cache, `TECTONIC_CACHE_DIR`) — https://github.com/tectonic-typesetting/tectonic/blob/master/docs/src/getting-started/first-document.md
- Bundles README (`.ttb`, texlive2023) — https://github.com/tectonic-typesetting/tectonic/blob/master/bundles/README.md
- Discussion #999 (no official WASM build; maintainer comment) — https://github.com/tectonic-typesetting/tectonic/discussions/999
- nl5887/tectonic-wasm (3.4 MB wasm, 11 MB bundle, Range on-demand, 512 MB/1 GB) — https://github.com/nl5887/tectonic-wasm
- nl5887/tectonic-wasm repo API (3 commits, push 2026-03-15, no license) — https://api.github.com/repos/nl5887/tectonic-wasm

**Newer entrants**

- typeward/texlive-wasm README (per-engine sizes, OPFS/FETCHFS VFS chain, latexmk driver, SyncTeX phase 4, pre-alpha) — https://github.com/typeward/texlive-wasm
- `@typeward/texlive-wasm` npm latest (0.2.4-alpha, MIT) — https://registry.npmjs.org/@typeward/texlive-wasm/latest
- typeward/texlive-wasm repo API — https://api.github.com/repos/typeward/texlive-wasm
- Siglum README (29 MB wasm, ~195 MB bundles, CTAN proxy, browser cache, ~512 MB RAM, COOP/COEP, Vite `workerUrl`) — https://github.com/SiglumProject/siglum
- Siglum repo API (5★, push 2026-05-28, MIT) — https://api.github.com/repos/SiglumProject/siglum
- `@siglum/engine` npm latest (0.1.4, MIT) — https://registry.npmjs.org/@siglum/engine/latest

---

## Unverified / caveats

- **Browser CPU/memory for `texlyre-busytex` is unmeasured.** The 512 MB figure is Siglum's (BusyTeX-based) number, and “~2× native” is SwiftLaTeX's vendor claim. Profile on target hardware before committing to a memory budget.
- **`texlyre-busytex` offline long-tail caching is the known gap.** Its own README says the example does not cache remote-fetched packages/fonts beyond Emscripten's IndexedDB `EM_PRELOAD_CACHE`. Whether TeXlyre's own production app caches them well is asserted but not documented here. MeldSpace should assume it must build the OPFS cache.
- **Exact SwiftLaTeX WASM sizes are not published per engine.** The 2.36 MB release zip is the only hard number; per-engine `.wasm` sizes are unknown and could be materially larger.
- **`nl5887/tectonic-wasm` claims MIT but the GitHub API reports no license metadata**, it has 3 commits and one author, and its offline-cache behavior is not documented. Do not rely on it.
- **`@typeward/texlive-wasm` is pre-alpha** (1★, first stable not shipped; `latest` currently resolves to a prerelease) and its SyncTeX lookups are explicitly not implemented. It may change or stall.
- **`@siglum/engine` is a 5★ project** with no evidence of production usage; treat its API as illustrative, not stable.
- **COOP/COEP interactions are not verified against MeldSpace's stack.** `SharedArrayBuffer` headers are required by BusyTeX-class engines, but we did not test whether they break y-webrtc signaling, `y-indexeddb`, or three-party resource loads. This is the highest-risk unknown in the integration.
- **Biber on BusyTeX is new and load-on-demand**; resilience of the separate Biber WASM on large `.bcf` files is unverified. This is cited as a known Overleaf-adjacent failure class (Unicode/accented `.bib` + abbreviation packages).
- **The AGPL-3.0-or-later analysis is not legal advice.** The exact boundary for shipping an AGPL compile worker inside a proprietary client should be reviewed by counsel.
- **Overleaf's plan numbers change.** The 10 s/240 s figures are current as of the access date and have changed historically; treat the on-prem/OSS numbers (60 s CLSI default, 180 s on-prem) as the stable architectural facts.
- **TeX Live 2026 packaging claims** (e.g. “full TeX Live”) come from the packagers' READMEs; we did not independently diff the bundled file set against CTAN.
