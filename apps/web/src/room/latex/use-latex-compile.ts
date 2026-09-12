import { useCallback, useEffect, useRef, useState } from "react";

import { useRoom } from "../room-provider";
import { createBusyTexProvider } from "./busytex-provider";
import { materializeLatexProject } from "./materialize";
import type { CompileProvider, CompilePhase, EngineState } from "./types";

const LOG_TAIL_LENGTH = 12_000;

function tail(text: string): string {
  return text.length > LOG_TAIL_LENGTH
    ? `… (truncated, last ${LOG_TAIL_LENGTH} chars)\n${text.slice(-LOG_TAIL_LENGTH)}`
    : text;
}

function describeCompileError(error: unknown): string {
  if (error instanceof TypeError) {
    return (
      "Engine assets unreachable. The BusyTeX files are provisioned under " +
      "`apps/web/public/core/busytex/` (see `public/core/README.md`); a first " +
      "compile needs the network, recompiles work offline once cached."
    );
  }
  return error instanceof Error ? error.message : "Compile failed with an unknown error.";
}

export type LatexCompile = {
  engine: EngineState;
  phase: CompilePhase;
  /** Blob URL for the `<iframe>` preview; null until the first success. */
  pdfUrl: string | null;
  pdfBytes: number;
  log: string;
  error: string | null;
  compiledAt: number | null;
  durationMs: number | null;
  recompile: () => Promise<void>;
  dismissError: () => void;
};

/**
 * Room-scoped compile state (#27). The engine pre-warms when the room opens
 * and never blocks editing; the PDF stays local — blob URL only, never written
 * to the CRDT or the checkpoint log.
 */
export function useLatexCompile(
  createProvider: () => CompileProvider = createBusyTexProvider,
): LatexCompile {
  const { runtime } = useRoom();
  const [provider] = useState(createProvider);
  const [engine, setEngine] = useState<EngineState>("idle");
  const [phase, setPhase] = useState<CompilePhase>("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState(0);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [compiledAt, setCompiledAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const urlRef = useRef<string | null>(null);

  // Pre-warm on room open. Async on purpose: editing never waits for the
  // tens-to-hundreds of MB engine download.
  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    setEngine("warming");
    provider.warm().then(
      () => {
        if (!cancelled) setEngine("ready");
      },
      () => {
        if (!cancelled) setEngine("unavailable");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runtime, provider]);

  // Blob URL lifecycle: revoke the previous PDF before replacing it, and on
  // unmount, so recompiles don't leak object URLs.
  useEffect(() => {
    const current = urlRef.current;
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  }, []);

  const recompile = useCallback(async () => {
    if (!runtime || phaseRef.current === "compiling") return;
    setPhase("compiling");
    setError(null);
    try {
      const project = materializeLatexProject(runtime.doc);
      if (!project) {
        setPhase("error");
        setError("No LaTeX sources yet — add a main.tex to the room, or start from the template.");
        return;
      }
      const result = await provider.compile({
        input: project.input,
        mainTexPath: project.mainTexPath,
        additionalFiles: project.additionalFiles,
      });
      setLog(tail(result.log));
      if (result.success && result.pdf) {
        const bytes = new Uint8Array(result.pdf);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(
          new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
        );
        urlRef.current = url;
        setPdfUrl(url);
        setPdfBytes(bytes.byteLength);
        setCompiledAt(Date.now());
        setDurationMs(result.durationMs);
        setPhase("success");
      } else {
        setPhase("error");
        setError(`Compile failed (exit ${result.exitCode}). The TeX log below has the error.`);
      }
    } catch (thrown) {
      setPhase("error");
      setError(describeCompileError(thrown));
    }
  }, [runtime, provider]);

  const dismissError = useCallback(() => {
    setError(null);
    setPhase((current) => {
      if (current !== "error") return current;
      return urlRef.current ? "success" : "idle";
    });
  }, []);

  return {
    engine,
    phase,
    pdfUrl,
    pdfBytes,
    log,
    error,
    compiledAt,
    durationMs,
    recompile,
    dismissError,
  };
}

/** True once the room holds at least one compilable `.tex` file. */
export function useLatexSourcesAvailable(): boolean {
  const { runtime } = useRoom();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!runtime) {
      setAvailable(false);
      return;
    }
    const check = () => setAvailable(materializeLatexProject(runtime.doc) !== null);
    check();
    runtime.doc.on("update", check);
    return () => {
      runtime.doc.off("update", check);
    };
  }, [runtime]);

  return available;
}
