import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type * as Y from "yjs";

import { listProjectFiles, projectMaps } from "./project/project";

/**
 * Project-aware completion for the LaTeX surface (#25).
 *
 * `codemirror-lang-latex` completes command and environment names; it knows
 * nothing about *this* project. This source indexes the shared `Y.Doc` — every
 * `\label`, every bib entry key, every file path — and completes the arguments
 * of `\ref`, `\cite`, `\input` and friends from it. The index is rebuilt per
 * completion (the project is small), which keeps it correct under concurrent
 * edits with zero cache invalidation.
 */

const TRIGGER =
  /\\(eqref|pageref|autoref|nameref|[cCvV]ref|ref|cite\w*|input|include|includegraphics)\{[^{}]*$/;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|pdf|eps)$/i;

type CompletionKind = "label" | "cite" | "file" | "graphic";

function commandKind(command: string): CompletionKind | null {
  const name = command.toLowerCase();
  if (name === "input" || name === "include") return "file";
  if (name === "includegraphics") return "graphic";
  if (name.startsWith("cite")) return "cite";
  return "label"; // ref, eqref, pageref, autoref, nameref, cref, vref, …
}

type ProjectIndex = {
  labels: string[];
  citeKeys: string[];
  files: string[];
  graphics: string[];
};

function buildIndex(doc: Y.Doc): ProjectIndex {
  const labels = new Set<string>();
  const citeKeys = new Set<string>();
  const files = new Set<string>();
  const graphics = new Set<string>();

  for (const file of listProjectFiles(doc)) {
    if (IMAGE_EXTENSIONS.test(file.path)) {
      graphics.add(file.path);
      continue; // binary or figure file — not scanned for \label
    }
    if (file.kind === "tex") files.add(file.path);
    const text = file.text.toString();
    if (file.kind === "tex") {
      for (const match of text.matchAll(/\\label\{([^{}]+)\}/g)) labels.add(match[1]!);
    } else if (file.kind === "bib") {
      for (const match of text.matchAll(/@\w+\s*\{\s*([^,\s}]+)/g)) citeKeys.add(match[1]!);
    }
  }
  // Assets live in their own map (#24); their paths are figure candidates.
  projectMaps(doc).assets.forEach((_, path) => {
    if (IMAGE_EXTENSIONS.test(path)) graphics.add(path);
  });

  const sorted = (set: Set<string>) => Array.from(set).sort((a, b) => (a < b ? -1 : 1));
  return {
    labels: sorted(labels),
    citeKeys: sorted(citeKeys),
    files: sorted(files),
    graphics: sorted(graphics),
  };
}

const TYPE_BY_KIND: Record<CompletionKind, string> = {
  label: "constant",
  cite: "keyword",
  file: "file",
  graphic: "file",
};

const DETAIL_BY_KIND: Record<CompletionKind, string> = {
  label: "label",
  cite: "reference",
  file: "file",
  graphic: "figure",
};

/**
 * A `CompletionSource` that reads the project doc lazily through `getDoc`, so
 * the same extension survives runtime setup. `\include{...}` and
 * `\input{...}` get paths without the `.tex` extension, matching LaTeX
 * convention; `\includegraphics` keeps the full asset path.
 */
export function projectCompletionSource(getDoc: () => Y.Doc | null) {
  return (context: CompletionContext): CompletionResult | null => {
    const trigger = context.matchBefore(TRIGGER);
    if (!trigger || (trigger.from === trigger.to && !context.explicit)) return null;

    const command = /\\(\w+)\{/.exec(trigger.text)?.[1];
    if (!command) return null;
    const kind = commandKind(command);
    if (!kind) return null;

    const doc = getDoc();
    if (!doc) return null;
    const index = buildIndex(doc);
    const values =
      kind === "label"
        ? index.labels
        : kind === "cite"
          ? index.citeKeys
          : kind === "file"
            ? index.files.map((path) => path.replace(/\.tex$/i, ""))
            : index.graphics;
    if (values.length === 0) return null;

    // Complete after the last `{` or `,` so `\cite{a,b|}` offers keys for b.
    const brace = trigger.text.indexOf("{");
    const tail = trigger.text.slice(brace + 1);
    const separator = Math.max(tail.lastIndexOf(","), -1);
    const from = trigger.from + brace + 1 + separator + 1;

    const options: Completion[] = values.map((value) => ({
      label: value,
      type: TYPE_BY_KIND[kind],
      detail: DETAIL_BY_KIND[kind],
    }));
    return { from, options, validFor: /^[\w:.-]*$/ };
  };
}
