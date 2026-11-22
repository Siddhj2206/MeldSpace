import { useEffect, useState } from "react";

import type { Artifact } from "./artifacts";
import { useRoom } from "./room-provider";

/**
 * The paper's figure surface (#9): an image artifact backed by the
 * content-addressed blob store (#8). The uploader renders instantly from the
 * local write; a peer that joins later renders as soon as the bytes merge in
 * over the blob channel — "fetching" is just "not yet converged".
 */
export function ImageSurface({ artifact }: { artifact: Artifact }) {
  const { runtime } = useRoom();
  const hash = artifact.assetRef?.hash ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!runtime || !hash) {
      setUrl(null);
      return;
    }
    const { blobStore } = runtime;
    const read = () => setUrl(blobStore.objectUrl(hash));
    const unobserve = blobStore.observe(read);
    read();
    return unobserve;
  }, [runtime, hash]);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[52rem] shrink-0 px-10 pt-9 pb-4">
        <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          {artifact.path} · Figure
        </div>
        {artifact.assetRef ? (
          <div className="mt-1.5 font-mono text-[10px] tracking-eyebrow text-subtle-foreground">
            {artifact.assetRef.mime} · {Math.round(artifact.assetRef.size / 1024)} KB ·{" "}
            {artifact.assetRef.hash.slice(0, 12)}
          </div>
        ) : null}
        <div className="mt-4 h-px w-full bg-border" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        {url ? (
          <img
            src={url}
            alt={artifact.title}
            className="max-h-full max-w-full rounded-md border border-border object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
              Fetching figure
            </span>
            <p className="max-w-xs text-body-sm text-muted-foreground">
              The bytes live on peers, addressed by content hash. They land here as soon as a peer
              that has them converges.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
