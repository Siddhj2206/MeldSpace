import * as Y from "yjs";

import { DOCUMENTS_KEY, TITLES_KEY } from "../room-content";
import type { LatexFileInput } from "./types";

/**
 * Flattens the room's shared sources into one engine input + the rest (#27).
 *
 * Reads two shapes so this ticket is not gated on #24 landing first:
 *
 * - **#24 shape (preferred on collision):** a `texts` `Y.Map<Y.Text>` keyed by
 *   file path (`main.tex`, `section/intro.tex`, `refs.bib`, …).
 * - **Current shape:** the `documents` `Y.Map<Y.Text>` plus the
 *   `document-titles` map, where the title doubles as the path.
 *
 * Only compilable extensions are materialised; the markdown notes the shell
 * edits today are skipped, never forced into `main.tex`. Returns null when the
 * room holds no `.tex` file, so the preview can offer the starter template
 * instead of failing inside the engine.
 */
export type MaterializedProject = {
  mainTexPath: string;
  input: string;
  additionalFiles: LatexFileInput[];
};

/** Basename that wins the main-file election. */
export const MAIN_TEX_BASENAME = "main.tex";

/** Forward-compatible with the #24 `Y.Map("texts")` project model. */
export const PROJECT_TEXTS_KEY = "texts";

const COMPILABLE_EXTENSIONS = new Set([
  "tex",
  "bib",
  "sty",
  "cls",
  "bst",
  "def",
  "clo",
  "cfg",
  "ldf",
  "fd",
]);

function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function basenameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Normalise a map key/title into a clean relative VFS path. */
function cleanPath(raw: string): string {
  const normalised = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalised
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..");
  return parts.join("/");
}

function collectTextFiles(map: Y.Map<Y.Text>, into: Map<string, string>): void {
  map.forEach((text, key) => {
    if (!(text instanceof Y.Text)) return;
    const path = cleanPath(key);
    if (path === "" || into.has(path)) return;
    if (!COMPILABLE_EXTENSIONS.has(extensionOf(path))) return;
    into.set(path, text.toString());
  });
}

export function materializeLatexProject(doc: Y.Doc): MaterializedProject | null {
  const byPath = new Map<string, string>();
  // #24 shape first so it wins on collision after migration.
  collectTextFiles(doc.getMap<Y.Text>(PROJECT_TEXTS_KEY), byPath);

  // Current shape: titles double as paths.
  const documents = doc.getMap<Y.Text>(DOCUMENTS_KEY);
  const titles = doc.getMap<string>(TITLES_KEY);
  documents.forEach((text, id) => {
    if (!(text instanceof Y.Text)) return;
    const title = titles.get(id) ?? "";
    const path = cleanPath(title);
    if (path === "" || byPath.has(path)) return;
    if (!COMPILABLE_EXTENSIONS.has(extensionOf(path))) return;
    byPath.set(path, text.toString());
  });

  const texPaths = [...byPath.keys()].filter((path) => extensionOf(path) === "tex").sort();
  const first = texPaths[0];
  if (!first) return null;
  // Exact `main.tex` first, then any nested same-basename file, then the
  // first `.tex` alphabetically. R2 rooms are flat, so this is usually one step.
  const mainTexPath = byPath.has(MAIN_TEX_BASENAME)
    ? MAIN_TEX_BASENAME
    : (texPaths.find((path) => basenameOf(path) === MAIN_TEX_BASENAME) ?? first);

  const input = byPath.get(mainTexPath) ?? "";
  const additionalFiles: LatexFileInput[] = [];
  for (const [path, content] of byPath) {
    if (path !== mainTexPath) additionalFiles.push({ path, content });
  }
  additionalFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { mainTexPath, input, additionalFiles };
}
