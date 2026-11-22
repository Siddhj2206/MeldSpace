import { useEffect, useState } from "react";
import type * as Y from "yjs";

import { useRoom, type RoomRuntime } from "./room-provider";

/**
 * The coordinator role (#10), per `CONTEXT.md` and ADR 0001.
 *
 * Content authority is equal across peers — this is a narrow coordination
 * role (admitting a peer, naming a checkpoint), not an administrator, and it
 * can never override content.
 *
 * **The epoch is durable; the holder is presence-derived.** Claims live in
 * `Y.Map("coordinator")` as `clientID → epoch`, one key per peer. A handoff
 * writes `max(seen epoch) + 1`, so the epoch is monotone CRDT state that
 * survives merges and offline claims. The holder is derived — never stored —
 * as `argmax(epoch, clientID)` restricted to peers present in awareness:
 *
 * - A returning peer carrying a stale epoch loses automatically (Act 4): its
 *   claim merges but never wins `argmax`.
 * - Two concurrent handoffs in a partition converge to one holder by
 *   `max(epoch)`, ties broken by `max(clientID)`.
 * - With no present claimant the role is vacant; the epoch persists.
 * - The database stores neither (matches #4: no authority columns).
 */

const CLAIMS_MAP_NAME = "coordinator";

export type Coordinator = { epoch: number; clientId: number } | null;

type Claim = { clientId: number; epoch: number };

export function readClaims(doc: Y.Doc): Claim[] {
  const claims: Claim[] = [];
  doc.getMap<number>(CLAIMS_MAP_NAME).forEach((epoch, key) => {
    const clientId = Number(key);
    if (Number.isFinite(clientId) && typeof epoch === "number") {
      claims.push({ clientId, epoch });
    }
  });
  // Stable order across replicas: forEach order is not merge-deterministic.
  claims.sort((a, b) => a.clientId - b.clientId);
  return claims;
}

/** argmax over (epoch, clientID). Ties — same epoch from a partition — break by clientID. */
export function coordinatorWinner(claims: Claim[], present: Set<number>): Coordinator {
  let best: Claim | null = null;
  for (const claim of claims) {
    if (!present.has(claim.clientId)) continue;
    if (
      best === null ||
      claim.epoch > best.epoch ||
      (claim.epoch === best.epoch && claim.clientId > best.clientId)
    ) {
      best = claim;
    }
  }
  return best;
}

/**
 * Derived coordinator for the UI. Observes the claims map and awareness, so
 * the badge moves the moment the holder leaves presence — no timers.
 */
export function useCoordinator(): Coordinator {
  const { runtime } = useRoom();
  const [coordinator, setCoordinator] = useState<Coordinator>(null);

  useEffect(() => {
    if (!runtime) {
      setCoordinator(null);
      return;
    }
    const { doc, awareness } = runtime;
    const map = doc.getMap<number>(CLAIMS_MAP_NAME);

    const read = () =>
      setCoordinator(coordinatorWinner(readClaims(doc), new Set(awareness.getStates().keys())));
    map.observe(read);
    awareness.on("change", read);
    read();
    return () => {
      map.unobserve(read);
      awareness.off("change", read);
    };
  }, [runtime]);

  return coordinator;
}

/**
 * The election loop (#10). Mounted once per room in `RoomProvider`.
 *
 * When no present peer holds the role, the deterministic claimant — the
 * present peer with the smallest clientID, which every replica computes the
 * same way — claims it at `max(epoch) + 1` and prunes the other claims. A
 * partition can still produce two claims at the same epoch (each side had
 * its own claimant); the merge resolves by `max(epoch, clientID)`, exactly
 * the spec's tie-break.
 */
export function useCoordinatorElection(runtime: RoomRuntime | null): void {
  useEffect(() => {
    if (!runtime) return;
    const { doc, awareness } = runtime;
    const map = doc.getMap<number>(CLAIMS_MAP_NAME);

    const elect = () => {
      const present = new Set(awareness.getStates().keys());
      if (present.size === 0) return; // vacant: nobody present can hold it
      const claims = readClaims(doc);
      const holder = coordinatorWinner(claims, present);
      if (holder !== null) {
        // A present peer already holds. Garbage-collect claims that can never
        // win again — absent peers strictly below the holder's epoch — without
        // touching the max epoch, which future claims still increment from.
        doc.transact(() => {
          for (const claim of claims) {
            if (claim.epoch < holder.epoch && !present.has(claim.clientId)) {
              map.delete(String(claim.clientId));
            }
          }
        });
        return;
      }

      const claimant = Math.min(...present);
      if (claimant !== doc.clientID) return; // not our job
      const nextEpoch = claims.reduce((max, claim) => Math.max(max, claim.epoch), 0) + 1;
      doc.transact(() => {
        // Prune superseded claims — the winner's own key is the whole state.
        map.forEach((_, key) => map.delete(key));
        map.set(String(doc.clientID), nextEpoch);
      });
    };

    map.observe(elect);
    awareness.on("change", elect);
    elect();
    return () => {
      map.unobserve(elect);
      awareness.off("change", elect);
    };
  }, [runtime]);
}
