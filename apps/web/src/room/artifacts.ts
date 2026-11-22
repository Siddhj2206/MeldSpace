import type * as Y from "yjs";

import type { FileKind, ProjectFile } from "./project/types";

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
  /** Project-relative path for file artifacts (#25). */
  path?: string;
  fileKind?: FileKind;
};

export const ARTIFACT_GROUPS: readonly { kind: ArtifactKind; label: string }[] = [
  { kind: "file", label: "FILES" },
  { kind: "board", label: "BOARDS" },
  { kind: "comment", label: "COMMENTS" },
] as const;

const KIND_SUBTITLE: Record<FileKind, string> = {
  tex: "LaTeX",
  bib: "BibTeX",
  asset: "Figure",
  text: "Text",
};

/**
 * Project the room's files into shell artifacts (#25). The file list *is* the
 * artifact list now — the paper pivot replaced loose documents with one
 * LaTeX project.
 */
export function projectFileArtifacts(files: readonly ProjectFile[]): Artifact[] {
  return files.map((file) => ({
    id: `file:${file.path}`,
    kind: "file",
    surface: "document",
    title: file.path,
    subtitle: KIND_SUBTITLE[file.kind],
    sourceKey: file.path,
    path: file.path,
    fileKind: file.kind,
    text: file.text,
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
