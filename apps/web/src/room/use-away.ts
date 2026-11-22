import { useEffect, useMemo, useRef, useState } from "react";

import type { CheckpointMeta } from "@/lib/history-store";

const seenKey = (roomId: string) => `meldspace:history-seen:${roomId}`;

/**
 * "While you were away" (#7): the ids of checkpoints this device hasn't seen.
 *
 * The marker is the newest checkpoint id the device had when the room was last
 * open, kept in localStorage per room. Everything after it in the log is the
 * away slice — which is exactly what a peer returning from offline sees once
 * the room reconverges. The marker is written on `pagehide` and unmount, so a
 * session that created the checkpoints itself doesn't count them as "away".
 */
export function useAwayIds(roomId: string, checkpoints: CheckpointMeta[]): string[] {
  // Read once per room: the id of the newest checkpoint seen last session.
  const [seenId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(seenKey(roomId));
    } catch {
      return null;
    }
  });

  // Persist the latest head whenever the room closes or unmounts.
  const latestRef = useRef(checkpoints);
  latestRef.current = checkpoints;
  useEffect(() => {
    const persist = () => {
      const head = latestRef.current[latestRef.current.length - 1];
      if (!head) return;
      try {
        window.localStorage.setItem(seenKey(roomId), head.id);
      } catch {
        /* localStorage unavailable — the away list just won't persist */
      }
    };
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [roomId]);

  return useMemo(() => {
    if (checkpoints.length === 0) return [];
    if (seenId === null) return checkpoints.map((c) => c.id); // first visit: all of it is new
    const index = checkpoints.findIndex((c) => c.id === seenId);
    // Unknown id (the seen head was squashed or never replicated): everything
    // is new. Otherwise the slice strictly after the seen checkpoint.
    return checkpoints.slice(index < 0 ? 0 : index + 1).map((c) => c.id);
  }, [checkpoints, seenId]);
}
