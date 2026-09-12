import { Button } from "@MeldSpace/ui/components/button";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useState } from "react";

import { useRoom } from "../room-provider";
import { useLatexCompileContext } from "./latex-compile-context";
import { seedStarterTemplate } from "./starter-template";
import { useLatexSourcesAvailable } from "./use-latex-compile";

function formatBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EngineNote({ engine }: { engine: "idle" | "warming" | "ready" | "unavailable" }) {
  if (engine === "warming") {
    return (
      <p className="text-micro text-subtle-foreground">
        Warming the TeX engine… editing stays available.
      </p>
    );
  }
  if (engine === "unavailable") {
    return (
      <p className="text-micro text-subtle-foreground">
        Engine failed to load — Recompile retries the download. Editing is unaffected.
      </p>
    );
  }
  return null;
}

/**
 * PDF preview for the room's LaTeX sources (#27). The PDF is derived local
 * state: rendered from a blob URL, never written to the CRDT or history. Each
 * peer compiles their own view of the shared sources.
 */
export function LatexPreviewPanel() {
  const { runtime } = useRoom();
  const compile = useLatexCompileContext();
  const hasSources = useLatexSourcesAvailable();
  const [showLog, setShowLog] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const compiling = compile.phase === "compiling";

  const seed = () => {
    if (!runtime || seeding) return;
    setSeeding(true);
    try {
      seedStarterTemplate(runtime.doc);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => void compile.recompile()}
          disabled={!runtime || compiling}
          className="h-7.5 flex-1 rounded-sm px-3 text-[12.5px]"
        >
          {compiling ? "Compiling…" : compile.pdfUrl ? "Recompile" : "Compile PDF"}
        </Button>
        {compile.log !== "" ? (
          <Button
            variant="ghost"
            onClick={() => setShowLog((open) => !open)}
            className="h-7.5 shrink-0 rounded-sm px-2.5 text-[12.5px] text-muted-foreground"
          >
            {showLog ? "Hide log" : "Log"}
          </Button>
        ) : null}
      </div>
      <EngineNote engine={compile.engine} />

      {!hasSources ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
          <div className="text-body-sm font-medium text-foreground">No LaTeX sources yet</div>
          <p className="text-body-sm text-muted-foreground">
            Add a <span className="font-mono">main.tex</span> to the room — it appears in the file
            list like any other document — or start from the template.
          </p>
          <Button
            variant="ghost"
            onClick={seed}
            disabled={!runtime || seeding}
            className="h-7.5 rounded-sm px-2.5 text-[12.5px] text-foreground"
          >
            Add starter main.tex
          </Button>
        </div>
      ) : null}

      {compile.error ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
          <div className="text-body-sm font-medium text-foreground">Compile failed</div>
          <p className="text-body-sm text-muted-foreground">{compile.error}</p>
          <div>
            <Button
              variant="ghost"
              onClick={compile.dismissError}
              className="h-7 rounded-sm px-2 text-[12px] text-muted-foreground"
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {compile.pdfUrl ? (
        <div className="flex flex-col gap-1.5">
          <iframe
            src={compile.pdfUrl}
            title="PDF preview"
            className={cn("h-[26rem] w-full rounded-md border border-border bg-white")}
          />
          <div className="font-mono text-[10px] tracking-[0.08em] text-subtle-foreground">
            {formatBytes(compile.pdfBytes)}
            {compile.durationMs !== null ? ` · ${(compile.durationMs / 1000).toFixed(1)}S` : ""}
            {compile.compiledAt !== null
              ? ` · ${new Date(compile.compiledAt).toLocaleTimeString()}`
              : ""}
            {" · LOCAL, NOT SYNCED"}
          </div>
        </div>
      ) : compile.phase === "idle" && hasSources ? (
        <p className="text-body-sm text-subtle-foreground">
          Sources found. Compile renders your local view of the shared room.
        </p>
      ) : null}

      {showLog && compile.log !== "" ? (
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {compile.log}
        </pre>
      ) : null}
    </div>
  );
}
