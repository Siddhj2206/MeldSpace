import * as Y from "yjs";

import {
  ASSETS_MAP_NAME,
  MAIN_FILE,
  META_MAP_NAME,
  TEXTS_MAP_NAME,
  TREE_MAP_NAME,
  type AssetRef,
  type FileKind,
  type ProjectFile,
  type ProjectMaps,
  type TreeEntry,
} from "./types";

/**
 * The room's paper-project model (#24).
 *
 * `Y.Map("texts")` holds one `Y.Text` per relative path, `Y.Map("tree")` holds
 * ordering metadata, `Y.Map("assets")` holds figure references, and `Y.Map("meta")`
 * holds `schemaVersion` + `mainFile`. Everything lives in the room's existing
 * `Y.Doc`, so `y-webrtc` + `y-indexeddb` need no changes. Schema migration and
 * seeding live in `migrate.ts`.
 *
 * R2 is deliberately flat: paths are strings, there are no folder objects and
 * no drag-and-drop. A tree UI is R3.
 */

const ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "eps"]);

/** Text file kinds the editor and compile worker care about, from the path. */
export function fileKind(path: string): FileKind {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "tex") return "tex";
  if (ext === "bib") return "bib";
  if (ASSET_EXTENSIONS.has(ext)) return "asset";
  return "text";
}

export function projectMaps(doc: Y.Doc): ProjectMaps {
  return {
    texts: doc.getMap<Y.Text>(TEXTS_MAP_NAME),
    tree: doc.getMap<TreeEntry>(TREE_MAP_NAME),
    assets: doc.getMap<AssetRef>(ASSETS_MAP_NAME),
    meta: doc.getMap<unknown>(META_MAP_NAME),
  };
}

/** Yjs deserialises any map value; only a real `Y.Text` is a project file. */
function asProjectText(value: unknown): Y.Text | null {
  return value instanceof Y.Text ? value : null;
}

export function projectSchemaVersion(doc: Y.Doc): number | null {
  const value = projectMaps(doc).meta.get("schemaVersion");
  return typeof value === "number" ? value : null;
}

export function projectMainFile(doc: Y.Doc): string {
  const value = projectMaps(doc).meta.get("mainFile");
  return typeof value === "string" && value !== "" ? value : MAIN_FILE;
}

export function hasProjectFile(doc: Y.Doc, path: string): boolean {
  return asProjectText(projectMaps(doc).texts.get(path)) !== null;
}

export function readProjectText(doc: Y.Doc, path: string): Y.Text | null {
  return asProjectText(projectMaps(doc).texts.get(path));
}

/**
 * Every text file, ordered by the tree's `order` then path for a stable list.
 * Entries without tree metadata (a partial sync) sort last rather than vanish.
 */
export function listProjectFiles(doc: Y.Doc): ProjectFile[] {
  const { texts, tree } = projectMaps(doc);
  const files: ProjectFile[] = [];
  texts.forEach((value, path) => {
    const text = asProjectText(value);
    if (!text) return;
    files.push({
      path,
      text,
      order: tree.get(path)?.order ?? Number.MAX_SAFE_INTEGER,
      kind: fileKind(path),
    });
  });
  files.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.path < b.path ? -1 : 1));
  return files;
}

/** The project as plain strings, for the compile worker (#27) and for snapshots. */
export function snapshotProjectTexts(doc: Y.Doc): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const file of listProjectFiles(doc)) snapshot[file.path] = file.text.toString();
  return snapshot;
}

function nextOrder(doc: Y.Doc): number {
  let max = -1;
  projectMaps(doc).tree.forEach((entry) => {
    if (entry.order > max) max = entry.order;
  });
  return max + 1;
}

/**
 * Create an empty (or seeded) file. Throws when the path exists so callers do
 * not silently overwrite live content; check `hasProjectFile` or use
 * `seedSampleProject` to be idempotent.
 */
export function createProjectFile(doc: Y.Doc, path: string, content = ""): Y.Text {
  if (!path) throw new Error("createProjectFile: path must be non-empty.");
  if (hasProjectFile(doc, path)) {
    throw new Error(`createProjectFile: ${path} already exists.`);
  }
  const text = new Y.Text();
  if (content.length > 0) text.insert(0, content);
  doc.transact(() => {
    const { texts, tree } = projectMaps(doc);
    texts.set(path, text);
    tree.set(path, { path, order: nextOrder(doc) });
  });
  return text;
}

/**
 * Rename in one transaction, preserving file order, content and any asset
 * reference, and repointing `meta.mainFile` when the entry point moves.
 *
 * Yjs cannot re-integrate a `Y.Text` that was deleted from a map, so the bytes
 * are copied into a fresh `Y.Text`. Atomicity is the transaction: observers see
 * either the old path or the new one, never both. A concurrent edit to the old
 * path that has not converged is not carried over — acceptable for the R2 flat
 * rename, and the reason a stable-id file model is the R3 scale path.
 *
 * Returns false when the source is missing or the target already exists.
 */
export function renameProjectFile(doc: Y.Doc, from: string, to: string): boolean {
  if (from === to) return hasProjectFile(doc, from) || projectMaps(doc).assets.has(from);
  if (!from || !to) return false;
  const { texts, tree, assets, meta } = projectMaps(doc);
  if (!texts.has(from) && !assets.has(from)) return false;
  if (texts.has(to) || tree.has(to) || assets.has(to)) return false;

  doc.transact(() => {
    const source = asProjectText(texts.get(from));
    if (source) {
      const value = source.toString();
      const next = new Y.Text();
      if (value.length > 0) next.insert(0, value);
      texts.set(to, next);
    }
    const asset = assets.get(from);
    if (asset) assets.set(to, asset);
    tree.set(to, { path: to, order: tree.get(from)?.order ?? nextOrder(doc) });
    if (meta.get("mainFile") === from) meta.set("mainFile", to);
    texts.delete(from);
    tree.delete(from);
    assets.delete(from);
  });
  return true;
}

/** Remove a file and any asset reference it carried. Returns false when absent. */
export function deleteProjectFile(doc: Y.Doc, path: string): boolean {
  const { texts, tree, assets } = projectMaps(doc);
  if (!texts.has(path) && !assets.has(path)) return false;
  doc.transact(() => {
    texts.delete(path);
    tree.delete(path);
    assets.delete(path);
  });
  return true;
}

export function setProjectAsset(doc: Y.Doc, path: string, ref: AssetRef): void {
  doc.transact(() => {
    projectMaps(doc).assets.set(path, ref);
  });
}

export function getProjectAsset(doc: Y.Doc, path: string): AssetRef | null {
  return projectMaps(doc).assets.get(path) ?? null;
}

/**
 * One undo stack across every file — the whole point of keeping the project in
 * a single `Y.Doc`. `Y.UndoManager` tracks the nested `Y.Text`s of a scoped
 * `Y.Map`, so an edit in `main.tex` and the one before it in `refs.bib` undo
 * together in order.
 */
export function createProjectUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager(projectMaps(doc).texts);
}
