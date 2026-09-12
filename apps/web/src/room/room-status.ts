/**
 * Room sync status.
 *
 * Canonical vocabulary from CONTEXT.md: **Local**, **Queued**, **Converged**
 * (never "synced"). "Connecting" is the transient in-between while the mesh
 * handshake runs.
 *
 * `provider.connected` only reflects intent (that `connect()` was called), not
 * the network, so we derive status from the browser online flag, the live mesh
 * peer count and the y-webrtc `synced` handshake instead. This mirrors the
 * behaviour landed for #5 so the shell and the offline work agree.
 */
export type SyncState = "loading" | "local" | "queued" | "connecting" | "converged";

export type RoomStatus = {
  state: SyncState;
  /** Human label, e.g. "CONVERGED" or "QUEUED · 3". */
  label: string;
  /** Tailwind background class for the status lamp. */
  dotClassName: string;
  /** Local replica has loaded from IndexedDB. */
  persisted: boolean;
  /** Changes made on this device while offline, not yet shared. */
  queued: number;
  /** Browser reports no network. */
  offline: boolean;
};

export type RoomStatusInput = {
  persisted: boolean;
  isOnline: boolean;
  meshPeers: number;
  synced: boolean;
  queued: number;
};

export function deriveRoomStatus({
  persisted,
  isOnline,
  meshPeers,
  synced,
  queued,
}: RoomStatusInput): RoomStatus {
  if (!persisted) {
    return {
      state: "loading",
      label: "LOADING",
      dotClassName: "bg-subtle-foreground",
      persisted,
      queued,
      offline: !isOnline,
    };
  }

  if (!isOnline) {
    return queued > 0
      ? {
          state: "queued",
          label: `QUEUED · ${queued}`,
          dotClassName: "bg-signal",
          persisted,
          queued,
          offline: true,
        }
      : {
          state: "local",
          label: "LOCAL",
          dotClassName: "bg-signal",
          persisted,
          queued,
          offline: true,
        };
  }

  if (meshPeers === 0) {
    return {
      state: "local",
      label: "LOCAL",
      dotClassName: "bg-muted-foreground",
      persisted,
      queued,
      offline: false,
    };
  }

  if (!synced) {
    return {
      state: "connecting",
      label: "CONNECTING",
      dotClassName: "bg-signal",
      persisted,
      queued,
      offline: false,
    };
  }

  return {
    state: "converged",
    label: "CONVERGED",
    dotClassName: "bg-success",
    persisted,
    queued,
    offline: false,
  };
}
