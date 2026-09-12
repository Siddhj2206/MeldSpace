import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * CodeMirror-native markdown live preview.
 *
 * There is no markdown → HTML step: every decoration is derived from the
 * Lezer syntax tree that `@codemirror/lang-markdown` already produces. Markers
 * (`#`, `**`, backticks, `>` …) are hidden and the content is styled in place,
 * so the text stays editable and the Yjs binding is untouched.
 *
 * Cursor-aware reveal: a marker is only hidden while the selection is *off* its
 * line. Move the caret onto a heading and the `#` comes back, the way a live
 * preview editor is expected to behave. When the editor is unfocused the whole
 * document renders.
 *
 * Scope today: headings, emphasis/strong/strikethrough, inline code, fenced and
 * indented code, blockquotes, horizontal rules, links/images. Tables stay close
 * to source (styling only); a real table widget is future work.
 */
function selectionLines(state: EditorView["state"]): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let line = from; line <= to; line++) lines.add(line);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const active = view.hasFocus ? selectionLines(state) : new Set<number>();
  const ranges: Range<Decoration>[] = [];

  const reveals = (from: number, to: number) => {
    if (active.size === 0) return false;
    const start = state.doc.lineAt(from).number;
    const end = state.doc.lineAt(to).number;
    for (let line = start; line <= end; line++) {
      if (active.has(line)) return true;
    }
    return false;
  };

  const lineClass = (lineNumber: number, className: string) => {
    ranges.push(Decoration.line({ class: className }).range(state.doc.line(lineNumber).from));
  };

  const lineRange = (from: number, to: number, className: string) => {
    const start = state.doc.lineAt(from).number;
    const end = state.doc.lineAt(to).number;
    for (let line = start; line <= end; line++) lineClass(line, className);
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      const { name, from, to } = node;

      switch (name) {
        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6": {
          lineClass(state.doc.lineAt(from).number, `cm-md-h${name.slice(-1)}`);
          break;
        }
        case "SetextHeading1":
        case "SetextHeading2": {
          lineClass(state.doc.lineAt(from).number, `cm-md-h${name.slice(-1)}`);
          break;
        }
        case "HeaderMark":
        case "EmphasisMark":
        case "StrikethroughMark":
        case "CodeMark":
        case "CodeInfo":
        case "QuoteMark": {
          if (!reveals(from, to)) ranges.push(Decoration.replace({}).range(from, to));
          break;
        }
        case "StrongEmphasis": {
          ranges.push(Decoration.mark({ class: "cm-md-strong" }).range(from, to));
          break;
        }
        case "Emphasis": {
          ranges.push(Decoration.mark({ class: "cm-md-em" }).range(from, to));
          break;
        }
        case "Strikethrough": {
          ranges.push(Decoration.mark({ class: "cm-md-strike" }).range(from, to));
          break;
        }
        case "InlineCode": {
          ranges.push(Decoration.mark({ class: "cm-md-inline-code" }).range(from, to));
          break;
        }
        case "FencedCode":
        case "CodeBlock": {
          lineRange(from, to, "cm-md-codeblock");
          break;
        }
        case "Blockquote": {
          lineRange(from, to, "cm-md-blockquote");
          break;
        }
        case "HorizontalRule": {
          ranges.push(Decoration.replace({}).range(from, to));
          lineClass(state.doc.lineAt(from).number, "cm-md-hr");
          break;
        }
        case "Link": {
          ranges.push(Decoration.mark({ class: "cm-md-link" }).range(from, to));
          break;
        }
        case "Autolink": {
          ranges.push(Decoration.mark({ class: "cm-md-link" }).range(from, to));
          break;
        }
        case "Image": {
          ranges.push(Decoration.mark({ class: "cm-md-image" }).range(from, to));
          break;
        }
        case "LinkMark":
        case "URL": {
          if (!reveals(from, to)) ranges.push(Decoration.replace({}).range(from, to));
          break;
        }
        case "ListMark": {
          ranges.push(Decoration.mark({ class: "cm-md-list-mark" }).range(from, to));
          break;
        }
        case "Table": {
          lineRange(from, to, "cm-md-table");
          break;
        }
        default:
          break;
      }
    },
  });

  return Decoration.set(ranges, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
