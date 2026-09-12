import type { BusyTexRunner } from "texlyre-busytex";

import type { CompileProvider, CompileRequest, CompileResult } from "./types";

type BusyTexModule = typeof import("texlyre-busytex");

/**
 * Default `CompileProvider`: `texlyre-busytex` in a Web Worker (#27).
 *
 * Spike verdict (see #27): the shipped engine is single-threaded — no
 * `SharedArrayBuffer`, so no COOP/COEP headers. y-webrtc, y-indexeddb and the
 * auth surfaces are untouched. Do not add isolation headers for this engine.
 *
 * Gotchas baked in:
 *
 * - `engineMode: "combined"` — the released assets ship only
 *   `busytex.js`/`busytex.wasm`; the per-engine modes look for files that do
 *   not exist.
 * - Assets live under `busytexBasePath` in `public/` and are never bundled;
 *   bundlers break the runner's worker resolution.
 * - `initialize(true)` runs in a worker; pre-warm on room open, never block
 *   editing.
 */
export const BUSYTEX_BASE_PATH = "/core/busytex";

/** Minimal offline path: engine + basic packages; the long tail is fetched. */
export const BUSYTEX_PRELOAD_PACKAGES = ["texlive-basic"];

export function createBusyTexProvider(options?: {
  basePath?: string;
  preloadPackages?: string[];
}): CompileProvider {
  const basePath = options?.basePath ?? BUSYTEX_BASE_PATH;
  const preloadDataPackages = options?.preloadPackages ?? [...BUSYTEX_PRELOAD_PACKAGES];

  let module: BusyTexModule | null = null;
  let runner: BusyTexRunner | null = null;
  let warmPromise: Promise<void> | null = null;

  async function getRunner(): Promise<BusyTexRunner> {
    if (runner) return runner;
    const loaded: BusyTexModule = await import("texlyre-busytex");
    const instance = new loaded.BusyTexRunner({
      busytexBasePath: basePath,
      engineMode: "combined",
      preloadDataPackages,
      verbose: false,
    });
    await instance.initialize(true);
    module = loaded;
    runner = instance;
    return instance;
  }

  function warm(): Promise<void> {
    if (!warmPromise) {
      warmPromise = getRunner().then(
        () => undefined,
        (error: unknown) => {
          // Drop everything so a later retry (e.g. back online) starts clean.
          warmPromise = null;
          module = null;
          runner = null;
          throw error;
        },
      );
    }
    return warmPromise;
  }

  async function compile(request: CompileRequest): Promise<CompileResult> {
    const started = Date.now();
    const active = await getRunner();
    const loaded = module;
    if (!loaded) throw new Error("BusyTeX: engine module lost after warm.");
    // R2 demo: single pass, no bibliography. `rerun`/`biber` arrive with the
    // bibliography template, not here.
    const pdf = new loaded.PdfLatex(active);
    const result = await pdf.compile({
      input: request.input,
      mainTexPath: request.mainTexPath,
      additionalFiles: request.additionalFiles,
      bibtex: false,
      biber: false,
      makeindex: false,
      rerun: false,
    });
    return {
      success: result.success,
      pdf: result.pdf,
      log: result.log,
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
    };
  }

  return { id: "busytex-worker", warm, compile };
}
