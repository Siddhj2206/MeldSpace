import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

import type { Artifact } from "./artifacts";
import { initials } from "./identity";
import { livePreview } from "./live-preview";
import { useRoom } from "./room-provider";

function Byline() {
  const { peers } = useRoom();
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.75">
        {peers.slice(0, 3).map((peer) => (
          <span
            key={peer.clientId}
            title={peer.isSelf ? `${peer.name} (you)` : peer.name}
            className="flex size-5 items-center justify-center rounded-full text-[7.5px] font-semibold text-[#0B0C0D]"
            style={{ backgroundColor: peer.color }}
          >
            {initials(peer.name)}
          </span>
        ))}
      </div>
      <span className="text-[12.5px] leading-4 text-muted-foreground">
        {peers.length} {peers.length === 1 ? "peer" : "peers"} in this room
      </span>
    </div>
  );
}

function LiveEditor({ text }: { text: Y.Text | undefined }) {
  const { runtime } = useRoom();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runtime || !text || !host.current) return;
    const undoManager = new Y.UndoManager(text);
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...yUndoManagerKeymap]),
          markdown(),
          livePreview,
          EditorView.theme({
            "&": {
              backgroundColor: "transparent",
              color: "#d7d9d5",
              fontSize: "15px",
              height: "100%",
            },
            ".cm-scroller": {
              fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
              lineHeight: "1.6",
            },
            ".cm-content": {
              width: "100%",
              maxWidth: "44rem",
              margin: "0 auto",
              padding: "2.25rem 2.5rem 6rem",
              caretColor: "var(--signal)",
            },
            ".cm-activeLine": { backgroundColor: "rgb(255 255 255 / 3%)" },
            "&.cm-focused": { outline: "none" },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              backgroundColor: "rgb(224 162 60 / 18%)",
            },
          }),
          EditorView.lineWrapping,
          yCollab(text, runtime.awareness, { undoManager }),
        ],
      }),
      parent: host.current,
    });

    return () => view.destroy();
  }, [runtime, text]);

  return <div ref={host} className="h-full min-h-0 w-full overflow-hidden [&_.cm-editor]:h-full" />;
}

/**
 * A markdown document rendered in place by CodeMirror's live preview. There is
 * no separate read mode: the source stays editable and the Lezer tree supplies
 * the rendered styling (see `live-preview.ts`).
 */
export function DocumentSurface({ artifact }: { artifact: Artifact }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[44rem] shrink-0 px-10 pt-9 pb-4">
        <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          Document · Markdown
        </div>
        <div className="mt-2">
          <Byline />
        </div>
        <div className="mt-4 h-px w-full bg-border" />
      </div>
      <div className="min-h-0 flex-1">
        <LiveEditor text={artifact.text} />
      </div>
    </div>
  );
}
