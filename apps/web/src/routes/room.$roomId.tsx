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

function RoomComponent() {
  const { roomId } = Route.useParams();
  const editorHost = useRef<HTMLDivElement>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  // `provider.connected` only reflects intent (connect() was called), not the
  // network — so sync state is derived from the browser online flag, the
  // mesh peer list and the y-webrtc `synced` handshake below.
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [persisted, setPersisted] = useState(false);
  const [synced, setSynced] = useState(false);
  const [meshPeers, setMeshPeers] = useState(0);
  // Local updates made while offline. Cleared when the mesh reports a fresh
  // `synced` handshake while online — i.e. the queue actually converged.
  const [queued, setQueued] = useState(0);
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;

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
    // Offline durability: every update is appended to IndexedDB, so edits
    // made with the network pulled survive a reload and are still here to
    // converge on reconnect. Acceptance 1 of #5.
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
    // handshake (state vectors) with each peer — only missing updates cross
    // the wire, and the CRDT merge converges both replicas. Acceptance 2 of #5.
    const onSynced = (event: { synced: boolean }) => {
      setSynced(event.synced);
      if (event.synced && onlineRef.current) setQueued(0);
    };
    provider.on("synced", onSynced);

    const onPeers = (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      setMeshPeers(event.webrtcPeers.length + event.bcPeers.length);
    };
    provider.on("peers", onPeers);

    const onUpdate = () => {
      // Count edits made while the browser reports offline; while online the
      // doc streams updates to connected peers as they happen.
      if (!onlineRef.current) setQueued((n) => n + 1);
    };
    doc.on("update", onUpdate);

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
      provider.off("synced", onSynced);
      provider.off("peers", onPeers);
      doc.off("update", onUpdate);
      view.destroy();
      provider.destroy();
      persistence.destroy();
      doc.destroy();
    };
  }, [roomId]);

  // Canonical vocabulary (CONTEXT.md): Local / Queued / Converged.
  const sync: { label: string; dot: string } = !persisted
    ? { label: "Loading…", dot: "bg-muted-foreground" }
    : !isOnline
      ? queued > 0
        ? { label: `Queued · ${queued}`, dot: "bg-amber-500" }
        : { label: "Local", dot: "bg-amber-500" }
      : meshPeers === 0
        ? { label: "Local", dot: "bg-yellow-500" }
        : !synced
          ? { label: "Connecting…", dot: "bg-blue-500" }
          : { label: "Converged", dot: "bg-green-500" };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      {!isOnline ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
        >
          You’re offline — edits stay on this device and converge automatically on reconnect.
          {queued > 0 ? ` ${queued} change${queued === 1 ? "" : "s"} queued.` : ""}
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Room</h1>
          <code className="text-muted-foreground text-sm">{roomId}</code>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${sync.dot}`} />
            {sync.label}
          </span>
          <span className="text-muted-foreground">{persisted ? "saved locally" : "loading…"}</span>
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
