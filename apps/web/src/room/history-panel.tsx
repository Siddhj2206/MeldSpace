import { cn } from "@MeldSpace/ui/lib/utils";
import { useMemo, useState } from "react";

import type { CheckpointMeta } from "@/lib/history-store";

import { identityColor } from "./identity";
import { useRoom } from "./room-provider";

/**
 * The room's memory (#7): the checkpoint log rendered in the rail.
 *
 * Data comes straight from `RoomContext` — `checkpoints` is the live
 * `HistoryStore` list (#6), which replicates with the room doc, so a peer's
 * history includes checkpoints made on devices that are now offline. "While
 * you were away" is the slice of the log this device hasn't seen yet; the
 * seen-marker is persisted per room in `useAwayMarker` (in `use-away.ts`).
 */

type Filter = "all" | "mine" | "away";

function formatTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(createdAt: number): string {
  const day = new Date(createdAt);
  const today = new Date();
  return day.toDateString() === today.toDateString()
    ? "Today"
    : day.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** One line of signal for a checkpoint row: its label, else a preview line. */
function summary(checkpoint: CheckpointMeta): string {
  if (checkpoint.label) return checkpoint.label;
  const first = checkpoint.textPreview.split("\n").find((line) => line.trim().length > 0);
  return first ? first.trim().slice(0, 80) : "Checkpoint";
}

function CheckpointRow({
  checkpoint,
  onInspect,
}: {
  checkpoint: CheckpointMeta;
  onInspect: (checkpoint: CheckpointMeta) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-2.5 py-2.75 hover:bg-surface-2">
      <div className="flex w-9 shrink-0 flex-col gap-0.5 pt-0.5">
        <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground">
          {formatTime(checkpoint.createdAt)}
        </span>
      </div>
      <div className="flex min-w-0 grow basis-[0%] flex-col gap-1.25 pl-1">
        <div className="flex items-center gap-2">
          <span
            className="size-1.75 shrink-0 rounded-full"
            style={{ backgroundColor: identityColor(checkpoint.authorName) }}
          />
          <span className="truncate text-body-sm text-foreground">{checkpoint.authorName}</span>
        </div>
        <div className="line-clamp-2 text-body-sm text-muted-foreground">{summary(checkpoint)}</div>
      </div>
      <button
        type="button"
        onClick={() => onInspect(checkpoint)}
        className="flex h-8.5 shrink-0 items-center justify-center rounded-md border border-border-strong px-3.5 text-body-sm text-foreground hover:border-signal hover:text-signal"
      >
        Inspect
      </button>
    </div>
  );
}

export function HistoryPanel({ onInspect }: { onInspect: (checkpoint: CheckpointMeta) => void }) {
  const { checkpoints, name, awayIds } = useRoom();
  const [filter, setFilter] = useState<Filter>("all");

  // Newest first for the timeline; the log itself is oldest first.
  const ordered = useMemo(() => [...checkpoints].reverse(), [checkpoints]);
  const awaySet = useMemo(() => new Set(awayIds), [awayIds]);
  const away = useMemo(
    () => ordered.filter((checkpoint) => awaySet.has(checkpoint.id)),
    [ordered, awaySet],
  );

  const visible = useMemo(() => {
    if (filter === "mine") return ordered.filter((c) => c.authorName === name);
    if (filter === "away") return away;
    return ordered;
  }, [filter, ordered, away, name]);

  const awayInView = filter === "all" ? away : [];
  const earlier = filter === "all" ? visible.filter((c) => !awaySet.has(c.id)) : visible;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mine", label: "Mine" },
    { id: "away", label: "While away" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-1.5">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={cn(
              "flex h-7 items-center rounded-full border border-solid px-2.75 text-micro",
              filter === entry.id
                ? "border-border-strong bg-surface-2 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <div className="text-body-sm text-subtle-foreground">
            No checkpoints yet. Use the Checkpoint button in the header, or let the room go quiet —
            a checkpoint is taken after a minute of stillness.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 pb-2">
            {awayInView.length > 0 ? (
              <>
                <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                  <span className="size-1.5 shrink-0 rounded-full bg-signal" />
                  <span className="font-mono text-eyebrow tracking-eyebrow text-signal">
                    WHILE YOU WERE AWAY · {awayInView.length}
                  </span>
                </div>
                {awayInView.map((checkpoint) => (
                  <CheckpointRow
                    key={checkpoint.id}
                    checkpoint={checkpoint}
                    onInspect={onInspect}
                  />
                ))}
              </>
            ) : null}

            {filter === "all" && awayInView.length > 0 && earlier.length > 0 ? (
              <div className="px-2.5 pt-3.5 pb-1 font-mono text-eyebrow tracking-eyebrow text-subtle-foreground">
                EARLIER
              </div>
            ) : null}

            {earlier.map((checkpoint) => (
              <CheckpointRow key={checkpoint.id} checkpoint={checkpoint} onInspect={onInspect} />
            ))}

            {visible.length === 0 ? (
              <div className="px-2.5 text-body-sm text-subtle-foreground">
                Nothing here under this filter.
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <span className="size-1.75 shrink-0 rounded-full bg-success" />
        <span className="font-mono text-[10px] tracking-eyebrow text-muted-foreground">
          {checkpoints.length} CHECKPOINT{checkpoints.length === 1 ? "" : "S"} ON THIS DEVICE
          {checkpoints.length > 0
            ? ` · SINCE ${formatDay(checkpoints[0]!.createdAt).toUpperCase()}`
            : ""}
        </span>
      </div>
    </div>
  );
}
