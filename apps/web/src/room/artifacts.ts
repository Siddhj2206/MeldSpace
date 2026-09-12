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
  /** Secondary line, e.g. the role/state of a contributor. */
  subtitle?: string;
  /** Identity hue of an editor present on this artifact, if any. */
  presentColor?: string;
  /** Identifier the surface reads (e.g. the Y.Text key). */
  sourceKey: string;
};

export const ARTIFACT_GROUPS: readonly { kind: ArtifactKind; label: string }[] = [
  { kind: "document", label: "DOCUMENTS" },
  { kind: "file", label: "FILES" },
  { kind: "board", label: "BOARDS" },
  { kind: "comment", label: "COMMENTS" },
] as const;

/** The single text document from #2, bound to the `content` Y.Text. */
export const DOCUMENT_ARTIFACT: Artifact = {
  id: "document:content",
  kind: "document",
  surface: "document",
  title: "notes.md",
  subtitle: "Markdown",
  sourceKey: "content",
};

export function groupArtifacts(
  artifacts: readonly Artifact[],
): { kind: ArtifactKind; label: string; items: Artifact[] }[] {
  return ARTIFACT_GROUPS.map((group) => ({
    ...group,
    items: artifacts.filter((artifact) => artifact.kind === group.kind),
  }));
}
