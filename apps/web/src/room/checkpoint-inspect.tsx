import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@MeldSpace/ui/components/dialog";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";

import type { CheckpointMeta } from "@/lib/history-store";

import { snapshotProjectTexts } from "./project/project";
import { useRoom } from "./room-provider";

/**
 * Read-only inspection of a checkpoint (#7). The snapshot is materialised into
 * a *detached* `Y.Doc` (`HistoryStore.inspect`) — the live room is never
 * touched, so inspection is always safe. Destructive rewind stays stretch.
 */
export function CheckpointInspect({
  checkpoint,
  open,
  onOpenChange,
}: {
  checkpoint: CheckpointMeta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { history } = useRoom();
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !checkpoint || !history) {
      setFiles({});
      setSelected(null);
      return;
    }
    const detached = history.inspect(checkpoint.id);
    const snapshot = detached ? snapshotProjectTexts(detached) : {};
    setFiles(snapshot);
    setSelected(Object.keys(snapshot)[0] ?? null);
    return () => detached?.destroy();
  }, [open, checkpoint, history]);

  const paths = useMemo(() => Object.keys(files).sort(), [files]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] max-w-[54rem] flex-col gap-0 overflow-hidden border border-border-strong bg-surface p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-title-3 font-semibold text-foreground">
            Checkpoint ·{" "}
            {checkpoint
              ? new Date(checkpoint.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </DialogTitle>
          <DialogDescription className="text-body-sm text-muted-foreground">
            {checkpoint?.authorName}
            {checkpoint?.label ? ` — ${checkpoint.label}` : ""} · read-only, the room is unchanged
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2">
            {paths.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => setSelected(path)}
                className={cn(
                  "truncate rounded-sm px-2 py-1.5 text-left font-mono text-[11.5px]",
                  path === selected
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {path}
              </button>
            ))}
            {paths.length === 0 ? (
              <span className="px-2 py-1.5 text-micro text-subtle-foreground">
                No files in this snapshot
              </span>
            ) : null}
          </div>
          <pre className="min-w-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-foreground">
            {selected !== null ? files[selected] : ""}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
