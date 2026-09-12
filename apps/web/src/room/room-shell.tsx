import { Button } from "@MeldSpace/ui/components/button";
import { SidebarProvider, useSidebar } from "@MeldSpace/ui/components/sidebar";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";

import type { Artifact } from "./artifacts";
import { DOCUMENT_ARTIFACT } from "./artifacts";
import { CommandPalette, type RailPanel } from "./command-palette";
import {
  BoardIcon,
  CloseIcon,
  CommentIcon,
  DocumentIcon,
  FileIcon,
  PlusIcon,
  ShareIcon,
} from "./icons";
import { useRoom } from "./room-provider";
import { RoomRail } from "./room-rail";
import { RoomSidebar, RoomSidebarTrigger } from "./room-sidebar";
import { ShareDialog } from "./share-dialog";
import { Surface } from "./surfaces";

const KIND_ICON = {
  document: DocumentIcon,
  file: FileIcon,
  board: BoardIcon,
  comment: CommentIcon,
} as const;

function PresenceStack() {
  const { peers } = useRoom();
  const shown = peers.slice(0, 3);
  const extra = peers.length - shown.length;
  return (
    <div className="flex items-center gap-0.75 pr-1">
      {shown.map((peer) => (
        <span
          key={peer.clientId}
          title={peer.isSelf ? `${peer.name} (you)` : peer.name}
          className="flex size-5.75 items-center justify-center rounded-full border-2 border-solid border-background text-[8px] font-semibold text-[#0B0C0D]"
          style={{ backgroundColor: peer.color }}
        >
          {peer.initials}
        </span>
      ))}
      {extra > 0 ? (
        <span className="flex size-5.75 items-center justify-center rounded-full border-2 border-solid border-background bg-surface-2 text-[9px] font-medium text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function RoomShellInner() {
  const { toggleSidebar } = useSidebar();
  const artifacts = useMemo<Artifact[]>(() => [DOCUMENT_ARTIFACT], []);
  const [openIds, setOpenIds] = useState<string[]>([DOCUMENT_ARTIFACT.id]);
  const [activeId, setActiveId] = useState<string | null>(DOCUMENT_ARTIFACT.id);
  const [railPanel, setRailPanel] = useState<RailPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const openArtifacts = useMemo(
    () => artifacts.filter((artifact) => openIds.includes(artifact.id)),
    [artifacts, openIds],
  );
  const activeArtifact =
    openArtifacts.find((artifact) => artifact.id === activeId) ?? openArtifacts[0] ?? null;

  const openArtifact = (artifact: Artifact) => {
    setOpenIds((ids) => (ids.includes(artifact.id) ? ids : [...ids, artifact.id]));
    setActiveId(artifact.id);
    setRailPanel(null);
  };

  const closeArtifact = (id: string) => {
    setOpenIds((ids) => {
      const next = ids.filter((entry) => entry !== id);
      if (id === activeId) {
        const index = ids.indexOf(id);
        const neighbour = next[index] ?? next[index - 1] ?? next[0] ?? null;
        setActiveId(neighbour);
      }
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      switch (event.key.toLowerCase()) {
        case "k":
          event.preventDefault();
          setPaletteOpen((open) => !open);
          break;
        case "s":
          event.preventDefault();
          setShareOpen(true);
          break;
        case "1":
          event.preventDefault();
          setActiveId(DOCUMENT_ARTIFACT.id);
          break;
        case "2":
          event.preventDefault();
          setRailPanel("details");
          break;
        case "3":
          event.preventDefault();
          setRailPanel("history");
          break;
        case "4":
          event.preventDefault();
          setRailPanel("people");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <RoomSidebar
        artifacts={artifacts}
        activeId={activeArtifact?.id ?? null}
        onOpenArtifact={openArtifact}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShare={() => setShareOpen(true)}
      />

      <div className="flex h-svh min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-11.5 shrink-0 items-center gap-0.75 border-b border-border px-2.5">
          <RoomSidebarTrigger className="size-7 rounded-sm" />

          <div className="flex min-w-0 flex-1 items-center gap-0.75">
            {openArtifacts.map((artifact) => {
              const Icon = KIND_ICON[artifact.kind];
              const isActive = artifact.id === activeArtifact?.id;
              return (
                <div
                  key={artifact.id}
                  className={cn(
                    "group flex h-7.75 shrink-0 items-center gap-2 rounded-sm px-2.5",
                    isActive ? "bg-surface-2" : "hover:bg-surface-2/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(artifact.id)}
                    className={cn(
                      "flex items-center gap-2 text-[12.5px] leading-4",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className={isActive ? "text-foreground" : "text-subtle-foreground"} />
                    {artifact.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${artifact.title}`}
                    onClick={() => closeArtifact(artifact.id)}
                    className="text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  >
                    <CloseIcon />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              disabled
              title="New artifacts arrive with #7 · #9 · #11"
              className="flex size-7 shrink-0 items-center justify-center rounded-sm text-subtle-foreground opacity-60"
            >
              <PlusIcon />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <PresenceStack />
            <span className="h-4.5 w-px shrink-0 bg-border-strong" />
            <Button
              onClick={() => setShareOpen(true)}
              className="h-7.5 gap-1.75 rounded-sm px-3 text-[12.5px]"
            >
              <ShareIcon />
              Share
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            {activeArtifact ? (
              <Surface artifact={activeArtifact} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
                  No artifact open
                </span>
                <p className="max-w-xs text-body-sm text-muted-foreground">
                  Pick an artifact from the sidebar, or press ⌘K.
                </p>
              </div>
            )}
          </main>

          {railPanel ? (
            <RoomRail
              panel={railPanel}
              artifact={activeArtifact}
              onPanelChange={setRailPanel}
              onClose={() => setRailPanel(null)}
            />
          ) : null}
        </div>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenSurface={() => setActiveId(DOCUMENT_ARTIFACT.id)}
        onOpenPanel={setRailPanel}
        onShare={() => setShareOpen(true)}
        onToggleSidebar={toggleSidebar}
        hasCheckpoints={false}
      />
    </>
  );
}

export function RoomShell() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <RoomShellInner />
    </SidebarProvider>
  );
}
