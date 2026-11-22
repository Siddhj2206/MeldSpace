import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap } from "@codemirror/commands";
import { codeFolding, foldGutter } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap } from "@codemirror/view";
import { bibtex, bibtexCompletionSource } from "codemirror-lang-bib";
import { latex, latexCompletionSource } from "codemirror-lang-latex";
import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

import type { Artifact } from "./artifacts";
import { initials } from "./identity";
import { projectCompletionSource } from "./latex-completion";
import type { FileKind } from "./project/types";
import { useRoom } from "./room-provider";

const KIND_LABEL: Record<FileKind, string> = {
  tex: "LaTeX",
  bib: "BibTeX",
  asset: "Figure",
  text: "Plain text",
};

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

function languageFor(kind: FileKind, path: string) {
  if (kind === "tex") {
    // Built-in autocomplete is disabled: the override below runs the project
    // index first, then the language's own command/environment source.
    return latex({ enableAutocomplete: false, fileName: path });
  }
  if (kind === "bib") return bibtex({ enableAutocomplete: false });
  return [];
}

/**
 * One CodeMirror per open file, bound to that file's `Y.Text` via `yCollab`.
 * The effect re-runs on `text` identity, so switching files re-binds cleanly
 * and each file keeps its own undo manager — a single shared `UndoManager`
 * over `texts` would undo edits across files the user never touched.
 */
function LatexEditor({ path, kind, text }: { path: string; kind: FileKind; text: Y.Text }) {
  const { runtime } = useRoom();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runtime || !host.current) return;
    const undoManager = new Y.UndoManager(text);
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          highlightActiveLine(),
          codeFolding(),
          foldGutter(),
          keymap.of([...defaultKeymap, ...completionKeymap, ...yUndoManagerKeymap]),
          languageFor(kind, path),
          autocompletion({
            override: [
              projectCompletionSource(() => runtime.doc),
              kind === "bib" ? bibtexCompletionSource : latexCompletionSource(true),
            ],
            activateOnTyping: true,
            icons: true,
          }),
          EditorView.theme({
            "&": {
              backgroundColor: "transparent",
              color: "#d7d9d5",
              fontSize: "13.5px",
              height: "100%",
            },
            ".cm-scroller": {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              lineHeight: "1.65",
            },
            ".cm-content": {
              width: "100%",
              maxWidth: "52rem",
              margin: "0 auto",
              padding: "1.75rem 2.5rem 6rem",
              caretColor: "var(--signal)",
            },
            ".cm-gutters": {
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-subtle-foreground, #6b6f6a)",
            },
            ".cm-activeLine": { backgroundColor: "rgb(255 255 255 / 3%)" },
            "&.cm-focused": { outline: "none" },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              backgroundColor: "rgb(224 162 60 / 18%)",
            },
            ".cm-tooltip": {
              backgroundColor: "var(--color-surface-2, #1a1c1b)",
              border: "1px solid var(--color-border-strong, #2c2f2d)",
              color: "#d7d9d5",
            },
            ".cm-tooltip-autocomplete ul li[aria-selected]": {
              backgroundColor: "rgb(224 162 60 / 16%)",
            },
          }),
          EditorView.lineWrapping,
          yCollab(text, runtime.awareness, { undoManager }),
        ],
      }),
      parent: host.current,
    });

    return () => view.destroy();
  }, [runtime, text, kind, path]);

  return <div ref={host} className="h-full min-h-0 w-full overflow-hidden [&_.cm-editor]:h-full" />;
}

/**
 * The paper's editing surface (#25): one file of the room's LaTeX project in a
 * CodeMirror 6 editor. Highlighting, folding, linting and tooltips come from
 * `codemirror-lang-latex` / `-bib`; `\ref`, `\cite`, `\input` and
 * `\includegraphics` complete from the whole project (see
 * `latex-completion.ts`).
 */
export function LatexSurface({ artifact }: { artifact: Artifact }) {
  if (!artifact.text || !artifact.path) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-subtle-foreground">
        This file is not editable.
      </div>
    );
  }
  const kind = artifact.fileKind ?? "text";
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[52rem] shrink-0 px-10 pt-9 pb-4">
        <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          {artifact.path} · {KIND_LABEL[kind]}
        </div>
        <div className="mt-2">
          <Byline />
        </div>
        <div className="mt-4 h-px w-full bg-border" />
      </div>
      <div className="min-h-0 flex-1">
        <LatexEditor path={artifact.path} kind={kind} text={artifact.text} />
      </div>
    </div>
  );
}
