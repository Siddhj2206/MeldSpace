import { Button } from "@MeldSpace/ui/components/button";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as Y from "yjs";
import { ExcalidrawBinding, yjsToExcalidraw } from "y-excalidraw";

import type { Artifact } from "./artifacts";
import { setProjectAsset } from "./project/project";
import { useRoom } from "./room-provider";

// Excalidraw is client-only and heavy (~1 MB): it lazy-loads with the surface
// and its fonts/locales are self-hosted from public/ so the board works
// offline (see public/dist/excalidraw-assets).
if (typeof window !== "undefined") {
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH =
    window.location.origin;
}

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw })),
);

/** Yjs structures the binding syncs, inside the room's own Y.Doc. */
const BOARD_ELEMENTS_KEY = "board-elements";
const BOARD_ASSETS_KEY = "board-assets";

/**
 * The paper's diagram surface (#11): an Excalidraw board bound to the room
 * doc by `y-excalidraw` — elements in a `Y.Array`, embedded files in a
 * `Y.Map`, cursors/selection on the shared awareness. This is a figure
 * *tool*, not a general whiteboard: the payoff is "Insert as figure", which
 * exports the scene to PNG, drops it in the content-addressed blob store
 * (#8) and registers it in the assets map so `\includegraphics` completes it.
 */
export function BoardSurface({ artifact }: { artifact: Artifact }) {
  const { runtime } = useRoom();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [binding, setBinding] = useState<ExcalidrawBinding | null>(null);
  const [exporting, setExporting] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runtime || !api || !domRef.current) return;
    const yElements = runtime.doc.getArray<Y.Map<any>>(BOARD_ELEMENTS_KEY);
    const yAssets = runtime.doc.getMap<any>(BOARD_ASSETS_KEY);
    const next = new ExcalidrawBinding(yElements, yAssets, api, runtime.awareness, {
      excalidrawDom: domRef.current,
      undoManager: new Y.UndoManager(yElements),
    });
    setBinding(next);
    return () => {
      setBinding(null);
      next.destroy();
    };
  }, [runtime, api]);

  const insertAsFigure = async () => {
    if (!runtime || !api || exporting) return;
    const elements = api.getSceneElements().filter((el) => !el.isDeleted);
    if (elements.length === 0) {
      toast.info("Draw something first");
      return;
    }
    setExporting(true);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements,
        files: api.getFiles(),
        mimeType: "image/png",
        appState: { exportWithDarkMode: false, exportBackground: true },
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await runtime.blobStore.put(bytes, "image/png");
      const path = `figures/board-${new Date().toISOString().slice(0, 10)}-${hash.slice(0, 6)}.png`;
      setProjectAsset(runtime.doc, path, { hash, mime: "image/png", size: bytes.byteLength });
      toast.success(`Figure added — \\includegraphics{${path.replace(/\.png$/, "")}}`);
    } catch {
      toast.error("Couldn't export the board as a figure");
    } finally {
      setExporting(false);
    }
  };

  if (!runtime) return null;
  const yElements = runtime.doc.getArray<Y.Map<any>>(BOARD_ELEMENTS_KEY);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11.5 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          {artifact.title} · Diagram
        </span>
        <span className="flex-1" />
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => void insertAsFigure()}
          className="h-7.5 rounded-sm px-3 text-[12.5px]"
        >
          {exporting ? "Exporting…" : "Insert as figure"}
        </Button>
      </div>
      <div ref={domRef} className="min-h-0 flex-1 [&_.excalidraw]:h-full">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-body-sm text-subtle-foreground">
              Loading the board…
            </div>
          }
        >
          <Excalidraw
            excalidrawAPI={setApi}
            onPointerUpdate={binding?.onPointerUpdate}
            theme="dark"
            initialData={{ elements: yjsToExcalidraw(yElements) }}
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
