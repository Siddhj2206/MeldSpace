import type * as Y from "yjs";

/**
 * Frozen data shapes for the room's LaTeX project (#24).
 *
 * A room is a small multi-file project inside one `Y.Doc` — the same doc the
 * `y-webrtc` provider and `y-indexeddb` persistence already carry, so the
 * transport and durability wiring is unchanged. There are no Yjs
 * subdocuments and no per-file databases: both were rejected in #24 because
 * they break cross-file undo (subdocs need one provider each; per-file stores
 * cannot share an `UndoManager`).
 */

/** `Y.Map<Y.Text>` keyed by relative path. The only place file bytes live. */
export const TEXTS_MAP_NAME = "texts";

/** `Y.Map<TreeEntry>` keyed by path. Minimal ordering metadata; folders are R3. */
export const TREE_MAP_NAME = "tree";

/** `Y.Map<AssetRef>` keyed by path. Metadata only — bytes live in the #8 store. */
export const ASSETS_MAP_NAME = "assets";

/** `Y.Map` holding `schemaVersion` and `mainFile`. */
export const META_MAP_NAME = "meta";

/** Bumped when the project shape changes; guards the legacy migration. */
export const PROJECT_SCHEMA_VERSION = 1;

/** The pre-project room text, migrated into `MAIN_FILE` on first open. */
export const LEGACY_TEXT_TYPE_NAME = "content";

/** Entry point the compile worker (#27) resolves `\input`s from. */
export const MAIN_FILE = "main.tex";

export type FileKind = "tex" | "bib" | "asset" | "text";

export type TreeEntry = {
  path: string;
  order: number;
};

/** A figure reference. `hash` addresses bytes in the deferred #8 blob store. */
export type AssetRef = {
  hash: string;
  mime: string;
  size: number;
};

export type ProjectFile = {
  path: string;
  text: Y.Text;
  order: number;
  kind: FileKind;
};

export type ProjectMaps = {
  texts: Y.Map<Y.Text>;
  tree: Y.Map<TreeEntry>;
  assets: Y.Map<AssetRef>;
  meta: Y.Map<unknown>;
};
