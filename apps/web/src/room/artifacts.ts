import type * as Y from "yjs";

import type { RoomDocument } from "./documents";

/**
 * Artifact model for the room shell.
 *
 * An *artifact* is durable content (document, file, board, comment). A
 * *surface* is a way of viewing one — never the data model. The shell only
 * knows how to lay artifacts out; surfaces are registered separately so
 * #7 (history), #9 (images) and #11 (board) can slot in without touching the
 * sync layer.
 */
export type ArtifactKind = "document" | "file" | "board" | "comment";

/** Surfaces the shell can host. Only `document` exists today. */
export type SurfaceId = "document" | "board" | "images" | "comments" | "history";

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  surface: SurfaceId;
  title: string;
  /** Secondary line, e.g. the surface/format. */
  subtitle?: string;
  /** Identity hue of an editor present on this artifact, if any. */
  presentColor?: string;
  /** Identifier the surface reads (e.g. the Y.Text key). */
  sourceKey: string;
  /** The shared text for document artifacts. */
  text?: Y.Text;
};

export const ARTIFACT_GROUPS: readonly { kind: ArtifactKind; label: string }[] = [
  { kind: "document", label: "DOCUMENTS" },
  { kind: "file", label: "FILES" },
  { kind: "board", label: "BOARDS" },
  { kind: "comment", label: "COMMENTS" },
] as const;

/** Project the room's documents into shell artifacts. */
export function documentArtifacts(documents: readonly RoomDocument[]): Artifact[] {
  return documents.map((document) => ({
    id: document.id,
    kind: "document",
    surface: "document",
    title: document.title,
    subtitle: "Markdown",
    sourceKey: document.id,
    text: document.text,
  }));
}

export function groupArtifacts(
  artifacts: readonly Artifact[],
): { kind: ArtifactKind; label: string; items: Artifact[] }[] {
  return ARTIFACT_GROUPS.map((group) => ({
    ...group,
    items: artifacts.filter((artifact) => artifact.kind === group.kind),
  }));
}
