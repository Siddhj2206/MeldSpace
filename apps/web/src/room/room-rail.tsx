import { Button } from "@MeldSpace/ui/components/button";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useState } from "react";

import type { Artifact } from "./artifacts";
import type { RailPanel } from "./command-palette";
import { useCoordinator } from "./coordinator";
import { initials } from "./identity";
import { LatexPreviewPanel } from "./latex/latex-preview";
import { useRoom } from "./room-provider";
import { useRoomRoster } from "./roster";

const PANELS: { id: RailPanel; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "preview", label: "Preview" },
  { id: "people", label: "People" },
  { id: "history", label: "History" },
];

const SURFACE_LABEL: Record<Artifact["kind"], string> = {
  document: "Markdown",
  file: "File",
  board: "Board",
  comment: "Comment",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-micro text-subtle-foreground">{label}</span>
      <span className="truncate text-body-sm text-foreground">{value}</span>
    </div>
  );
}

export function RoomRail({
  panel,
  artifact,
  onPanelChange,
  onClose,
}: {
  panel: RailPanel;
  artifact: Artifact | null;
  onPanelChange: (panel: RailPanel) => void;
  onClose: () => void;
}) {
  const { roomId, meta, status, isOnline, mesh } = useRoom();
  const roster = useRoomRoster();
  const coordinator = useCoordinator();
  const [copied, setCopied] = useState(false);

  const roomName = meta?.name ?? `Room ${roomId.slice(0, 8)}`;

  const copyCode = async () => {
    if (!meta?.joinCode) return;
    try {
      await navigator.clipboard.writeText(meta.joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the code is visible in the panel */
    }
  };

  return (
    <aside className="flex h-full w-[21.25rem] shrink-0 flex-col gap-4 border-l border-border-strong bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-title-3 font-semibold tracking-tight text-foreground">
          {PANELS.find((entry) => entry.id === panel)?.label ?? "Details"}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-subtle-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close panel"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-1">
        {PANELS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onPanelChange(entry.id)}
            className={cn(
              "flex-1 rounded-sm px-2 py-1 text-micro font-medium transition-colors",
              entry.id === panel
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "details" ? (
          <div className="flex flex-col gap-3.5">
            <Row label="Room" value={roomName} />
            <Row label="Artifact" value={artifact?.title ?? "—"} />
            <Row label="Type" value={artifact ? SURFACE_LABEL[artifact.kind] : "—"} />
            <Row label="Source" value={artifact?.sourceKey ?? "—"} />
            <Row
              label="Storage"
              value={
                status.persisted
                  ? status.queued > 0
                    ? `${status.queued} queued`
                    : "Saved locally"
                  : "Loading…"
              }
            />
            <Row
              label="Network"
              value={isOnline ? `${mesh.webrtc} webrtc · ${mesh.bc} bc` : "Offline"}
            />
            <Row
              label="Join code"
              value={
                meta?.joinCode ? (
                  <button
                    type="button"
                    onClick={copyCode}
                    className="font-mono tracking-[0.08em] text-foreground hover:text-signal"
                  >
                    {copied ? "Copied" : meta.joinCode}
                  </button>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Room id" value={<span className="font-mono text-[12px]">{roomId}</span>} />
            <div className="h-px w-full bg-border" />
            <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
              Versions
            </div>
            <div className="text-body-sm text-subtle-foreground">
              No checkpoints on this device yet. History arrives with #7.
            </div>
          </div>
        ) : null}

        {panel === "preview" ? <LatexPreviewPanel /> : null}

        {panel === "people" ? (
          <div className="flex flex-col gap-2">
            {roster.length === 0 ? (
              <div className="text-body-sm text-subtle-foreground">
                No one else yet. Share the room to bring a peer in.
              </div>
            ) : (
              roster.map((entry) => {
                const isCoordinator =
                  coordinator !== null &&
                  entry.clientId !== undefined &&
                  entry.clientId === coordinator.clientId;
                return (
                  <div key={entry.key} className="flex h-8 items-center gap-2.5">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-[#0B0C0D]"
                      style={{ backgroundColor: entry.color }}
                    >
                      {initials(entry.name)}
                    </span>
                    <span className="truncate text-body-sm text-foreground">
                      {entry.name}
                      {entry.isSelf ? (
                        <span className="ml-1.5 text-micro text-subtle-foreground">you</span>
                      ) : null}
                    </span>
                    <span className="flex-1" />
                    {isCoordinator ? (
                      <span className="font-mono text-[10px] tracking-[0.08em] text-signal">
                        COORD · R{coordinator.epoch}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "font-mono text-[10px] tracking-[0.08em]",
                          entry.present ? "text-signal" : "text-subtle-foreground",
                        )}
                      >
                        {entry.present ? "PRESENT" : "PEER"}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {panel === "history" ? (
          <div className="flex flex-col gap-2">
            <div className="text-body-sm text-subtle-foreground">
              Checkpoints are taken when a surface goes quiet. The timeline lands with #7, backed by
              the checkpoint log in #6.
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
