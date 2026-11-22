/**
 * In-browser LaTeX compile seam (#27).
 *
 * The PDF is **derived local state**: each peer compiles its own view of the
 * shared sources and the bytes never enter the CRDT, never sync, and are never
 * checkpointed. Only `.tex`/`.bib` sources are shared.
 *
 * Shape: a `CompileProvider` interface with the BusyTeX Web Worker path as the
 * default. A stateless server `latexmk` path stays an explicit escape hatch
 * behind this seam — not the default, since it breaks the offline story.
 */

export type LatexFileInput = {
  path: string;
  content: string;
};

export type CompileRequest = {
  /** Full text of the main `.tex` file. */
  input: string;
  mainTexPath: string;
  additionalFiles: LatexFileInput[];
};

export type CompileResult = {
  success: boolean;
  pdf?: Uint8Array;
  log: string;
  exitCode: number;
  durationMs: number;
};

export interface CompileProvider {
  readonly id: "busytex-worker";
  /** Load the engine (tens to hundreds of MB) without blocking editing. */
  warm(): Promise<void>;
  compile(request: CompileRequest): Promise<CompileResult>;
}

export type EngineState = "idle" | "warming" | "ready" | "unavailable";
export type CompilePhase = "idle" | "compiling" | "success" | "error";
