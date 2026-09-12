import { Button } from "@MeldSpace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@MeldSpace/ui/components/dialog";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { encode } from "uqr";

import { initials } from "./identity";
import { useRoom } from "./room-provider";
import { useRoomRoster } from "./roster";

function QrCode({ value, size = 112 }: { value: string; size?: number }) {
  const modules = useMemo(() => encode(value, { border: 1, ecc: "M" }).data, [value]);
  const count = modules.length;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-[10px] border border-border-strong"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} shapeRendering="crispEdges">
        <rect width={count} height={count} fill="#ECEDEA" />
        {modules.flatMap((row, y) =>
          row.map((on, x) =>
            on ? <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill="#0B0C0D" /> : null,
          ),
        )}
      </svg>
    </div>
  );
}

function Avatar({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-[#0B0C0D]",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}

export function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { roomId, shareUrl, meta } = useRoom();
  const [copied, setCopied] = useState(false);
  const roster = useRoomRoster();

  const roomName = meta?.name ?? `Room ${roomId.slice(0, 8)}`;
  const joinCode = meta?.joinCode ?? null;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-w-[35rem] flex-col gap-5 rounded-[14px] border border-border-strong bg-surface-2 p-7 shadow-[0_24px_60px_#0000008c]"
      >
        <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          Share
        </div>
        <DialogTitle className="text-title-1 font-semibold tracking-tight text-foreground">
          Invite to {roomName}
        </DialogTitle>
        <DialogDescription className="text-body text-muted-foreground">
          Anyone with the link joins as a peer. They can edit; their changes merge when they
          reconnect.
        </DialogDescription>

        <div className="flex items-center gap-2">
          <div className="flex h-10.5 min-w-0 flex-1 items-center rounded-md border border-border bg-background px-3">
            <span className="truncate font-mono text-body-sm text-foreground">{shareUrl}</span>
          </div>
          <Button onClick={copyLink} className="h-9.5 shrink-0 px-4 text-[14px]">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="h-px w-full shrink-0 bg-border" />

        <div className="flex items-center gap-4">
          <QrCode value={shareUrl} />
          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
              Or enter a code
            </div>
            {joinCode ? (
              <>
                <div className="font-mono text-[22px] leading-7 font-medium tracking-[0.08em] text-foreground">
                  {joinCode}
                </div>
                <div className="text-micro text-subtle-foreground">
                  Case-insensitive · share it with a peer
                </div>
              </>
            ) : (
              <div className="max-w-56 text-micro text-subtle-foreground">
                This room isn&apos;t registered with the control plane, so it has no join code yet.
                The link still works peer-to-peer.
              </div>
            )}
          </div>
        </div>

        <div className="h-px w-full shrink-0 bg-border" />

        <div className="flex flex-col gap-1">
          <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
            In this room
          </div>
          {roster.length === 0 ? (
            <div className="py-2 text-body-sm text-subtle-foreground">
              No one else yet. Share the link to bring a peer in.
            </div>
          ) : (
            roster.map((entry) => (
              <div key={entry.key} className="flex h-8 items-center gap-2.5">
                <Avatar name={entry.name} color={entry.color} />
                <span className="text-body-sm text-foreground">{entry.name}</span>
                {entry.isSelf ? (
                  <span className="text-micro text-subtle-foreground">you</span>
                ) : null}
                <span className="flex-1" />
                <span
                  className={cn(
                    "flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em]",
                    entry.present ? "text-signal" : "text-subtle-foreground",
                  )}
                >
                  {entry.present ? <span className="size-1.5 rounded-full bg-signal" /> : null}
                  {entry.present ? "PRESENT" : "PEER"}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <Button
            variant="outline"
            className="h-9.5 px-4 text-[14px]"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
          <Button className="h-9.5 px-4 text-[14px]" onClick={copyLink}>
            Copy invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
