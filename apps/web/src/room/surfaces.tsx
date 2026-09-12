import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

import type { Artifact, SurfaceId } from "./artifacts";
import { useRoom } from "./room-provider";

/**
 * The surface registry. A surface renders one artifact; it reads the shared
 * Y.Doc through `useRoom` and never owns sync. Adding #7/#9/#11 means adding a
 * case here, not touching the provider.
 */
export function Surface({ artifact }: { artifact: Artifact }) {
  switch (artifact.surface) {
    case "document":
      return <DocumentSurface sourceKey={artifact.sourceKey} />;
    default:
      return <SurfacePlaceholder surface={artifact.surface} title={artifact.title} />;
  }
}

/** CodeMirror + y-codemirror binding for a `Y.Text` inside the room doc. */
function DocumentSurface({ sourceKey }: { sourceKey: string }) {
  const { runtime } = useRoom();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runtime || !host.current) return;
    const ytext = runtime.doc.getText(sourceKey);
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...yUndoManagerKeymap]),
          markdown(),
          oneDark,
          // Re-skin CodeMirror for the Quiet Room: instrument-black ground,
          // bone prose, amber caret/selection. The shell owns the chrome.
          EditorView.theme({
            "&": {
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontSize: "15px",
              height: "100%",
            },
            ".cm-scroller": {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              lineHeight: "1.6",
            },
            ".cm-content": {
              maxWidth: "44rem",
              margin: "0 auto",
              padding: "2.5rem 2rem 6rem",
              caretColor: "var(--signal)",
            },
            ".cm-gutters": {
              backgroundColor: "transparent",
              color: "var(--subtle-foreground)",
              border: "none",
            },
            ".cm-activeLine": { backgroundColor: "rgb(255 255 255 / 3%)" },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
            "&.cm-focused": { outline: "none" },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              backgroundColor: "rgb(224 162 60 / 18%)",
            },
          }),
          EditorView.lineWrapping,
          yCollab(ytext, runtime.awareness, { undoManager }),
        ],
      }),
      parent: host.current,
    });

    return () => view.destroy();
  }, [runtime, sourceKey]);

  return (
    <div
      ref={host}
      className={cn(
        "h-full min-h-0 w-full overflow-hidden [&_.cm-editor]:h-full",
        "[&_.cm-editor.cm-focused]:outline-none",
      )}
    />
  );
}

/**
 * Quiet stand-in for surfaces that don't exist yet. Keeps the shell honest:
 * the artifact is in the room, its surface is still being built.
 */
function SurfacePlaceholder({ surface, title }: { surface: SurfaceId; title: string }) {
  const tickets: Record<SurfaceId, string> = {
    document: "#2",
    board: "#11",
    images: "#9",
    comments: "#7",
    history: "#7",
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="font-mono text-[11px] tracking-eyebrow text-subtle-foreground uppercase">
        Surface pending
      </div>
      <div className="text-title-3 font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-body-sm text-muted-foreground">
        This surface lands with {tickets[surface]}. The shell already hosts it; the artifact data
        model is shared.
      </p>
    </div>
  );
}
