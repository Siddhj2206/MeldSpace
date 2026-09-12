import type { Artifact, SurfaceId } from "./artifacts";
import { DocumentSurface } from "./document-surface";

/**
 * The surface registry. A surface renders one artifact; it reads the shared
 * Y.Doc through `useRoom` and never owns sync. Adding #7/#9/#11 means adding a
 * case here, not touching the provider.
 */
export function Surface({ artifact }: { artifact: Artifact }) {
  switch (artifact.surface) {
    case "document":
      return <DocumentSurface artifact={artifact} />;
    default:
      return <SurfacePlaceholder surface={artifact.surface} title={artifact.title} />;
  }
}

/**
 * Quiet stand-in for surfaces that don't exist yet. Keeps the shell honest:
 * the artifact is in the room, its surface is still being built.
 */
function SurfacePlaceholder({ surface, title }: { surface: SurfaceId; title: string }) {
  const tickets: Record<SurfaceId, string> = {
    document: "#2",
    board: "#11",
    images: "#9",
    comments: "#7",
    history: "#7",
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="font-mono text-[11px] tracking-eyebrow text-subtle-foreground uppercase">
        Surface pending
      </div>
      <div className="text-title-3 font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-body-sm text-muted-foreground">
        This surface lands with {tickets[surface]}. The shell already hosts it; the artifact data
        model is shared.
      </p>
    </div>
  );
}
