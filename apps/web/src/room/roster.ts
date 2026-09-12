import { useMemo } from "react";

import { identityColor } from "./identity";
import { useRoom } from "./room-provider";

export type RosterEntry = {
  key: string;
  name: string;
  color: string;
  /** Currently present over WebRTC/BroadcastChannel awareness. */
  present: boolean;
  isSelf: boolean;
  /** Yjs client id, only known for present peers. */
  clientId?: number;
};

/**
 * Who is in the room: live presence first, then registered membership from the
 * control plane. The two are deduped by display name so a present member shows
 * once, with its live identity hue.
 */
export function useRoomRoster(): RosterEntry[] {
  const { peers, meta } = useRoom();
  return useMemo(() => {
    const seen = new Set<string>();
    const entries: RosterEntry[] = [];

    for (const peer of peers) {
      seen.add(peer.name.toLowerCase());
      entries.push({
        key: `peer:${peer.clientId}`,
        name: peer.name,
        color: peer.color,
        present: true,
        isSelf: peer.isSelf,
        clientId: peer.clientId,
      });
    }

    for (const member of meta?.members ?? []) {
      const dedupe = member.displayName.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      entries.push({
        key: `member:${member.id}`,
        name: member.displayName,
        color: identityColor(member.displayName),
        present: false,
        isSelf: false,
      });
    }

    return entries;
  }, [peers, meta]);
}
