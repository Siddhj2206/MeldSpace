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

export const Route = createFileRoute("/room/$roomId")({
  ssr: false,
  component: RoomComponent,
});

type Peer = {
  clientId: number;
  name: string;
  color: string;
};

function colorFor(id: number) {
  return `hsl(${id % 360} 70% 55%)`;
}

function signalingUrl() {
  const override = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (override) return override;
  if (typeof window === "undefined") return "ws://localhost:4444";
  return `ws://${window.location.hostname}:4444`;
}

function RoomComponent() {
  const { roomId } = Route.useParams();
  const editorHost = useRef<HTMLDivElement>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [persisted, setPersisted] = useState(false);

  useEffect(() => {
    if (!editorHost.current) return;

    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`meldspace-${roomId}`, doc);
    persistence.once("synced", () => setPersisted(true));

    const provider = new WebrtcProvider(roomId, doc, {
      signaling: [signalingUrl()],
      maxConns: 20,
    });

    const awareness = provider.awareness;
    awareness.setLocalStateField("user", {
      name: `peer-${String(doc.clientID).slice(-4)}`,
      color: colorFor(doc.clientID),
    });

    const refreshPeers = () => {
      setPeers(
        Array.from(awareness.getStates().entries()).map(([clientId, state]) => {
          const user = (state as { user?: { name?: string; color?: string } }).user;
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

    const onStatus = (event: { connected: boolean }) => setConnected(event.connected);
    provider.on("status", onStatus);

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
      provider.off("status", onStatus);
      view.destroy();
      provider.destroy();
      persistence.destroy();
      doc.destroy();
    };
  }, [roomId]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Room</h1>
          <code className="text-muted-foreground text-sm">{roomId}</code>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500"}`}
            />
            {connected ? "signaling connected" : "peer-to-peer / local"}
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
        Open this URL in another browser to collaborate. Edits sync peer-to-peer over WebRTC and are
        persisted locally.
      </p>
    </div>
  );
}
