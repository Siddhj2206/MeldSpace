import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebrtcProvider } from "y-webrtc";

import { ENV } from "@/env";
import { HistoryStore, type CheckpointMeta } from "@/lib/history-store";
import { useTRPC } from "@/utils/trpc";

import { identityColor, initials } from "./identity";
import { ensureProject } from "./project/migrate";
import { readRoomContent } from "./room-content";
import { deriveRoomStatus, type RoomStatus } from "./room-status";

const GUEST_NAME_KEY = "meldspace.peer-name";
const DEVICE_ID_KEY = "meldspace:device-id";

/**
 * RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts, so a LAN
 * demo served over http needs this fallback — otherwise the device id below
 * degrades to a per-load value and checkpoint authorship becomes unstable.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Stable per-browser author id until #17 binds Better Auth identity to
 * `device.register`. Persisted in localStorage so checkpoints keep the same
 * author across reloads on one device.
 */
function readDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return `ephemeral-${Date.now().toString(36)}`;
  }
}

/** A stable per-browser alias, used when nobody is signed in. */
function readGuestName(): string {
  if (typeof window === "undefined") return "Guest";
  try {
    const existing = window.localStorage.getItem(GUEST_NAME_KEY);
    if (existing) return existing;
    const generated = `Guest ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    window.localStorage.setItem(GUEST_NAME_KEY, generated);
    return generated;
  } catch {
    return "Guest";
  }
}

function signalingUrl(): string {
  if (ENV.VITE_SIGNALING_URL) return ENV.VITE_SIGNALING_URL;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.hostname}:4444`;
}

export type RoomRuntime = {
  doc: Y.Doc;
  awareness: Awareness;
  provider: WebrtcProvider;
  persistence: IndexeddbPersistence;
};

export type RoomPeer = {
  clientId: number;
  name: string;
  color: string;
  initials: string;
  isSelf: boolean;
};

export type RoomMeta = {
  id: string;
  name: string;
  joinCode: string;
  /**
   * Client projection of the frozen `Member` shape from #4. Dates arrive as
   * ISO strings over the tRPC HTTP link, so `joinedAt` is typed as string here
   * rather than the server-side `Date`.
   */
  members: { id: string; deviceId: string; displayName: string; joinedAt: string }[];
};

export type RoomContextValue = {
  roomId: string;
  /** Null until the Y.Doc, provider and IndexedDB store are wired up. */
  runtime: RoomRuntime | null;
  /** Everyone currently present, including you. */
  peers: RoomPeer[];
  /** Live WebRTC + BroadcastChannel peer count from y-webrtc. */
  meshPeers: number;
  /** The same count split by transport, so the P2P path is visible. */
  mesh: { webrtc: number; bc: number };
  status: RoomStatus;
  isOnline: boolean;
  /** Display name this peer advertises. */
  name: string;
  /** Control-plane room metadata, if this room is registered and reachable. */
  meta: RoomMeta | null;
  /** Shareable URL for this room. */
  shareUrl: string;
  /**
   * Durable history (#6) over this room's own `Y.Doc`; null until the runtime
   * exists. Checkpoints replicate with the room and persist in IndexedDB.
   */
  history: HistoryStore | null;
  /** The checkpoint log, oldest first. Empty until the runtime exists. */
  checkpoints: CheckpointMeta[];
  /**
   * Capture the current room state. No-op when unchanged since the head.
   * Naming a checkpoint is the coordinator's job (#10), so no label is accepted
   * here yet — that call is where the coordinator gate belongs.
   */
  createCheckpoint: () => void;
};

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({
  roomId,
  displayName,
  children,
}: {
  roomId: string;
  displayName?: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const [runtime, setRuntime] = useState<RoomRuntime | null>(null);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [mesh, setMesh] = useState({ webrtc: 0, bc: 0 });
  const [persisted, setPersisted] = useState(false);
  const [synced, setSynced] = useState(false);
  const [queued, setQueued] = useState(0);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [guestName] = useState(readGuestName);
  const [deviceId] = useState(readDeviceId);
  const [history, setHistory] = useState<HistoryStore | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);

  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;

  const name = displayName?.trim() || guestName;

  // The peer is built here and mounted once per room. Presence rides on
  // y-webrtc awareness; durability rides on y-indexeddb keyed by room.
  useEffect(() => {
    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`meldspace-${roomId}`, doc);
    const provider = new WebrtcProvider(roomId, doc, {
      signaling: [signalingUrl()],
      maxConns: 20,
      // Same-browser tabs sync over BroadcastChannel; this is the R1 fallback
      // when WebRTC signaling isn't reachable. y-webrtc defaults to true.
      filterBcConns: true,
    });
    setRuntime({ doc, awareness: provider.awareness, provider, persistence });

    return () => {
      provider.destroy();
      persistence.destroy();
      doc.destroy();
      setRuntime(null);
    };
  }, [roomId]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Sync signals: IndexedDB load, the y-webrtc handshake, the mesh peer list
  // and local edits made while offline. Offline durability is y-indexeddb: it
  // appends every update, so an offline reload still has the work to converge.
  useEffect(() => {
    if (!runtime) return;
    const { doc, provider, persistence } = runtime;
    setPersisted(false);
    setSynced(false);
    setQueued(0);
    setMesh({ webrtc: 0, bc: 0 });

    let disposed = false;
    const onPersisted = () => {
      if (disposed) return;
      setPersisted(true);
      // Migrate once IndexedDB has loaded, so a legacy room's `content` is
      // present before we decide whether to move it into `main.tex`.
      ensureProject(doc);
    };
    const onSynced = (event: { synced: boolean }) => {
      setSynced(event.synced);
      // Only clear the queue on a fresh handshake while actually online; a
      // peer-close also reports synced and must not wipe local queued edits.
      if (event.synced && onlineRef.current) setQueued(0);
    };
    const onPeers = (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      setMesh({ webrtc: event.webrtcPeers.length, bc: event.bcPeers.length });
    };
    const onUpdate = () => {
      if (!onlineRef.current) setQueued((count) => count + 1);
    };

    persistence.once("synced", onPersisted);
    // `once` can miss a store that finished loading before this effect ran.
    if (persistence.synced) onPersisted();
    provider.on("synced", onSynced);
    provider.on("peers", onPeers);
    doc.on("update", onUpdate);

    return () => {
      disposed = true;
      persistence.off("synced", onPersisted);
      provider.off("synced", onSynced);
      provider.off("peers", onPeers);
      doc.off("update", onUpdate);
    };
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return;
    const { doc, awareness } = runtime;
    awareness.setLocalStateField("user", { name, color: identityColor(name) });

    const refresh = () => {
      setPeers(
        Array.from(awareness.getStates().entries()).map(([clientId, state]) => {
          const user = (state as { user?: { name?: string; color?: string } }).user;
          const peerName = user?.name ?? String(clientId);
          return {
            clientId,
            name: peerName,
            color: user?.color ?? identityColor(peerName),
            initials: initials(peerName),
            isSelf: clientId === doc.clientID,
          };
        }),
      );
    };

    awareness.on("change", refresh);
    refresh();
    return () => awareness.off("change", refresh);
  }, [runtime, name]);

  // Durable history (#6): checkpoints live in the same Y.Doc as the room, so
  // they ride the existing provider (P2P replication) and persistence
  // (IndexedDB) with no extra transport. #7 replaces this with the full panel.
  useEffect(() => {
    if (!runtime) return;
    const store = new HistoryStore(runtime.doc, { contentSource: readRoomContent });
    setHistory(store);
    setCheckpoints(store.list());
    const unsubscribe = store.subscribe(setCheckpoints);
    return () => {
      unsubscribe();
      setHistory(null);
      setCheckpoints([]);
    };
  }, [runtime]);

  const createCheckpoint = useCallback(() => {
    history?.createCheckpoint({ deviceId, displayName: name });
  }, [history, deviceId, name]);

  // Control-plane metadata is a bonus, never a gate: a local (unregistered) or
  // offline room simply renders without a join code.
  const byIdQuery = useQuery({
    ...trpc.room.byId.queryOptions({ id: roomId }),
    retry: false,
    staleTime: 30_000,
    meta: { suppressErrorToast: true },
  });

  const meshPeers = mesh.webrtc + mesh.bc;
  const status = deriveRoomStatus({ persisted, isOnline, meshPeers, synced, queued });
  const shareUrl = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/room/${roomId}`),
    [roomId],
  );

  const value = useMemo<RoomContextValue>(
    () => ({
      roomId,
      runtime,
      peers,
      meshPeers,
      mesh,
      status,
      isOnline,
      name,
      meta: byIdQuery.data ?? null,
      shareUrl,
      history,
      checkpoints,
      createCheckpoint,
    }),
    [
      roomId,
      runtime,
      peers,
      meshPeers,
      mesh,
      status,
      isOnline,
      name,
      byIdQuery.data,
      shareUrl,
      history,
      checkpoints,
      createCheckpoint,
    ],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
}
