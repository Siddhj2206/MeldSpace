# BusyTeX engine assets (#27)

This directory holds the in-browser TeX engine. It is **gitignored** (100MB+
of binaries) and must be provisioned on each machine. Nothing here is bundled —
Vite serves it verbatim and the runner loads it in a Web Worker via an
explicit `busytexBasePath`.

## What goes here

```
public/core/busytex/
  busytex.js            # combined engine glue (engineMode MUST be "combined";
  busytex.wasm          #   the released assets ship only this engine)
  busytex_worker.js     # single-threaded worker (no SharedArrayBuffer, so no
  busytex_pipeline.js   #   COOP/COEP headers — see #27)
  busytex_biber.js      # on-demand biber wasm glue (bibliographies only)
  texlive-basic.js
  texlive-basic.data    # minimal offline path (~93 MB)
  ...
```

Only `texlive-basic` is needed for the R2 demo: keep the template preamble
inside it and an already-compiled document recompiles offline. The long tail
(`texlive-recommended`, `texlive-extra`, `biber`) arrives via `remoteEndpoint`
and must be cached (OPFS/IndexedDB + the service-worker's `meldspace-busytex`
runtime cache) before going offline.

## Provisioning

Copy the assets from the `texlyre-busytex` release / your local spike worktree
into `public/core/busytex/`, then run the dev server and open any room: the
Preview panel's Recompile button compiles end to end. First compile needs the
network; recompiles work offline once the engine + packages are cached.
