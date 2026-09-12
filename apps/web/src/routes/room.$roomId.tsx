import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebrtcProvider } from "y-webrtc";

import { ENV } from "@/env";

export const Route = createFileRoute("/room/$roomId")({
  ssr: false,
  component: RoomComponent,
});

type PresenceUser = {
  name: string;
  color: string;
};

type Peer = PresenceUser & {
  clientId: number;
};

function colorFor(id: number) {
  return `hsl(${id % 360} 70% 55%)`;
}

function signalingUrl() {
  if (ENV.VITE_SIGNALING_URL) return ENV.VITE_SIGNALING_URL;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.hostname}:4444`;
}

// Canonical vocabulary (CONTEXT.md): Local, Queued, Converged. "Reconnecting"
// and "Live" are the design's transient states between those.
type SyncTone = "muted" | "signal" | "success";

type SyncStatus = {
  label: "Loading…" | "Local" | "Queued" | "Reconnecting" | "Live" | "Converged";
  tone: SyncTone;
  detail: string;
};

const toneClass: Record<SyncTone, string> = {
  muted: "bg-muted-foreground",
  signal: "bg-signal",
  success: "bg-success",
};

function SyncStatusPill({ status }: { status: SyncStatus }) {
  return (
    <span
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      title={status.detail}
    >
      <span className={`h-2 w-2 rounded-full ${toneClass[status.tone]}`} />
      {status.label}
      <span className="sr-only">{status.detail}</span>
    </span>
  );
}

type SyncInputs = {
  persisted: boolean;
  isOnline: boolean;
  converged: boolean;
  queued: number;
  live: boolean;
};

/**
 * One derivation for the whole pill so the label, lamp and detail can never
 * disagree with each other. `queued` is a count of local edits waiting to be
 * shared; `converged` is only ever true when a real peer holds our state.
 */
function deriveSyncStatus({
  persisted,
  isOnline,
  converged,
  queued,
  live,
}: SyncInputs): SyncStatus {
  if (!persisted) {
    return { label: "Loading…", tone: "muted", detail: "Reading this room from local storage." };
  }
  if (!isOnline) {
    return queued > 0
      ? {
          label: "Queued",
          tone: "signal",
          detail: `${queued} local ${queued === 1 ? "change" : "changes"} waiting to converge.`,
        }
      : { label: "Local", tone: "muted", detail: "Offline. Edits stay on this device." };
  }
  if (!converged) {
    return { label: "Reconnecting", tone: "signal", detail: "Looking for peers to converge with." };
  }
  if (live) {
    return { label: "Live", tone: "signal", detail: "Edits are moving between peers right now." };
  }
  return {
    label: "Converged",
    tone: "success",
    detail: "You and your peers share the same room state.",
  };
}

/**
 * y-webrtc emits `synced` only when the state *changes*, and treats "no WebRTC
 * connections" as synced. Read the room's own connections instead so we never
 * report converged before the handshake or stall on a missed transition.
 * BroadcastChannel peers apply updates inline and never enter `webrtcConns`.
 */
function peersHaveOurState(provider: WebrtcProvider): boolean {
  const room = provider.room;
  if (!room) return false;
  if (room.webrtcConns.size === 0) return room.bcConns.size > 0;
  return Array.from(room.webrtcConns.values()).every((conn) => conn.synced);
}

function RoomComponent() {
  const { roomId } = Route.useParams();
  const editorHost = useRef<HTMLDivElement>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [persisted, setPersisted] = useState(false);
  const [converged, setConverged] = useState(false);
  const [queued, setQueued] = useState(0);
  const [live, setLive] = useState(false);
  const onlineRef = useRef(isOnline);
  const convergedRef = useRef(converged);
  onlineRef.current = isOnline;
  convergedRef.current = converged;

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

  useEffect(() => {
    if (!editorHost.current) return;

    const doc = new Y.Doc();
    // Offline durability: every local update is appended to IndexedDB, so edits
    // made with the network pulled survive a reload and converge on reconnect.
    const persistence = new IndexeddbPersistence(`meldspace-${roomId}`, doc);
    persistence.once("synced", () => setPersisted(true));

    const provider = new WebrtcProvider(roomId, doc, {
      signaling: [signalingUrl()],
      maxConns: 20,
      // Same-browser tabs sync over BroadcastChannel; this is the R1 fallback
      // when WebRTC signaling isn't reachable. y-webrtc defaults to true.
      filterBcConns: true,
    });

    // No manual reconnect step: y-webrtc keeps `shouldConnect` true across an
    // outage, re-establishes signaling on its own, and re-runs the Yjs sync
    // handshake (state vectors) with each peer — only missing updates cross the
    // wire, and the CRDT merge converges both replicas.
    const refreshConvergence = () => {
      const next = onlineRef.current && peersHaveOurState(provider);
      setConverged(next);
      // Every reachable peer holding our state means nothing is queued.
      if (next) setQueued(0);
    };

    let liveTimer: ReturnType<typeof setTimeout> | undefined;
    const markLive = () => {
      setLive(true);
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => setLive(false), 1500);
    };

    const onUpdate = (_update: Uint8Array, _origin: unknown, _doc: Y.Doc, tx: Y.Transaction) => {
      refreshConvergence();
      // Only edits made on this device count as queued. IndexedDB replay and
      // remote updates arrive with `transaction.local === false`, so an offline
      // reload or a sibling tab can no longer inflate the count.
      if (tx.local && !convergedRef.current) setQueued((n) => n + 1);
      if (tx.local && convergedRef.current && onlineRef.current) markLive();
    };
    doc.on("update", onUpdate);

    provider.on("synced", refreshConvergence);
    provider.on("peers", refreshConvergence);
    // `status` only reflects `shouldConnect`, so it is a refresh trigger, never
    // something we show. The poll covers transitions y-webrtc does not emit.
    provider.on("status", refreshConvergence);
    const convergencePoll = setInterval(refreshConvergence, 1000);
    refreshConvergence();

    const awareness = provider.awareness;
    const me: PresenceUser = {
      name: `peer-${String(doc.clientID).slice(-4)}`,
      color: colorFor(doc.clientID),
    };
    awareness.setLocalStateField("user", me);

    const refreshPeers = () => {
      setPeers(
        Array.from(awareness.getStates().entries()).map(([clientId, state]) => {
          const user = (state as { user?: PresenceUser }).user;
          return {
            clientId,
            name: user?.name ?? String(clientId),
            color: user?.color ?? "#888",
          };
        }),
      );
    };
    awareness.on("change", refreshPeers);
    refreshPeers();

    const ytext = doc.getText("content");
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...yUndoManagerKeymap]),
          markdown(),
          oneDark,
          EditorView.lineWrapping,
          yCollab(ytext, awareness, { undoManager }),
        ],
      }),
      parent: editorHost.current,
    });

    return () => {
      awareness.off("change", refreshPeers);
      provider.off("synced", refreshConvergence);
      provider.off("peers", refreshConvergence);
      provider.off("status", refreshConvergence);
      doc.off("update", onUpdate);
      clearInterval(convergencePoll);
      clearTimeout(liveTimer);
      view.destroy();
      provider.destroy();
      persistence.destroy();
      doc.destroy();
    };
  }, [roomId]);

  const status = deriveSyncStatus({ persisted, isOnline, converged, queued, live });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Room</h1>
          <code className="text-muted-foreground text-sm">{roomId}</code>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <SyncStatusPill status={status} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {peers.map((peer) => (
          <span
            key={peer.clientId}
            className="rounded-full border px-3 py-1 text-sm"
            style={{ borderColor: peer.color }}
          >
            <span style={{ color: peer.color }}>●</span> {peer.name}
          </span>
        ))}
        {peers.length === 0 ? (
          <span className="text-muted-foreground text-sm">no peers yet</span>
        ) : null}
      </div>

      <div
        ref={editorHost}
        className="overflow-hidden rounded-lg border [&_.cm-editor]:min-h-[60vh] [&_.cm-editor]:outline-none"
      />
      <p className="text-muted-foreground mt-3 text-xs">
        Open this URL in another browser to collaborate. Edits sync peer-to-peer over WebRTC, are
        persisted locally, and converge automatically after going offline.
      </p>
    </div>
  );
}
