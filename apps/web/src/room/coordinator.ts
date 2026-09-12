import { useEffect, useState } from "react";

import { useRoom } from "./room-provider";

export type Coordinator = { epoch: number; clientId: number } | null;

/**
 * Reads the coordinator register if the room carries one.
 *
 * The register is `{ epoch, clientID }` inside the shared `Y.Doc` (see #10 and
 * CONTEXT.md). Until #10 lands the map is absent and the shell simply shows no
 * coordinator, rather than inventing one — the epoch is durable state, the
 * holder is presence-derived, and neither belongs to the shell.
 */
export function useCoordinator(): Coordinator {
  const { runtime } = useRoom();
  const [coordinator, setCoordinator] = useState<Coordinator>(null);

  useEffect(() => {
    if (!runtime) {
      setCoordinator(null);
      return;
    }
    const map = runtime.doc.getMap<{ epoch?: number; clientID?: number }>("coordinator");
    const read = () => {
      const value = map.get("state");
      if (typeof value?.epoch === "number" && typeof value.clientID === "number") {
        setCoordinator({ epoch: value.epoch, clientId: value.clientID });
      } else {
        setCoordinator(null);
      }
    };
    map.observe(read);
    read();
    return () => map.unobserve(read);
  }, [runtime]);

  return coordinator;
}
