import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@MeldSpace/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@MeldSpace/ui/components/sidebar";
import { cn } from "@MeldSpace/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import type { Artifact, ArtifactKind } from "./artifacts";
import { groupArtifacts } from "./artifacts";
import { useCoordinator } from "./coordinator";
import {
  BoardIcon,
  ChevronDownIcon,
  CommentIcon,
  DocumentIcon,
  FileIcon,
  MeldMark,
  PlusIcon,
  SearchIcon,
} from "./icons";
import { initials } from "./identity";
import { useRoom } from "./room-provider";

const KIND_ICONS: Record<ArtifactKind, (props: { className?: string }) => React.ReactNode> = {
  document: DocumentIcon,
  file: FileIcon,
  board: BoardIcon,
  comment: CommentIcon,
};

function PeerStack({ peers }: { peers: { clientId: number; color: string; name: string }[] }) {
  if (peers.length === 0) return null;
  const shown = peers.slice(0, 3);
  const extra = peers.length - shown.length;
  return (
    <span className="flex items-center gap-0.75">
      {shown.map((peer) => (
        <span
          key={peer.clientId}
          title={peer.name}
          className="size-3.75 shrink-0 rounded-full border-solid border-surface [border-width:1.5px]"
          style={{ backgroundColor: peer.color }}
        />
      ))}
      {extra > 0 ? (
        <span className="font-mono text-[10px] text-subtle-foreground">+{extra}</span>
      ) : null}
    </span>
  );
}

export function RoomSidebar({
  artifacts,
  activeId,
  onOpenArtifact,
  onCreateArtifact,
  onOpenPalette,
  onOpenShare,
}: {
  artifacts: Artifact[];
  activeId: string | null;
  onOpenArtifact: (artifact: Artifact) => void;
  onCreateArtifact: () => void;
  onOpenPalette: () => void;
  onOpenShare: () => void;
}) {
  const { roomId, peers, mesh, status, meta, name, shareUrl } = useRoom();
  const coordinator = useCoordinator();
  const navigate = useNavigate();

  const roomName = meta?.name ?? `Room ${roomId.slice(0, 8)}`;
  const self = peers.find((peer) => peer.isSelf);
  const selfName = self?.name ?? name;
  const selfColor = self?.color ?? "var(--id-1)";
  const isSelfCoordinator =
    coordinator !== null && self !== undefined && coordinator.clientId === self.clientId;

  const groups = groupArtifacts(artifacts);

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Room link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border-strong">
      <SidebarHeader className="h-14 shrink-0 justify-center gap-0 border-b border-border px-3 py-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-sm px-1 py-1 text-left outline-none hover:bg-sidebar-accent"
              />
            }
          >
            <span className="flex size-6.5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-2">
              <MeldMark />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-body-sm font-medium text-foreground">{roomName}</span>
              <span className="font-mono text-[9.5px] tracking-[0.08em] text-subtle-foreground">
                {roomId.slice(0, 8).toUpperCase()} · {peers.length} PEER
                {peers.length === 1 ? "" : "S"}
              </span>
            </span>
            <ChevronDownIcon className="shrink-0 text-subtle-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 border border-border-strong bg-surface-2"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
                Room
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={copyRoomLink}>Copy room link</DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenShare}>Share room…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void navigate({ to: "/" })}>
                Leave room
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <div className="shrink-0 px-3 pt-2.5 pb-1">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7.5 w-full items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.25 text-left"
        >
          <SearchIcon className="shrink-0 text-subtle-foreground" />
          <span className="flex-1 text-[12.5px] leading-4 text-subtle-foreground">
            Search or jump to
          </span>
          <span className="rounded-[4px] border border-border-strong px-1.25 py-px font-mono text-[9.5px] text-muted-foreground">
            ⌘K
          </span>
        </button>
      </div>

      <SidebarContent className="gap-0 px-2 pt-1">
        {groups.map((group) => {
          const Icon = KIND_ICONS[group.kind];
          return (
            <SidebarGroup key={group.kind} className="p-0">
              <SidebarGroupLabel className="h-7 px-2 font-mono text-[9.5px] tracking-[0.08em] text-subtle-foreground">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((artifact) => (
                    <SidebarMenuItem key={artifact.id}>
                      <SidebarMenuButton
                        isActive={artifact.id === activeId}
                        tooltip={artifact.title}
                        onClick={() => onOpenArtifact(artifact)}
                        className="h-7.5 gap-2 rounded-sm px-2 text-body-sm"
                      >
                        <Icon className="text-muted-foreground" />
                        <span className="flex-1 truncate">{artifact.title}</span>
                        {artifact.presentColor ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: artifact.presentColor }}
                          />
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {group.items.length === 0 ? (
                    <li className="flex h-7.5 items-center px-2 text-micro text-subtle-foreground">
                      None yet
                    </li>
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        <SidebarGroup className="p-0 pt-1.5">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New document (⌘N)"
                  onClick={onCreateArtifact}
                  className="h-8 gap-2 rounded-sm px-2 text-body-sm text-subtle-foreground hover:text-foreground"
                >
                  <PlusIcon />
                  <span className="flex-1">New document</span>
                  <span className="font-mono text-[9.5px] text-subtle-foreground">⌘N</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2.75 border-t border-border px-3 py-3.25">
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 shrink-0 rounded-full", status.dotClassName)} />
          <span className="flex-1 font-mono text-[10px] tracking-eyebrow text-muted-foreground">
            {status.label}
          </span>
          <span
            title={`${mesh.webrtc} over WebRTC · ${mesh.bc} over BroadcastChannel`}
            className="flex items-center"
          >
            <PeerStack peers={peers} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-5.5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-semibold text-[#0B0C0D]",
              isSelfCoordinator && "border-solid border-signal [border-width:1.5px]",
            )}
            style={{ backgroundColor: selfColor }}
          >
            {initials(selfName)}
          </span>
          <span className="flex-1 truncate text-[12.5px] leading-4 text-foreground">
            {selfName}
          </span>
          {isSelfCoordinator ? (
            <span className="font-mono text-[9.5px] tracking-eyebrow text-signal">
              COORD · R{coordinator.epoch}
            </span>
          ) : null}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Kept next to the sidebar so the main pane can render a matching trigger. */
export function RoomSidebarTrigger({ className }: { className?: string }) {
  return <SidebarTrigger className={cn("text-subtle-foreground", className)} />;
}
