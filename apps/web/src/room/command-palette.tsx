import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@MeldSpace/ui/components/command";
import { useEffect, useState } from "react";

import {
  CheckIcon,
  DetailsIcon,
  DocumentIcon,
  FileIcon,
  HistoryIcon,
  PanelLeftIcon,
  PeopleIcon,
  PlusIcon,
  ShareIcon,
} from "./icons";
import { useRoom } from "./room-provider";

export type RailPanel = "details" | "preview" | "people" | "history";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-5.5 min-w-6 items-center justify-center rounded-[5px] border border-border-strong px-1.5 font-mono text-eyebrow text-subtle-foreground">
      {children}
    </span>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenDocument,
  onNewDocument,
  onOpenPanel,
  onShare,
  onToggleSidebar,
  onCreateCheckpoint,
  canCheckpoint,
  onRecompile,
  canRecompile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDocument: () => void;
  onNewDocument: () => void;
  onOpenPanel: (panel: RailPanel) => void;
  onShare: () => void;
  onToggleSidebar: () => void;
  onCreateCheckpoint: () => void;
  /** True once the room runtime (and therefore the history store) is ready. */
  canCheckpoint: boolean;
  onRecompile: () => void;
  /** True once the room runtime (and therefore the compile engine) is ready. */
  canRecompile: boolean;
}) {
  const { peers } = useRoom();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search or run a command"
      className="max-w-[40rem] gap-0 rounded-[14px] border border-border-strong bg-surface-2 p-0 shadow-[0_30px_80px_#00000099]"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search or run a command…" />
      <CommandList className="max-h-[26rem]">
        <CommandEmpty>Nothing matches “{query}”.</CommandEmpty>

        <CommandGroup heading="Go to">
          <CommandItem value="editor document" onSelect={() => run(onOpenDocument)}>
            <DocumentIcon />
            Editor
            <CommandShortcut>
              <Key>⌘1</Key>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="history checkpoints"
            onSelect={() => run(() => onOpenPanel("history"))}
          >
            <HistoryIcon />
            History
            <CommandShortcut>
              <Key>⌘3</Key>
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="people members" onSelect={() => run(() => onOpenPanel("people"))}>
            <PeopleIcon />
            People
            <CommandShortcut>
              <Key>⌘4</Key>
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="details" onSelect={() => run(() => onOpenPanel("details"))}>
            <DetailsIcon />
            Details
            <CommandShortcut>
              <Key>⌘2</Key>
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="new document" onSelect={() => run(onNewDocument)}>
            <PlusIcon />
            New document
            <CommandShortcut>
              <Key>⌘N</Key>
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="share room invite" onSelect={() => run(onShare)}>
            <ShareIcon />
            Share room
            <CommandShortcut>
              <Key>⌘S</Key>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="create checkpoint"
            disabled={!canCheckpoint}
            onSelect={() => run(onCreateCheckpoint)}
          >
            <CheckIcon />
            Create checkpoint
            {canCheckpoint ? null : <CommandShortcut>arrives #6</CommandShortcut>}
          </CommandItem>
          <CommandItem
            value="recompile pdf latex preview"
            disabled={!canRecompile}
            onSelect={() => run(onRecompile)}
          >
            <FileIcon />
            Recompile PDF
          </CommandItem>
          <CommandItem value="toggle sidebar" onSelect={() => run(onToggleSidebar)}>
            <PanelLeftIcon />
            Toggle sidebar
            <CommandShortcut>
              <Key>⌘B</Key>
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {peers.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {peers.map((peer) => (
                <CommandItem
                  key={peer.clientId}
                  value={`${peer.name} ${peer.isSelf ? "you" : ""}`}
                  onSelect={() => run(() => onOpenPanel("people"))}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: peer.color }} />
                  {peer.isSelf ? `${peer.name} (you)` : peer.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
      <div className="flex h-9.5 items-center gap-4 border-t border-border px-4.5">
        <span className="font-mono text-[10px] tracking-eyebrow text-subtle-foreground">
          ↑↓ NAVIGATE · ↵ OPEN · ESC CLOSE
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-eyebrow text-muted-foreground">
          MELDSPACE
        </span>
      </div>
    </CommandDialog>
  );
}
