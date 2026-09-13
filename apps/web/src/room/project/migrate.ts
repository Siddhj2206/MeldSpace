import * as Y from "yjs";

import { createProjectFile, hasProjectFile, projectMaps, projectSchemaVersion } from "./project";
import { SAMPLE_PAPER } from "./sample-paper";
import { LEGACY_TEXT_TYPE_NAME, MAIN_FILE, PROJECT_SCHEMA_VERSION } from "./types";

/**
 * Schema migration and demo seeding for the paper project (#24).
 *
 * Kept apart from the CRUD in `project.ts`: migration touches the whole doc and
 * runs once, while `project.ts` is called on every edit.
 */

/**
 * Seed the demo paper. Idempotent per path, so concurrent peers converge on one
 * copy of each file. Exported for the room-creation flow (#25/#17) to call; it
 * is deliberately *not* run automatically on open, because a device joining an
 * existing room would otherwise resurrect the sample before it hears from peers.
 */
export function seedSampleProject(doc: Y.Doc): void {
  doc.transact(() => {
    for (const [path, content] of Object.entries(SAMPLE_PAPER)) {
      if (!hasProjectFile(doc, path)) createProjectFile(doc, path, content);
    }
    const { meta } = projectMaps(doc);
    if (typeof meta.get("mainFile") !== "string") meta.set("mainFile", MAIN_FILE);
    meta.set("schemaVersion", PROJECT_SCHEMA_VERSION);
  });
}

/**
 * Bring a room up to the project schema, once, guarded by `schemaVersion`.
 *
 * Old rooms still open: a room whose only content is the legacy
 * `Y.Text("content")` gets that text moved into `main.tex` inside the same
 * guarded transaction. The legacy text is left in place (never destroyed) so
 * the pre-#25 shell keeps rendering it and a rollback can still read it.
 *
 * Call this after `y-indexeddb` reports `synced`; running before the store has
 * loaded would see an empty legacy text and migrate nothing.
 */
export function ensureProject(doc: Y.Doc): void {
  const current = projectSchemaVersion(doc);
  // A peer on a newer schema has already migrated; never downgrade it.
  if (current !== null && current >= PROJECT_SCHEMA_VERSION) return;

  const { meta } = projectMaps(doc);
  doc.transact(() => {
    const version = projectSchemaVersion(doc);
    if (version !== null && version >= PROJECT_SCHEMA_VERSION) return;
    const legacy = doc.getText(LEGACY_TEXT_TYPE_NAME).toString();
    if (legacy.trim().length > 0 && !hasProjectFile(doc, MAIN_FILE)) {
      createProjectFile(doc, MAIN_FILE, legacy);
    }
    if (typeof meta.get("mainFile") !== "string") meta.set("mainFile", MAIN_FILE);
    meta.set("schemaVersion", PROJECT_SCHEMA_VERSION);
  });
}
